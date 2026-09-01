# Exposer le pipeline social à un agent externe

Plan technique. Aucun code écrit pour l'instant.

Base documentaire : `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`,
`16-proxy.md`, `02-guides/backend-for-frontend.md`, `02-guides/authentication.md`,
`03-api-reference/03-file-conventions/proxy.md`. Next **16.3.0**.

---

## 0. Un préalable que le reste suppose : le proxy avale les requêtes sans cookie

Avant toute conception, un fait vérifiable dans `src/proxy.ts` :

```
matcher: ["/((?!api/upload|api/client-files|api/avatar|api/branding|api/promo|api/invoice|_next/static|…).*)"]
```

`/api/agent/...` **n'est pas dans les exclusions**. Le proxy s'exécutera donc, ne
trouvera pas de cookie de session, et renverra un **302 vers `/connexion`**.

Un agent qui appelle l'API recevrait une redirection, la suivrait, obtiendrait la
page de connexion en **200**, et lirait ça comme un succès. C'est exactement le
défaut déjà corrigé une fois dans ce dépôt — le commentaire de `currentDirection()`
dans `src/lib/auth.ts` le raconte :

> `requireDirection` redirige, ce qui convient à une page […] mais trompe un appel
> programmé : `fetch` suit la redirection, reçoit une page en 200, et le code
> appelant la lit comme un succès alors que rien n'a été fait.

**Correctif : ajouter `/api/agent` à la liste `isPublic` du proxy**, pas au
`matcher`. Les deux marchent, mais l'exclusion du `matcher` existe pour une raison
précise — éviter la recopie du corps en mémoire, plafonnée à 10 Mo
(`proxyClientMaxBodySize`) — qui ne concerne pas ces routes. `isPublic` dit ce
qu'on veut dire : « le proxy ne tranche pas ici, la route s'en charge », ce qui est
déjà le cas de `/api/health`.

« Public » au sens du proxy ne veut pas dire ouvert : l'authentification se fait
dans la route, comme le recommandent les guides (« Do not rely on proxy alone for
authentication and authorization »).

---

## 1. Authentification

### Ne pas réutiliser `sessions`

La table existante :

```ts
sessions = { tokenHash: text().primaryKey(), userId: uuid().notNull(), expiresAt, createdAt }
```

Y ajouter une colonne `scope` nullable serait tentant — même empreinte, même
lecture. C'est à écarter, pour une raison de sûreté et non de style : `currentUser()`
interroge cette table sans autre filtre que l'expiration. Une clé d'API rangée là
deviendrait **un cookie de session valide** dès qu'une requête présenterait son
jeton dans le cookie `SESSION_COOKIE`. Les deux chemins d'accès partageraient une
même table de vérité, et n'importe quel oubli de filtre dans l'un ouvrirait l'autre.

Deux cycles de vie qui n'ont rien en commun, par ailleurs : une session dure 30 jours,
naît à chaque connexion, meurt à la déconnexion (`db.delete`) et n'est jamais listée
nulle part. Une clé est peu nombreuse, nommée, longue à vivre, révocable
individuellement, et doit laisser une trace après sa mort.

### Table proposée

```ts
export const apiKeys = pgTable("api_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  /** « Agent chef de projet — social ». Sert à savoir laquelle révoquer. */
  name: text("name").notNull(),
  /** Empreinte SHA-256 du jeton, jamais le jeton. Comme sessions. */
  tokenHash: text("token_hash").notNull(),
  /**
   * Les huit premiers caractères, en clair. Sans eux, l'écran des réglages
   * affiche une liste de clés indistinguables et les journaux ne disent pas
   * laquelle a appelé.
   */
  prefix: text("prefix").notNull(),
  /** ["pipeline:read", "pipeline:write"] — même forme que users.departments. */
  scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
  /** Le périmètre métier, lu comme requireDepartment() le lit pour un humain. */
  departments: jsonb("departments").$type<string[]>().notNull().default([]),
  /**
   * Nul = toute la clientèle du pôle. Renseigné = un seul client.
   * Colonne posée maintenant bien qu'inutilisée : l'ajouter plus tard
   * obligerait à reprendre chaque requête déjà écrite.
   */
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  /** Révoquer sans effacer : qui l'a créée, quand elle a servi, quand elle est morte. */
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("api_keys_token_key").on(t.tokenHash)]);
```

