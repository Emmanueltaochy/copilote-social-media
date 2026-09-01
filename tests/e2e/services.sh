#!/usr/bin/env bash
# Remet PostgreSQL et le relais SMTP debout s'ils sont tombés.
set -u
SP=/tmp/claude-0/-home-claude/956d6f17-f290-5e1d-9e91-839fdc4ed875/scratchpad
chmod 755 /tmp/claude-0 /tmp/claude-0/-home-claude /tmp/claude-0/-home-claude/956d6f17-f290-5e1d-9e91-839fdc4ed875 "$SP" 2>/dev/null

if ! (exec 3<>/dev/tcp/127.0.0.1/5451) 2>/dev/null; then
  touch "$SP/pg2.log"; chmod 666 "$SP/pg2.log"
  su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $SP/pgdata -l $SP/pg2.log -o '-p 5451' -w start" >/dev/null 2>&1
  for i in $(seq 1 20); do
    (exec 3<>/dev/tcp/127.0.0.1/5451) 2>/dev/null && break
    sleep 1
  done
fi
(exec 3<>/dev/tcp/127.0.0.1/5451) 2>/dev/null && echo "pg ok" || { echo "pg KO"; tail -5 "$SP/pg2.log"; exit 1; }

if ! (exec 3<>/dev/tcp/127.0.0.1/2525) 2>/dev/null; then
  cd "$SP" && setsid nohup node smtpd.mjs > smtpd.log 2>&1 < /dev/null &
  sleep 2
fi
(exec 3<>/dev/tcp/127.0.0.1/2525) 2>/dev/null && echo "smtp ok" || echo "smtp KO"
