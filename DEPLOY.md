# Déploiement

Chaîne : **push sur `main` → GitHub construit l'image → GHCR → le VPS la tire et
redémarre.**

Le VPS ne compile jamais. Un `next build` sur une petite machine partagée
consomme beaucoup de mémoire et peut faire tomber les autres SaaS qui tournent
à côté — c'est pour ça que la construction se fait sur GitHub.

---

## 1. Préparer le VPS (une seule fois)

En SSH sur le VPS Hostinger.

### Docker

```bash
docker --version || curl -fsSL https://get.docker.com | sh
docker compose version
```

### Récupérer le repo

```bash
sudo mkdir -p /opt/copilote-social-media
sudo chown "$USER":"$USER" /opt/copilote-social-media
git clone https://github.com/Emmanueltaochy/copilote-social-media.git /opt/copilote-social-media
cd /opt/copilote-social-media
```

Seuls `docker-compose.yml` et `.env` servent ici — le code est déjà dans l'image.

### Choisir un port libre

```bash
ss -tlnp | grep 3001   # aucune sortie = port libre
```

Si 3001 est pris par un autre SaaS, prends-en un autre et reporte-le dans `.env`.

```bash
cp .env.example .env
nano .env            # ajuster APP_PORT si besoin
```

### Accès à l'image

Le plus simple : rendre le package public une fois.
GitHub → repo → **Packages** → `copilote-social-media` → **Package settings** →
**Change visibility** → *Public*.

Si tu préfères le garder privé, il faut authentifier le VPS auprès de GHCR :

```bash
echo "TON_PAT_read:packages" | docker login ghcr.io -u Emmanueltaochy --password-stdin
```

### Premier démarrage

```bash
cd /opt/copilote-social-media
docker compose pull
docker compose up -d
curl -s localhost:3001/api/health
# {"status":"ok","service":"copilote-social-media","version":"..."}
```

---

## 2. Clé SSH pour GitHub

Sur le VPS, une clé dédiée au déploiement (pas ta clé personnelle) :

```bash
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/gh_deploy -N ""
cat ~/.ssh/gh_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
cat ~/.ssh/gh_deploy        # <- la clé PRIVÉE, à copier entièrement
```

---

## 3. Secrets GitHub

Repo → **Settings → Secrets and variables → Actions → New repository secret** :

| Secret | Valeur | Obligatoire |
| --- | --- | --- |
| `VPS_HOST` | IP ou domaine du VPS | oui |
| `VPS_USER` | utilisateur SSH | oui |
| `VPS_SSH_KEY` | contenu de `~/.ssh/gh_deploy`, `-----BEGIN` et `-----END` compris | oui |
| `VPS_PORT` | port SSH si ce n'est pas 22 | non |
| `VPS_APP_DIR` | chemin si ce n'est pas `/opt/copilote-social-media` | non |

---

## 4. Reverse proxy

Le conteneur n'écoute que sur `127.0.0.1` : il n'est pas joignable depuis
l'extérieur tant qu'un proxy ne le publie pas. À adapter à ce qui tourne déjà
sur ta machine.

### nginx

`/etc/nginx/sites-available/copilote` :

```nginx
server {
    server_name pilot.taochy.re;      # <- ton sous-domaine

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/copilote /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d pilot.taochy.re
```

### Coolify / Dokploy

Pas besoin de `docker-compose.yml` ni de secrets SSH : pointer le panel sur le
repo, il détecte le `Dockerfile` et redéploie à chaque push. Port interne :
**3000**.

---

## Au quotidien

Tu me dis quoi changer ici, je pousse sur `main`, le déploiement part tout seul.

**Suivre un déploiement** — repo → onglet **Actions** → workflow *Deploy*.
Le job échoue si le lint, les types, le build ou la sonde de santé échouent :
en cas d'échec, l'ancienne version continue de tourner.

**Vérifier la version en ligne**

```bash
curl -s https://pilot.taochy.re/api/health
```

`version` correspond aux 7 premiers caractères du commit déployé.

**Revenir en arrière** — chaque image est taguée par commit :

```bash
cd /opt/copilote-social-media
nano .env    # APP_IMAGE=ghcr.io/emmanueltaochy/copilote-social-media:<sha>
docker compose up -d
```

**Logs**

```bash
docker compose logs -f app
```

---

## Ce que ça ne fait pas encore

Il n'y a pas de base de données : les données sont des fixtures figées au
25 août 2026 (`src/data/`). Le jour où Supabase arrive, il faudra ajouter les
variables d'environnement correspondantes dans `.env` **et** dans
`docker-compose.yml` — la section `environment:` du service `app`.