**Empreinte SHA-256, pas scrypt.** C'est le même choix que `sessions`, et il est
juste pour la même raison : le jeton fait 256 bits d'aléa, il n'existe pas de
dictionnaire contre lui. `scrypt` est réservé aux mots de passe, qui eux sont
devinables. Mettre scrypt ici ajouterait ~100 ms à *chaque* appel de l'agent.

**Format du jeton** : `tpk_` + `randomBytes(32).toString("base64url")`, comme
`createSession()`. Le préfixe littéral rend le secret repérable dans un journal ou
par un scanner de fuite.

**`scopes` en `jsonb`, pas en `pgEnum`.** Un enum obligerait à
`ALTER TYPE … ADD VALUE` à chaque nouveau droit ; `jsonb string[]` suit la
convention déjà en place pour `users.departments`.

### Emplacement du helper

**Nouveau fichier `src/lib/api-auth.ts`.** Pas dans `auth.ts`.

`auth.ts` importe `cookies()` de `next/headers` et `redirect()` de
`next/navigation`. Une clé d'API n'a besoin ni de l'un ni de l'autre, et ne doit
surtout jamais rediriger. Les garder séparés rend structurellement impossible
qu'une clé hérite par erreur des pouvoirs d'une session.

L'empreinte, elle, doit être partagée. `hashToken` est aujourd'hui privé dans
`auth.ts` — l'extraire dans un `src/lib/tokens.ts` minuscule, importé par les deux.
**Pas dans `auth.shared.ts`** : ce fichier est importé par `proxy.ts`, et y faire
entrer `node:crypto` alourdirait le bundle du proxy pour rien.

Signature calquée sur `currentDirection()`, le précédent maison pour une route
d'API :

```ts
export type ApiScope = "pipeline:read" | "pipeline:write";

/** La clé porteuse du scope, ou null. Ne redirige jamais : une route répond. */
export async function currentKey(request: Request, scope: ApiScope): Promise<ApiKey | null>;
```

Trois règles de mise en œuvre :

- Le jeton se lit **uniquement** dans `Authorization: Bearer …`. Jamais de repli sur
  le cookie : sinon un navigateur déjà connecté pourrait piloter l'API par CSRF.
- `lastUsedAt` n'est réécrit que s'il est nul ou vieux de plus de 5 minutes. Sinon
  chaque lecture coûte une écriture, sur une réserve de 10 connexions
  (`DB_POOL_MAX`, `src/db/index.ts`).
- La vérification du scope se fait **avant** d'entrer dans le handler, dans un
  enveloppeur `withApiKey(scope, handler)`. Un scope vérifié à l'intérieur de chaque
  route finit par être oublié dans l'une d'elles.

### Ce que ça implique côté migration Drizzle

