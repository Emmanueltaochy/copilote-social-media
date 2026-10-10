# Taochy Pilot — inventaire des fonctionnalités

État au 9 octobre 2026, relevé dans le code (le README, plus ancien, décrit
encore une maquette sans base : il est dépassé).

Ce document sert de point de départ à une **refonte du design**. Il dit ce que
chaque écran fait et pour qui, afin que la nouvelle interface garde toutes les
fonctions existantes. La dernière section liste les contraintes techniques à
respecter pendant la refonte.

---

## 1. Qui utilise l'outil

| Profil | Accès | Interface |
| --- | --- | --- |
| **Direction** | tout, y compris montants, coûts, marges, équipe, réglages | outil agence (bureau) |
| **Équipe** | tout le travail, aucun montant | outil agence (bureau) |
| **Équipe sur le terrain** | tournage du jour, publication, envoi de médias | `/terrain`, pensé pour téléphone |
| **Client** | son seul portail | `/portail`, échelle de texte plus grande |

L'agence a **deux pôles** : *Social* (réseaux sociaux) et *Web* (sites). Un
sélecteur Social / Web en haut de la barre latérale change la navigation. Un
collaborateur peut appartenir à l'un, l'autre ou les deux ; la direction a
toujours les deux.

Un **sélecteur de client** dans la barre latérale restreint les écrans à un
client ou montre tout le portefeuille.

---

## 2. Entrée dans l'outil (pages publiques)

| Route | Fonction |
| --- | --- |
| `/bienvenue` | Création du tout premier compte (direction). Se ferme dès qu'un compte existe. |
| `/connexion` | Connexion par e-mail + mot de passe. Lien « Mot de passe oublié ? ». |
| `/connexion/oubli` | Demande d'un lien de réinitialisation par e-mail (réponse identique que le compte existe ou non). |
| `/connexion/reinitialiser/[jeton]` | Choix d'un nouveau mot de passe (lien valable 1 h, usage unique). Ferme les autres sessions. |
| `/invitation/[jeton]` | Un collaborateur ou un contact client invité choisit son mot de passe. |

Mise en page commune (`AuthShell`) : formulaire à gauche, visuel de l'agence à
droite ; sur téléphone, le visuel passe en fond. Logo(s) et visuel viennent
des réglages ; sans visuel, dégradé aux couleurs de l'agence.

---

## 3. Outil agence — pôle Social

| Route | Écran | Ce qu'il fait |
| --- | --- | --- |
| `/` | **Suivi** (accueil) | La semaine jour par jour : contenus programmés, contenus sans date, et écart entre ce qui est vendu au mois et ce qui existe. |
| `/cockpit` | **Cockpit agence** | Engagements de tous les clients triés par urgence, et ce qui est à publier aujourd'hui. |
| `/avancement` | **Suivi d'avancement** | Engagement client par client : livré, projection fin de mois, repère « où on devrait en être ». |
| `/calendrier` | **Calendrier éditorial** | Grille du mois avec les contenus planifiés. |
| `/preparer` | **Préparer le mois** | Génère d'un coup les contenus du mois pour tout le portefeuille, d'après le contrat de chaque client, avec aperçu avant création. |
| `/production` | **Pipeline de production** | Tableau en colonnes par étape : idée → brief → tournage → dérush → création → révision → validation → prêt → publié (+ « manqué »). Assignation d'un responsable sur chaque carte. |
| `/contenu` | **Nouveau contenu** | Formulaire de création d'un contenu. |
| `/contenu/[id]` | **Fiche contenu** | Fiche, responsable, publication (lien du post), médias, versions successives, commentaires, historique. Envoi direct de fichiers volumineux. |
| `/approbations` | **Approbations** | Contenus en attente de validation client, commentaires épinglés, comparaison de versions. |
| `/a-publier` | **À publier** | File du jour : en retard, programmés pas encore prêts, publiés aujourd'hui. Marquer « publié » en donnant le lien. |
| `/tournages` | **Tournages** | Planning terrain en colonnes d'état (ce qui n'est pas encore sécurisé d'abord). |
| `/tournages/[id]` | **Fiche tournage** | Équipe, shotlist, matériel (avec préréglages), livrables attendus, droits à l'image, médias issus du tournage. |
| `/assets` | **Bibliothèque d'assets** | Photos et vidéos par client, rangées en dossiers (création, déplacement, suppression), import en flux jusqu'à plusieurs Go, vignettes. |
| `/ads` | **Campagnes** | Campagnes publicitaires et rythme de dépense du budget dans le mois. |
| `/ads/[id]` | **Fiche campagne** | Ensembles de publicités, saisie hebdomadaire des résultats, historique, réglages. |
| `/rapports` | **Rapports** | Liste des clients → un rapport par client. |
| `/rapports/[id]` | **Rapport mensuel** | Document imprimable/envoyable au client : rythme, publications, tournages, médias, campagnes. Saisie des statistiques directement dans le tableau. Bouton imprimer. |
| `/heures` | **Mes heures** | Chacun saisit ses heures par client et par semaine (base du coût interne). |
| `/clients` | **Clients** | Portefeuille + création d'un client. |
| `/clients/[id]` | **Fiche client** | Contrat et décomposition de l'engagement (lignes par format/réseau), pôles, accès au portail (invitations des contacts), charte graphique, **pièces jointes** (interne / partagé, téléchargement un par un ou en ZIP), factures, pôle web. |
| `/devis` | **Demandes de devis** | Demandes arrivées des portails clients, statut visible du client, note interne. |
| `/equipe` | **Équipe** *(direction)* | Collaborateurs, rôles, pôles, invitations, accès temporaires (date de fin), désactivation. |
| `/rentabilite` | **Rentabilité** *(direction)* | Forfait vendu − coût des heures (tarif horaire en vigueur la semaine), marges, arbitrages. |
| `/reglages` | **Réglages** *(direction)* | Nom de l'agence, couleurs du portail, logos (social / web), visuel de connexion, mot d'accueil, **bannières d'offres** affichées dans les portails, formulaire de devis. |
| `/compte` | **Mon compte** | Identité, photo de profil, changement de mot de passe. |

