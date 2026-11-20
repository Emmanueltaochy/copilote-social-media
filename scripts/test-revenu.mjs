#!/usr/bin/env node
//
// Page « Revenu mensuel » (/revenu) : le revenu mensuel récurrent tiré des
// abonnements GoCardless, l'objectif et ses paliers, l'évolution sur 12 mois,
// la répartition, les fuites, et l'encart de l'accueil. Vérifié contre un faux
// serveur GoCardless (et un faux Abby), jamais contre un vrai compte.
//
// Ce que le script vérifie :
//   - les règles pures (src/lib/revenu-regles.ts) : conversions au mois au
//     centime près (mensuel, hebdomadaire, annuel, tous les 3 mois…), hors
//     taxes, écart et nombre de clients, évolution (nouveau, perdu, net),
//     dépendance, type d'offre, facturation mensuelle Abby, prochains
//     prélèvements sans double compte, réglages illisibles ;
//   - GoCardless non relié : la page le dit (pas de zéro), l'accueil se tait ;
//   - après un relevé : le chiffre (prélevé et hors taxes, taux noté dans les
//     métadonnées suivi), l'évolution mois par mois, l'écart et « N clients de
//     plus », l'alerte de dépendance, les contrats sans prélèvement (Pilot et
//     Abby), les paiements en échec, les mandats annulés, les prochains
//     prélèvements, l'encart de l'accueil ;
//   - les droits : direction oui ; pôle social, pôle web, vidéaste, client du
//     portail, visiteur sans session non (page, encart et réglages) ;
//   - seules des requêtes GET partent vers GoCardless, et la page elle-même
//     n'en envoie aucune ;
//   - captures Playwright (1440 px et iPhone 13, clair et sombre), rien qui
//     déborde à 390 px ; le formulaire de l'objectif enregistre.
//
// Usage (local uniquement, après npm run build ; le script démarre et arrête
// lui-même le serveur Pilot et les faux services) :
//   PGURL="postgres://pilot:pilot@localhost:5432/pilot" node scripts/test-revenu.mjs
//   CAPTURES=/chemin/dossier …  → captures Playwright.

import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, "..");
const PGURL = process.env.PGURL ?? process.env.DATABASE_URL;
const PORT = Number(process.env.PORT_TEST ?? 3132);
const BASE = `http://127.0.0.1:${PORT}`;
const CAPTURES = process.env.CAPTURES ?? "";

if (!PGURL || !/localhost|127\.0\.0\.1/.test(PGURL)) {
  console.error("\n  ✗ PGURL local requis (ce test écrit en base).\n");
  process.exit(1);
}
if (!existsSync(path.join(RACINE, ".next", "BUILD_ID"))) {
  console.error("\n  ✗ Lancer d'abord npm run build.\n");
  process.exit(1);
}

/* ---------------------------------------------------------------- outils -- */

const sql = (q) => execFileSync("psql", [PGURL, "-tA", "-v", "ON_ERROR_STOP=1", "-c", q], { encoding: "utf8" }).trim();
const un = (q) => sql(q).split("\n")[0].trim();
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => createHash("sha256").update(s).digest("hex");
let verts = 0;
const rouges = [];
const ok = (label, condition) => {
  if (condition) {
    verts += 1;
    console.log(`OK    ${label}`);
  } else {
    rouges.push(label);
    console.log(`ÉCHEC ${label}`);
  }
};
const jeu = randomBytes(3).toString("hex");
const dir = mkdtempSync(path.join(os.tmpdir(), "pilot-test-revenu-"));
const MEDIA = path.join(dir, "media");
mkdirSync(path.join(MEDIA, ".secrets"), { recursive: true, mode: 0o700 });
writeFileSync(path.join(MEDIA, ".secrets", "pilot-secrets.key"), randomBytes(32).toString("hex"), { mode: 0o600 });
const JOURNAL = path.join(dir, "serveur.log");
const JOUR = 86_400_000;
const maintenant = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const jourReunion = (ms) => new Date(ms + 4 * 3_600_000).toISOString().slice(0, 10);
const decale = (j) => jourReunion(maintenant + j * JOUR);
// Les montants s'écrivent avec des espaces insécables (fr-FR) : on les compare en espaces simples.
const norm = (x) => String(x).replace(/[\u00a0\u202f]/g, " ");
const euros = (c) => norm(`${Math.round(c / 100).toLocaleString("fr-FR")} €`);
// Le mois en cours à La Réunion, et le jour d d'un mois décalé de k (k = -1 : le mois dernier).
const [AN, MOIS] = jourReunion(maintenant).split("-").map(Number);
const moisDecale = (k) => {
  const t = AN * 12 + (MOIS - 1) + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};
const jourDe = (k, d) => `${moisDecale(k)}-${String(d).padStart(2, "0")}`;
/** Le jour J à 10 h, heure de La Réunion, en ISO (UTC). */
const aDix = (jour) => new Date(`${jour}T10:00:00+04:00`).toISOString();

/* ---------------------------------------------------- 1. règles pures -- */

console.log("\n— règles (src/lib/revenu-regles.ts) —");
const R = await import(path.join(RACINE, "src/lib/revenu-regles.ts"));
ok("mensuel : 300,00 € → 300,00 €", R.mensuelCents(30000, 1, "monthly") === 30000);
ok("hebdomadaire : 100,00 € × 52 / 12 → 433,33 €", R.mensuelCents(10000, 1, "weekly") === 43333);
ok("toutes les 2 semaines : 50,00 € × 52 / 12 / 2 → 108,33 €", R.mensuelCents(5000, 2, "weekly") === 10833);
ok("annuel : 1 200,00 € ÷ 12 → 100,00 €", R.mensuelCents(120000, 1, "yearly") === 10000);
ok("annuel : 999,99 € ÷ 12 → 83,33 € (au centime)", R.mensuelCents(99999, 1, "yearly") === 8333);
ok("tous les 3 mois : 900,00 € ÷ 3 → 300,00 €", R.mensuelCents(90000, 3, "monthly") === 30000);
ok("tous les 3 mois : 100,00 € ÷ 3 → 33,33 €", R.mensuelCents(10000, 3, "monthly") === 3333);
ok("tous les 2 ans : 2 400,00 € ÷ 12 ÷ 2 → 100,00 €", R.mensuelCents(240000, 2, "yearly") === 10000);
ok("rythme inconnu : jamais compté", R.mensuelCents(10000, 1, "daily") === null);
ok("hors taxes : 108,50 € à 8,5 % → 100,00 € ; à 0 % → inchangé", R.horsTaxesCents(10850, 8.5) === 10000 && R.horsTaxesCents(10850, 0) === 10850);
let e = R.ecart(1_000_000, 421_200, 40_000);
ok("écart : 10 000 − 4 212 = 5 788 €, soit 15 clients à 400 €", e.resteCents === 578_800 && e.clients === 15 && !e.atteint);
e = R.ecart(1_000_000, 1_020_000, 40_000);
ok("écart : objectif dépassé → 0, atteint", e.resteCents === 0 && e.clients === 0 && e.atteint);
ok("prochain palier : 4 212 € → « Embauche n° 1 » (5 700 €)", R.prochainPalier(421_200, R.REGLAGES_REVENU_DEFAUT)?.libelle === "Embauche n° 1");
ok("prochain palier : 6 000 € → « Bureau + embauche n° 2 »", R.prochainPalier(600_000, R.REGLAGES_REVENU_DEFAUT)?.libelle === "Bureau + embauche n° 2");
ok("réglages par défaut : 10 000 €, paliers 5 700 et 8 800 €, TVA 8,5 %", R.lireReglages({}).objectifCents === 1_000_000 && R.lireReglages(null).paliers.map((p) => p.montantCents).join(",") === "570000,880000" && R.lireReglages({}).tauxTva === 8.5);
ok("réglages illisibles ignorés (objectif négatif, TVA 99 %)", R.lireReglages({ objectifCents: -5, tauxTva: 99 }).objectifCents === 1_000_000 && R.lireReglages({ tauxTva: 99 }).tauxTva === 8.5);
ok("saisie « 10 000 », « 5700,50 », « 8 800 € » → centimes ; « abc » → rien", R.centimesDepuisSaisie("10 000") === 1_000_000 && R.centimesDepuisSaisie("5700,50") === 570_050 && R.centimesDepuisSaisie("8 800 €") === 880_000 && R.centimesDepuisSaisie("abc") === null);

