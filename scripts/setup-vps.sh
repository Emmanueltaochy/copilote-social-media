#!/usr/bin/env bash
#
# Installation complète sur le VPS. À lancer une seule fois — mais il est
# rejouable sans rien casser si besoin.
#
#   sudo bash scripts/setup-vps.sh --domain marketing.taochyconsulting.fr
#
# Ce que le script fait :
#   1. installe Docker et nginx s'ils manquent
#   2. choisit un port local libre (les autres SaaS ne sont pas touchés)
#   3. écrit le .env
#   4. configure nginx pour le domaine, puis le certificat HTTPS
#   5. génère la clé SSH que GitHub utilisera pour déployer
#   6. affiche les 3 secrets à copier dans GitHub
#
# Ce que le script ne fait JAMAIS :
#   - redémarrer Docker ou nginx (rechargement seulement)
#   - toucher aux conteneurs, vhosts ou certificats existants

set -euo pipefail

DOMAIN="marketing.taochyconsulting.fr"
APP_DIR="/opt/copilote-social-media"
REPO="https://github.com/Emmanueltaochy/copilote-social-media.git"
SKIP_TLS=0
EMAIL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --dir)    APP_DIR="$2"; shift 2 ;;
    --email)  EMAIL="$2"; shift 2 ;;
    --no-tls) SKIP_TLS=1; shift ;;
    *) echo "Option inconnue : $1"; exit 1 ;;
  esac
done

# ---------------------------------------------------------------- affichage --
bold=$'\033[1m'; green=$'\033[32m'; yellow=$'\033[33m'; red=$'\033[31m'; off=$'\033[0m'
step() { echo; echo "${bold}▸ $*${off}"; }
ok()   { echo "  ${green}✓${off} $*"; }
warn() { echo "  ${yellow}!${off} $*"; }
die()  { echo; echo "${red}✗ $*${off}"; exit 1; }

