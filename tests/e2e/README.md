# Suite end-to-end — **liée au bac à sable, à porter**

> **Cette suite ne tourne pas en l'état.** Elle est commitée telle qu'elle a été
> écrite et exécutée, dans un conteneur éphémère qui n'existe plus. Elle est ici
> pour que son *contenu* survive — ce qu'elle vérifie ne se réécrit pas de mémoire.

Dernier passage complet : **489 assertions vertes, 0 rouge, aucune erreur JS**,
sur 17 suites, contre le build `standalone` réel et un PostgreSQL réel.

---

## Ce qui empêche de la lancer

Quatre dépendances au bac à sable, toutes dans les en-têtes des fichiers :

| Ligne | Problème |
| --- | --- |
| `import pw from "/opt/node22/lib/node_modules/playwright/index.js"` | Playwright était installé globalement, il n'est pas dans `package.json` |
| `const SP = "/tmp/claude-0/…/scratchpad"` | Répertoire de session, 17 occurrences |
| `chromium.launch({ executablePath: "/opt/pw-browsers/chromium" })` | Navigateur préinstallé du bac à sable |
| `psql -h 127.0.0.1 -p 5451 -U postgres` | Base du bac à sable ; le `docker-compose.yml` du projet ne publie aucun port |

`stack.sh` et `services.sh` supposent en plus un PostgreSQL sur 5451 et un serveur
SMTP bouchon sur 2525.

### Ce que coûterait le portage

Environ 3 à 4 h : ajouter `playwright` en devDependency, remplacer l'import absolu,
paramétrer répertoire / base / port par variables d'environnement, et réécrire
`stack.sh` pour monter sa propre base. **Ce n'est pas prévu.** Ce fichier existe
justement pour le cas où ça n'arrive jamais.

---

## Comment c'était organisé

- `stack.sh` — recrée la base, recopie `.next/static` et `public` à côté de
  `.next/standalone`, démarre le serveur sur le port 4030. **Ne compile pas** :
  `npm run build` doit précéder.
- `services.sh` — relance PostgreSQL et le SMTP bouchon quand ils meurent.
- `all.sh` — enchaîne les 17 suites, chacune sur une base neuve, et totalise.
- `e2e-*.mjs` — une suite par domaine. Chaque assertion s'écrit
  `ok("ce qu'on vérifie", condition)` et s'affiche `OK` ou `ÉCHEC`.