const ab = (x) => ({ id: "A", nom: "Abonnement", statut: "active", montantCents: 10000, devise: "EUR", intervalle: 1, unite: "monthly", debut: "2026-01-10", premierPrelevement: null, finPrevue: null, arret: null, client: "C1", mandat: "M1", tauxTva: null, aVenir: [], ...x });
const pm = (x) => ({ id: "P", statut: "paid_out", montantCents: 10000, devise: "EUR", date: "2026-02-05", abonnement: "A", mandat: "M1", client: "C1", libelle: "x", ...x });
const NOW = new Date("2026-11-20T08:00:00Z");
const rev = R.revenuActuel(
  [ab({ id: "a1" }), ab({ id: "a2", unite: "weekly", montantCents: 10000 }), ab({ id: "a3", statut: "cancelled" }), ab({ id: "a4", devise: "USD" }), ab({ id: "a5", montantCents: 10850, tauxTva: 0 }), ab({ id: "a6", statut: "pending_customer_approval" })],
  8.5,
);
ok("revenu actuel : actifs seulement (100 + 433,33 + 108,50), USD mis à part", rev.preleveCents === 10000 + 43333 + 10850 && rev.abonnements === 3 && rev.ignores.length === 1 && rev.ignores[0].devise === "USD");
ok("hors taxes : taux réglé, sauf taux noté sur l'abonnement (0 %)", rev.horsTaxesCents === R.horsTaxesCents(10000, 8.5) + R.horsTaxesCents(43333, 8.5) + 10850 && rev.tauxNotes === 1);

const evo = R.evolution(
  {
    depuis: "2025-10-20T00:00:00Z",
    abonnements: [
      ab({ id: "e1", debut: "2026-03-10" }), // 100 € depuis mars
      ab({ id: "e2", debut: "2026-06-02", statut: "cancelled", arret: "2026-09-15", montantCents: 5000 }), // 50 €, juin → septembre
      ab({ id: "e3", debut: "2026-11-03", montantCents: 90000, intervalle: 3 }), // 300 € depuis novembre
      ab({ id: "e4", debut: "2026-04-01", statut: "finished", montantCents: 2000 }), // 20 €, fin inconnue : dernier paiement le 5 août
      ab({ id: "e5", debut: "2026-10-01", statut: "pending_customer_approval", montantCents: 7000 }),
    ],
    paiements: [pm({ abonnement: "e4", date: "2026-08-05" }), pm({ abonnement: "e1", date: "2026-10-10" }), pm({ abonnement: "e1", date: "2026-10-12", statut: "failed" })],
  },
  NOW,
);
const mo = (m) => evo.mois.find((x) => x.mois === m);
ok("évolution : 12 mois, de décembre 2025 à novembre 2026", evo.mois.length === 12 && evo.mois[0].mois === "2025-12" && evo.mois[11].mois === "2026-11");
ok("évolution : novembre = 100 + 300, nouveau 300, perdu 0, net +300", mo("2026-11").finCents === 40000 && mo("2026-11").nouveauCents === 30000 && mo("2026-11").perduCents === 0 && mo("2026-11").netCents === 30000);
ok("évolution : septembre, abonnement annulé → perdu 50, net −50, fin 100", mo("2026-09").perduCents === 5000 && mo("2026-09").netCents === -5000 && mo("2026-09").finCents === 10000);
ok("évolution : août, fin estimée au dernier paiement → perdu 20, mois marqué estimé", mo("2026-08").perduCents === 2000 && mo("2026-08").estime && evo.finsEstimees === 1);
ok("évolution : juin, nouveau 50 ; juillet, fin 170", mo("2026-06").nouveauCents === 5000 && mo("2026-07").finCents === 17000);
ok("évolution : fin(M) = fin(M−1) + net(M) chaque mois", evo.mois.slice(1).every((m, i) => m.finCents === evo.mois[i].finCents + m.netCents));
ok("évolution : avant le premier abonnement (mars), les mois sont « avant »", mo("2026-02").avant && !mo("2026-03").avant);
ok("évolution : encaissé (contrôle) = paiements encaissés seulement", mo("2026-10").encaisseCents === 10000 && mo("2026-08").encaisseCents === 10000);
ok("évolution : jamais accepté par le client → jamais compté", mo("2026-10").nouveauCents === 0 && mo("2026-10").finCents === 10000);

