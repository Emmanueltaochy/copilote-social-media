# Taochy Pilot

Le poste de pilotage de Taochy Consulting : engagements clients, production,
publication, campagnes et rentabilité.

Implémentation front des 13 écrans du prototype (conservé dans `design/`),
en Next.js (App Router) + TypeScript + Tailwind v4.

## Démarrer

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
npm run lint
```

## L'idée centrale : le rythme attendu

Un seul modèle traverse tout le produit. Le 25 d'un mois de 31 jours, un client
qui a acheté 16 contenus devrait en avoir 12,9. Chaque écran compare le réalisé
à ce rythme et affiche l'écart.

Ce calcul vit dans `src/lib/pacing.ts` et se lit toujours de la même façon,
via `<PacingBar>` :

- **barre foncée** — ce qui est livré ;
- **barre gris clair** — la projection de fin de mois au rythme actuel ;
- **repère or** — où l'on devrait en être *aujourd'hui*.

L'or ne sert qu'à ça (et à la sélection active). Il ne doit apparaître nulle
part ailleurs : c'est ce qui rend le repère lisible d'un coup d'œil.

Le même modèle sert au budget des campagnes (`/ads`) et aux heures vendues
(`/rentabilite`), où le repère marque respectivement la dépense attendue et le
forfait vendu.

## Structure

```
design/                le prototype d'origine, pour référence
src/
  app/                 un dossier par écran (13 routes)
  app/api/health/      sonde utilisée par Docker et le déploiement
  components/
    shell/             Sidebar, en-tête d'écran, portail client
    ui/                primitives : PacingBar, Card, Table, Button, pastilles
    EngagementPanel    volet latéral du cockpit
  data/                jeu de démonstration typé, figé au 25 août 2026
  lib/
    pacing.ts          le moteur de rythme
    tone.ts            tons sémantiques → classes
  state/app.tsx        périmètre client partagé + portail
```

### Tons sémantiques plutôt que couleurs

Les données ne nomment jamais une couleur, elles nomment un **sens** :
`ok`, `warn`, `alert`, `neutral`, `muted`, `info`, `gold`. `src/lib/tone.ts`
traduit ce sens en classes. Changer la palette se fait à un seul endroit.

Une pastille pleine signifie « il se passe quelque chose » ; une pastille
creuse, « rien à signaler ». Un compte sain se lit donc comme un contour, pas
comme un feu vert.

### Jetons de design

Tous les jetons du §7 de la spec (surfaces, encres, lignes, sémantique, échelle
typographique à 6 tailles, rayons) sont déclarés dans le bloc `@theme` de
`src/app/globals.css`. Les écrans utilisent `bg-canvas`, `text-ink-2`,
`text-warn`… jamais un hexadécimal.

## Écrans

| Route | Écran |
| --- | --- |
| `/` | Cockpit agence |
| `/avancement` | Suivi d'avancement client |
| `/calendrier` | Calendrier éditorial |
| `/production` | Pipeline de production (9 étapes) |
| `/contenu` | Détail d'un contenu |
| `/approbations` | Approbations, commentaires épinglés, comparaison de versions |
| `/a-publier` | File de publication du jour |
| `/tournages` | Planning terrain et fiche tournage |
| `/assets` | Bibliothèque d'assets |
| `/ads` | Campagnes et pacing budget |
| `/rapports` | Rapport mensuel + saisie des statistiques |
| `/clients` | Portefeuille : contrats, rythme du mois, accès portail |
| `/contacts` | Annuaire unique (clients, prospects, Swap'Îles) et fiche complète par contact |
| `/rentabilite` | Rentabilité et arbitrages |

Le **portail client** s'ouvre depuis le bas de la barre latérale : mêmes
chiffres, aucun rouage interne, échelle typographique plus large.

## État actuel

Front uniquement. Les données sont des fixtures typées dans `src/data/`, figées
au **mardi 25 août 2026** — la date qui rend la démonstration lisible (81 % du
mois écoulé, deux clients en retard, un contenu non publié).

Les interactions réelles sont implémentées : filtres, sélection, onglets,
navigation, cases à cocher, marquage « publié » avec demande du lien, saisie de
statistiques, comparaison de versions. Rien n'est persisté.

### Trois écarts assumés par rapport au prototype

1. **Le calendrier était décalé d'un jour.** Le 1er août 2026 est un samedi ; la
   grille du prototype le plaçait un vendredi. Corrigé
   (`LEADING_BLANKS = 5` dans `src/data/calendar.ts`).
2. **Le résumé de la file de publication comptait six contenus pour cinq
   lignes.** Les compteurs sont maintenant dérivés des lignes elles-mêmes.
3. **« Contenus en cours » excluait puis incluait les contenus publiés selon
   l'endroit.** Le sous-titre de `/production` exclut désormais la colonne
   « Publié », ce qui aligne le chiffre sur le badge de la barre latérale.

## Déploiement

Push sur `main` → GitHub construit l'image → GHCR → le VPS la tire et redémarre.
Le VPS ne compile jamais : un `next build` sur une machine partagée pèse trop.

La procédure complète (préparation du VPS, secrets, reverse proxy, rollback)
est dans **[DEPLOY.md](./DEPLOY.md)**.

| Fichier | Rôle |
| --- | --- |
| `Dockerfile` | image de production, sortie `standalone`, utilisateur non-root |
| `docker-compose.yml` | ce qui tourne sur le VPS ; port local configurable |
| `.env.example` | à copier en `.env` sur le VPS |
| `.github/workflows/ci.yml` | lint + types + build sur chaque PR |
| `.github/workflows/deploy.yml` | build, publication GHCR, déploiement SSH |

Le déploiement s'arrête si le lint, les types, le build ou la sonde de santé
échouent — dans ce cas l'ancienne version continue de tourner.

### L'annuaire et l'import des prospects

`/contacts` réunit les clients de l'agence (table `clients`) et les fiches sans
client (table `directory_entries` : prospects de l'agent ventes, entreprises
sans site trouvées sur Google Maps, contacts Swap'Îles). La frise d'une fiche
lit `directory_events`, où chaque source à venir (Gmail, Trello, Agenda,
GoCardless) écrira ses lignes.

Les fichiers de l'agent ventes s'importent par `POST /api/annuaire/import`
(clé portant le droit `annuaire:write`, créée dans Réglages → « Import des
prospects ») :

```bash
PILOT_URL=https://app.taochyagency.com PILOT_IMPORT_KEY=tpk_… \
  node scripts/importer-annuaire.mjs ../montagevideo/docs/crm/prospects.json ../montagevideo/docs/crm/sans-site.json