Les suites vérifient par trois moyens : le **DOM rendu** (ce que l'utilisateur
voit), le **code HTTP** (`403` et non `302` sur les routes d'API), et l'**état en
base** via `psql` — parce qu'un écran qui affiche « enregistré » n'est pas une
preuve que quelque chose a été enregistré.

---

## Ce que les 489 assertions vérifient, domaine par domaine

### `contrat` — 64 assertions · la fiche client et les deux pôles

Le plus gros bloc, et le plus riche en règles métier.

- La fiche d'un client **social** montre l'engagement mensuel et sa décomposition
  posts / stories ; elle ne montre aucun bloc web.
- La fiche d'un client **web** montre la maintenance mensuelle, aucune
  décomposition de contenus, et le nom du client sur le bloc du pôle.
- La fiche d'un client **mixte** montre les deux blocs à la fois.
- **Forfait contre régie** : au forfait, l'écran donne le taux horaire réellement
  obtenu et pas d'enveloppe d'heures ; en régie, il compte les heures contre
  l'enveloppe vendue, calcule le montant à facturer et rappelle le calcul.
- Repasser de régie à forfait **efface** le tarif horaire et l'enveloppe, **mais
  pas** la maintenance.
- Le montant d'un site vit sur le projet, pas sur le client : le « vendu » de la
  fiche est la somme des projets.
- Un projet s'ouvre **depuis la fiche**, sans repasser par le tableau web, et la
  fiche dit ce que son absence empêche.
- Le portefeuille change de colonnes selon le pôle actif (Projets / Vendu /
  Maintenance côté web, Avancement du mois / Forfait côté social).
- **L'équipe web voit le projet mais aucun montant** — ni vendu, ni maintenance.

### `web` — 49 assertions · projets, briefs, portail web

- Cloisonnement des pôles : un compte social est renvoyé s'il tente le pôle web ;
  un compte web n'a pas le calendrier éditorial.
- Les **jalons du type de projet sont posés d'emblée** à la création.
- Le brief reprend le modèle du type choisi (e-commerce : N questions), passe en
  « envoyé », et **un courriel part réellement** — vérifié dans le journal SMTP —
  avec un lien vers le portail et **non** vers le questionnaire nu.
- Le client ouvre son brief, le déclare terminé, la date est posée, il peut le
  relire.
- Un client ne voit ni les briefs ni les fichiers d'un autre.

### `connexion` — 32 assertions · la porte d'entrée

- Disposition à deux volets : formulaire à gauche, visuel à droite, largeur de
  lecture bornée.
- Sans visuel envoyé, un **dégradé aux couleurs de l'agence** — aucune image de
  marque codée en dur.
- Sur téléphone : le volet de droite disparaît, les **deux marques passent en haut**,
  le formulaire occupe la largeur, rien ne déborde.
- Les trois images (logo social, logo web, visuel) s'enregistrent et se servent.
- **Le visuel et le logo se chargent sans être connecté** — sinon la page de
  connexion ne peut pas s'afficher.
- Un jeton d'invitation inventé tombe sur « Lien expiré ».

### `portail` — 31 assertions · l'espace client

- L'accueil annonce ce qui attend une réponse et le mois en cours, sans dérouler
  médias, documents ni charte : ce sont des onglets.
- L'onglet **Projets est absent tant qu'il n'y a pas de projet**.
- La bibliothèque reprend les dossiers de l'agence, la racine ne déballe pas leur
  contenu, le fil d'Ariane fonctionne.
- **Le document interne n'apparaît pas**, le partagé oui, et les deux listes sont
  distinctes.
- Un client ne voit **rien** du client voisin.
- Un compte de l'agence n'entre pas dans le portail d'un client.

### `preparer` — 30 assertions · fabriquer le mois

- Les lignes de contrat produisent **13 contenus** pour Cap Marine, **aucun le
  week-end**, étalés sur N jours distincts, tous dans le mois demandé.
- Relancer sur un client déjà à jour **ne crée rien** ; le mois suivant repart à
  zéro.
- Les contenus créés apparaissent dans le pipeline et dans le calendrier.

### `quatre` — 29 assertions · réseaux multiples, tournages, cloche

- Un contenu vise **plusieurs réseaux** : cases à cocher, réaffichage fidèle des
  réseaux enregistrés.
- Le tableau des tournages a cinq colonnes ; la carte dit **ce qui bloque le
  départ** et le lieu ; aucun bouton ne mène directement à « Annulé ».
- Le panneau de la cloche est monté **à la racine**, peint au-dessus du contenu et
  non derrière — un défaut d'empilement corrigé et verrouillé ici.

### `final` — 29 assertions · liens externes, filtres, matériel

- Un visuel hébergé ailleurs (Drive, Frame.io) : libellé, lien cliquable, pas de
  vignette, et le client comprend pourquoi.
- Le filtre par client de la bibliothèque : un identifiant invalide ou un uuid
  inconnu **retombe sur « tous » sans casser la page**.
- Listes de matériel personnelles : mémorisées, ajoutables à un tournage, un
  élément déjà présent est désactivé sans disparaître, et **retirer un préréglage
  ne touche pas au matériel déjà posé sur un tournage**.

### `factures` — 26 assertions · la comptabilité du client

- Dépôt depuis la fiche, groupement par année, totaux par année, rappel du reste dû.
- **L'onglet existe avant la première facture**, sans pastille, avec un message
  d'attente ; la pastille ne compte que les factures **à régler**.
- Le client télécharge la sienne ; **un autre client reçoit 403**.
- Un compte non-direction ne peut pas déposer de facture — et la route **répond**
  au lieu de rediriger.

### `dossiers` — 24 assertions · l'arborescence des médias

- Création à la racine d'un client, sous-dossiers, fil d'Ariane.
- Un média rangé dans un dossier **n'apparaît pas dans le dossier voisin**, qui se
  déclare vide.
- Un import à la racine y reste ; un déplacement le fait apparaître dans sa
  nouvelle destination.

### `poles-clients` — 24 assertions · le cloisonnement social / web

- Un client porte un ou deux pôles ; chaque membre ne voit que les siens.
- Le cockpit, les listes déroulantes et le portefeuille sont filtrés en conséquence.
- **L'adresse directe ne suffit pas** : la fiche d'un client hors pôle répond 404.
- L'admin voit tout, selon le pôle actif, et garde l'accès direct aux deux.
- Ajouter un pôle à un client existant le fait apparaître de l'autre côté.

### `banniere` — 23 assertions · l'offre affichée au portail

- Enregistrement avec audience et bouton ; affichage chez le client visé.
- **Elle précède le mois en cours mais pas les alertes.**
- Pause, reprise, dates : une offre terminée ou pas encore commencée **ne fuite pas**.
- Un compte équipe ne peut ni la créer ni atteindre la route du visuel — qui
  **répond** au lieu de rediriger.

### `chat` — 23 assertions · messagerie interne et photo de profil

- Photo recadrée en carré de 256 px, servie aux connectés, **refusée aux visiteurs**.
- Fil d'équipe, pastille, cloche, notification citant l'auteur, **aucun courriel**
  pour un message interne.
- Le tête-à-tête se crée au premier message et **réécrire n'en crée pas un second**.
- Le portail client n'a pas la messagerie ; un compte client n'y accède pas.

### `devis` — 23 assertions · la demande depuis le portail

- Enregistrement, statut initial « nouvelle », budget annoncé, texte du client.
- Le statut avance côté agence ; le client voit que sa demande est partie
  **mais pas la note interne**.

### `livrables` — 21 assertions · les allers-retours web

- Livrable en attente, consigne, lien vers la maquette.
- **Un refus sans motif est refusé** ; la reprise enregistre son motif ; resoumettre
  remet en attente et efface la remarque traitée.
- Un PDF soumis comme livrable s'ouvre depuis l'espace client.
- Un autre client ne voit pas ces livrables.

### `suivi` — 22 assertions · le tableau de la semaine

- Un contenu du jour non prêt est **signalé** ; les contenus sans date sont comptés ;
  ce qui manque au contrat est compté.
- **La couleur vient de la distance à l'échéance, pas du statut** : aujourd'hui non
  prêt = alerte, à deux jours = à finir.
- Navigation de semaine en semaine, retour à la semaine en cours, et **une adresse
  bricolée ne casse rien**.

### `documents` — 20 assertions · interne contre partagé

- La fiche montre les deux ; le portail ne montre que le partagé.
- **Le fichier interne est refusé au client au niveau de la route**, pas seulement
  masqué dans la liste.
- Ce que le client dépose remonte à l'agence.

### `mobile` — 18 assertions · le téléphone

- Barre latérale repliée hors écran, bouton de menu, fermeture au toucher à côté et
  à la navigation.
- La cloche reste dans la barre du haut **sans ouvrir le menu**.
- Tous les écrans tiennent dans la largeur et ne débordent pas en hauteur.
- On peut écrire un message depuis un téléphone — **vérifié en base**, pas à l'écran.

---

## Les trois motifs qui reviennent partout

Si le portage n'a lieu que partiellement, ce sont ces trois-là qu'il faut sauver
en premier — ce sont eux qui ont attrapé de vrais défauts :

1. **Une route d'API répond, elle ne redirige pas.** Plusieurs suites vérifient un
   `403` explicite avec `redirect: "manual"`, parce qu'un `302` suivi par `fetch`
   rend une page en `200` que l'appelant lit comme un succès. C'est le défaut réel
   corrigé dans `currentDirection()`.

2. **Le cloisonnement se vérifie au niveau de la route, pas de l'affichage.** Masquer
   un document dans une liste n'est pas le protéger : chaque suite qui touche à une
   frontière (client / client, pôle / pôle, équipe / direction) tente l'accès direct
   par l'URL.

3. **L'état se lit en base, pas à l'écran.** Un écran qui affiche « enregistré » ne
   prouve rien ; toutes les assertions d'écriture repassent par `psql`.