const parts = R.parClient(
  [ab({ id: "p1", client: "C1", montantCents: 50000 }), ab({ id: "p2", client: "C2", montantCents: 20000 }), ab({ id: "p3", client: "C3", montantCents: 20000 }), ab({ id: "p4", client: "C4", montantCents: 10000 }), ab({ id: "p5", client: "C5", montantCents: 10000 })],
  [
    { id: "C1", nom: "Gros client", entryId: "F1" },
    { id: "C2", nom: "Deux", entryId: "F2" },
    { id: "C3", nom: "Deux bis", entryId: "F2" },
  ],
);
ok("par client : deux clients GoCardless d'une même fiche n'en font qu'un", parts.length === 4 && parts.find((p) => p.entryId === "F2")?.mensuelCents === 40000);
ok("dépendance : 500 / 1 100 = 45 % > 20 % ; 400 / 1 100 = 36 % > 20 % ; 100 / 1 100 = 9 % non", parts.find((p) => p.entryId === "F1")?.dependance && parts.find((p) => p.entryId === "F2")?.dependance && !parts.find((p) => p.cle === "gc:C4")?.dependance);
const vingt = R.parClient([ab({ client: "A", montantCents: 20000 }), ab({ client: "B", montantCents: 80000 })], []);
ok("dépendance : exactement 20 % n'est pas signalé (plus de 20 % seulement)", vingt.find((p) => p.nom === "A").dependance === false && vingt.find((p) => p.nom === "B").dependance === true);
ok("revenu moyen par client : 1 100 € / 4 = 275 €", R.moyenneParClient(110000, 4) === 27500 && R.moyenneParClient(0, 0) === 0);
ok(
  "type d'offre d'après le nom",
  R.typeOffre("Community management Garage") === "Community management" && R.typeOffre("Maintenance site") === "Site et maintenance" && R.typeOffre("Publicité Facebook") === "Publicité" && R.typeOffre("Abonnement mensuel") === null,
);
ok("par type d'offre : montrée si au moins la moitié du revenu est classée", R.parOffre([ab({ nom: "Community management" }), ab({ nom: "Abonnement" })]).montrer && !R.parOffre([ab({ nom: "Community management" }), ab({ nom: "Abonnement", montantCents: 30000 })]).montrer);
const factures = [1, 2, 3].map((k) => ({ client: "X", emiseLe: new Date(`2026-${String(11 - k).padStart(2, "0")}-15T08:00:00Z`), montantCents: 50000 }));
ok(
  "Abby : facturé 3 des 4 derniers mois → mensuel (moyenne 500 €) ; 2 mois → non",
  R.facturationMensuelle(factures, NOW).get("X")?.moyenneCents === 50000 && !R.facturationMensuelle(factures.slice(0, 2), NOW).has("X"),
);
const pr = R.prochainsPrelevements(
  [ab({ id: "s1", aVenir: [{ date: "2026-11-23", montantCents: 30000 }, { date: "2026-12-23", montantCents: 30000 }] })],
  [pm({ abonnement: "s1", date: "2026-11-23", statut: "pending_submission", montantCents: 30000 })],
  NOW,
);
ok("prochains prélèvements : une échéance déjà créée en paiement n'est pas comptée deux fois", pr.length === 1 && pr[0].source === "paiement");
const t = R.texteEncart(421_200, 1_000_000, 30_000);
ok(`encart : « ${norm(t.montant)} · ${norm(t.detail)} »`, norm(t.montant) === "4 212 €" && norm(t.detail) === "42 % de l'objectif 10 000 € · +300 € ce mois-ci");

/* ------------------------------------------- 2. lecture seule : le code -- */

