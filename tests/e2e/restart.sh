set -u
SP=/tmp/claude-0/-home-claude/956d6f17-f290-5e1d-9e91-839fdc4ed875/scratchpad
pkill -f pgserver.mjs 2>/dev/null; pkill -f "standalone/server.js" 2>/dev/null
sleep 1
rm -rf "$SP/media"; mkdir -p "$SP/media" "$SP/shots"
cd /home/claude/copilote-social-media
nohup node pgserver.mjs > "$SP/pgX.log" 2>&1 &
sleep 3
DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5450/postgres" \
MEDIA_ROOT="$SP/media" PORT=4030 HOSTNAME=127.0.0.1 \
nohup node .next/standalone/server.js > "$SP/appX.log" 2>&1 &
for i in $(seq 1 30); do
  curl -sf -m 2 http://127.0.0.1:4030/api/health >/dev/null && echo "prêt" && exit 0
  sleep 1
done
echo "pas prêt"; tail -20 "$SP/appX.log"
