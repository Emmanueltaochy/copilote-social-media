# Audit UX/UI de Pilot — novembre 2026

Audit fait sur un build de production local (`npm run build && npx next start`),
base de démonstration, avec quatre rôles : direction (Emmanuel, deux pôles),
membre du pôle social (Léa), membre du pôle web (Nina), client du portail
(Lagon Spa). Chaque écran de la navigation et les fiches ont été parcourus et
capturés en 1440 px et sur iPhone 13 (Playwright), puis chaque lien visible par
chaque rôle a été appelé pour repérer les 404, les redirections et les pages
interdites.

Priorités : **1** = bloque ou induit en erreur · **2** = confusion · **3** = finition.
État : **Corrigé** (dans cette livraison) · **Reste** (proposition, non faite).

---

## 1. Le rôle de chaque espace (règle retenue)

| Espace | Rôle | Ce qui y vit |
| --- | --- | --- |
| **Aujourd'hui** (`/`) | Quoi faire maintenant | Ce matin, À traiter, À venir, la semaine, les clients en retard, les tournages, l'activité |
| **Contacts** (`/contacts`, `/contacts/[id]`, `/clients`, `/avancement`) | Tout sur un client | Annuaire, fiche unique, portefeuille, engagements du mois |
| **Modules métier** (Calendrier, Production, À valider, Réception, Statistiques, et « Plus ») | Travailler sur un type d'objet | Contenus, validations, messages, chiffres, tournages, campagnes… |
| **Réglages** (`/reglages`, `/equipe`, `/compte`) | Configuration | Raccordements, équipe, compte |

Le filtre client (en haut à droite) appartient aux modules métier. L'accueil,
les contacts et le portefeuille montrent toujours toute l'agence.

---

## 2. Problèmes relevés

### Architecture de l'information