console.log("\n— lecture seule : le code —");
const sansCommentaires = (f) => readFileSync(path.join(RACINE, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const codeGc = sansCommentaires("src/lib/gocardless.ts") + sansCommentaires("src/lib/releves.ts");
ok("GoCardless : aucun appel réseau en dehors de lireJson (GET)", !/\bfetch\(/.test(sansCommentaires("src/lib/gocardless.ts")) && /method: "GET"/.test(sansCommentaires("src/lib/releves.ts")) && !/method:\s*["'`](POST|PUT|PATCH|DELETE)/i.test(codeGc));
const codePage = ["src/lib/revenu.ts", "src/lib/revenu-regles.ts", "src/app/(agence)/revenu/page.tsx", "src/app/(agence)/revenu/actions.ts"].map(sansCommentaires).join("\n");
ok("la page et ses calculs n'appellent pas GoCardless (ni fetch, ni relevé)", !/\bfetch\(|releverGoCardless|synchroniser\(/.test(codePage));
ok("la page est réservée à la direction (requireDirection, et l'action vérifie currentDirection)", /await requireDirection\(\)/.test(sansCommentaires("src/app/(agence)/revenu/page.tsx")) && /currentDirection\(\)/.test(sansCommentaires("src/app/(agence)/revenu/actions.ts")));

/* --------------------------------------------- 3. les faux services -- */

const recues = [];
const JETON_GC = `sandbox_${randomBytes(24).toString("base64url")}`;
const json = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};
const MARIE = `marie.${jeu}@garage-rev.test`;
const GARAGE = `Garage Revenu ${jeu}`;
const SPM = `SPMrev${jeu}`;
const BOUL = `Boulangerie Revenu ${jeu}`;
const ATELIER = `Atelier Revenu ${jeu}`;
const VANILLE = `Vanille Revenu ${jeu}`;
const TRAITEUR = `Traiteur Abby ${jeu}`;
const INCONNU = `Inconnu Revenu SAS ${jeu}`;
const id = (x) => `${x}${jeu}`;
const CLIENTS_GC = [
  { id: id("CU1"), email: MARIE, given_name: "Marie", family_name: "Hoarau", company_name: null, created_at: aDix(jourDe(-8, 1)) },
  { id: id("CU2"), email: `compta.${jeu}@autre.test`, given_name: null, family_name: null, company_name: SPM, created_at: aDix(jourDe(-9, 1)) },
  { id: id("CU3"), email: `b.${jeu}@boul.test`, given_name: null, family_name: null, company_name: BOUL, created_at: aDix(jourDe(-11, 1)) },
  { id: id("CU4"), email: `x.${jeu}@inconnu.test`, given_name: "Paul", family_name: "Inconnu", company_name: INCONNU, created_at: aDix(jourDe(-6, 1)) },
  { id: id("CU5"), email: `a.${jeu}@atelier.test`, given_name: null, family_name: null, company_name: ATELIER, created_at: aDix(jourDe(-6, 2)) },
];
const mandat = (n, client, status, k) => ({ id: id(`MD${n}`), status, reference: `REV-${jeu}-${n}`, scheme: "sepa_core", created_at: aDix(jourDe(k, 1)), next_possible_charge_date: null, links: { customer: id(client), creditor: "CR1" } });
const MANDATS_GC = [mandat(1, "CU1", "active", -8), mandat(2, "CU2", "active", -9), mandat(3, "CU3", "active", -11), mandat(4, "CU4", "active", -6), mandat(5, "CU5", "cancelled", -6)];
const abonnement = (n, md, x) => ({ id: id(`SB${n}`), status: "active", currency: "EUR", interval: 1, interval_unit: "monthly", end_date: null, upcoming_payments: [], metadata: {}, links: { mandate: id(md) }, ...x });
const ABONNEMENTS_GC = [
  abonnement(1, "MD1", { amount: 30000, name: `Community management ${jeu}`, created_at: aDix(jourDe(-7, 12)), start_date: jourDe(-7, 15), upcoming_payments: [{ charge_date: decale(3), amount: 30000 }, { charge_date: decale(33), amount: 30000 }] }),
  abonnement(2, "MD2", { amount: 10000, interval_unit: "weekly", name: `Site vitrine, maintenance ${jeu}`, created_at: aDix(jourDe(-3, 5)), start_date: jourDe(-3, 8), upcoming_payments: [2, 9, 16, 23, 37].map((j) => ({ charge_date: decale(j), amount: 10000 })) }),
  abonnement(3, "MD2", { status: "cancelled", amount: 15000, name: `Publicité Facebook ${jeu}`, created_at: aDix(jourDe(-8, 15)), start_date: jourDe(-8, 20) }),
  abonnement(4, "MD2", { status: "finished", amount: 5000, name: `Option stories ${jeu}`, created_at: aDix(jourDe(-6, 3)), start_date: jourDe(-5, 3) }),
  abonnement(5, "MD3", { amount: 120000, interval_unit: "yearly", name: `Maintenance site annuelle ${jeu}`, created_at: aDix(jourDe(-10, 20)), start_date: jourDe(-10, 25), upcoming_payments: [{ charge_date: decale(200), amount: 120000 }] }),
  abonnement(6, "MD3", { amount: 90000, interval: 3, name: `Publicité trimestrielle ${jeu}`, created_at: new Date(`${jourDe(0, 1)}T06:00:00+04:00`).toISOString(), start_date: decale(12), upcoming_payments: [{ charge_date: decale(12), amount: 90000 }] }),
  abonnement(7, "MD4", { amount: 200000, name: `Community management premium ${jeu}`, created_at: aDix(jourDe(-5, 8)), start_date: jourDe(-5, 10), metadata: { tva: "0" }, upcoming_payments: [{ charge_date: decale(6), amount: 200000 }] }),
  abonnement(8, "MD4", { status: "pending_customer_approval", amount: 99900, name: `En attente ${jeu}`, created_at: iso(maintenant - 2 * JOUR), start_date: decale(10) }),
];
const paiement = (n, md, sb, status, amount, jourIso) => ({ id: id(`PM${n}`), status, amount, currency: "EUR", charge_date: jourIso, reference: null, description: null, created_at: aDix(jourIso), amount_refunded: 0, links: { mandate: id(md), subscription: sb ? id(sb) : undefined, creditor: "CR1" } });
const PAIEMENTS_GC = [
  paiement(1, "MD1", "SB1", "paid_out", 30000, jourDe(-1, 15)),
  paiement(2, "MD1", "SB1", "paid_out", 30000, jourDe(-2, 15)),
  paiement(3, "MD1", "SB1", "paid_out", 30000, jourDe(-3, 15)),
  paiement(4, "MD1", "SB1", "failed", 30000, decale(-5)),
  paiement(5, "MD1", "SB1", "pending_submission", 30000, decale(3)),
  ...[-5, -4, -3, -2].map((k, i) => paiement(10 + i, "MD2", "SB4", "paid_out", 5000, jourDe(k, 3))),
  paiement(20, "MD2", "SB3", "paid_out", 15000, jourDe(-3, 20)),
  paiement(21, "MD2", "SB3", "paid_out", 15000, jourDe(-2, 20)),
  ...[1, 8, 15, 22].map((d, i) => paiement(30 + i, "MD2", "SB2", "paid_out", 10000, jourDe(-1, d))),
  paiement(40, "MD4", "SB7", "paid_out", 200000, jourDe(-1, 8)),
  paiement(41, "MD2", null, "failed", 10000, decale(-45)),
];
const EVENEMENTS_GC = [
  { id: "EV1", created_at: aDix(jourDe(-1, 10)), action: "cancelled", resource_type: "subscriptions", links: { subscription: id("SB3") } },
  { id: "EV2", created_at: aDix(decale(-10)), action: "cancelled", resource_type: "mandates", links: { mandate: id("MD5") } },
  { id: "EV3", created_at: aDix(jourDe(-3, 1)), action: "created", resource_type: "subscriptions", links: { subscription: id("SB2") } },
];
const fauxGc = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  recues.push({ methode: req.method, chemin: u.pathname, requete: u.search, version: req.headers["gocardless-version"] ?? "" });
  if (req.method !== "GET") return json(res, 405, { error: { message: "lecture seule attendue" } });
  if (req.headers.authorization !== `Bearer ${JETON_GC}`) return json(res, 401, { error: { message: "Invalid access token" } });
  const page = (cle, liste) => {
    const parPage = Number(u.searchParams.get("limit") ?? 50);
    const debut = u.searchParams.get("after") ? liste.findIndex((x) => x.id === u.searchParams.get("after")) + 1 : 0;
    const morceau = liste.slice(debut, debut + parPage);
    json(res, 200, { [cle]: morceau, meta: { cursors: { before: null, after: debut + parPage < liste.length ? morceau.at(-1).id : null }, limit: parPage } });
  };
  if (u.pathname === "/customers") return page("customers", CLIENTS_GC);
  if (u.pathname === "/mandates") return page("mandates", MANDATS_GC);
  if (u.pathname === "/subscriptions") return page("subscriptions", ABONNEMENTS_GC);
  if (u.pathname === "/payments") return page("payments", PAIEMENTS_GC);
  if (u.pathname === "/events") return page("events", EVENEMENTS_GC.filter((x) => !u.searchParams.get("resource_type") || x.resource_type === u.searchParams.get("resource_type")));
  json(res, 404, { error: { message: "inconnu" } });
});
// Faux Abby : la Boulangerie (déjà prélevée) et un traiteur sans fiche, facturés tous les mois.
const facture = (n, client, nom, k, montant) => ({ id: `f${n}`, type: "invoice", number: `F-${jeu}-${n}`, state: k === -1 ? "finalized" : "paid", title: "Forfait", customer: { id: client, name: nom }, totalAmountWithTax: montant, emittedAt: Math.floor(Date.parse(aDix(jourDe(k, 15))) / 1000) });
const FACTURES = [
  ...[-1, -2, -3].map((k, i) => facture(i + 1, `ABBYB${jeu}`, BOUL, k, 40000)),
  ...[-1, -2, -4].map((k, i) => facture(i + 10, `ABBYT${jeu}`, TRAITEUR, k, 50000)),
  facture(20, `ABBYO${jeu}`, `Ponctuel ${jeu}`, -2, 90000),
];
const recuesAbby = [];
const fauxAbby = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  recuesAbby.push(req.method);
  if (u.pathname === "/v2/billings") {
    const etats = u.searchParams.getAll("state");
    return json(res, 200, { docs: FACTURES.filter((f) => !etats.length || etats.includes(f.state)), hasNextPage: false });
  }
  json(res, 404, {});
});
for (const s of [fauxGc, fauxAbby]) await new Promise((r) => s.listen(0, "127.0.0.1", r));

/* ------------------------------------------------------ 4. serveur Pilot -- */

let serveur = null;
async function demarrer() {
  const sortie = [];
  serveur = spawn(path.join(RACINE, "node_modules/.bin/next"), ["start", "-p", String(PORT), "-H", "127.0.0.1"], {
    cwd: RACINE,
    env: {
      ...process.env,
      DATABASE_URL: PGURL,
      MEDIA_ROOT: MEDIA,
      NODE_ENV: "production",
      GOCARDLESS_API_BASE: `http://127.0.0.1:${fauxGc.address().port}`,
      ABBY_API_URL: `http://127.0.0.1:${fauxAbby.address().port}`,
      ABBY_API_KEY: "",
      // Les autres services de l'étape 3 ne sont pas reliés : rien ne part ailleurs.
      TRELLO_API_BASE: "http://127.0.0.1:9",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serveur.stdout.on("data", (x) => sortie.push(x.toString()));
  serveur.stderr.on("data", (x) => sortie.push(x.toString()));
  serveur.sortie = sortie;
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1500) })).ok) return;
    } catch {
      // pas prêt
    }
    await attendre(500);
  }
  throw new Error(`Pilot n'a pas démarré :\n${sortie.join("").slice(-2000)}`);
}
async function arreter() {
  if (!serveur) return;
  const s = serveur;
  serveur = null;
  if (s.exitCode === null) {
    s.kill("SIGTERM");
    await Promise.race([new Promise((r) => s.once("exit", r)), attendre(8000)]);
    if (s.exitCode === null) s.kill("SIGKILL");
  }
  writeFileSync(JOURNAL, s.sortie.join(""), { flag: "a" });
}

