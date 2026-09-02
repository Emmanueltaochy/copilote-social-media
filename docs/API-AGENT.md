# API des agents

Ouvre le pipeline social à un agent externe — lire l'état des contenus, les
faire avancer, relancer. Rien d'autre.

Spécification machine : [`openapi.yaml`](../openapi.yaml) à la racine.

---

## Ce que l'API ne donne pas

À dire avant le reste, parce que c'est la moitié de la conception :

| Jamais exposé | Pourquoi |
| --- | --- |
| Factures, devis | Hors sujet, et la couche n'importe même pas les tables |
| Forfaits, heures vendues, tarifs horaires | Les conditions commerciales de chaque client en un appel |
| Coûts salariaux (`hourly_rates`) | Ressemble à de la gestion de projet, révèle les salaires par recoupement |
| Courriels, jetons d'invitation, mots de passe | Un jeton d'invitation est un moyen de prise de contrôle de compte |
| Messagerie interne | Des conversations privées entre collègues |
| Documents clients | La distinction interne / partagé tient à une colonne |
| Le pôle web | Une clé sociale ne voit pas les projets web |

Et deux gestes qu'un agent ne peut pas faire :

- **Publier.** `publie` ne s'atteint pas par l'API. C'est la trace qu'une
  personne a vu le post en ligne, et le suivi calcule les retards dessus.
- **Valider ou refuser une version.** C'est la décision du client ; la forger
  reviendrait à approuver le travail à sa place.

---

## Authentification

Une clé, dans l'en-tête `Authorization`. Jamais dans un cookie — sinon un
navigateur déjà connecté pourrait piloter l'API à l'insu de son utilisateur.

```bash
curl -H "Authorization: Bearer tpk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
     https://marketing.taochyconsulting.fr/api/agent/pipeline
```

### Créer une clé

Sur le VPS, dans le conteneur applicatif :

```bash
docker compose exec app node scripts/create-api-key.mjs \
  --name "Agent chef de projet — social" \
  --scopes pipeline:read,pipeline:write \
  --pole social \
  --days 90
```

Le jeton s'affiche **une seule fois**. Seule son empreinte SHA-256 part en
base : personne, pas même toi, ne peut le retrouver ensuite. Si tu le perds,
crée-en un autre et révoque celui-ci.

Options : `--client <uuid>` restreint la clé à un seul client ; `--days`
donne une date de fin (sans elle, la clé ne périme pas).

### Révoquer

```sql
update api_keys set revoked_at = now() where id = '…';
```

La ligne n'est pas supprimée : qui a créé la clé, quand elle a servi et quand
elle est morte restent lisibles.

### Les deux droits

| Droit | Ce qu'il ouvre |
| --- | --- |
| `pipeline:read` | Les six routes de lecture |
| `pipeline:write` | Créer un contenu, le faire avancer, commenter |

Une clé sans le bon droit reçoit **403**, avec le nom du droit manquant.

---

## Le périmètre d'une clé

Deux bornes, toujours appliquées ensemble :

- **le pôle** — une clé sociale ne voit aucun client web, ni ses contenus, ni
  ses tournages, ni les personnes du pôle web ;
- **le client**, si la clé est nominative (`--client`).

Le périmètre est posé **avant** tout paramètre : aucun argument ne peut
l'élargir. Demander explicitement un client hors périmètre rend une liste
vide, jamais une erreur — dire « ce client existe mais pas pour toi »
confirmerait son existence.

Même logique sur une ressource précise : hors périmètre, c'est **404**, avec
le message d'un contenu inexistant.

---

## Cadence

| | Par minute et par clé |
| --- | --- |
| Lectures | 120 |
| Écritures | 20 |

Les deux budgets sont séparés : consommer son quota de lecture n'empêche pas
d'écrire. Au-delà, **429** avec un `Retry-After` en secondes. Chaque réponse
porte `X-RateLimit-Limit` et `X-RateLimit-Remaining`.

Le compteur repart à zéro au redémarrage du conteneur, donc à chaque
déploiement.

---

## Les codes de réponse

