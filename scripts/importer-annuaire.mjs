#!/usr/bin/env node
//
// Envoie un fichier de l'agent ventes à l'annuaire de Pilot.
//
//   PILOT_URL=https://app.taochyagency.com PILOT_IMPORT_KEY=tpk_… \
//     node scripts/importer-annuaire.mjs /chemin/vers/prospects.json [/chemin/vers/sans-site.json …]
//
// Le fichier est envoyé tel quel ; Pilot reconnaît sa forme (prospects.json ou
// sans-site.json), retrouve chaque fiche et la met à jour. Relancer le script
// avec le même fichier ne crée aucun doublon.
//
// La clé se crée dans Pilot : Réglages → « Import des prospects ». Elle ne
// s'écrit jamais dans ce fichier ni dans le dépôt : uniquement dans la variable
// d'environnement, le temps de la commande.

import { readFile } from "node:fs/promises";
import { basename } from "node:path";

function meurs(message) {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

const base = (process.env.PILOT_URL ?? "").replace(/\/+$/, "");
const cle = process.env.PILOT_IMPORT_KEY ?? "";
const fichiers = process.argv.slice(2).filter((a) => !a.startsWith("--"));

if (!base) meurs("PILOT_URL absent (ex. : PILOT_URL=https://app.taochyagency.com).");
if (!/^https?:\/\//.test(base)) meurs("PILOT_URL doit commencer par https:// (ou http:// en local).");
if (!cle.startsWith("tpk_")) meurs("PILOT_IMPORT_KEY absent ou mal formé (une clé Pilot commence par tpk_).");
if (fichiers.length === 0) meurs("Donne au moins un fichier : node scripts/importer-annuaire.mjs prospects.json");

let echec = false;
for (const chemin of fichiers) {
  let texte;
  try {
    texte = await readFile(chemin, "utf8");
    JSON.parse(texte);
  } catch (e) {
    console.error(`  ✗ ${chemin} : illisible ou JSON invalide (${e.message})`);
    echec = true;
    continue;
  }
  // Le nom du fichier aide Pilot à le reconnaître ; à défaut, la forme suffit.
  const nom = basename(chemin).toLowerCase();
  const fichier = nom.startsWith("sans-site") ? "sans-site" : nom.startsWith("prospects") ? "prospects" : null;
  const url = `${base}/api/annuaire/import${fichier ? `?fichier=${fichier}` : ""}`;

  let reponse;
  try {
    reponse = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
      body: texte,
      redirect: "manual",
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e) {
    console.error(`  ✗ ${chemin} : Pilot ne répond pas (${e.message})`);
    echec = true;
    continue;
  }
  const corps = await reponse.json().catch(() => null);
  if (!reponse.ok && reponse.status !== 207) {
    console.error(`  ✗ ${chemin} : ${reponse.status} ${corps?.error ?? reponse.statusText}`);
    echec = true;
    continue;
  }
  console.log(
    `  ✓ ${basename(chemin)} (${corps.fichier}) : ${corps.recues} reçues, ${corps.creees} créées, ` +
      `${corps.misesAJour} mises à jour, ${corps.ignorees} ignorées, ${corps.relieesAUnClient} reliées à un client, ` +
      `${corps.evenements} lignes d'historique` +
      (corps.erreurs?.length ? ` — ${corps.erreurs.length} en erreur : ${corps.erreurs.join(", ")}` : ""),
  );
  if (corps.erreurs?.length) echec = true;
}
process.exit(echec ? 1 : 0);
