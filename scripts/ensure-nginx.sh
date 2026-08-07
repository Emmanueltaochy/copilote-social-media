#!/usr/bin/env bash
#
# Vérifie que le vhost du domaine accepte les envois volumineux, et le corrige
# si besoin. Appelé à chaque déploiement.
#
# Pourquoi ici plutôt que dans setup-vps.sh : une limite de taille posée par
# défaut par nginx bloque les vidéos avant même qu'elles atteignent
# l'application, et attendre que quelqu'un relance l'installation à la main
# laisse le produit cassé entre-temps. Le déploiement répare ce qu'il sait
# réparer.
#
# Trois précautions, parce que la machine héberge d'autres sites :
#   - un seul fichier est touché, celui du domaine passé en argument
#   - une copie est faite avant toute modification
#   - nginx n'est rechargé que si sa configuration est valide, et le fichier
#     est remis en l'état sinon

set -euo pipefail

DOMAIN="${1:-}"
[[ -n "$DOMAIN" ]] || { echo "Domaine manquant"; exit 1; }

VHOST="/etc/nginx/sites-available/$DOMAIN"
[[ -f "$VHOST" ]] || { echo "Vhost $VHOST absent — rien à faire"; exit 0; }
command -v nginx >/dev/null || { echo "nginx absent — rien à faire"; exit 0; }

besoin=0
grep -q 'client_max_body_size' "$VHOST" || besoin=1
grep -q 'proxy_request_buffering off' "$VHOST" && besoin=1

if [[ $besoin -eq 0 ]]; then
  echo "nginx : limites d'envoi déjà en place"
  exit 0
fi

SAUVE="$VHOST.avant-deploiement"
cp "$VHOST" "$SAUVE"

# Transmettre le corps au fil de l'eau faisait remonter les hoquets de la
# connexion du client jusqu'à l'application, qui recevait un fichier coupé.
if grep -q 'proxy_request_buffering off' "$VHOST"; then
  sed -i 's|proxy_request_buffering off;|proxy_request_buffering on;|' "$VHOST"
fi

if ! grep -q 'client_max_body_size' "$VHOST"; then
  sed -i "0,/location \/ {/s||location / {\n        client_max_body_size 0;\n        proxy_request_buffering on;\n        client_body_buffer_size 1m;\n        client_body_timeout 900s;\n        proxy_read_timeout 900s;\n        proxy_send_timeout 900s;|" "$VHOST"
fi

if ! nginx -t >/dev/null 2>&1; then
  echo "Configuration nginx invalide après modification — retour à l'état précédent."
  mv "$SAUVE" "$VHOST"
  nginx -t >/dev/null 2>&1 || echo "Attention : la configuration était déjà invalide avant."
  exit 1
fi

systemctl reload nginx 2>/dev/null || nginx -s reload
rm -f "$SAUVE"
echo "nginx : limite de taille levée pour $DOMAIN, configuration rechargée"