| Code | Sens |
| --- | --- |
| `200` / `201` | Fait |
| `400` | Requête mal formée — le message dit quoi corriger |
| `401` | Clé absente, inconnue, révoquée ou expirée |
| `403` | Clé valide, mais sans le droit demandé |
| `404` | Inexistant **ou** hors périmètre — indiscernables, à dessein |
| `409` | Bien formé, mais l'état actuel s'y oppose (règle d'ordre) |
| `429` | Cadence dépassée |
| `500` | Erreur interne — le détail va au journal, jamais au client |

Les messages sont en français et destinés à être lus tels quels.

**Aucune route ne redirige.** Un `302` serait suivi par le client HTTP, qui
recevrait une page en `200` et la lirait comme un succès.

---

## Lecture

### L'état d'ensemble — le premier appel à faire

```bash
curl -H "Authorization: Bearer $CLE" \
     "https://marketing.taochyconsulting.fr/api/agent/pipeline?jours=3"
```

Rend le total, la ventilation par statut et par client, et trois anomalies :

- **`retards`** — échéance dépassée, jamais publié. Mesuré sur les dates et non
  sur le statut : un contenu marqué « prêt » depuis trois semaines est en
  retard.
- **`manques`** — prévu, jamais publié. *Toujours vide aujourd'hui* : aucune
  écriture ne pose ce statut. Voir « Ce qui manque encore » plus bas.
- **`attentesDeValidation`** — en validation client depuis plus de `jours`
  jours. Le seuil est rappelé dans la réponse, parce que « 3 en attente » ne
  veut rien dire sans « depuis plus de combien ».

### Le pipeline, filtré

```bash
# Ce qui attend une validation ou est prêt à partir
curl -H "Authorization: Bearer $CLE" \
     "https://marketing.taochyconsulting.fr/api/agent/contents?statut=validation,pret"

# Ce qui doit sortir cette semaine
curl -H "Authorization: Bearer $CLE" \
     "https://marketing.taochyconsulting.fr/api/agent/contents?debut=2026-09-01&fin=2026-09-07"
```

Filtres : `client`, `statut` (séparés par des virgules), `debut`, `fin`
(sur la publication prévue, bornes incluses), `limite` (1–200, 50 par défaut).

### Un contenu en détail

```bash
curl -H "Authorization: Bearer $CLE" \
     "https://marketing.taochyconsulting.fr/api/agent/contents/$ID"
```

Le contenu, ses versions et son fil de commentaires.

### Le portefeuille et les contrats

```bash
curl -H "Authorization: Bearer $CLE" \
     https://marketing.taochyconsulting.fr/api/agent/clients
```

Chaque client vient avec son `contrat` — ce que le mois **devrait** contenir,
ligne par ligne. Sans ça, un agent voit ce qui existe mais jamais ce qui
manque.

### Les tournages et l'équipe

```bash
curl -H "Authorization: Bearer $CLE" \
     https://marketing.taochyconsulting.fr/api/agent/shoots

curl -H "Authorization: Bearer $CLE" \
     https://marketing.taochyconsulting.fr/api/agent/team
```

Savoir qu'un tournage a lieu jeudi explique pourquoi rien n'est prêt mercredi.
`/team` rend la charge de chacun par statut, bornée au périmètre de la clé.

---

## Écriture

Chaque écriture inscrit une ligne dans le journal d'activité, **dans la même
transaction que la modification**. Une écriture qui réussirait sans sa trace
serait pire qu'une écriture refusée : le pipeline aurait changé et
l'historique dirait que personne ne l'a touché.

La trace porte le **nom de la clé**, pas celui d'une personne. Dans
l'historique, une action d'agent se distingue toujours d'une action humaine.

### Créer un contenu

```bash
curl -X POST \
  -H "Authorization: Bearer $CLE" \
  -H "Content-Type: application/json" \
  -d '{
    "client": "00000000-0000-0000-0000-000000000000",
    "titre": "Carrousel rentrée",
    "format": "carrousel",
    "reseaux": ["instagram", "facebook"],
    "consignes": "Trois vues, ton chaleureux",
    "prevuLe": "2026-09-15T09:00:00Z"
  }' \
  https://marketing.taochyconsulting.fr/api/agent/contents
```

Le contenu naît toujours au statut `idee`. Le statut n'est pas un paramètre :
un contenu créé « prêt à publier » n'aurait traversé aucune des étapes qui
font qu'il est prêt.

### Faire avancer un contenu

```bash
curl -X PATCH \
  -H "Authorization: Bearer $CLE" \
  -H "Content-Type: application/json" \
  -d '{"statut": "creation"}' \
  https://marketing.taochyconsulting.fr/api/agent/contents/$ID
```

Colonnes modifiables : `titre`, `statut`, `format`, `reseaux`, `consignes`,
`legende`, `hashtags`, `prevuLe`, `echeanceLe`, `responsable`.

`null` se distingue de l'absence : effacer une échéance se dit
`{"echeanceLe": null}`, ne pas y toucher se dit en n'écrivant rien.

### Commenter

```bash
curl -X POST \
  -H "Authorization: Bearer $CLE" \
  -H "Content-Type: application/json" \
  -d '{"texte": "La légende dépasse la limite Instagram, à raccourcir."}' \
  https://marketing.taochyconsulting.fr/api/agent/contents/$ID/comments
```

C'est ainsi qu'un chef de projet relance : sur le contenu concerné, là où
celui qui le fabrique regardera.

---

## La règle d'ordre du pipeline

```
idee → brief → tournage → derush → creation → revision → validation → pret → publie
       ─────   ────────   ──────                ────────
                    facultatives
```

**On avance dans l'ordre, en sautant ce qui est facultatif.** Sauter une étape
obligatoire ne raccourcit pas le travail, ça efface la trace qu'il a eu lieu.

**On recule librement.** Une reprise demandée par le client renvoie en
création depuis n'importe où. Une règle qui n'autorise que la marche avant
bloquerait la première correction réelle — donc dès le premier jour d'usage.

Un refus rend **409** avec la raison et la prochaine étape possible :

```json
{
  "error": "On ne passe pas de « En création » à « Prêt à publier » : l'étape « Validation client » est obligatoire. Prochaine étape possible : « Révision interne »."
}
```

### Ce qui est facultatif, et pourquoi

Déclaré dans [`src/data/content.ts`](../src/data/content.ts), en **deux listes
qu'il ne faut pas confondre** :

- **`SAUTABLES_PAR_NATURE`** — `brief`, `tournage`, `derush`. Un carrousel ou
  une actualité ne se tourne pas et n'a rien à briefer. Exiger un tournage à
  vide obligerait à mentir au pipeline, et un pipeline auquel on ment cesse
  d'être un état des lieux. **Ça restera vrai.**

- **`SAUTABLES_FAUTE_DE_MODELE`** — `revision`. La révision interne est
  obligatoire chez certains clients et inutile chez d'autres ; aucune colonne
  ne dit lesquels. **C'est une dette, pas une décision.** Le jour où `clients`
  porte un « révision interne exigée », c'est cette liste qu'il faut vider, et
  la règle de transition qui doit consulter le client plutôt qu'une constante.

---

## Comment c'est cloisonné, côté code

Les routes **n'accèdent pas à la base**. Une règle eslint interdit tout import
de `@/db`, `@/db/schema`, `drizzle-orm`, `postgres` et de leurs chemins
relatifs sous `src/app/api/agent/`. Le seul chemin est
[`src/lib/agent-data.ts`](../src/lib/agent-data.ts), qui applique le périmètre.

Ce n'est pas une convention : la règle est une **erreur** eslint, et les étapes
`npm run lint` de `ci.yml` et `deploy.yml` font échouer la PR.

Un registre y déclare le cloisonnement de chaque ressource — `client`, `pole`
ou `aucun` — et `exige()` confronte ce que l'accès applique à ce que le
registre annonce. **Une ressource que personne n'a déclarée est refusée, pas
servie :** le silence n'ouvre rien.

Les agrégats passent par le même verrou que les listes. C'est le point le plus
délicat : une liste qui fuit se voit dans le JSON, un `COUNT` qui fuit ne se
voit jamais.

---

## Vérifier que tout tient

```bash
BASE=https://marketing.taochyconsulting.fr \
PGURL="postgres://…" \
node scripts/smoke-api.mjs
```

113 assertions contre un serveur et une base réels : les refus, le
cloisonnement, l'absence de donnée commerciale dans les réponses, la règle
d'ordre dans les deux sens, et le fait qu'une trace impossible annule la
modification.

---

## Ce qui manque encore

- **Le statut `manque` n'est posé par personne.** Il est déclaré dans le
  schéma mais aucune écriture ne l'attribue, donc `anomalies.manques` est
  toujours vide. Le remède retenu est de **dériver** cet état plutôt que de le
  stocker — échéance dépassée, jamais publié, figé depuis N jours — dans
  `src/lib/suivi.ts`, à côté de `etatDuContenu()` qui calcule déjà le retard
  par les dates. Le stocker demanderait un ordonnanceur et écraserait le vrai
  statut sans possibilité de revenir en arrière. Chantier séparé.

- **Pas d'écran de gestion des clés.** Une commande suffit tant qu'il y en a
  deux ou trois.

- **Aucune écriture sur les tournages, les versions ou les documents.** Par
  choix, pas par oubli.