/* --------------------------------------------------------- 5. le décor -- */

process.on("exit", () => serveur?.kill("SIGKILL"));
await demarrer();

const sauvegarde = sql(`select coalesce(json_agg(i), '[]') from integrations i where id in ('trello','gocardless','agenda','abby')`);
const releveAvant = sql(`select coalesce(json_agg(r), '[]') from releves r`);
const objectifAvant = un(`select coalesce((select revenue_goal::text from settings where id='agence'), 'absent')`);
const ouvrirSession = (userId) => {
  const jeton = randomBytes(32).toString("base64url");
  un(`insert into sessions (token_hash, user_id, expires_at) values ('${sha(jeton)}','${userId}', now() + interval '1 day') returning token_hash`);
  return jeton;
};
const direction = un(`insert into users (email,name,initials,role) values ('dir-${jeu}@exemple.test','Emmanuel ${jeu}','ET','direction') returning id`);
const sociale = un(`insert into users (email,name,initials,role,departments) values ('soc-${jeu}@exemple.test','Sociale ${jeu}','SO','equipe','["social"]'::jsonb) returning id`);
const web = un(`insert into users (email,name,initials,role,departments) values ('web-${jeu}@exemple.test','Web ${jeu}','WE','equipe','["web"]'::jsonb) returning id`);
const videaste = un(`insert into users (email,name,initials,role,departments,password_hash) values ('video-${jeu}@exemple.test','Vidéaste ${jeu}','VI','videaste','[]'::jsonb,'x') returning id`);
const garage = un(`insert into clients (name, short_name, departments, monthly_fee_cents) values (${lit(GARAGE)}, ${lit(GARAGE)}, '["social"]'::jsonb, 30000) returning id`);
const spm = un(`insert into clients (name, short_name, departments) values ('Société ${SPM}', ${lit(SPM)}, '["social","web"]'::jsonb) returning id`);
const boul = un(`insert into clients (name, short_name, departments, abby_customer_id) values (${lit(BOUL)}, ${lit(BOUL)}, '["web"]'::jsonb, 'ABBYB${jeu}') returning id`);
const atelier = un(`insert into clients (name, short_name, departments, monthly_fee_cents) values (${lit(ATELIER)}, ${lit(ATELIER)}, '["social"]'::jsonb, 45000) returning id`);
const vanille = un(`insert into clients (name, short_name, departments) values (${lit(VANILLE)}, ${lit(VANILLE)}, '["social"]'::jsonb) returning id`);
un(`insert into contract_lines (client_id, label, monthly_target) values ('${vanille}', '8 posts', 8) returning id`);
un(`insert into contacts (client_id, name, reach) values ('${garage}', 'Marie Hoarau', '${MARIE}') returning id`);
const portail = un(`insert into users (email,name,initials,role,client_id) values ('portail-${jeu}@exemple.test','Client ${jeu}','CP','client','${garage}') returning id`);
sql(`insert into integrations (id, token) values ('abby', 'abby-test-${jeu}') on conflict (id) do update set token = excluded.token`);
sql(`delete from integrations where id in ('trello','gocardless','agenda')`);
sql(`delete from releves`);
sql(`insert into settings (id) values ('agence') on conflict (id) do nothing`);
sql(`update settings set revenue_goal = '{}'::jsonb where id = 'agence'`);
const cDir = ouvrirSession(direction);
const cSoc = ouvrirSession(sociale);
const cWeb = ouvrirSession(web);
const cVid = ouvrirSession(videaste);
const cPortail = ouvrirSession(portail);

