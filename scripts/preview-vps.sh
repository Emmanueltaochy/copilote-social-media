#!/usr/bin/env bash
#
# Préversion sur le VPS, à côté de la production. Lancé par
# .github/workflows/preview.yml (ou à la main, en root) :
#
#   bash scripts/preview-vps.sh --domain preview.taochyagency.com [--refresh-db]
#
# Ce que le script fait :
#   1. écrit deploy/preview/.env (mot de passe et port choisis une seule fois) ;
#   2. démarre la base de la préversion ;
#   3. la remplit avec une COPIE de la base de production (première fois, ou
#      --refresh-db) — la production n'est que lue (pg_dump) ;
#   4. démarre l'application de la préversion, médias de la production en
#      lecture seule, sans aucun envoi d'e-mail ;
#   5. ajoute un site nginx pour le domaine et son certificat HTTPS.
#
# Ce que le script ne fait JAMAIS : arrêter, recréer ou modifier un conteneur,
# un volume ou un site nginx de la production.

set -euo pipefail

DOMAIN="preview.taochyagency.com"
REFRESH=0
PROD_DB="copilote-db"
PROD_APP="copilote-social-media"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --refresh-db) REFRESH=1; shift ;;
    *) echo "Option inconnue : $1"; exit 1 ;;
  esac
done

HERE="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$HERE/deploy/preview"
ENV="$DIR/.env"
COMPOSE=(docker compose -f "$DIR/docker-compose.yml" --env-file "$ENV")

say() { echo "▸ $*"; }

port_taken() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
set_env() {
  if grep -q "^$1=" "$ENV" 2>/dev/null; then sed -i "s|^$1=.*|$1=$2|" "$ENV"; else echo "$1=$2" >> "$ENV"; fi
}

# ------------------------------------------------------------------ .env --
touch "$ENV"; chmod 600 "$ENV"
grep -q '^PREVIEW_DB_PASSWORD=' "$ENV" || set_env PREVIEW_DB_PASSWORD "$(openssl rand -hex 24)"
if ! grep -q '^PREVIEW_PORT=' "$ENV"; then
  for p in $(seq 3091 3099); do port_taken "$p" || { set_env PREVIEW_PORT "$p"; break; }; done
fi
PORT="$(grep '^PREVIEW_PORT=' "$ENV" | cut -d= -f2)"
[[ -n "$PORT" ]] || { echo "Aucun port libre entre 3091 et 3099."; exit 1; }
set_env PREVIEW_DOMAIN "$DOMAIN"
set_env APP_VERSION "${GITHUB_SHA:-manuel}"

# Les médias de la production : on retrouve leur volume par le conteneur.
MEDIA="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data/assets"}}{{.Name}}{{end}}{{end}}' "$PROD_APP")"
[[ -n "$MEDIA" ]] || { echo "Volume des médias de production introuvable."; exit 1; }
set_env PROD_MEDIA_VOLUME "$MEDIA"
say "Port local $PORT · médias de production en lecture seule ($MEDIA)"

# ------------------------------------------------------------------ base --
"${COMPOSE[@]}" pull -q
"${COMPOSE[@]}" up -d db
for i in $(seq 1 30); do
  [[ "$(docker inspect -f '{{.State.Health.Status}}' pilot-preview-db 2>/dev/null)" == "healthy" ]] && break
  sleep 2
done

MARQUE="$DIR/.base-copiee"
if [[ $REFRESH -eq 1 || ! -f "$MARQUE" ]]; then
  say "Copie de la base de production vers la préversion (lecture seule côté production)"
  docker stop pilot-preview-app >/dev/null 2>&1 || true
  docker exec "$PROD_DB" pg_dump -U pilot -d pilot --no-owner --no-privileges --clean --if-exists \
    | docker exec -i pilot-preview-db psql -U pilot -d pilot -q -v ON_ERROR_STOP=1 >/dev/null
  date -Iseconds > "$MARQUE"
  say "Base copiée"
else
  say "Base de la préversion conservée (copie du $(cat "$MARQUE")) — --refresh-db pour la recopier"
fi

# ----------------------------------------------------------- application --
"${COMPOSE[@]}" up -d app
for i in $(seq 1 30); do
  st="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}' pilot-preview-app 2>/dev/null || true)"
  [[ "$st" == "healthy" || "$st" == "running" ]] && curl -fsS -m 3 "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break
  sleep 5
done
curl -fsS -m 5 "http://127.0.0.1:$PORT/api/health" || { "${COMPOSE[@]}" logs --tail 60 app; exit 1; }
echo

# ----------------------------------------------------------------- nginx --
VHOST="/etc/nginx/sites-available/$DOMAIN"
if [[ ! -f "$VHOST" ]]; then
  cat > "$VHOST" <<EOF
# Préversion Taochy Pilot — généré par scripts/preview-vps.sh
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    location / {
        client_max_body_size 0;
        proxy_read_timeout 300s;
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # Une préversion n'a rien à faire dans Google.
        add_header X-Robots-Tag "noindex, nofollow" always;
    }
}
EOF
  ln -sf "$VHOST" "/etc/nginx/sites-enabled/$DOMAIN"
  if nginx -t >/dev/null 2>&1; then systemctl reload nginx; say "Site nginx ajouté"; else rm -f "/etc/nginx/sites-enabled/$DOMAIN" "$VHOST"; echo "nginx refuse la configuration : rien n'a été rechargé."; exit 1; fi
fi

if ! grep -q "listen 443" "$VHOST"; then
  if getent ahostsv4 "$DOMAIN" >/dev/null 2>&1; then
    command -v certbot >/dev/null || apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect >/dev/null \
      && say "HTTPS actif" || say "certbot a échoué : la préversion répond en HTTP pour l'instant."
  else
    say "Le DNS de $DOMAIN ne pointe pas encore ici : ajoute l'enregistrement A, puis relance."
  fi
fi

say "Préversion en ligne : https://$DOMAIN"