| # | Écran | Ce qui ne va pas | Pourquoi c'est gênant | Correction | Prio | État |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | Toute l'agence | Le filtre client (cookie gardé **un an**) s'appliquait aussi à l'accueil, au portefeuille « Clients », au cockpit et à l'avancement. Après avoir regardé un client, le « Bonjour » du lendemain, le portefeuille et les compteurs ne montraient plus que lui, sans qu'on s'en souvienne. | C'est le « dashboard mélangé aux données client » : on lit un tableau de bord global qui n'en est plus un, et l'on croit l'agence en bonne santé (ou vide). | Le filtre ne vaut plus que pour les modules métier (liste `ROUTES_FILTRABLES`) ; le sélecteur n'est affiché que là. L'accueil n'obéit qu'à un lien explicite `/?client=…`, et le dit (« Filtré sur … · Voir tous les clients »). Le cookie devient un cookie de session. | 1 | Corrigé |
| A2 | `/clients/[id]` et `/contacts/[id]` | Deux fiches pour un même client : la « fiche complète » (Contacts) et « Contrat, portail et réglages » (Clients), chacune renvoyant vers l'autre par un bouton. | On ne sait pas laquelle est la bonne ; le rythme du mois n'était que sur l'une, les e-mails et l'argent que sur l'autre. | **Une seule fiche** : `/contacts/[id]`, avec des onglets « Vue d'ensemble · Contrat et suivi · Documents et factures · Portail et accès ». `/clients/[id]` redirige vers l'onglet « Contrat et suivi ». Toutes les fonctions sont reprises (engagement, lignes de contrat, pôle web, modifier le contrat, archiver, pièces jointes, factures, accès portail, charte). | 1 | Corrigé |
| A3 | Clients, Avancement, Cockpit, accueil | Le même tableau « rythme du mois par client » à **quatre** endroits (portefeuille, suivi d'avancement, cockpit, bloc « Engagements » de l'accueil). | Quatre écrans à tenir cohérents, et l'équipe ne sait pas lequel consulter. | `/avancement` devient l'unique « Engagements du mois » ; `/cockpit` y redirige (ses autres blocs sont déjà sur l'accueil et dans « À publier ») ; l'accueil ne montre plus que les clients en retard ; « Clients » devient « Portefeuille » (contrats et création d'un client). | 2 | Corrigé |
| A4 | Accueil | Douze blocs, dont des statistiques (abonnés, croissance de l'audience, meilleure publication, réseaux du mois) et un doublon (« Chez le client » = « À traiter » + page À valider). Page de 4 700 px. | L'accueil doit dire quoi faire ; les chiffres d'audience disent comment ça va et vivent déjà dans Statistiques. | Accueil recentré : Ce matin → À traiter / À venir → La semaine → Engagements (en retard seulement) / Tournages → Activité. Repères du haut cliquables (publiés/vendus, clients en retard, prévus sur 7 j). Audience et meilleure publication restent dans Statistiques. 3 700 px. | 2 | Corrigé |
| A5 | Avancement | Le total « Écart » additionnait l'avance d'un client (+175 contenus) au retard des autres : « +151,3 » en vert alors que sept clients étaient en retard. | Induit en erreur : le chiffre global rassure à tort. | Remplacé par « Retard cumulé » (somme des retards client par client). Colonne « État » ajoutée, noms cliquables vers la fiche. | 1 | Corrigé |
| A6 | Contacts / Clients | Deux boutons de création sans explication : « Nouvelle fiche » (Contacts) ne crée que des prospects ; un client sous contrat se crée ailleurs (Clients). | On crée un client comme prospect, sans contrat ni portail. | En-tête de Contacts : « Nouveau client » (vers le formulaire du portefeuille) et « Nouveau contact » ; les états vides « Ajouter un client » mènent directement au formulaire. | 2 | Corrigé |
| A7 | Fiche prospect | Blocs vides « Contrats en cours », « Projets web et contenus », « Documents » qui disent seulement « ce n'est pas un client ». | Bruit, la fiche d'un prospect semble cassée. | Ces blocs n'apparaissent que pour un client. « Il a signé ? Relier au client » passe dans l'en-tête de la fiche. | 3 | Corrigé |
| A8 | Fiche client | « Modifier la fiche » tout en bas de la colonne de droite, après tout l'historique ; « ← Tous les contacts » en bas de page. | Il fallait faire défiler toute la frise pour corriger un numéro de téléphone. | « Modifier la fiche » dans la carte d'en-tête ; retour « ← Contacts » au-dessus du titre. | 2 | Corrigé |
| A9 | Fiche client | L'ordre des blocs ne suivait pas l'usage (Contrat, Argent, puis « en cours »), et le rythme du mois n'y figurait pas. | Ce qu'on consulte le plus (ce qui est en cours, où en est le mois) était le plus bas. | Ordre : En cours → Contrat (avec « Ce mois-ci : 2 / 12 publiés · En retard ») → Argent → Documents ; à droite E-mails → Rendez-vous → Trello → Historique. | 2 | Corrigé |
| A10 | Devis (pôle web) | La liste montre les demandes de tous les pôles et lie le nom du client vers `/clients/[id]` : 404 pour un membre du pôle web sur un client social. | Lien cassé, et page « introuvable » pour une donnée pourtant affichée. | Le nom n'est un lien que si la fiche est visible pour la personne ; le lien mène à la fiche unique. **Question ouverte** : le pôle web doit-il voir les demandes de devis des clients sociaux ? (règle de droits, non modifiée) | 1 / 2 | Corrigé (lien) · Reste (règle) |

### Navigation

| # | Écran | Ce qui ne va pas | Pourquoi | Correction | Prio | État |
| --- | --- | --- | --- | --- | --- | --- |
| N1 | Rail de gauche, pôle web | Le rail montrait « Nouveau contenu », « À publier », « Campagnes », « Bibliothèque », « Terrain » à l'équipe web : chaque clic renvoyait vers `/web` sans rien faire. Le logo menait aussi à `/` → `/web`. | Liens trompeurs pour tout un pôle. | Rail selon le pôle ; il ne garde que des gestes (rechercher, nouveau contenu, Jarvis, à publier, terrain, thème) et ne répète plus la barre. Logo vers `/web` côté web. Recherche : « Nouveau contenu » retiré côté web. | 1 | Corrigé |
| N2 | « Plus » (pôle social) | 18 entrées à plat, sans ordre lisible, dont trois écrans de suivi presque identiques (Semaine de suivi, Avancement, Cockpit) et « Clients » à côté de « Contacts ». | Fourre-tout : on ne trouve pas, on n'ose pas cliquer. | « Plus » rangé en quatre sections : Contenus, Suivi client, Outils, Direction. Cockpit retiré (redirigé), Clients et Avancement deviennent des onglets de Contacts. | 2 | Corrigé |
| N3 | Barre principale | 8 entrées + Plus ; « Tournages » dans la barre mais « À publier » dans Plus ; pôle web avec « Clients » **et** « Contacts ». | Trop d'entrées au même niveau, doublon côté web. | 7 entrées du quotidien côté social (Aujourd'hui, Contacts, Calendrier, Production, À valider, Réception, Statistiques) ; 5 côté web (Projets, Briefs, Contacts, Devis, Jarvis). | 2 | Corrigé |
| N4 | Contacts / Clients / Avancement | Sur `/clients/[id]` ou `/avancement`, c'était « Plus » qui s'allumait, pas « Contacts ». | On ne sait plus dans quel espace on est. | Entrée « Contacts » allumée sur tout l'espace (annuaire, fiche, portefeuille, engagements), avec des onglets « Annuaire · Portefeuille · Engagements du mois ». | 2 | Corrigé |
| N5 | Fiches (contenu, tournage, projet, campagne, rapport, brief) | Le retour était tantôt en bas (« ← Pipeline »), tantôt un bouton (« Retour au planning », « Retour aux campagnes », « Retour »), tantôt un lien (« ← Tous les projets »). | Retour imprévisible. | Un seul modèle : « ← Rubrique » au-dessus du titre, via `PageHeader back`. | 2 | Corrigé |
| N6 | Libellés | Barre ≠ titre de page : « À valider »/« Approbations », « Tournages »/« Planning tournages », « Campagnes »/« Campagnes ads », « Bibliothèque »/« Bibliothèque d'assets », « Calendrier »/« Calendrier éditorial », « Production »/« Pipeline de production », « Devis »/« Demandes de devis », « Semaine de suivi »/« Suivi de la semaine », « Avancement »/« Suivi d'avancement ». | On doute d'être arrivé au bon endroit ; anglicismes (« ads », « assets »). | Titres alignés sur la barre ; « Engagements du mois », « Portefeuille », « Suivi de la semaine ». | 2 | Corrigé |
| N7 | Mobile | Pas de barre du bas : tout passait par le menu hamburger (26 entrées à plat). | Trois gestes pour aller au calendrier depuis le téléphone. | Barre du bas (Aujourd'hui, Contacts, Calendrier, À valider + Menu ; côté web Projets, Briefs, Contacts, Devis + Menu) ; menu latéral rangé par sections, avec le filtre client là où il agit. Bulle de discussion remontée au-dessus de la barre. | 2 | Corrigé |
| N8 | Sélecteur de client | Affiché sur tous les écrans, y compris ceux qu'il ne filtre pas (Contacts, Jarvis, Réglages…). Caché sur téléphone sans autre accès. | Il annonce un filtre qui ne s'applique pas. | Affiché seulement sur les écrans filtrables ; sur téléphone, dans le menu. | 2 | Corrigé |
| N9 | Menu « Mon compte » | Le rail avait une icône « réglages » (roue) qui menait à « Mon compte », alors que « Réglages » est ailleurs. | Confusion entre compte et réglages de l'agence. | Retiré du rail (Mon compte reste dans le menu de l'avatar). | 3 | Corrigé |

### Cohérence visuelle

| # | Écran | Ce qui ne va pas | Correction | Prio | État |
| --- | --- | --- | --- | --- | --- |
| V1 | Accueil, fiche, calendrier | Un même statut avait deux noms : « En validation » / « Validation client », « Prêt » / « Prêt à publier », « Révision » / « Révision interne » (deux tables de libellés, plus une troisième dans la fiche contact). | `StatusTag` lit désormais `CONTENT_STATUS` (une seule source) ; légendes de l'accueil et du calendrier alignées. | 2 | Corrigé |
| V2 | Plusieurs écrans | Espaces perdus dans le texte : « Forfait450 € », « Heures vendues10 h », « obligatoire(s)à », etc. (18 occurrences de `{""}` au lieu de `{" "}`). | Corrigé partout. | 2 | Corrigé |
| V3 | Accueil, portail | Actions de bloc en icône seule (flèche ↗ de 36 px) : « Calendrier », « Statistiques »… n'étaient lisibles qu'au survol. | Lien libellé (« Calendrier → »), 44 px sur téléphone. | 2 | Corrigé |
| V4 | Thème sombre | Pilules actives (barre, onglets, filtres) en `bg-night` noir sur fond presque noir : l'onglet actif ne se voyait presque plus. | Pilules actives en `bg-ink text-paper` (claire sur fond sombre, sombre sur fond clair). | 2 | Corrigé |
| V5 | En-têtes | Accueil et calendrier construisent leur propre titre au lieu de `PageHeader` (tailles et marges légèrement différentes). | Garder `PageHeader` pour tout nouvel écran ; migrer ces deux-là. | 3 | Reste |
| V6 | Boutons | Trois tailles de bouton primaire (`px-[11px] py-[7px]` en production, `px-5 py-3` sur l'accueil, `px-5 py-[9px]` dans Contacts). | Créer un composant `Bouton` (primaire / secondaire, 44 px) et l'utiliser partout. | 3 | Reste |
| V7 | Dates | Formats variés : « jeu. 12 nov. · 10:00 », « 12 nov. », « 17/11/2026 », « mardi 17 novembre ». | Fixer deux formats (court : « jeu. 12 nov. », long : « jeudi 12 novembre ») dans `lib/dates`. | 3 | Reste |
| V8 | États vides | Trois styles (EmptyState, `Empty` de l'accueil, phrases grises simples). | Un seul composant. | 3 | Reste |

### Mobile

| # | Écran | Ce qui ne va pas | Correction | Prio | État |
| --- | --- | --- | --- | --- | --- |
| M1 | Contacts | Filtres rapides de 34 px de haut. | 44 px sur téléphone. | 2 | Corrigé |
| M2 | Fiche contact | Lignes « en cours », documents, bouton « Modifier la fiche », « Relier au client » sous 44 px. | 44 px minimum. | 2 | Corrigé |
| M3 | Accueil | Le bloc « À traiter » venait après « À venir » sur téléphone. | « À traiter » en premier sur téléphone. | 2 | Corrigé |
| M4 | Production | Le tableau de neuf colonnes déborde horizontalement (voulu, défilement latéral), mais aucune indication de défilement. | Ajouter un dégradé de bord ou une vue liste sur téléphone. | 3 | Reste |
| M5 | À valider, Calendrier, Réglages | Beaucoup de petites cibles (puces de clients, sélecteurs, cases à 32–36 px). | Passer les puces et petits boutons à 44 px sur téléphone, écran par écran. | 2 | Reste |

### Portail client

| # | Écran | Ce qui ne va pas | Correction | Prio | État |
| --- | --- | --- | --- | --- | --- |
| P1 | Accueil du portail | « Ce qui arrive » montrait les statuts internes du pipeline au client (« Dérush », « Brief », « Révision interne »). | Mots du calendrier du portail : « En préparation », « À valider », « Validé », « Publié ». | 1 | Corrigé |
| P2 | Accueil du portail | « Publié ce mois » listait **tout** le mois (181 lignes pour Lagon Spa, page de 9 000 px). | Les 8 plus récents, avec le total et « Tout voir » vers le calendrier. | 2 | Corrigé |
| P3 | Barre du portail | Dix onglets ; sur téléphone, seuls trois sont visibles, sans signe qu'il y en a d'autres. | Regrouper Documents, Factures et Devis sous « Documents », ou passer à une barre du bas. | 2 | Reste |
| P4 | En-tête du portail | « Espace client · Taochy Consulting » : nom légal de l'agence, pas sa marque. | Vérifier le réglage « nom de l'agence » (donnée, pas code). | 3 | Reste |

### Droits (chaque rôle ne voit que ce qui le concerne)

Parcours des liens visibles, avant → après :

| Rôle | Liens testés | Avant | Après |
| --- | --- | --- | --- |
| Direction | 554 | aucun lien cassé | aucun lien cassé |
| Pôle social | 241 | aucun lien cassé | aucun lien cassé |
| Pôle web | 124 | 6 liens qui renvoyaient ailleurs (`/`, `/contenu`, `/a-publier`, `/ads`, `/assets`, `/terrain` → `/web`) et 1 lien 404 (`/clients/[id]` d'un client social, depuis Devis) | aucun |
| Portail | 200 | aucun lien cassé ; le portail ne montre aucune donnée interne (hors statuts, voir P1) | aucun |

Les pages réservées (Rentabilité, Réglages, Équipe) restent invisibles et
redirigées pour l'équipe ; un client du portail est renvoyé au portail depuis
toute adresse de l'agence (vérifié par `test-annuaire` et `test-ce-matin`).

---

## 3. Anciennes adresses

| Ancienne adresse | Mène désormais à |
| --- | --- |
| `/clients/[id]` | `/contacts/[id]?onglet=contrat` (la fiche unique, onglet « Contrat et suivi ») |
| `/cockpit` | `/avancement` (« Engagements du mois ») |
| `/clients` | inchangée, renommée « Portefeuille » (onglet de Contacts) |

Les notifications et e-mails déjà envoyés qui pointent vers `/clients/[id]`
continuent de fonctionner.

---

## 4. Reste à faire (par priorité)

1. **Règle (A10)** : décider si le pôle web voit les demandes de devis des clients sociaux.
2. **P3** : barre du portail sur téléphone (dix onglets).
3. **M5** : cibles de 44 px sur À valider, Calendrier et Réglages.
4. **V5–V8** : composants communs (bouton, état vide, formats de date), en-têtes de l'accueil et du calendrier.
5. **M4** : indication de défilement dans Production sur téléphone.
6. **P4** : nom commercial dans l'en-tête du portail.
