#!/usr/bin/env bash
# Remonte une pile de test propre : PostgreSQL réel + serveur standalone.
set -u
SP=/tmp/claude-0/-home-claude/956d6f17-f290-5e1d-9e91-839fdc4ed875/scratchpad
bash /tmp/claude-0/-home-claude/956d6f17-f290-5e1d-9e91-839fdc4ed875/scratchpad/services.sh >/dev/null 2>&1
APP=/home/claude/copilote-social-media

for pat in "next-server" "server.js"; do
  for pid in $(pgrep -f "$pat" 2>/dev/null); do kill -9 "$pid" 2>/dev/null; done
done
sleep 1

psql -h 127.0.0.1 -p 5451 -U postgres -q -c "drop database if exists pilot;" -c "create database pilot;" || exit 1
rm -rf "$SP/media"; mkdir -p "$SP/media" "$SP/shots"

cd "$APP"
# `output: standalone` n'embarque pas les fichiers statiques : le Dockerfile les
# copie à côté du serveur, il faut faire pareil ici, sinon le CSS répond 404 et
# toutes les captures sortent sans style.
rm -rf .next/standalone/.next/static .next/standalone/public
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public 2>/dev/null || true

DATABASE_URL="postgres://postgres@127.0.0.1:5451/pilot" \
SMTP_HOST=127.0.0.1 SMTP_PORT=2525 SMTP_USER=marketing@taochyconsulting.fr SMTP_PASSWORD=test SMTP_FROM="Taochy <marketing@taochyconsulting.fr>" \
 MEDIA_ROOT="$SP/media" PORT=4030 HOSTNAME=127.0.0.1 NODE_ENV=production \
setsid node .next/standalone/server.js > "$SP/appX.log" 2>&1 < /dev/null &
disown

for i in $(seq 1 40); do
  curl -sf -m 2 http://127.0.0.1:4030/api/health >/dev/null && echo "pile prête" && exit 0
  sleep 1
done
echo "pas prête"; tail -20 "$SP/appX.log"; exit 1