## 4. Outil agence — pôle Web

| Route | Écran | Ce qu'il fait |
| --- | --- | --- |
| `/web` | **Projets web** | Tableau des projets par étape ; chaque carte dit ce qui bloque (souvent côté client). |
| `/web/[id]` | **Fiche projet** | Le projet, jalons, brief, livrables soumis au client (fichiers ou liens). |
| `/web/briefs` | **Briefs** | Tous les briefs, ceux en attente d'abord. |
| `/web/briefs/[id]` | **Brief** | Questionnaire du brief, champ par champ, et envoi au client. |

Clients, devis, heures, équipe et réglages sont partagés avec le pôle Social.

## 5. Terrain (téléphone)

| Route | Fonction |
| --- | --- |
| `/terrain` | « Aujourd'hui » : le tournage du jour et ce qui bloque, puis ce qui doit partir aujourd'hui. |
| `/terrain/tournages` | Tournages à venir. |
| `/terrain/[id]` | Fiche tournage cochable au pouce (matériel, plans, livrables). |
| `/terrain/publier` | Copier la légende, ouvrir le réseau, revenir noter le lien. |
| `/terrain/medias` | Envoyer ce qu'on vient de prendre, retrouver un visuel. |

## 6. Portail client

Onglets : Accueil · À valider · Médias · Documents · Devis · Factures · Projets
(si le client a un projet web) · Charte.

| Route | Fonction |
| --- | --- |
| `/portail` | Ce qu'on attend du client, où en est son mois, bannière d'offre de l'agence. |
| `/portail/valider` | Contenus à valider et maquettes web à approuver : valider ou demander une retouche. |
| `/portail/contenu/[id]` | Un contenu en grand, avec sa légende, pour le juger à taille réelle. |
| `/portail/medias` | Ses photos et vidéos livrées, avec les mêmes dossiers que l'agence, téléchargeables. |
| `/portail/documents` | Deux listes : ce que l'agence partage, ce que le client a envoyé (dépôt de fichiers). |
| `/portail/devis` | Demander un devis et suivre son statut. |
| `/portail/factures` | Factures par année, total annuel, téléchargement. |
| `/portail/projets` | Avancement des projets web en jalons franchis. |
| `/portail/brief/[id]` | Remplir le brief web (enregistrement à chaque champ). |
| `/portail/charte` | Charte graphique remplie à deux mains (client + agence). |

L'agence peut ouvrir un **aperçu du portail** depuis le bas de sa barre latérale.

## 7. Fonctions transversales

- **Messagerie interne** (bulle en bas à droite) : fil d'équipe + conversations en tête-à-tête.
- **Notifications** (cloche) : assignation, validation attendue, validé, retouche demandée, publié, tournage, message, devis.
- **Envoi par e-mail** d'un contenu, d'un rapport, d'un fichier ou d'une invitation, depuis l'outil.
- **E-mails automatiques** depuis la boîte de l'agence (une boîte par pôle possible).
- **API pour agents** externes (`/api/agent/*`, doc dans `docs/API-AGENT.md`) : lecture et avancement du pipeline social, sans accès à l'argent, aux messages ni aux documents.
- **Stockage des médias** sur le serveur, avec vignettes et contrôle d'accès à chaque fichier.

---

## 8. Pour la refonte du design : ce qu'il faut savoir

**Où vit le design actuel**
- Jetons (couleurs, typo, rayons) : bloc `@theme` de `src/app/globals.css`. Les écrans utilisent des classes comme `bg-canvas`, `text-ink-2`, `border-line`, `text-warn`, jamais d'hexadécimal. Changer la palette = changer ce fichier en priorité.
- Primitives : `src/components/ui/` (Card, Button, Table, PacingBar, pastilles…).
- Coquille : `src/components/shell/` (Sidebar, TopBar, Screen, ChatDock, Bell, ClientPortal).
- Écrans d'entrée : `src/components/AuthShell.tsx`.
- Tons sémantiques (`ok`, `warn`, `alert`, `info`, `muted`, `gold`…) traduits en classes dans `src/lib/tone.ts`.
- Prototype d'origine pour référence : `design/`.

**La lecture centrale à préserver** : le « rythme attendu » (`src/lib/pacing.ts`,
composant `<PacingBar>`) — barre foncée = livré, gris clair = projection fin de
mois, repère or = où l'on devrait être aujourd'hui. On le retrouve sur le
suivi, l'avancement, les campagnes et la rentabilité. La refonte peut changer
son apparence, mais il doit rester lisible d'un coup d'œil.

**Contraintes**
- Next.js 16 (App Router), React 19, Tailwind v4. Lire `AGENTS.md` : cette version de Next diffère de ce qu'on connaît, la doc est dans `node_modules/next/dist/docs/`.
- Ne pas toucher à la logique (actions serveur, routes `/api`, `src/db`, `src/lib`) pour une refonte visuelle : elle porte les droits d'accès.
- Les montants ne s'affichent qu'à la direction (`canSeeMoney`) : à garder dans les nouveaux composants.
- Trois publics, trois contextes : bureau (dense), terrain (téléphone, gros boutons), portail client (plus aéré, plus grand, couleurs de l'agence prises dans les réglages).
- Vérifier avant de pousser : `npm run lint`, `npx tsc --noEmit`, `npm run build`. Un push sur `main` met en ligne automatiquement.
