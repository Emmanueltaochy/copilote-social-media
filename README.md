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
| `/clients` | Fiche client 360° |
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

### Prochaine étape

Brancher Supabase : le découpage `data/` ↔ `lib/` est fait pour que chaque
fixture devienne une requête sans toucher aux écrans. Les types de
`src/data/*.ts` sont la forme attendue des tables.