const page = async (chemin, cookie) => {
  const r = await fetch(`${BASE}${chemin}`, { headers: cookie ? { Cookie: `pilot_session=${cookie}` } : {}, redirect: "manual", cache: "no-store" });
  const html = (await r.text()).replace(/<!--.*?-->/g, "");
  return {
    statut: r.status,
    location: r.headers.get("location") ?? "",
    html,
    visible: norm(html).replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#xa0;| | /gi, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " "),
  };
};
function actionsDe(manifestePage, fichier) {
  const m = path.join(RACINE, `.next/server/app/${manifestePage}/server-reference-manifest.json`);
  const j = JSON.parse(readFileSync(m, "utf8"));
  return Object.fromEntries(Object.entries(j.node).filter(([, v]) => String(v.filename ?? "").includes(fichier)).map(([k, v]) => [v.exportedName, k]));
}
const A = actionsDe("(agence)/reglages/page", "reglages/etape3-actions");
const AR = actionsDe("(agence)/revenu/page", "revenu/actions");
async function action(chemin, idAction, args, cookie) {
  const r = await fetch(`${BASE}${chemin}`, {
    method: "POST",
    headers: { "Next-Action": idAction, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component", Origin: BASE, ...(cookie ? { Cookie: `pilot_session=${cookie}` } : {}) },
    body: JSON.stringify(args),
    redirect: "manual",
  });
  const texte = await r.text();
  const ligne = texte.split("\n").find((l) => l.startsWith("1:"));
  try {
    return { statut: r.status, resultat: ligne ? JSON.parse(ligne.slice(2)) : null };
  } catch {
    return { statut: r.status, resultat: null };
  }
}
const attendreReleve = async (apres) => {
  for (let i = 0; i < 60; i++) {
    const s = un(`select coalesce(extract(epoch from last_run_at)::bigint, 0) || '|' || coalesce((lease_until > now())::text, 'false') from releves where id = 'gocardless'`);
    const [tt, bail] = (s || "0|false").split("|");
    if (Number(tt) >= apres && bail !== "true") return true;
    await attendre(500);
  }
  return false;
};
const attr = (html, nom) => [...html.matchAll(new RegExp(`${nom}="([^"]*)"`, "g"))].map((m) => m[1]);
const ligneMois = (html, k) => {
  const m = new RegExp(`data-mois="${moisDecale(k)}" data-fin="(-?\\d+)" data-nouveau="(-?\\d+)" data-perdu="(-?\\d+)" data-net="(-?\\d+)" data-encaisse="(-?\\d+)"`).exec(html);
  return m ? { fin: +m[1], nouveau: +m[2], perdu: +m[3], net: +m[4], encaisse: +m[5] } : null;
};

let codeSortie = 0;
try {
  console.log("\n— GoCardless non relié —");
  ok("action « Enregistrer l'objectif » présente dans le build", Boolean(AR.enregistrerObjectif && A.testerEtEnregistrerGoCardless));
  let p = await page("/revenu", cDir);
  ok("la page dit « GoCardless n'est pas relié » et renvoie vers Réglages", p.statut === 200 && p.html.includes('data-revenu-etat="non_relie"') && p.html.includes("/reglages#gocardless"));
  ok("… sans zéro trompeur (aucun montant affiché)", !p.html.includes("data-preleve-cents") && !/\b0 € prélevés/.test(p.visible));
  p = await page("/", cDir);
  ok("accueil : pas d'encart tant que rien n'est relevé", p.statut === 200 && !p.html.includes("data-encart-revenu"));

  console.log("\n— relevé GoCardless —");
  const debut = Math.floor(Date.now() / 1000) - 1;
  let r = await action("/reglages", A.testerEtEnregistrerGoCardless, [{ jeton: JETON_GC, environnement: "sandbox" }], cDir);
  ok("jeton enregistré (sandbox)", r.resultat?.ok === true);
  ok("relevé terminé", await attendreReleve(debut));
  ok("événements d'arrêt lus (abonnements et mandats), en GET", recues.some((x) => x.chemin === "/events" && x.requete.includes("resource_type=subscriptions")) && recues.some((x) => x.chemin === "/events" && x.requete.includes("resource_type=mandates")));
  const resume = JSON.parse(un(`select donnees->'revenu' from releves where id='gocardless'`));
  ok(`résumé gardé pour la page : ${resume.abonnements.length} abonnements, ${resume.paiements.length} paiements, ${resume.mandats.length} mandats`, resume.version === 1 && resume.abonnements.length === 8 && resume.paiements.length === PAIEMENTS_GC.length && resume.evenementsLus === true);
  ok("date d'arrêt de l'abonnement annulé tirée de l'événement", resume.abonnements.find((a) => a.id === id("SB3"))?.arret === jourDe(-1, 10));
  ok("taux de TVA noté dans les métadonnées (« tva » = 0) repris", resume.abonnements.find((a) => a.id === id("SB7"))?.tauxTva === 0);
  ok("aucune coordonnée ni e-mail de client dans le résumé", !JSON.stringify(resume).includes("@"));

  console.log("\n— la page —");
  const avantPage = recues.length;
  p = await page("/revenu", cDir);
  ok("la page s'ouvre (direction)", p.statut === 200 && p.visible.includes("Revenu mensuel"));
  ok("ouvrir la page n'envoie aucune requête à GoCardless", recues.length === avantPage);
  const PRELEVE = 30000 + 43333 + 10000 + 30000 + 200000;
  ok(`revenu mensuel prélevé = 300 + 433,33 + 100 + 300 + 2 000 = ${euros(PRELEVE)} (${PRELEVE} centimes)`, attr(p.html, "data-preleve-cents")[0] === String(PRELEVE) && p.visible.includes(`${euros(PRELEVE)} prélevés chaque mois`));
  const HT = [30000, 43333, 10000, 30000].reduce((tt, c) => tt + R.horsTaxesCents(c, 8.5), 0) + 200000;
  ok(`estimation hors taxes = ${euros(HT)} (8,5 %, sauf 0 % noté sur un abonnement), marquée comme estimation`, attr(p.html, "data-ht-cents")[0] === String(HT) && p.visible.includes("vérifiez le taux de chaque client") && p.visible.includes("ou le taux noté sur 1 abonnement"));
  ok("« MRR » n'apparaît qu'une fois, entre parenthèses", (p.visible.match(/MRR/g) ?? []).length === 1 && p.visible.includes("(MRR)"));
  ok("l'abonnement en attente d'accord du client n'est pas compté", !p.visible.includes(`En attente ${jeu}`) && resume.abonnements.some((a) => a.statut === "pending_customer_approval"));
  ok("barre de progression : 31 % de l'objectif 10 000 €, paliers 5 700 € et 8 800 € nommés", attr(p.html, "data-progression")[0] === "31" && p.html.includes('data-palier="Embauche n° 1"') && p.html.includes('data-palier="Bureau + embauche n° 2"') && p.visible.includes("Objectif 10 000 €"));
  const RESTE = 1_000_000 - PRELEVE;
  const MOYENNE = Math.round(PRELEVE / 4);
  ok(`écart : ${euros(RESTE)}, soit ${Math.ceil(RESTE / MOYENNE)} clients de plus à ${euros(MOYENNE)} (moyenne actuelle)`, attr(p.html, "data-ecart")[0] === String(RESTE) && attr(p.html, "data-clients-de-plus")[0] === String(Math.ceil(RESTE / MOYENNE)) && p.visible.includes(`à ${euros(MOYENNE)} par mois`));
  ok("valeurs à essayer : 400, 500 et 600 €", ["400 €", "500 €", "600 €"].every((x) => p.visible.includes(x)) && p.visible.includes("(moyenne actuelle)"));
  ok("prochain palier : Embauche n° 1, encore …", p.visible.includes(`Prochain palier : Embauche n° 1 à 5 700 €, encore ${euros(570000 - PRELEVE)}`));

  const m0 = ligneMois(p.html, 0);
  const m1 = ligneMois(p.html, -1);
  const m2 = ligneMois(p.html, -2);
  const m3 = ligneMois(p.html, -3);
  ok(`ce mois-ci : nouveau +300 € (tous les 3 mois), perdu 0, net +300, fin ${euros(PRELEVE)}`, m0?.nouveau === 30000 && m0.perdu === 0 && m0.net === 30000 && m0.fin === PRELEVE);
  ok("le mois dernier : abonnement annulé → perdu 150 €, net −150 €", m1?.perdu === 15000 && m1.nouveau === 0 && m1.net === -15000 && m1.fin === PRELEVE - 30000);
  ok("il y a 2 mois : abonnement terminé sans événement → perdu 50 € (fin estimée)", m2?.perdu === 5000 && m2.fin === PRELEVE - 30000 + 15000);
  ok("il y a 3 mois : hebdomadaire démarré → nouveau +433,33 €", m3?.nouveau === 43333 && m3.net === 43333 && m3.fin === m2.fin + 5000);
  ok("le mois dernier : encaissé (contrôle) = 300 + 4 × 100 + 2 000 = 2 700 €", m1?.encaisse === 270000);
  const tousMois = Array.from({ length: 12 }, (_, i) => ligneMois(p.html, -i));
  ok("12 mois dans le tableau, fin(M) = fin(M−1) + net(M)", tousMois.every(Boolean) && tousMois.slice(0, 11).every((m, i) => m.fin === tousMois[i + 1].fin + m.net));
  ok("historique en partie estimé : dit sur la page", p.html.includes('data-avis="historique-estime"') && p.visible.includes("1 abonnement arrêté sans date d'arrêt connue"));
  ok("avant le premier abonnement : « pas de données », pas un zéro", p.html.includes("data-historique-court") && p.visible.includes(`Aucun abonnement GoCardless avant ${["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"][Number(moisDecale(-10).slice(5)) - 1]}`));
  ok("graphique présent (12 colonnes, infobulles au survol)", p.html.includes("data-graphique-revenu") && (p.html.match(/aria-label="[^"]*en fin de mois/g) ?? []).length === 24);

  const partsPage = attr(p.html, "data-part-client");
  const dep = [...p.html.matchAll(/data-part-client="([^"]*)" data-part="([\d.]+)" data-dependance="(oui|non)"/g)].map((m) => ({ nom: m[1], part: +m[2], dep: m[3] === "oui" }));
  ok(`par client : ${partsPage.length} clients (Garage, SPM, Boulangerie, Inconnu), triés par montant`, partsPage.length === 4 && partsPage[0] === INCONNU && dep.reduce((tt, x) => tt + x.part, 0) > 0.999);
  ok("dépendance : le client à 2 000 € (64 %) est signalé, les autres (< 20 %) non", dep.find((x) => x.nom === INCONNU)?.dep === true && dep.filter((x) => x.nom !== INCONNU).every((x) => !x.dep) && p.html.includes('data-avis="dependance"'));
  ok("client relié à sa fiche Contacts (même rapprochement que l'étape 3)", p.html.includes(`href="/contacts/${garage}"`) && p.html.includes(`href="/contacts/${spm}"`) && p.html.includes(`href="/contacts/${boul}"`));
  ok("client GoCardless sans fiche : « sans fiche · relier »", p.visible.includes("sans fiche · relier"));
  ok("par type d'offre : montrée (noms explicites)", p.html.includes("data-par-offre") && ["Community management", "Site et maintenance", "Publicité"].every((x) => p.visible.includes(x)));
  ok(`revenu moyen par client : ${euros(MOYENNE)}`, p.visible.includes(`Revenu moyen par client ${euros(MOYENNE)}`));

  const sans = attr(p.html, "data-sans-prelevement");
  const estime = Object.fromEntries([...p.html.matchAll(/data-sans-prelevement="([^"]*)"[\s\S]*?data-estime="(\d+)"/g)].map((m) => [m[1], +m[2]]));
  ok("contrats sans prélèvement : l'atelier (forfait 450 € dans Pilot, mandat annulé)", sans.includes(ATELIER) && estime[ATELIER] === 45000);
  ok("… le client avec des lignes de contrat mais sans forfait noté", sans.includes(VANILLE) && p.visible.includes("forfait non noté dans Pilot"));
  ok("… le traiteur facturé tous les mois chez Abby (≈ 500 € TTC)", sans.includes(TRAITEUR) && estime[TRAITEUR] === 50000);
  ok("… mais pas les clients prélevés (Garage, SPM, Boulangerie), ni une facture ponctuelle", !sans.includes(GARAGE) && !sans.includes(SPM) && !sans.includes(BOUL) && !sans.includes(`Ponctuel ${jeu}`));
  ok("… avec un lien vers la fiche", p.html.includes(`href="/contacts/${atelier}"`) && p.html.includes(`href="/contacts/${vanille}"`));
  const echecs = (p.html.match(/data-ligne="echec"/g) ?? []).length;
  ok("paiements en échec sur 30 jours : 1 (celui d'il y a 45 jours n'y est pas)", echecs === 1 && p.visible.includes("En échec"));
  ok("mandat annulé d'un client encore actif : l'atelier", (p.html.match(/data-ligne="mandat"/g) ?? []).length === 1 && p.visible.includes(`REV-${jeu}-5`) && p.visible.includes(`Annulé le`));
  ok("prochains prélèvements (30 jours) : 7 lignes, 3 600 €, sans double compte", (p.html.match(/data-ligne="prochain"/g) ?? []).length === 7 && attr(p.html, "data-total-prochains")[0] === "360000");

  console.log("\n— l'accueil —");
  p = await page("/", cDir);
  const encart = norm(/data-encart-revenu[^>]*>([\s\S]*?)<\/a>/.exec(p.html)?.[1] ?? "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
  ok(`encart : « ${encart.trim()} »`, encart.includes(euros(PRELEVE)) && encart.includes("31 % de l'objectif 10 000 €") && encart.includes("+300 € ce mois-ci") && p.html.includes('href="/revenu"'));

  console.log("\n— les droits —");
  for (const [qui, c, vers] of [
    ["pôle social", cSoc, "/"],
    ["pôle web", cWeb, "/"],
    ["vidéaste", cVid, "/videaste"],
    ["client du portail", cPortail, "/portail"],
    ["visiteur sans session", null, "/connexion"],
  ]) {
    p = await page("/revenu", c);
    ok(`${qui} : la page le renvoie ailleurs (${vers}), sans aucun chiffre`, p.statut >= 300 && p.statut < 400 && p.location.includes(vers) && !p.html.includes("data-preleve-cents") && !p.html.includes(euros(PRELEVE)));
    const avant = un(`select revenue_goal::text from settings where id='agence'`);
    r = await action("/revenu", AR.enregistrerObjectif, [null, {}], c);
    ok(`${qui} : « Enregistrer l'objectif » refusé`, r.resultat?.ok !== true && un(`select revenue_goal::text from settings where id='agence'`) === avant);
  }
  for (const [qui, c] of [
    ["pôle social", cSoc],
    ["pôle web", cWeb],
  ]) {
    p = await page("/", c);
    ok(`${qui} : pas d'encart sur l'accueil`, !p.html.includes("data-encart-revenu") && !p.html.includes(euros(PRELEVE)));
  }

  /* --------------------------------------------------- navigateur -- */
  console.log("\n— navigateur —");
  const pw = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;
  const navigateur = await pw.chromium.launch();
  if (CAPTURES) mkdirSync(CAPTURES, { recursive: true });
  const formats = [
    ["1440", { viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 }],
    ["iphone13", { ...pw.devices["iPhone 13"] }],
  ];
  for (const [nom, options] of formats) {
    for (const theme of ["light", "dark"]) {
      const ctx = await navigateur.newContext({ ...options, colorScheme: theme, locale: "fr-FR", timezoneId: "Indian/Reunion" });
      await ctx.addCookies([{ name: "pilot_session", value: cDir, url: BASE }]);
      const onglet = await ctx.newPage();
      const erreurs = [];
      onglet.on("pageerror", (x) => erreurs.push(x.message));
      await onglet.goto(`${BASE}/revenu`, { waitUntil: "networkidle" });
      ok(`${nom} ${theme} : thème appliqué`, (await onglet.evaluate(() => document.documentElement.dataset.theme)) === theme);
      // Rien ne déborde : hors des tables qui défilent dans leur carte, aucun élément ne dépasse la fenêtre.
      const debord = await onglet.evaluate(() => {
        const l = window.innerWidth;
        const main = document.querySelector("main");
        if (main && main.scrollWidth > main.clientWidth + 1) return [`main défile sur le côté (${main.scrollWidth} px)`];
        return [...document.querySelectorAll("main *")]
          .filter((el) => el.closest(".overflow-x-auto") === main && el.getClientRects().length)
          .filter((el) => {
            const b = el.getBoundingClientRect();
            return b.right > l + 1 || b.left < -1;
          })
          .slice(0, 5)
          .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} (${Math.round(el.getBoundingClientRect().right)})`);
      });
      ok(`${nom} ${theme} : rien ne déborde${debord.length ? ` — ${debord.join(" | ")}` : ""}`, debord.length === 0);
      // L'infobulle du graphique au survol (ou au toucher).
      const col = onglet.locator("[data-graphique-revenu] button").nth(11);
      if (nom === "1440") await col.hover();
      else await col.tap();
      ok(`${nom} ${theme} : infobulle du mois en cours`, (await onglet.locator('[data-graphique-revenu] [role="status"]').innerText()).includes("en cours"));
      if (nom === "1440") await onglet.mouse.move(0, 0);
      else await onglet.locator("h1").first().tap();
      if (CAPTURES) {
        // L'application défile dans un conteneur intérieur : une fenêtre aussi haute que la page la montre entière.
        const largeur = onglet.viewportSize().width;
        const hauteur = await onglet.evaluate(() => Math.max(...[...document.querySelectorAll("main .overflow-auto")].map((x) => x.scrollHeight + x.getBoundingClientRect().top)) + 120);
        await onglet.setViewportSize({ width: largeur, height: Math.min(Math.ceil(hauteur), 12_000) });
        await attendre(300);
        await onglet.screenshot({ path: path.join(CAPTURES, `revenu-${nom}-${theme}.png`) });
        await onglet.setViewportSize({ width: largeur, height: nom === "1440" ? 1000 : 844 });
        await onglet.goto(`${BASE}/`, { waitUntil: "networkidle" });
        await onglet.locator("[data-encart-revenu]").scrollIntoViewIfNeeded();
        await onglet.screenshot({ path: path.join(CAPTURES, `accueil-${nom}-${theme}.png`) });
      }
      ok(`${nom} ${theme} : aucune erreur JavaScript${erreurs.length ? ` — ${erreurs.join(" | ")}` : ""}`, erreurs.length === 0);
      await ctx.close();
    }
  }

  // Le menu « Plus » → Direction, pour la direction et pour le pôle social.
  for (const [qui, c, attendu] of [
    ["direction", cDir, true],
    ["pôle social", cSoc, false],
  ]) {
    const cx = await navigateur.newContext({ viewport: { width: 1440, height: 1000 }, locale: "fr-FR" });
    await cx.addCookies([{ name: "pilot_session", value: c, url: BASE }]);
    const o = await cx.newPage();
    await o.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await o.getByRole("button", { name: /^Plus/ }).first().click();
    const liens = await o.locator('a[href="/rentabilite"], a[href="/revenu"]:not([data-encart-revenu])').evaluateAll((els) => els.map((x) => x.getAttribute("href")));
    ok(
      attendu ? "menu « Plus » → Direction : « Revenu mensuel » juste après Rentabilité" : `${qui} : « Revenu mensuel » absent du menu`,
      attendu ? liens.join(",") === "/rentabilite,/revenu" : !liens.includes("/revenu"),
    );
    await cx.close();
  }

  // Le formulaire de l'objectif, comme Emmanuel s'en sert.
  const ctx = await navigateur.newContext({ viewport: { width: 1440, height: 1000 }, locale: "fr-FR" });
  await ctx.addCookies([{ name: "pilot_session", value: cDir, url: BASE }]);
  const onglet = await ctx.newPage();
  await onglet.goto(`${BASE}/revenu`, { waitUntil: "networkidle" });
  await onglet.locator("[data-reglages-objectif] summary").click();
  await onglet.locator('input[name="objectif"]').fill("abc");
  await onglet.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await onglet.getByRole("status").filter({ hasText: "objectif" }).waitFor({ timeout: 10_000 });
  ok("objectif illisible : message clair, rien d'enregistré", (await onglet.getByRole("status").filter({ hasText: "objectif" }).innerText()).includes("montant en euros") && un(`select revenue_goal::text from settings where id='agence'`) === "{}");
  await onglet.locator('input[name="objectif"]').fill("12 000");
  await onglet.locator('input[name="palier1"]').fill("6000");
  await onglet.locator('input[name="libelle1"]').fill("Première embauche");
  await onglet.locator('input[name="palier2"]').fill("");
  await onglet.locator('input[name="libelle2"]').fill("");
  await onglet.locator('input[name="tva"]').fill("0");
  await onglet.locator('select[name="base"]').selectOption("ht");
  await onglet.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await onglet.getByRole("status").filter({ hasText: "Enregistré" }).waitFor({ timeout: 10_000 });
  const goal = JSON.parse(un(`select revenue_goal::text from settings where id='agence'`));
  ok("objectif enregistré : 12 000 €, un palier « Première embauche » à 6 000 €, TVA 0 %, comparé au hors taxes", goal.objectifCents === 1_200_000 && goal.paliers.length === 1 && goal.paliers[0].libelle === "Première embauche" && goal.paliers[0].montantCents === 600_000 && goal.tauxTva === 0 && goal.base === "ht");
  await ctx.close();
  await navigateur.close();
  p = await page("/revenu", cDir);
  ok("la page suit les nouveaux réglages (objectif 12 000 €, palier renommé)", p.visible.includes("Objectif 12 000 €") && p.html.includes('data-palier="Première embauche"') && !p.html.includes('data-palier="Embauche n° 1"'));
  p = await page("/", cDir);
  ok("l'encart aussi (hors taxes, objectif 12 000 €)", /data-encart-revenu[\s\S]*?revenu mensuel HT[\s\S]*?de l'objectif 12 000 €/.test(norm(p.html).replace(/&#x27;/g, "'")));

  console.log("\n— lecture seule, vue du faux GoCardless —");
  ok(`${recues.length} requêtes reçues par le faux GoCardless : toutes en GET, avec GoCardless-Version`, recues.length >= 6 && recues.every((x) => x.methode === "GET" && x.version === "2015-07-06"));
  ok(`${recuesAbby.length} requêtes reçues par le faux Abby : toutes en GET`, recuesAbby.length >= 1 && recuesAbby.every((x) => x === "GET"));

  console.log("\n— déconnecté —");
  r = await action("/reglages", A.deconnecterService, [{ service: "gocardless", effacer: false }], cDir);
  p = await page("/revenu", cDir);
  ok("GoCardless déconnecté : la page le redit, l'accueil n'a plus d'encart", r.resultat?.ok === true && p.html.includes('data-revenu-etat="non_relie"') && !(await page("/", cDir)).html.includes("data-encart-revenu"));
  await arreter();
  const journal = readFileSync(JOURNAL, "utf8");
  ok("journal du serveur : jamais le jeton GoCardless", !journal.includes(JETON_GC));
} catch (x) {
  console.error(x);
  codeSortie = 1;
} finally {
  console.log("\n— nettoyage —");
  await arreter().catch(() => undefined);
  for (const s of [fauxGc, fauxAbby]) s.close();
  sql(`delete from directory_entries where name like '%${jeu}%' or client_id in (select id from clients where name like '%${jeu}%')`);
  sql(`delete from users where email like '%-${jeu}@exemple.test'`);
  sql(`delete from clients where name like '%${jeu}%'`);
  sql(`delete from integrations where id in ('trello','gocardless','agenda','abby')`);
  sql(`insert into integrations select * from json_populate_recordset(null::integrations, ${lit(sauvegarde)})`);
  sql(`delete from releves`);
  sql(`insert into releves select * from json_populate_recordset(null::releves, ${lit(releveAvant)})`);
  if (objectifAvant !== "absent") sql(`update settings set revenue_goal = ${lit(objectifAvant)}::jsonb where id='agence'`);
  else sql(`delete from settings where id='agence'`);
  rmSync(dir, { recursive: true, force: true });
  console.log("décor effacé, serveur Pilot et faux services arrêtés");
}

console.log(`\n${verts} vérifications vertes, ${rouges.length} rouge(s).`);
if (rouges.length || codeSortie) {
  for (const x of rouges) console.log(`  ✗ ${x}`);
  process.exit(1);
}
process.exit(0);
