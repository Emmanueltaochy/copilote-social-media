#!/usr/bin/env bash
set -u
SP=/tmp/claude-0/-home-claude/956d6f17-f290-5e1d-9e91-839fdc4ed875/scratchpad
total=0; rouges=0
for s in final chat preparer mobile quatre web livrables poles-clients contrat dossiers documents connexion portail suivi banniere devis factures; do
  bash $SP/stack.sh > /dev/null 2>&1
  node $SP/e2e-$s.mjs > $SP/out-$s.log 2>&1
  code=$?
  v=$(grep -c '^OK  ' $SP/out-$s.log)
  r=$(grep -c '^ÉCHEC' $SP/out-$s.log)
  js=$(grep -o 'erreurs JS : .*' $SP/out-$s.log | head -1)
  total=$((total+v)); rouges=$((rouges+r))
  printf '%-16s %3d vertes  %d rouges  exit=%d  %s\n' "$s" "$v" "$r" "$code" "$js"
  grep '^ÉCHEC' $SP/out-$s.log
done
echo "----------------------------------------"
echo "TOTAL : $total vertes, $rouges rouges"
