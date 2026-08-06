# Mise en ligne

Guide pour non-développeur. Deux copier-coller, une fois pour toutes.

Ensuite, à chaque modification : tu me dis quoi changer, je pousse, le site se
met à jour tout seul en deux minutes.

Adresse finale : **https://marketing.taochyconsulting.fr**

---

## Avant de commencer : le DNS

À faire dans ton panneau Hostinger (section **Domaines → DNS**), sur
`taochyconsulting.fr` :

| Type | Nom | Valeur |
| --- | --- | --- |
| A | `marketing` | l'adresse IP de ton VPS |

L'IP du VPS est affichée sur sa page dans le panneau Hostinger.

La propagation prend de quelques minutes à une heure. Si tu lances l'étape 1
avant que ce soit propagé, ce n'est pas grave : le site marchera en `http://`
et il suffira de relancer la même commande plus tard pour obtenir le `https://`.

---

## Étape 1 — Une commande sur le VPS

Ouvre le terminal du VPS : panneau Hostinger → ton VPS → **Terminal du
navigateur**. (Ou en SSH si tu préfères, c'est pareil.)

Colle ceci, en une seule fois, et appuie sur Entrée :

```bash
apt-get update -qq && apt-get install -y -qq git && \
rm -rf /tmp/pilot-setup && \
git clone -q https://github.com/Emmanueltaochy/copilote-social-media.git /tmp/pilot-setup && \
bash /tmp/pilot-setup/scripts/setup-vps.sh --domain marketing.taochyconsulting.fr
```

Le terminal Hostinger ouvre directement une session `root` — d'où l'absence de
`sudo`, qui n'est d'ailleurs pas installé sur ces images. Si ton invite n'affiche
pas `root@`, ajoute `sudo ` devant chacune des quatre lignes.

Ça prend 2 à 5 minutes. Le script installe ce qui manque, configure le domaine,
pose le certificat HTTPS et prépare la connexion avec GitHub.

**Il ne touche à rien de ce qui tourne déjà** sur ton VPS : il choisit un port
libre, ajoute un site nginx à côté des autres, et s'arrête net si un autre site
utilise déjà ce domaine.

À la fin, il affiche trois blocs à copier. Garde la fenêtre ouverte.

---

## Étape 2 — Trois secrets dans GitHub

Va sur le dépôt :
**Settings → Secrets and variables → Actions → New repository secret**

Crée ces trois secrets, en recopiant ce que le script a affiché :

| Nom | Valeur |
| --- | --- |
| `VPS_HOST` | l'IP affichée |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | tout le bloc de clé, de `-----BEGIN` à `-----END` inclus |

Le nom doit être écrit exactement comme dans le tableau, en majuscules.

---

## Étape 3 — Préviens-moi

Je lance le premier déploiement et je vérifie que le site répond.

---

## Ensuite, au quotidien

Tu me dis ce que tu veux changer. Je modifie, je pousse, et le site se met à
jour tout seul.

**Voir où ça en est** : sur le dépôt GitHub, onglet **Actions**. Un rond vert =
en ligne. Un rond rouge = le déploiement a été refusé, et **l'ancienne version
continue de tourner** — le site ne tombe jamais à cause d'une mauvaise version.

**Vérifier la version en ligne** : https://marketing.taochyconsulting.fr/api/health

---

## Changer de domaine plus tard

Pour passer à `taochyagency.com` : ajoute le DNS chez ton registrar, puis
relance la commande de l'étape 1 en changeant seulement le domaine :

```bash
bash /opt/copilote-social-media/scripts/setup-vps.sh --domain marketing.taochyagency.com
```

L'ancienne adresse continue de répondre tant que tu ne la retires pas.

---

## En cas de souci

**« Le site ne répond pas »**

```bash
cd /opt/copilote-social-media && docker compose ps && docker compose logs --tail 50 app
```

**Revenir à la version précédente**

```bash
cd /opt/copilote-social-media && git log --oneline -5
```

Prends le code à 7 caractères d'une version qui marchait, puis :

```bash
sed -i 's|:latest|:LE_CODE|' /opt/copilote-social-media/.env
cd /opt/copilote-social-media && docker compose up -d
```

Dans tous les cas : copie-colle-moi le message d'erreur, je m'en occupe.

---

## Détails techniques

Pour référence — rien de tout ça n'est à faire à la main.

- Le VPS ne compile jamais. L'image est construite par GitHub, publiée sur
  GHCR, et le VPS ne fait que la télécharger. Un `next build` sur une machine
  partagée consomme trop de mémoire et mettrait en danger tes autres SaaS.
- Le conteneur écoute sur `127.0.0.1` uniquement : il n'est joignable que par
  nginx, qui gère le HTTPS.
- Le paquet GHCR peut rester privé : le VPS s'authentifie avec un jeton
  temporaire, valable le temps du déploiement, et se déconnecte ensuite.
- Le déploiement s'arrête si le lint, les types, la compilation ou la sonde de
  santé échouent.
- Le conteneur tourne sous un utilisateur sans privilèges.

Secrets facultatifs : `VPS_PORT` si le SSH n'est pas sur le port 22,
`VPS_APP_DIR` si le dossier n'est pas `/opt/copilote-social-media`.
