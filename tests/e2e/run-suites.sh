#!/usr/bin/env bash
set -u
SP=/tmp/claude-0/-home-claude/956d6f17-f290-5e1d-9e91-839fdc4ed875/scratchpad
for s in "$@"; do
  echo "############ $s"
  bash $SP/stack.sh > /dev/null 2>&1 || { echo "STACK KO"; continue; }
  node $SP/e2e-$s.mjs > $SP/out-$s.log 2>&1
  echo "exit=$?"
  grep -c '^OK  ' $SP/out-$s.log | sed 's/^/vertes: /'
  grep -c '^ÉCHEC' $SP/out-$s.log | sed 's/^/rouges: /'
  grep '^ÉCHEC' $SP/out-$s.log
  tail -3 $SP/out-$s.log
done