```

Un nouvel envoi met les fiches à jour (rapprochement par identifiant d'origine,
puis e-mail, puis nom et ville). Vérification locale :
`scripts/test-annuaire.mjs` ; démonstration locale : `scripts/dev/seed-annuaire-demo.sql`
et `scripts/dev/abby-demo.mjs` (faux serveur Abby, données fictives).

### « Ce matin » : le bouton « Traité »

Chaque ligne du bloc « Ce matin » de l'accueil peut être marquée « Traité ».
L'archive est en base (table `ce_matin_archives`), partagée par l'équipe, avec
l'empreinte de la ligne au moment de l'archivage : si quelque chose de nouveau
arrive (réponse, commentaire, échéance, montant…), la ligne revient d'elle-même.
La règle complète est écrite dans `src/lib/ce-matin.ts`. Rien n'est écrit dans
Abby. Vérification locale, sur un build de production :
`scripts/test-ce-matin.mjs`.

### Gmail en lecture seule (étape 2)

Réglages → « Gmail (lecture seule) », réservé à la direction : adresse Gmail et
mot de passe d'application (Compte Google → Sécurité → Mots de passe des
applications). Connexion IMAP (imap.gmail.com:993, TLS, bibliothèque
`imapflow`, MIT) ; dossiers ouverts en EXAMINE, lecture en BODY.PEEK : rien
n'est jamais modifié dans la boîte. Le mot de passe est chiffré (AES-256-GCM,
clé `PILOT_SECRETS_KEY` ou fichier `MEDIA_ROOT/.secrets/pilot-secrets.key`,
hors de la base). Relevé toutes les 12 minutes (`src/instrumentation.ts`),
60 derniers jours au premier passage puis incrémental (UID / UIDVALIDITY dans
`gmail_sync`), un seul à la fois (bail en base), 4 minutes au plus.

Seuls les échanges avec une adresse connue de l'annuaire sont gardés, comme
lignes de `directory_events` (source `gmail`) : sens, date, adresses, objet,
extrait de 280 caractères, Message-ID, fil, lien Gmail, noms des pièces
jointes. Les règles (domaines grand public, messages automatiques, extrait,
mots d'urgence) sont dans `src/lib/gmail-regles.ts` ; « sans réponse » dans
`src/lib/gmail.ts` ; « urgent / peut attendre » dans `src/lib/ce-matin.ts`.

Les e-mails envoyés depuis l'admin du site (taochyagency.com/admin/envois.php)
n'arrivent plus dans Gmail (plus de copie cachée). Ils valent quand même
réponse d'Emmanuel : l'import de `prospects.json` range les `envois[]` de
l'agent ventes dans la fiche (`data.envois`, avec le `message_id`), et un envoi
d'un jour postérieur à un e-mail reçu sur la même fiche (ou du même jour, sauf
si l'e-mail reçu y répond) lève « sans réponse ». Règle : `envoiAnterieur` dans
`gmail-regles.ts`.

Rapprochement par la vraie contrepartie seulement : l'adresse From d'un message
reçu (jamais Reply-To, les autres destinataires ni le corps), To et Cc d'un
message envoyé. Tout message du dossier « Messages envoyés » est un envoi
d'Emmanuel, même parti de l'admin du site avec une adresse @taochyagency.com.
Les domaines d'Emmanuel (`DOMAINES_EMMANUEL` dans `gmail-regles.ts` : Swap'Îles,
l'agence, ses sites) et ceux de l'équipe ne sont jamais des clients ; les
messages transactionnels reçus (objet « [Plateforme] », services d'envoi,
expéditeurs automatiques) sont ignorés. Au démarrage et à chaque relevé, les
e-mails gardés avant ces règles sont retirés (avec leurs « Traité » et les
fiches vides créées pour eux). Sur la frise, un envoi noté aussi par l'agent
ventes n'apparaît qu'une fois (version Gmail, « Écrit par l'agent ventes »).

Vérification : `scripts/test-gmail.mjs`, contre un faux serveur Dovecot local
(`GMAIL_IMAP_HOST` / `_PORT` / `_TLS`, pris en compte seulement pour une
adresse de boucle locale).

### Trello, GoCardless et Google Agenda (étape 3, lecture seule)

Trois cartes dans Réglages, réservées à la direction, sur le modèle de Gmail
(« Tester et enregistrer », « Synchroniser maintenant », « Déconnecter ») ;
secrets chiffrés. Relevé toutes les 15 minutes (`src/lib/etape3.ts`, depuis
`src/instrumentation.ts`), borné à 2 minutes, un seul à la fois par service
(bail dans la table `releves`, migration 0031 additive). Seules des requêtes
GET partent (`src/lib/releves.ts`).

- **Trello** (`src/lib/trello.ts`) : clé d'API et jeton (trello.com/power-ups/admin),
  tableaux à suivre (« CEO / EMMANUEL TAOCHY » coché d'office). Carte
  « Client — action » rapprochée par le nom (sans symbole, accents ni casse),
  ou reliée / déliée à la main depuis la fiche (`links`).
- **GoCardless** (`src/lib/gocardless.ts`) : jeton « Read-only », live ou sandbox.
  Client rapproché par e-mail, sinon nom d'entreprise, ou à la main. Mandats,
  abonnements et paiements sur la fiche ; encaissé Abby + GoCardless sans
  double compte (`sansDoubleCompte` dans `src/lib/etape3-regles.ts`).
- **Google Agenda** (`src/lib/agenda.ts`) : adresse secrète iCal (une par agenda),
  lue avec `ical.js` (récurrences, exceptions, fuseaux). Seuls les rendez-vous
  rattachés à une fiche (invité connu, nom dans le titre, mot choisi sur la
  fiche) sont gardés ; description limitée à 280 caractères.

Règles de « Ce matin » écrites en tête de `src/lib/ce-matin.ts`. Vérification
locale contre de faux serveurs (le script démarre lui-même Pilot) :
`scripts/test-etape3.mjs` (`CAPTURES=dossier` pour les captures Playwright).

### Clés enregistrées : toutes chiffrées

Toutes les clés saisies dans Réglages (Claude, Abby, Google Drive, Metricool,
stock vidéos, adresse Claude.ai, Gmail, clé de signature des médias, et celles
de l'étape 3) sont chiffrées en base, en AES-256-GCM (`src/lib/chiffrement.ts`,
`src/lib/secrets.ts`). L'écriture chiffre toujours ; la lecture accepte aussi
l'ancienne forme en clair. Au démarrage, `convertirSecretsEnClair()` chiffre
sur place ce qui est encore en clair, ligne par ligne, dans une transaction,
en vérifiant le déchiffrement avant d'écrire. Sans clé lisible (ni
`PILOT_SECRETS_KEY`, ni fichier `MEDIA_ROOT/.secrets/pilot-secrets.key`), ou si
un secret déjà chiffré ne s'ouvre pas avec la clé actuelle, rien n'est converti
et le journal le dit (sans aucun secret).

**La clé maîtresse est le seul moyen de relire les secrets** : en garder une
copie hors du serveur (gestionnaire de mots de passe). La perdre ne casse rien
d'autre : il suffit alors de recoller chaque clé dans Réglages.

Aucune route qui sert un fichier ne peut atteindre `.secrets` : tous les
chemins viennent de la base et passent par `src/lib/chemin-media.ts`.
Vérification locale (le script démarre lui-même le serveur) :
`scripts/test-secrets.mjs`.

### Prochaine étape

Brancher Supabase : le découpage `data/` ↔ `lib/` est fait pour que chaque
fixture devienne une requête sans toucher aux écrans. Les types de
`src/data/*.ts` sont la forme attendue des tables.