# Un port est considéré pris si on arrive à s'y connecter. Le test de connexion
# ne dépend d'aucun outil externe : sur une machine sans « ss » ni « netstat »,
# se fier à leur sortie vide reviendrait à retenir un port déjà occupé, et le
# conteneur refuserait de démarrer.
port_taken() {
  local p="$1"
  (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null && return 0
  if command -v ss >/dev/null 2>&1; then
    ss -tln 2>/dev/null | grep -qE "[:.]${p}([[:space:]]|$)" && return 0
  fi
  if command -v netstat >/dev/null 2>&1; then
    netstat -tln 2>/dev/null | grep -qE "[:.]${p}([[:space:]]|$)" && return 0
  fi
  return 1
}

# Beaucoup d'images VPS (dont Hostinger) ouvrent une session root sans installer
# sudo : conseiller « sudo » quand la commande n'existe pas envoie dans le mur.
if [[ $EUID -ne 0 ]]; then
  if command -v sudo >/dev/null 2>&1; then
    die "À lancer en administrateur : sudo bash $0 --domain $DOMAIN"
  fi
  die "À lancer en administrateur. Connecte-toi en root, puis : bash $0 --domain $DOMAIN"
fi
command -v apt-get >/dev/null || die "Ce script vise Debian/Ubuntu. Dis-le moi et j'adapte."

echo "${bold}Installation de Taochy Pilot${off}"
echo "  domaine    : $DOMAIN"
echo "  dossier    : $APP_DIR"

# ------------------------------------------------------------------ paquets --
step "Paquets de base"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl ca-certificates dnsutils >/dev/null
ok "git, curl, dig"

if ! command -v docker >/dev/null; then
  step "Installation de Docker"
  curl -fsSL https://get.docker.com | sh >/dev/null
  ok "Docker installé"
else
  ok "Docker déjà présent — laissé tel quel"
fi
docker compose version >/dev/null 2>&1 || die "Le plugin 'docker compose' manque. Installe docker-compose-plugin puis relance."

if ! command -v nginx >/dev/null; then
  step "Installation de nginx"
  apt-get install -y -qq nginx >/dev/null
  systemctl enable --now nginx >/dev/null 2>&1 || true
  ok "nginx installé"
else
  ok "nginx déjà présent — les autres sites ne seront pas touchés"
fi

# --------------------------------------------------------------------- code --
step "Récupération du code"
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" fetch --quiet origin main
  git -C "$APP_DIR" reset --hard --quiet origin/main
  ok "Dépôt mis à jour"
else
  git clone --quiet "$REPO" "$APP_DIR"
  ok "Dépôt cloné dans $APP_DIR"
fi

# --------------------------------------------------------------------- port --
# Les autres SaaS occupent déjà des ports : on prend le premier libre à partir
# de 3001 plutôt que d'imposer une valeur.
step "Choix du port local"
ENV_FILE="$APP_DIR/.env"
IMAGE="ghcr.io/emmanueltaochy/copilote-social-media:latest"
if [[ -f "$ENV_FILE" ]] && grep -q '^APP_PORT=' "$ENV_FILE"; then
  PORT="$(grep '^APP_PORT=' "$ENV_FILE" | cut -d= -f2)"
  ok "Port déjà choisi précédemment : $PORT"
else
  PORT=3001
  while port_taken "$PORT"; do
    PORT=$((PORT + 1))
  done
  ok "Port libre retenu : $PORT"
fi

# Rejouer le script ne doit pas défaire un retour arrière : si APP_IMAGE a été
# épinglé sur une version précise, on le laisse tel quel.
if [[ -f "$ENV_FILE" ]]; then
  set_env() {
    if grep -q "^$1=" "$ENV_FILE"; then
      sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"
    else
      echo "$1=$2" >> "$ENV_FILE"
    fi
  }
  set_env APP_PORT "$PORT"
  set_env APP_DOMAIN "$DOMAIN"
  grep -q '^APP_IMAGE=' "$ENV_FILE" || echo "APP_IMAGE=$IMAGE" >> "$ENV_FILE"
  grep -q '^APP_VERSION=' "$ENV_FILE" || echo "APP_VERSION=dev" >> "$ENV_FILE"
  # Le mot de passe de la base ne doit jamais être régénéré : les données
  # existantes deviendraient inaccessibles.
  grep -q '^DB_PASSWORD=' "$ENV_FILE" || echo "DB_PASSWORD=$(openssl rand -hex 24)" >> "$ENV_FILE"
  ok "Configuration mise à jour dans $ENV_FILE"
else
  cat > "$ENV_FILE" <<EOF
# Généré par scripts/setup-vps.sh — modifiable à la main.
APP_PORT=$PORT
APP_IMAGE=$IMAGE
APP_VERSION=dev
APP_DOMAIN=$DOMAIN
DB_PASSWORD=$(openssl rand -hex 24)
EOF
  chmod 600 "$ENV_FILE"
  ok "Configuration écrite dans $ENV_FILE"
fi

# --------------------------------------------------------------- messagerie --
# Les notifications partent par la boîte de l'agence. Les identifiants ne sont
# demandés qu'une fois : rejouer le script ne les redemande pas, et ne les
# affiche jamais à l'écran.
step "Messagerie (notifications par courriel)"
if grep -q '^SMTP_PASSWORD=.\+' "$ENV_FILE" 2>/dev/null; then
  ok "Messagerie déjà configurée — laissée telle quelle"
  ok "Pour la changer : modifie SMTP_* dans $ENV_FILE puis « docker compose up -d »"
else
  echo "  Les notifications (contenu à valider, publication, assignation) partent"
  echo "  par courriel. Laisse vide pour ne rien envoyer : la cloche dans"
  echo "  l'application fonctionnera quand même."
  echo
  read -r -p "  Serveur SMTP [smtp.hostinger.com] : " SMTP_HOST_IN
  SMTP_HOST_IN="${SMTP_HOST_IN:-smtp.hostinger.com}"
  read -r -p "  Port [465] : " SMTP_PORT_IN
  SMTP_PORT_IN="${SMTP_PORT_IN:-465}"
  read -r -p "  Adresse d'envoi : " SMTP_USER_IN
  if [[ -n "$SMTP_USER_IN" ]]; then
    # -s : le mot de passe ne s'affiche pas et ne reste pas dans l'historique
    # du terminal, où n'importe qui le relirait ensuite.
    read -r -s -p "  Mot de passe : " SMTP_PASSWORD_IN
    echo
    set_env_quiet() {
      if grep -q "^$1=" "$ENV_FILE"; then
        sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"
      else
        echo "$1=$2" >> "$ENV_FILE"
      fi
    }
    set_env_quiet SMTP_HOST "$SMTP_HOST_IN"
    set_env_quiet SMTP_PORT "$SMTP_PORT_IN"
    set_env_quiet SMTP_USER "$SMTP_USER_IN"
    set_env_quiet SMTP_PASSWORD "$SMTP_PASSWORD_IN"
    set_env_quiet SMTP_FROM "Taochy Consulting <$SMTP_USER_IN>"
    chmod 600 "$ENV_FILE"
    ok "Messagerie configurée pour $SMTP_USER_IN"
  else
    warn "Aucune adresse saisie — les courriels ne partiront pas, la cloche reste active"
  fi
fi

# -------------------------------------------------------------------- nginx --
step "Configuration nginx pour $DOMAIN"
VHOST="/etc/nginx/sites-available/$DOMAIN"

# Si un autre site répond déjà sur ce domaine, on s'arrête : mieux vaut ne rien
# écraser sur une machine qui héberge d'autres SaaS.
EXISTING="$(grep -rl "server_name .*\b${DOMAIN}\b" /etc/nginx/sites-enabled/ 2>/dev/null | grep -v "$DOMAIN\$" || true)"
if [[ -n "$EXISTING" ]]; then
  warn "Un autre vhost sert déjà $DOMAIN :"
  echo "$EXISTING" | sed 's/^/      /'
  die "Rien n'a été modifié. Dis-le moi et on décide quoi faire."
fi

# Réécrire le vhost effacerait le bloc « listen 443 » que certbot y ajoute.
# Sans bloc HTTPS, nginx sert le site par DÉFAUT en 443 — c'est-à-dire un
# autre site de la machine, à notre adresse. On ne réécrit donc jamais un
# vhost existant : on met seulement le port à jour, sans réécrire le fichier —
# une réécriture effacerait le bloc « listen 443 » ajouté par certbot.
if [[ -f "$VHOST" ]]; then
  sed -i "s|proxy_pass http://127.0.0.1:[0-9]*;|proxy_pass http://127.0.0.1:$PORT;|g" "$VHOST"

  # nginx refuse par défaut tout corps de requête au-delà d'un mégaoctet : une
  # photo de photographe serait rejetée avant même d'atteindre l'application,
  # avec une erreur 413 que rien n'explique côté écran.
  # Répare un vhost posé par une version précédente du script : la
  # transmission au fil de l'eau tronquait les envois lents.
  if grep -q 'proxy_request_buffering off' "$VHOST"; then
    sed -i 's|proxy_request_buffering off;|proxy_request_buffering on;\n        client_body_buffer_size 1m;\n        client_body_timeout 900s;|' "$VHOST"
    ok "Transmission des envois corrigée (nginx encaisse avant de relayer)"
  fi

  if ! grep -q 'client_max_body_size' "$VHOST"; then
    sed -i "0,/location \/ {/s||location / {\n        client_max_body_size 0;\n        proxy_request_buffering on;\n        client_body_buffer_size 1m;\n        client_body_timeout 900s;\n        proxy_read_timeout 900s;\n        proxy_send_timeout 900s;|" "$VHOST"
    ok "Limite de taille d'envoi levée dans le vhost"
  fi
  ok "Vhost existant conservé (configuration TLS intacte), port mis à jour"
else
  cat > "$VHOST" <<EOF
# Taochy Pilot — généré par scripts/setup-vps.sh
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    location / {
        # Aucune limite de taille : les images sont réencodées à l'import et
        # ne pèsent presque rien une fois stockées, mais elles arrivent
        # parfois à plusieurs dizaines de mégaoctets.
        client_max_body_size 0;
        # nginx encaisse l'envoi en entier avant de le relayer. Le relayer au
        # fil de l'eau faisait remonter les hoquets de la connexion du client
        # jusqu'à l'application, qui recevait alors un fichier coupé sans que
        # rien ne signale l'interruption. Ici nginx absorbe la lenteur puis
        # transmet d'un trait en local : l'application ne voit que des envois
        # complets.
        proxy_request_buffering on;
        client_body_buffer_size 1m;

        # Une photo de plusieurs dizaines de mégaoctets depuis une connexion
        # domestique dépasse largement les délais par défaut d'une minute.
        client_body_timeout 900s;
        proxy_read_timeout 900s;
        proxy_send_timeout 900s;

        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
  ok "Vhost créé"
fi
ln -sf "$VHOST" "/etc/nginx/sites-enabled/$DOMAIN"
nginx -t >/dev/null 2>&1 || die "Configuration nginx invalide — rien n'a été rechargé."
systemctl reload nginx
ok "nginx configuré et rechargé (les autres sites continuent de tourner)"

if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 'Nginx Full' >/dev/null 2>&1 || true
  ok "Pare-feu : ports 80 et 443 ouverts"
fi

# ---------------------------------------------------------------------- TLS --
step "Certificat HTTPS"
SERVER_IP="$(curl -fsS --max-time 10 https://api.ipify.org 2>/dev/null || echo "")"
DOMAIN_IP="$(dig +short "$DOMAIN" A | tail -n1)"

if [[ $SKIP_TLS -eq 1 ]]; then
  warn "Étape ignorée (--no-tls)"
elif [[ -z "$DOMAIN_IP" ]]; then
  warn "$DOMAIN ne pointe encore sur aucune IP."
  warn "Crée un enregistrement DNS de type A :"
  warn "    ${DOMAIN%%.*}  →  ${SERVER_IP:-<IP de ce VPS>}"
  warn "Puis relance ce script : le certificat sera posé automatiquement."
elif [[ -n "$SERVER_IP" && "$DOMAIN_IP" != "$SERVER_IP" ]]; then
  warn "$DOMAIN pointe sur $DOMAIN_IP, mais ce VPS est en $SERVER_IP."
  warn "Corrige l'enregistrement DNS puis relance ce script."
else
  apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
  if certbot certificates 2>/dev/null | grep -q "Domains:.*\b${DOMAIN}\b"; then
    # Un certificat émis ne sert à rien s'il n'est plus référencé dans le
    # vhost : les requêtes HTTPS tomberaient sur le site par défaut du serveur.
    if grep -q "listen 443" "$VHOST"; then
      ok "Certificat déjà en place"
    else
      certbot install --nginx --cert-name "$DOMAIN" >/dev/null 2>&1 \
        && ok "Certificat réinstallé dans le vhost" \
        || warn "Réinstallation du certificat impossible — le site répond en HTTP."
    fi
  else
    if [[ -n "$EMAIL" ]]; then
      CERTBOT_ID=(--email "$EMAIL")
    else
      CERTBOT_ID=(--register-unsafely-without-email)
    fi
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
      "${CERTBOT_ID[@]}" --redirect >/dev/null \
      && ok "HTTPS actif (renouvellement automatique)" \
      || warn "certbot a échoué. Le site répond en HTTP ; relance le script plus tard."
  fi
fi

# ---------------------------------------------------------- sauvegardes --
step "Sauvegardes de la base et des médias"
mkdir -p "$APP_DIR/backups"
cat > /usr/local/bin/copilote-backup <<'BACKUP'
#!/usr/bin/env bash
# Sauvegarde quotidienne, conservée 14 jours.
#
# La base et les médias partent ensemble : une base restaurée sans les fichiers
# afficherait une bibliothèque de vignettes cassées, et des fichiers sans la
# base seraient un dossier d'images anonymes que plus rien ne rattache à un
# client. L'un ne vaut rien sans l'autre.
set -euo pipefail
DIR="/opt/copilote-social-media"
cd "$DIR"
mkdir -p backups
STAMP="$(date +%Y-%m-%d_%H%M)"

docker compose exec -T db pg_dump -U pilot pilot | gzip > "backups/pilot-$STAMP.sql.gz"
# Une sauvegarde vide est pire qu'aucune : elle donne l'illusion d'être couvert.
if [ ! -s "backups/pilot-$STAMP.sql.gz" ]; then
  echo "Sauvegarde de la base vide, échec" >&2
  rm -f "backups/pilot-$STAMP.sql.gz"
  exit 1
fi

# Les médias vivent dans un volume Docker : on passe par un conteneur jetable
# pour les lire, sans dépendre du chemin interne de Docker sur la machine.
VOLUME="$(docker volume ls -q --filter name=pilot-media | head -n1)"
if [ -n "$VOLUME" ]; then
  # « .tmp » contient les fichiers en cours de réception : ils n'ont pas
  # d'entrée en base et ne veulent rien dire une fois restaurés.
  docker run --rm -v "$VOLUME":/data:ro -v "$DIR/backups":/out alpine \
    tar czf "/out/medias-$STAMP.tar.gz" --exclude='./.tmp' -C /data . 
  if [ ! -s "backups/medias-$STAMP.tar.gz" ]; then
    echo "Sauvegarde des médias vide, échec" >&2
    rm -f "backups/medias-$STAMP.tar.gz"
    exit 1
  fi
  find backups -name 'medias-*.tar.gz' -mtime +14 -delete
fi

find backups -name 'pilot-*.sql.gz' -mtime +14 -delete

# Le disque n'est pas extensible : si les sauvegardes dépassent 20 Go, on le
# dit plutôt que d'attendre le jour où l'écriture échouera en silence.
USED_KB="$(du -sk backups | cut -f1)"
if [ "$USED_KB" -gt 20971520 ]; then
  echo "Attention : les sauvegardes occupent $((USED_KB / 1048576)) Go." >&2
fi
BACKUP
chmod +x /usr/local/bin/copilote-backup
# 3h30 du matin, heure du serveur
( crontab -l 2>/dev/null | grep -v copilote-backup ; echo "30 3 * * * /usr/local/bin/copilote-backup" ) | crontab -
ok "Sauvegarde quotidienne à 3h30 (base + médias), conservée 14 jours"
ok "Sauvegarde manuelle : copilote-backup"

# ------------------------------------------------------------------ clé SSH --
step "Clé de déploiement GitHub"
# Nom propre au projet. Un chemin générique comme gh_deploy est déjà utilisé par
# d'autres déploiements sur la même machine : le réutiliser ferait partager une
# clé root entre deux projets, où une fuite d'un côté ouvrirait l'autre et où
# renouveler l'une casserait l'autre.
KEY="/root/.ssh/gh_deploy_copilote"
mkdir -p /root/.ssh && chmod 700 /root/.ssh
if [[ ! -f "$KEY" ]]; then
  ssh-keygen -t ed25519 -C "github-actions-copilote" -f "$KEY" -N "" -q
  ok "Clé générée"
else
  ok "Clé déjà existante — réutilisée"
fi
touch /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys
grep -qF "$(cat "$KEY.pub")" /root/.ssh/authorized_keys || cat "$KEY.pub" >> /root/.ssh/authorized_keys
ok "Clé autorisée sur ce serveur"

# ------------------------------------------------------------------ démarrage --
step "Démarrage de l'application"
cd "$APP_DIR"
if docker compose pull >/dev/null 2>&1; then
  docker compose up -d --remove-orphans >/dev/null
  sleep 8
  if curl -fsS --max-time 5 "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    ok "L'application répond sur le port $PORT"
  else
    warn "Démarrée mais pas encore de réponse — laisse-lui 30 s."
  fi
else
  warn "L'image n'est pas encore publiée ou n'est pas accessible."
  warn "C'est normal au premier passage : elle sera tirée au premier déploiement."
fi

# ------------------------------------------------------------------- secrets --
echo
echo "${bold}────────────────────────────────────────────────────────────${off}"
echo "${bold}${green}Le serveur est prêt.${off}"
echo "${bold}────────────────────────────────────────────────────────────${off}"
echo
echo "Dernière étape, dans GitHub :"
echo "  Settings ▸ Secrets and variables ▸ Actions ▸ New repository secret"
echo
echo "  ${bold}VPS_HOST${off}"
echo "    ${SERVER_IP:-<IP de ce VPS>}"
echo
echo "  ${bold}VPS_USER${off}"
echo "    root"
echo
echo "  ${bold}VPS_SSH_KEY${off}   (tout le bloc, BEGIN et END compris)"
echo
# Surtout pas d'indentation ici : une clé SSH dont les lignes portent des
# espaces en tête est invalide, et l'erreur côté GitHub ne le dit pas.
cat "$KEY"
echo
echo "${yellow}⚠ Ce bloc est une clé privée : elle donne un accès root à ce serveur.${off}"
echo "${yellow}  À coller dans GitHub, et NULLE PART ailleurs — ni dans un chat,${off}"
echo "${yellow}  ni dans un e-mail, ni dans une capture d'écran.${off}"
echo "${yellow}  Pour la réafficher plus tard : cat $KEY${off}"
echo
echo "Ensuite préviens-moi, je lance le premier déploiement."
echo
echo "Au premier lancement, ouvre https://$DOMAIN : l'outil te demandera"
echo "de créer ton compte administrateur. Cette page ne s'affiche qu'une fois."
echo