- `npx drizzle-kit generate` produit `drizzle/0019_*.sql`. Il n'y a pas de script
  npm pour ça (`package.json` n'expose que `dev`, `build`, `start`, `lint`) — la
  commande se lance directement.
- **Migration purement additive** : un `CREATE TABLE`, deux clés étrangères, un
  index unique. Aucun `ALTER` sur une table existante, aucune valeur d'enum ajoutée,
  rien à recharger. Elle passe donc sans interruption de service et se laisse
  annuler sans dégât — revenir en arrière laisse une table inutilisée, c'est tout.
- Elle est appliquée au démarrage par `src/instrumentation.ts`, qui **relance
  l'exception en cas d'échec**. Le conteneur ne devient alors jamais `healthy`, et
  `deploy.yml` bascule sur l'image précédente. C'est le filet, il fonctionne.
- Le `Dockerfile` copie `drizzle/` dans l'image : le fichier doit être commité,
  sinon la migration n'existe pas en production.
- **Aucune clé en clair dans une migration.** La création se fait depuis Réglages,
  et le jeton n'est affiché qu'une fois, à cet instant.

---

## 2. Tests

### L'état réel

Aucun framework dans le dépôt : `package.json` ne déclare ni `vitest`, ni `jest`,
ni script `test`. `scripts/` ne contient que `ensure-nginx.sh` et `setup-vps.sh`.

À signaler, parce que ça change la question : il existe déjà une batterie de
**17 suites e2e Playwright (489 assertions)** qui tourne contre le build
`standalone` réel et un PostgreSQL réel. Elle vit dans mon espace de travail, pas
dans le dépôt. L'option B ci-dessous n'est donc pas un point de départ : c'est la
mise au propre de quelque chose qui existe et qui a déjà attrapé de vrais défauts.

### Option A — ajouter vitest

| Poste | Temps |
| --- | --- |
| Installer, configurer, résoudre l'alias `@/` (`vite-tsconfig-paths` ou alias manuel) | ~1 h |
| Fixture PostgreSQL réel + rejeu des migrations entre suites | ~1 h |
| Écrire les premiers tests utiles | ~1 h |
| **Premier vert** | **~3 h** |

Coût récurrent : 2 dépendances de développement, un fichier de configuration, un
script `test` en CI.

Le point faible est précis : la logique intéressante ici n'est pas pure. C'est
`currentKey()` qui interroge Postgres, l'application du scope au niveau HTTP, et des
requêtes Drizzle. Les tester sous vitest impose soit de simuler Drizzle — ce qui
teste la simulation, pas le SQL, alors que ce dépôt s'est déjà fait avoir par un
vrai bug SQL (une colonne externe rendue sans préfixe dans une sous-requête de
`semaineDeSuivi`) — soit de monter un vrai PostgreSQL, c'est-à-dire exactement
l'infrastructure de l'option B.

### Option B — tests fumigènes HTTP dans `scripts/`

| Poste | Temps |
| --- | --- |
| `scripts/smoke-api.mjs` : sans clé → 401, mauvais scope → 403, clé révoquée → 401, lecture valide, écriture valide, 429, chemin interdit → 403 | ~1 h |
| Branchement CI ou vérification post-déploiement | ~30 min |
| **Premier vert** | **~1 h 30** |

Zéro dépendance : Node 22 a `fetch` nativement, et `psql` est déjà là pour les
assertions en base.

### Recommandation : **B**, maintenant.

Quatre raisons tirées de ce dépôt, pas de préférences générales :

1. **Ce qui casse dans une couche de clés d'API casse à la frontière HTTP** : une
   route qui oublie la garde, une garde qui redirige au lieu de répondre, un scope
   non vérifié, un 302 lu comme un succès. Un test unitaire à base de simulacre n'en
   attrape aucun ; un vrai appel HTTP les attrape tous.
2. **Le précédent est documenté dans le code.** Le défaut de `currentDirection()`
   aurait passé n'importe quel test unitaire : la fonction faisait exactement ce
   qu'on lui demandait. Le défaut était que `fetch` suivait la redirection.
   Seul un appel HTTP réel le voit.
3. **Zéro dépendance colle à la posture du projet** : 9 dépendances applicatives,
   une image finale « sans sources ni toolchain ».
4. **Ça teste le build `standalone`**, c'est-à-dire ce que la production exécute.

Ce que B ne donne pas, et qu'il faut assumer : pas de mode veille, pas d'isolation
par fonction, et les helpers purs (analyse des scopes, arithmétique de la fenêtre de
débit) se testent mal à travers HTTP. **Vitest se justifiera le jour où il y aura de
la logique pure à isoler** — ce n'est pas un préalable pour livrer l'API.

Réserve honnête sur B : il exige un serveur et une base en marche. Il a donc sa
place soit dans un job CI qui démarre les deux, soit en vérification
post-déploiement contre le VPS avec une clé dédiée à cet usage.

---

## 3. Limitation de débit

### Ce que le déploiement réel impose

- `docker-compose.yml` : **un seul conteneur `app`**, aucun `replicas`. Next
  `standalone` lance un unique `node server.js`, sans cluster. La mémoire du
  processus *est* l'application : un compteur en mémoire est donc globalement
  cohérent, sans problème de partage entre instances.
- **nginx est mutualisé avec d'autres sites**, dont Swap'Îles. Or `limit_req_zone`
  se déclare dans le bloc `http` du `nginx.conf` principal, pas dans un vhost.
  `scripts/ensure-nginx.sh` ne touche qu'un seul fichier de vhost, en fait une copie
  avant, et revient en arrière si `nginx -t` échoue — « parce que la machine héberge
  d'autres sites ». Poser la limite dans nginx romprait cette discipline et
  ferait courir un risque à un site qui n'a rien demandé. **Écarté.**
- Redis serait un second conteneur à surveiller et à sauvegarder, pour une API qui a
  un consommateur. **Écarté.**

### Proposition : `src/lib/rate-limit.ts`, fenêtre fixe en mémoire

C'est très exactement la forme que montre le guide `backend-for-frontend.md` :
`checkRateLimit(request)` importé de `@/lib/rate-limit`, appelé **dans le handler**,
qui répond 429.

- **Fenêtre fixe** plutôt que fenêtre glissante : une quinzaine de lignes, et son
  seul défaut — jusqu'à 2× la limite à cheval sur une bordure — est sans
  conséquence pour un agent interne. À dire plutôt qu'à cacher.
- **Clé = `apiKeys.id`, pas l'adresse IP.** L'agent arrive derrière nginx : sans
  analyse de `X-Forwarded-For`, toutes les requêtes semblent venir de `127.0.0.1`.
  La clé est plus juste et ne se falsifie pas.
- **Deux plafonds** : généreux en lecture, strict en écriture. C'est en écriture
  qu'un agent parti en boucle fait des dégâts.
- Réponse **429** avec `Retry-After` et `X-RateLimit-Remaining`.
- **Mémoire bornée par construction** : la `Map` est indexée par identifiant de clé,
  donc sa taille est celle du nombre de clés — une poignée. Une `Map` indexée par
  une valeur que l'appelant choisit serait une fuite ; ce n'est pas le cas ici.
  Balayer quand même les fenêtres périmées à l'écriture.

### Caveat décisif : surtout pas dans `proxy.ts`

Deux raisons, la première vérifiable dans la sortie de build :

1. **Le proxy est un bundle distinct.** `.next/server/middleware.js` existe à côté de
   `.next/server/app/…`. Même si le proxy tourne bien dans le runtime Node depuis
   Next 16 (`proxy.md` : « Proxy defaults to using the Node.js runtime »), l'état de
   module qui y vit n'est pas la même instance que celui d'un route handler. Un
   compteur incrémenté dans le proxy n'est pas le compteur que la route relit.
2. Les guides sont explicites — « Do not rely on proxy alone for authentication and
   authorization » — et le commentaire de `src/proxy.ts` dit déjà la même chose pour
   ce projet : le proxy n'a pas accès à la base et ne doit pas faire autorité.

Donc : `checkRateLimit()` en première ligne de l'enveloppeur `withApiKey`, juste
après la résolution de la clé. Un enveloppeur, pas une consigne — pour qu'on ne
puisse pas l'oublier.

**Ce que ça perd** : le compteur repart à zéro à chaque redémarrage du conteneur,
donc à chaque déploiement. Sans importance pour un agent interne, mais à dire. Si
ça devenait gênant, la suite est une table `api_key_usage` avec une colonne de
fenêtre : même interface, une requête de plus par appel, aucune refonte.

---

## 4. Périmètre, table par table

Hypothèse : la clé porte `departments: ["social"]`. Comme `requireDepartment()` pour
un humain, **chaque requête doit filtrer sur `clients.departments`** — sinon
« agent social » est un nom, pas une frontière.

### Lecture et écriture

| Table | Lecture | Écriture | Pourquoi cette limite |
| --- | --- | --- | --- |
| `contents` | tout | `status`, `dueAt`, `scheduledAt`, `ownerId`, `title`, `instructions`, `caption`, `hashtags`, `kind`, `network`, `networks`, `updatedAt` | **Jamais `publishedAt`, `publishedUrl`, `publishedById`.** Ces trois colonnes sont la trace qu'un humain a constaté une publication réelle. `etatDuContenu()` (`src/lib/suivi.ts`) s'en sert pour décider ce qui est en retard : un agent qui peut les écrire peut faire dire à l'outil qu'un post est parti alors qu'il n'existe pas. |
| `activity` | — | insertion **obligatoire** à chaque écriture, `actorLabel` renseigné | La colonne est faite pour ça : « Vide quand l'action vient du système ». Sans elle, rien ne distingue une modification de l'agent d'une modification humaine. C'est la piste d'audit. |
| `comments` | oui | insertion | C'est ainsi qu'un chef de projet relance. **Pas `resolvedAt`** : clore la remarque d'un autre est un jugement. |
| `contentLinks` | oui | insertion | Sans risque, et utile pour pointer un montage livré ailleurs. |
| `contentVersions` | oui | `note` seulement | **Jamais `approvedAt`, `rejectedAt`, `rejectionReason`** : c'est la décision du client. Les écrire, c'est valider le travail à sa place. |
| `notifications` | — | insertion (`assignation`, `validation_attendue`) | **Jamais `readAt`** : marquer lue la notification d'un humain la lui cache. Et aucune lecture : l'agent n'a pas à lire le courrier des autres. |

### Lecture seule

| Table | Portée | Pourquoi |
| --- | --- | --- |
| `clients` | **projection stricte** : `id`, `name`, `shortName`, `sector`, `contentTarget`, `projectManagerId`, `departments` | Voir plus bas — c'est la fuite la plus probable. |
| `contractLines` | `label`, `monthlyTarget`, `kind`, `network`, `networks`, `position` | Ce que le mois *doit* contenir. Sans ça, impossible de dire ce qui manque. Aucun montant sur cette table. |
| `brands` | tout | Ton, mots interdits *avec leur raison*, palette. Exactement ce qu'il faut avant de demander une réécriture. |
| `users` | `id`, `name`, `initials`, `departments`, `active` | Savoir à qui assigner, pas qui sont les gens. |
| `assets`, `assetFolders`, `assetUsages` | métadonnées : `filename`, `folderId`, `rights`, `rightsUntil`, dimensions | Permet de repérer un carrousel dont un visuel a des droits expirés. **Jamais les octets** : `storagePath` est un chemin serveur, `/api/media/[id]` reste la seule porte. |
| `shoots`, `shots`, `shootDeliverables` | oui | Un tournage jeudi explique qu'il n'y ait rien de prêt mercredi. Écrire reviendrait à déplacer l'agenda de vraies personnes. |
| `contentStats` | oui | Lecture défendable. **Écriture jamais** : inventer des chiffres de performance, c'est fabriquer la justification de ses propres recommandations. |

### Jamais — dont ce que tu demanderais à tort

1. **`timeEntries` + `hourlyRates` — le piège principal.** Ça ressemble à de la
   gestion de projet (« combien d'heures reste-t-il ? »). Mais
   `hourlyRates.costPerHourCents` est **ce que l'agence paie chaque salarié**.
   Ouvrir la lecture des heures ouvre les salaires par recoupement. `canSeeMoney()`
   les réserve déjà à la direction dans l'interface. Pas même en lecture.

2. **Les colonnes d'argent de `clients`** : `monthlyFeeCents`, `hoursSold`,
   `webMaintenanceCents`, `webHourlyRateCents`, `webHoursSold`. C'est la fuite la
   plus probable de tout ce document, parce que l'écriture naturelle est
   `select().from(clients)` et qu'elle emporte tout. **Un `select({...})` explicite,
   jamais un `select()` nu.**

3. **`invoices`** — hors sujet par ta consigne. À ne pas seulement filtrer :
   la couche API ne devrait pas *importer* la table, pour qu'une jointure
   distraite ne puisse pas la ramener plus tard.

4. **`quoteRequests`** — ressemble à du pipeline (« un client demande quelque chose,
   donc c'est une tâche ! »). C'est une négociation commerciale avec des montants.
   Un agent qui relance un devis parle au nom commercial de l'agence.

5. **`users.email`** — paraît anodin, c'est la façon naturelle d'identifier
   quelqu'un. Ça transforme la clé en annuaire des adresses de l'équipe. Et
   **`inviteToken` / `inviteExpiresAt` sont un moyen de prise de contrôle de compte** :
   jamais exposés, sous aucun prétexte. `passwordHash`, `avatarPath`,
   `accessExpiresAt`, `role` : inutiles, donc exclus.

6. **`messages`, `conversations`, `conversationMembers`** — la messagerie interne.
   Ça se présente comme du contexte qu'un agent adorerait. Ce sont des conversations
   privées entre collègues, y compris sur les clients et sur eux-mêmes.

7. **`clientFiles`**, même ceux en `visibility: "client"`. Les internes sont des
   contrats et des grilles tarifaires ; la distinction tient à une colonne, et elle
   a déjà été fausse une fois (le commentaire du schéma le documente). Le jeu n'en
   vaut pas la chandelle pour un agent de pipeline social.

8. **`sessions` et `apiKeys`** — évident, mais à écrire : un agent qui pourrait
   *écrire* dans `apiKeys` se délivrerait un scope plus large. Le contrôle de scope
   doit être évalué avant le handler, jamais dans une requête que l'agent influence.

9. **`settings`, `promos`** — aucun besoin, et des chemins de fichiers de marque.

10. **`webProjects`, `webMilestones`, `webDeliverables`, `briefs`, `briefFields`** —
    hors périmètre par le pôle. C'est le filtre `departments` qui doit les exclure,
    pas la bonne volonté de l'agent.

### Deux points structurels

**La vérification de périmètre doit vivre dans la requête d'écriture, pas avant.**
Un `select` pour vérifier que le contenu appartient à un client social, puis un
`update` séparé, laisse une fenêtre entre les deux. La condition sur
`clients.departments` doit être **dans le `where` de l'`update` lui-même**.

**Pas de cloisonnement par client dans cette proposition** : la clé voit tous les
clients du pôle social. Si tu veux un jour un agent par client, la colonne
`apiKeys.clientId` est déjà prévue ci-dessus, nullable. La poser maintenant coûte
zéro ; l'ajouter après oblige à reprendre chaque requête écrite entre-temps.

---

## Ce que ça donne comme fichiers

```
src/db/schema.ts             + table apiKeys
drizzle/0019_*.sql           généré, additif, commité
src/lib/tokens.ts            hashToken / newToken, extraits d'auth.ts
src/lib/api-auth.ts          currentKey(), withApiKey()
src/lib/rate-limit.ts        checkRateLimit()
src/proxy.ts                 + "/api/agent" dans isPublic
src/app/api/agent/…/route.ts les routes
scripts/smoke-api.mjs        les tests fumigènes
```

Plus un écran de gestion des clés dans Réglages — création, affichage unique du
jeton, révocation, date de dernier usage.

**Ordre suggéré** : proxy + table + `api-auth` + une seule route en lecture + les
tests fumigènes d'abord. Une lecture qui refuse correctement vaut mieux que six
routes dont on espère qu'elles refusent.
