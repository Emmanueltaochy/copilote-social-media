#!/usr/bin/env node
//
// Étape 3 de l'espace clients : Trello, GoCardless et Google Agenda, en
// lecture seule. Vérification de bout en bout contre de faux serveurs locaux,
// jamais contre un vrai compte.
//
// Ce que le script vérifie :
//   - les règles pures (src/lib/etape3-regles.ts) : découpage des cartes,
//     colonnes, rapprochement par le nom, double compte Abby / GoCardless,
//     extrait et lien de visio, adresse iCal ;
//   - qu'aucune requête d'écriture ne part : dans le code (seules des GET),
//     et sur les faux serveurs Trello, GoCardless et iCal (méthodes reçues) ;
//   - Réglages : « Tester et enregistrer » (erreurs claires, secrets chiffrés),
//     choix des tableaux, « Synchroniser maintenant », « Déconnecter » ;
//   - les rapprochements (nom sans symbole, accents ni casse ; e-mail ; nom
//     d'entreprise ; liens manuels depuis la fiche) et les cartes sans fiche ;
//   - la confidentialité de l'agenda : rien de non rattaché en base, 280
//     caractères de description au plus, récurrences, exceptions, fuseaux ;
//   - l'encaissé sans double compte (Abby + GoCardless) sur la fiche ;
//   - « Ce matin » (Actions Trello, Argent qui dort, À répondre, Rendez-vous
//     du jour, compte rendu à envoyer) avec « Traité » et le retour des
//     lignes quand l'état change ;
//   - les droits : direction seulement ; pôle social, pôle web, client du
//     portail et visiteur sans session refusés ;
//   - aucun secret dans les réponses ni dans le journal du serveur.
//
// Usage (local uniquement, après npm run build ; le script démarre et arrête
// lui-même le serveur Pilot et les faux services) :
//   PGURL="postgres://pilot:pilot@localhost:5432/pilot" node scripts/test-etape3.mjs
//   CAPTURES=/chemin/dossier …  → captures Playwright (1440 px et iPhone 13).

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
const PORT = Number(process.env.PORT_TEST ?? 3131);
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
const dir = mkdtempSync(path.join(os.tmpdir(), "pilot-test-etape3-"));
const MEDIA = path.join(dir, "media");
mkdirSync(path.join(MEDIA, ".secrets"), { recursive: true, mode: 0o700 });
writeFileSync(path.join(MEDIA, ".secrets", "pilot-secrets.key"), randomBytes(32).toString("hex"), { mode: 0o600 });
const JOURNAL = path.join(dir, "serveur.log");
const reponses = [];
const JOUR = 86_400_000;
const iso = (ms) => new Date(ms).toISOString();
const jourReunion = (ms) => new Date(ms + 4 * 3_600_000).toISOString().slice(0, 10);
const maintenant = Date.now();

/* ---------------------------------------------------- 1. règles pures -- */

console.log("\n— règles (src/lib/etape3-regles.ts) —");
const R = await import(path.join(RACINE, "src/lib/etape3-regles.ts"));
let d = R.decouperCarte("🌐 VTC Services+ — Améliorer le programme tablette");
ok("« 🌐 VTC Services+ — Améliorer… » → web, client « VTC Services+ »", d.categorie === "web" && d.client === "VTC Services+" && d.action === "Améliorer le programme tablette" && !d.agence);
d = R.decouperCarte("SPM — Créer le document PPSPS");
ok("« SPM — Créer le document PPSPS » (sans symbole) → client SPM", d.categorie === null && d.client === "SPM" && d.action === "Créer le document PPSPS");
ok("« 🗂️ Agence — … » et « 🗂️ Tous les clients — … » : toute l'agence", R.decouperCarte("🗂️ Agence — Mettre à jour les CGV").agence && R.decouperCarte("🗂️ Tous les clients — Bilan annuel").agence);
ok("« 🏝️ Swap'Îles — … » → catégorie swapiles", R.decouperCarte("🏝️ Swap'Îles — Corriger le paiement").categorie === "swapiles");
ok("carte sans « — » : pas de client", R.decouperCarte("Idées en vrac").client === null);
ok(
  "colonnes reconnues (🔥 Cette semaine (7 cartes max), ⏳ En attente du client, 💶 Argent à encaisser, ✅ Terminé…)",
  R.colonneTrello("🔥 Cette semaine (7 cartes max)") === "semaine" && R.colonneTrello("⏳ En attente du client") === "attente" && R.colonneTrello("💶 Argent à encaisser") === "argent" && R.colonneTrello("✅ Terminé") === "termine" && R.colonneTrello("📥 À trier") === "a_trier" && R.colonneTrello("💡 Plus tard") === "plus_tard" && R.colonneTrello("📋 À faire") === "a_faire" && R.colonneTrello("🎯 Objectifs") === "objectifs",
);
const cands = [
  { entryId: null, clientId: "c1", nom: "Garage Sud-Auto" },
  { entryId: "e2", clientId: null, nom: "Café Lagon" },
  { entryId: null, clientId: "c3", nom: "VTC Services+" },
];
ok("rapprochement : « GARAGE SUD AUTO » = « Garage Sud-Auto » (casse, tiret)", R.parNom("GARAGE SUD AUTO", cands)?.clientId === "c1");
ok("rapprochement : « Cafe lagon » = « Café Lagon » (accents)", R.parNom("Cafe lagon", cands)?.entryId === "e2");
ok("rapprochement : « VTC Services » = « VTC Services+ » (symbole)", R.parNom("VTC Services", cands)?.clientId === "c3");
ok("rapprochement : nom inconnu ou trop court → rien", R.parNom("Inconnu", cands) === null && R.parNom("ab", [{ entryId: "x", clientId: null, nom: "AB" }]) === null);
ok("titre : « Rdv SPM chantier » contient « spm », pas « Spmx »", R.titreContient("Rdv SPM chantier", "spm") && !R.titreContient("Rdv Spmx", "spm"));
const carte = (x) => ({ id: "k", nom: "", url: "", tableau: "", colonne: "", colonneCle: "a_faire", echeance: null, echeanceFaite: false, derniereActivite: iso(maintenant), dansLaColonneDepuis: iso(maintenant), ...x });
ok("règle : « 🔥 Cette semaine » → Actions", R.raisonsCarte(carte({ colonneCle: "semaine" }), new Date())[0] === "Dans « 🔥 Cette semaine »");
ok("règle : échéance dépassée → Actions ; cochée « terminée » → non", R.raisonsCarte(carte({ echeance: iso(maintenant - 3 * JOUR) }), new Date())[0] === "Échéance dépassée de 3 j" && R.raisonsCarte(carte({ echeance: iso(maintenant - 3 * JOUR), echeanceFaite: true }), new Date()).length === 0);
ok("règle : « En attente du client » depuis 10 j → relancer ; depuis 3 j → non", /relancer/.test(R.raisonsCarte(carte({ colonneCle: "attente", dansLaColonneDepuis: iso(maintenant - 10 * JOUR) }), new Date())[0] ?? "") && R.raisonsCarte(carte({ colonneCle: "attente", dansLaColonneDepuis: iso(maintenant - 3 * JOUR) }), new Date()).length === 0);
ok("règle : « ✅ Terminé » n'entre jamais (même en retard)", R.raisonsCarte(carte({ colonneCle: "termine", echeance: iso(maintenant - 9 * JOUR) }), new Date()).length === 0);
ok("empreinte « Traité » = colonne | échéance | dernière activité", R.empreinteCarte({ colonne: "A", echeance: "B", derniereActivite: "C" }) === "A|B|C");
const dc = R.sansDoubleCompte(
  [
    { number: "F-2026-031", amountCents: 30000, paidAt: new Date("2026-11-03T10:00:00Z") },
    { number: "F-2026-032", amountCents: 12000, paidAt: new Date("2026-10-20T10:00:00Z") },
  ],
  [
    { id: "PM1", amountCents: 30000, chargeDate: "2026-11-01", reference: "TAOCHY", description: null },
    { id: "PM2", amountCents: 99999, chargeDate: "2026-09-01", reference: null, description: "Facture F 2026 032" },
    { id: "PM3", amountCents: 5000, chargeDate: "2026-11-01", reference: null, description: null },
    { id: "PM4", amountCents: 30000, chargeDate: "2026-08-01", reference: null, description: null },
  ],
);
ok(
  "double compte : même référence (PM2), même montant à 3 j près (PM1) → pas recomptés ; PM3 et PM4 (autre date) ajoutés",
  dc.aAjouter.sort().join(",") === "PM3,PM4" && dc.regles.find((x) => x.paiement === "PM2")?.par === "reference" && dc.regles.find((x) => x.paiement === "PM1")?.par === "montant_date",
);
ok("paiements : encaissé, à venir, échec", R.etatPaiement("paid_out") === "encaisse" && R.etatPaiement("pending_submission") === "a_venir" && R.etatPaiement("failed") === "echec" && R.etatPaiement("charged_back") === "echec");
ok("rythme : mensuel, tous les 3 mois, annuel", R.rythme(1, "monthly") === "mensuel" && R.rythme(3, "monthly") === "tous les 3 mois" && R.rythme(1, "yearly") === "annuel");
ok("description : 280 caractères au plus, sans le bloc Meet", R.extraitDescription("mot ".repeat(300)).length <= 280 && R.extraitDescription("Ordre du jour\n-::~:~::~:~:~:~::~:~::-\nRejoindre avec Google Meet : https://meet.google.com/abc-defg-hij") === "Ordre du jour");
ok("lien de visio : propriété Google, sinon Meet / Zoom dans la description", R.lienVisio("https://meet.google.com/abc-defg-hij", null, null) === "https://meet.google.com/abc-defg-hij" && R.lienVisio(null, null, "Lien : https://us02web.zoom.us/j/123?pwd=x") === "https://us02web.zoom.us/j/123?pwd=x");
ok(
  "adresse iCal : seule la forme Google est acceptée",
  R.adresseIcalGoogle("https://calendar.google.com/calendar/ical/emmanuel%40gmail.com/private-0123abcd/basic.ics") && !R.adresseIcalGoogle("https://evil.example/calendar/ical/x/private-y/basic.ics") && !R.adresseIcalGoogle("http://calendar.google.com/calendar/ical/x/private-y/basic.ics"),
);
ok("adresse iCal masquée : jamais la partie secrète", !R.adresseMasquee("https://calendar.google.com/calendar/ical/emmanuel%40gmail.com/private-0123456789abcdef/basic.ics").includes("0123456789ab"));

/* ------------------------------------------- 2. lecture seule : le code -- */

console.log("\n— lecture seule : le code —");
const fichiers = ["src/lib/trello.ts", "src/lib/gocardless.ts", "src/lib/agenda.ts", "src/lib/releves.ts"];
const code = fichiers.map((f) => readFileSync(path.join(RACINE, f), "utf8")).join("\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const fetchs = [...code.matchAll(/fetch\(([^;]*?)\)\s*;/g)].map((m) => m[1]);
ok(`chaque fetch des trois services est un GET (${fetchs.length} appels)`, fetchs.length >= 2 && fetchs.every((f) => /method: "GET"/.test(f)));
ok("aucune méthode POST, PUT, PATCH ni DELETE écrite dans ces modules", !/method:\s*["'`](POST|PUT|PATCH|DELETE)/i.test(code));
ok("adresses de test prises en compte seulement vers 127.0.0.1 / localhost", /const BOUCLE = \/\^\(127\\.0\\.0\\.1\|localhost\|\\\[::1\\\]\)\$\//.test(readFileSync(path.join(RACINE, "src/lib/releves.ts"), "utf8")));
ok("le jeton Trello part dans l'en-tête, jamais dans l'adresse", /Authorization: `OAuth oauth_consumer_key=/.test(code) && !/searchParams\.set\("(key|token)"/.test(code));

/* --------------------------------------------- 3. les faux services -- */

const recues = { trello: [], gocardless: [], ical: [] };
const CLE_TRELLO = randomBytes(16).toString("hex");
const JETON_TRELLO = `ATTA${randomBytes(30).toString("hex")}`;
const JETON_GC = `sandbox_${randomBytes(24).toString("base64url")}`;
const SECRET_ICS = `private-${randomBytes(12).toString("hex")}`;

const json = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

// Trello : formes de réponse de l'API REST 1 (members/me, boards, lists, cards, actions).
const LISTES = [
  ["l-obj", "🎯 Objectifs"],
  ["l-tri", "📥 À trier"],
  ["l-sem", "🔥 Cette semaine (7 cartes max)"],
  ["l-faire", "📋 À faire"],
  ["l-att", "⏳ En attente du client"],
  ["l-arg", "💶 Argent à encaisser"],
  ["l-tard", "💡 Plus tard"],
  ["l-fini", "✅ Terminé"],
];
const GARAGE = `Garage Sud-Auto ${jeu}`;
const SPM = `SPM${jeu}`;
const CAFE = `Café Lagon ${jeu}`;
const cartesTrello = [
  { id: `c1${jeu}`, name: `🌐 GARAGE SUD AUTO ${jeu} — Améliorer la page d'accueil`, idList: "l-sem", due: null, dateLastActivity: iso(maintenant - 2 * JOUR) },
  { id: `c2${jeu}`, name: `${SPM} — Créer le document PPSPS`, idList: "l-faire", due: iso(maintenant - 2 * JOUR), dueComplete: false, dateLastActivity: iso(maintenant - 5 * JOUR) },
  { id: `c3${jeu}`, name: `📣 Garage Sud Auto ${jeu} — Relancer pour les photos`, idList: "l-att", due: null, dateLastActivity: iso(maintenant - 10 * JOUR) },
  { id: `c4${jeu}`, name: `🗂️ Agence — Mettre à jour les CGV ${jeu}`, idList: "l-sem", due: null, dateLastActivity: iso(maintenant - JOUR) },
  { id: `c5${jeu}`, name: `🌐 Inconnu ${jeu} — Faire le site`, idList: "l-faire", due: null, dateLastActivity: iso(maintenant - JOUR) },
  { id: `c6${jeu}`, name: `Garage Sud Auto ${jeu} — Ancienne tâche`, idList: "l-fini", due: iso(maintenant - 20 * JOUR), dueComplete: true, dateLastActivity: iso(maintenant - 15 * JOUR) },
  { id: `c7${jeu}`, name: `📣 ${SPM} — Attendre la validation`, idList: "l-att", due: null, dateLastActivity: iso(maintenant - 2 * JOUR) },
  { id: `c8${jeu}`, name: `🏝️ cafe LAGON ${jeu} — Envoyer la proposition`, idList: "l-tri", due: null, dateLastActivity: iso(maintenant - JOUR) },
  { id: `c9${jeu}`, name: `🌐 Boutique Vanille ${jeu} — Photos produits`, idList: "l-faire", due: null, dateLastActivity: iso(maintenant - JOUR) },
];
const actionsTrello = () => [
  // c3 arrivée dans « En attente » il y a 10 jours ; c7 il y a 2 jours.
  { id: "a1", type: "updateCard", date: iso(maintenant - 10 * JOUR), data: { card: { id: `c3${jeu}` }, listBefore: { id: "l-faire" }, listAfter: { id: "l-att" } } },
  { id: "a2", type: "updateCard", date: iso(maintenant - 2 * JOUR), data: { card: { id: `c7${jeu}` }, listBefore: { id: "l-faire" }, listAfter: { id: "l-att" } } },
  { id: "a3", type: "createCard", date: iso(maintenant - 30 * JOUR), data: { card: { id: `c1${jeu}` }, list: { id: "l-tri" } } },
];
const fauxTrello = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  recues.trello.push({ methode: req.method, chemin: u.pathname, auth: req.headers.authorization ?? "", requete: u.search });
  if (req.method !== "GET") return json(res, 405, { message: "lecture seule attendue" });
  if (req.headers.authorization !== `OAuth oauth_consumer_key="${CLE_TRELLO}", oauth_token="${JETON_TRELLO}"`) {
    res.writeHead(401, { "Content-Type": "text/plain" });
    return res.end("invalid key");
  }
  if (u.pathname === "/1/members/me") return json(res, 200, { id: "m1", username: "emmanueltaochy", fullName: "Emmanuel Taochy" });
  if (u.pathname === "/1/members/me/boards") return json(res, 200, [{ id: "b-ceo", name: "CEO / EMMANUEL TAOCHY", closed: false }, { id: "b-perso", name: "Perso", closed: false }]);
  if (u.pathname === "/1/boards/b-ceo") return json(res, 200, { id: "b-ceo", name: "CEO / EMMANUEL TAOCHY" });
  if (u.pathname === "/1/boards/b-ceo/lists") return json(res, 200, LISTES.map(([id, name], i) => ({ id, name, closed: false, pos: i * 1000, idBoard: "b-ceo" })));
  if (u.pathname === "/1/boards/b-ceo/cards")
    return json(res, 200, cartesTrello.map((c) => ({ dueComplete: false, closed: false, idBoard: "b-ceo", shortUrl: `https://trello.com/c/${c.id}`, url: `https://trello.com/c/${c.id}/carte`, ...c })));
  if (u.pathname === "/1/boards/b-ceo/actions") return json(res, 200, actionsTrello());
  json(res, 404, { message: "inconnu" });
});

// GoCardless : formes de réponse de l'API (version 2015-07-06), pagination par curseur.
const MARIE = `marie.${jeu}@garage-sud.test`;
const SPM_CONTACT = `chantier.${jeu}@spm.test`;
const auj = jourReunion(maintenant);
const decale = (j) => jourReunion(maintenant + j * JOUR);
const CLIENTS_GC = [
  { id: `CU1${jeu}`, email: MARIE, given_name: "Marie", family_name: "Hoarau", company_name: null, created_at: iso(maintenant - 200 * JOUR), metadata: {} },
  { id: `CU2${jeu}`, email: `compta.${jeu}@autre.test`, given_name: null, family_name: null, company_name: `spm ${jeu}`.replace(" ", ""), created_at: iso(maintenant - 150 * JOUR), metadata: {} },
  { id: `CU3${jeu}`, email: `x.${jeu}@inconnu.test`, given_name: "Paul", family_name: "Inconnu", company_name: `Inconnu SAS ${jeu}`, created_at: iso(maintenant - 100 * JOUR), metadata: {} },
];
const MANDATS_GC = [
  { id: `MD1${jeu}`, status: "active", reference: `TAOCHY-${jeu}-1`, scheme: "sepa_core", created_at: iso(maintenant - 199 * JOUR), next_possible_charge_date: decale(3), links: { customer: `CU1${jeu}`, creditor: "CR1" } },
  { id: `MD2${jeu}`, status: "cancelled", reference: `TAOCHY-${jeu}-2`, scheme: "sepa_core", created_at: iso(maintenant - 149 * JOUR), next_possible_charge_date: null, links: { customer: `CU2${jeu}`, creditor: "CR1" } },
  { id: `MD3${jeu}`, status: "active", reference: `TAOCHY-${jeu}-3`, scheme: "sepa_core", created_at: iso(maintenant - 99 * JOUR), next_possible_charge_date: decale(3), links: { customer: `CU3${jeu}`, creditor: "CR1" } },
];
const ABONNEMENTS_GC = [
  { id: `SB1${jeu}`, status: "active", amount: 30000, currency: "EUR", name: `Forfait social ${jeu}`, interval: 1, interval_unit: "monthly", day_of_month: 5, start_date: decale(-180), end_date: null, created_at: iso(maintenant - 190 * JOUR), upcoming_payments: [{ charge_date: decale(3), amount: 30000 }, { charge_date: decale(33), amount: 30000 }], links: { mandate: `MD1${jeu}` } },
];
const paiement = (id, mandat, status, amount, jours, extra = {}) => ({ id: `${id}${jeu}`, status, amount, currency: "EUR", charge_date: decale(jours), reference: null, description: null, created_at: iso(maintenant + (jours - 5) * JOUR), amount_refunded: 0, links: { mandate: `${mandat}${jeu}`, creditor: "CR1" }, ...extra });
const PAIEMENTS_GC = [
  paiement("PM1", "MD1", "paid_out", 30000, -30, { reference: `TAOCHY-${jeu}` }), // règle F-…-1 (même montant, même date)
  paiement("PM2", "MD1", "confirmed", 12000, -60, { description: `Facture F-${jeu}-2` }), // règle F-…-2 (référence)
  paiement("PM3", "MD1", "paid_out", 5000, -10, { description: `Option stories ${jeu}` }), // n'a pas de facture Abby : ajouté
  paiement("PM4", "MD1", "pending_submission", 30000, 3, { description: `Forfait social ${jeu}` }), // à venir
  paiement("PM5", "MD1", "failed", 30000, -5, { description: `Forfait octobre ${jeu}` }), // échec, client sous contrat
  paiement("PM6", "MD3", "failed", 8000, -4), // échec, client sans fiche
];
const fauxGc = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  recues.gocardless.push({ methode: req.method, chemin: u.pathname, auth: req.headers.authorization ?? "", version: req.headers["gocardless-version"] ?? "", requete: u.search });
  if (req.method !== "GET") return json(res, 405, { error: { message: "lecture seule attendue" } });
  if (req.headers.authorization !== `Bearer ${JETON_GC}`) return json(res, 401, { error: { type: "invalid_api_usage", code: 401, message: "Invalid access token", errors: [{ reason: "invalid_access_token" }] } });
  if (req.headers["gocardless-version"] !== "2015-07-06") return json(res, 400, { error: { message: "GoCardless-Version manquant" } });
  const page = (cle, liste) => {
    // Les clients sont servis en deux pages (curseur « after ») pour éprouver la pagination.
    const parPage = cle === "customers" && u.searchParams.get("limit") !== "1" ? 2 : Number(u.searchParams.get("limit") ?? 50);
    const debut = u.searchParams.get("after") ? liste.findIndex((x) => x.id === u.searchParams.get("after")) + 1 : 0;
    const morceau = liste.slice(debut, debut + parPage);
    const suite = debut + parPage < liste.length ? morceau.at(-1).id : null;
    json(res, 200, { [cle]: morceau, meta: { cursors: { before: null, after: suite }, limit: parPage } });
  };
  if (u.pathname === "/customers") return page("customers", CLIENTS_GC);
  if (u.pathname === "/mandates") return page("mandates", MANDATS_GC);
  if (u.pathname === "/subscriptions") return page("subscriptions", ABONNEMENTS_GC);
  if (u.pathname === "/payments") return page("payments", PAIEMENTS_GC);
  json(res, 404, { error: { message: "inconnu" } });
});

// Le faux agenda (.ics comme Google l'exporte).
const ics = (lignes) => ["BEGIN:VCALENDAR", "PRODID:-//Google Inc//Google Calendar 70.9054//EN", "VERSION:2.0", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Emmanuel", "X-WR-TIMEZONE:Indian/Reunion", ...lignes, "END:VCALENDAR", ""].join("\r\n");
const ical = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const mur = (jourIso, hh, mm = 0) => `${jourIso.replace(/-/g, "")}T${String(hh).padStart(2, "0")}${String(mm).padStart(2, "0")}00`;
const debutSerie = decale(-14);
const SECRET_PERSO = `SECRET-PERSO-${jeu}`;
const LONGUE = `Ordre du jour : ${"point détaillé sur le chantier, ".repeat(25)} FIN-${jeu}`;
const evts = [
  // Série hebdomadaire, nom du client dans le titre, 10 h à La Réunion (TZID sans VTIMEZONE : Intl), une date exclue, une occurrence déplacée.
  ["BEGIN:VEVENT", `DTSTART;TZID=Indian/Reunion:${mur(debutSerie, 10)}`, `DTEND;TZID=Indian/Reunion:${mur(debutSerie, 11)}`, "RRULE:FREQ=WEEKLY;COUNT=6", `EXDATE;TZID=Indian/Reunion:${mur(decale(-7), 10)}`, `UID:hebdo-${jeu}@google.com`, `SUMMARY:Point hebdo Garage Sud Auto ${jeu}`, "DESCRIPTION:Suivi du site", "STATUS:CONFIRMED", "END:VEVENT"],
  ["BEGIN:VEVENT", `RECURRENCE-ID;TZID=Indian/Reunion:${mur(decale(7), 10)}`, `DTSTART;TZID=Indian/Reunion:${mur(decale(7), 15)}`, `DTEND;TZID=Indian/Reunion:${mur(decale(7), 16)}`, `UID:hebdo-${jeu}@google.com`, `SUMMARY:Point hebdo Garage Sud Auto ${jeu} (déplacé)`, "END:VEVENT"],
  // Aujourd'hui à midi (La Réunion), invité connu (contact du client SPM), lien Meet de Google.
  ["BEGIN:VEVENT", `DTSTART:${ical(Date.parse(`${auj}T08:00:00Z`))}`, `DTEND:${ical(Date.parse(`${auj}T09:00:00Z`))}`, `UID:chantier-${jeu}@google.com`, "SUMMARY:Visite de chantier", `ATTENDEE;CN=Chantier;PARTSTAT=ACCEPTED:mailto:${SPM_CONTACT}`, "ATTENDEE;CN=Emmanuel:mailto:emmanuel@taochyagency.com", "X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij", "LOCATION:Rue de Paris, Saint-Denis", "END:VEVENT"],
  // Personnel : rien à voir avec un client.
  ["BEGIN:VEVENT", `DTSTART:${ical(maintenant + 2 * JOUR)}`, `DTEND:${ical(maintenant + 2 * JOUR + 3_600_000)}`, `UID:perso-${jeu}@google.com`, `SUMMARY:Dentiste ${jeu}`, `DESCRIPTION:${SECRET_PERSO}`, `ATTENDEE:mailto:inconnu.${jeu}@gmail.com`, "END:VEVENT"],
  // Il y a deux jours, avec Marie (cliente) : compte rendu à envoyer ; description longue.
  ["BEGIN:VEVENT", `DTSTART:${ical(maintenant - 2 * JOUR - 2 * 3_600_000)}`, `DTEND:${ical(maintenant - 2 * JOUR - 3_600_000)}`, `UID:bilan-${jeu}@google.com`, "SUMMARY:Réunion bilan", `DESCRIPTION:${LONGUE}`, `ATTENDEE:mailto:${MARIE}`, "END:VEVENT"],
  // Sans nom ni invité connu : rattaché seulement après le lien manuel (« Bellepierre »).
  ["BEGIN:VEVENT", `DTSTART:${ical(maintenant + 5 * JOUR)}`, `DTEND:${ical(maintenant + 5 * JOUR + 3_600_000)}`, `UID:bellepierre-${jeu}@google.com`, `SUMMARY:Visite atelier Bellepierre ${jeu}`, "END:VEVENT"],
  // Annulé : jamais gardé.
  ["BEGIN:VEVENT", `DTSTART:${ical(maintenant + 3 * JOUR)}`, `DTEND:${ical(maintenant + 3 * JOUR + 3_600_000)}`, `UID:annule-${jeu}@google.com`, `SUMMARY:Garage Sud Auto ${jeu} annulé`, "STATUS:CANCELLED", "END:VEVENT"],
  // Journée entière.
  ["BEGIN:VEVENT", `DTSTART;VALUE=DATE:${decale(4).replace(/-/g, "")}`, `DTEND;VALUE=DATE:${decale(5).replace(/-/g, "")}`, `UID:journee-${jeu}@google.com`, `SUMMARY:Tournage ${CAFE}`, "END:VEVENT"],
];
const evtsParis = [
  // Fuseau Europe/Paris (heure d'hiver, UTC+1) : 10 h à Paris = 09:00 UTC.
  ["BEGIN:VEVENT", `DTSTART;TZID=Europe/Paris:${mur(decale(6), 10)}`, `DTEND;TZID=Europe/Paris:${mur(decale(6), 11)}`, `UID:paris-${jeu}@google.com`, `SUMMARY:Visio Garage Sud Auto ${jeu} depuis Paris`, "END:VEVENT"],
];
const fauxIcal = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  recues.ical.push({ methode: req.method, chemin: u.pathname });
  if (req.method !== "GET") {
    res.writeHead(405);
    return res.end();
  }
  if (u.pathname === `/calendar/ical/emmanuel%40gmail.com/${SECRET_ICS}/basic.ics`) {
    res.writeHead(200, { "Content-Type": "text/calendar; charset=UTF-8" });
    return res.end(ics(evts.flat()));
  }
  if (u.pathname === `/calendar/ical/pro%40group.calendar.google.com/${SECRET_ICS}/basic.ics`) {
    res.writeHead(200, { "Content-Type": "text/calendar; charset=UTF-8" });
    return res.end(ics(evtsParis.flat()));
  }
  res.writeHead(404);
  res.end("Not Found");
});
// Faux Abby : les factures du client Garage (deux payées, une à payer).
const fauxAbby = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const docs = [
    { id: "f1", type: "invoice", number: `F-${jeu}-1`, state: "paid", title: "Forfait septembre", customer: { id: `ABBY${jeu}`, name: GARAGE, email: MARIE }, totalAmountWithTax: 30000, emittedAt: Math.floor((maintenant - 40 * JOUR) / 1000), paidAt: Math.floor((maintenant - 29 * JOUR) / 1000) },
    { id: "f2", type: "invoice", number: `F-${jeu}-2`, state: "paid", title: "Logo", customer: { id: `ABBY${jeu}`, name: GARAGE, email: MARIE }, totalAmountWithTax: 12000, emittedAt: Math.floor((maintenant - 70 * JOUR) / 1000), paidAt: Math.floor((maintenant - 55 * JOUR) / 1000) },
    { id: "f3", type: "invoice", number: `F-${jeu}-3`, state: "finalized", title: "Photos", customer: { id: `ABBY${jeu}`, name: GARAGE, email: MARIE }, totalAmountWithTax: 9000, emittedAt: Math.floor((maintenant - 5 * JOUR) / 1000), dueAt: Math.floor((maintenant + 25 * JOUR) / 1000) },
  ];
  if (u.pathname === "/v2/billings") {
    const cust = u.searchParams.get("customerId");
    return json(res, 200, { docs: cust ? docs.filter((x) => x.customer.id === cust) : u.searchParams.getAll("state").includes("finalized") ? docs.filter((x) => x.state === "finalized") : [], hasNextPage: false });
  }
  json(res, 404, {});
});
for (const s of [fauxTrello, fauxGc, fauxIcal, fauxAbby]) await new Promise((r) => s.listen(0, "127.0.0.1", r));
const URL_ICS = `http://127.0.0.1:${fauxIcal.address().port}/calendar/ical/emmanuel%40gmail.com/${SECRET_ICS}/basic.ics`;
const URL_ICS2 = `http://127.0.0.1:${fauxIcal.address().port}/calendar/ical/pro%40group.calendar.google.com/${SECRET_ICS}/basic.ics`;

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
      TRELLO_API_BASE: `http://127.0.0.1:${fauxTrello.address().port}`,
      GOCARDLESS_API_BASE: `http://127.0.0.1:${fauxGc.address().port}`,
      AGENDA_ICAL_TEST: "1",
      ABBY_API_URL: `http://127.0.0.1:${fauxAbby.address().port}`,
      ABBY_API_KEY: "",
      // Gmail « relié » en base pour la règle du compte rendu, mais jamais joint : boucle locale fermée.
      GMAIL_IMAP_HOST: "127.0.0.1",
      GMAIL_IMAP_PORT: "9",
      GMAIL_IMAP_TLS: "0",
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

// Le serveur d'abord : il applique les migrations (table « releves »).
process.on("exit", () => serveur?.kill("SIGKILL"));
await demarrer();

const sauvegarde = sql(`select coalesce(json_agg(i), '[]') from integrations i where id in ('trello','gocardless','agenda','gmail','abby')`);
const releveAvant = sql(`select coalesce(json_agg(r), '[]') from releves r`);
const ouvrirSession = (userId) => {
  const jeton = randomBytes(32).toString("base64url");
  un(`insert into sessions (token_hash, user_id, expires_at) values ('${sha(jeton)}','${userId}', now() + interval '1 day') returning token_hash`);
  return jeton;
};
const direction = un(`insert into users (email,name,initials,role) values ('dir-${jeu}@exemple.test','Direction ${jeu}','DT','direction') returning id`);
const sociale = un(`insert into users (email,name,initials,role,departments) values ('soc-${jeu}@exemple.test','Sociale ${jeu}','SO','equipe','["social"]'::jsonb) returning id`);
const web = un(`insert into users (email,name,initials,role,departments) values ('web-${jeu}@exemple.test','Web ${jeu}','WE','equipe','["web"]'::jsonb) returning id`);
const garage = un(`insert into clients (name, short_name, departments, abby_customer_id) values (${lit(GARAGE)}, ${lit(GARAGE)}, '["social","web"]'::jsonb, 'ABBY${jeu}') returning id`);
const spm = un(`insert into clients (name, short_name, departments) values ('Société SPM ${jeu}', ${lit(SPM)}, '["social"]'::jsonb) returning id`);
un(`insert into contacts (client_id, name, reach) values ('${garage}', 'Marie Hoarau', '${MARIE}') returning id`);
un(`insert into contacts (client_id, name, reach) values ('${spm}', 'Chef de chantier', '${SPM_CONTACT}') returning id`);
const portail = un(`insert into users (email,name,initials,role,client_id) values ('portail-${jeu}@exemple.test','Client ${jeu}','CP','client','${garage}') returning id`);
const cafe = un(`insert into directory_entries (name, kind, source, email, email_key) values (${lit(CAFE)}, 'prospect', 'agence', 'cafe.${jeu}@lagon.test', 'cafe.${jeu}@lagon.test') returning id`);
const vanille = un(`insert into directory_entries (name, kind, source) values ('Vanille Bourbon ${jeu}', 'prospect', 'agence') returning id`);
// Gmail « relié » (pour la règle du compte rendu) et Abby (faux serveur), en clair : la lecture accepte l'ancienne forme.
sql(`insert into integrations (id, token, account_id) values ('gmail', 'abcdefghijklmnop', 'emmanuel.${jeu}@gmail.com') on conflict (id) do update set token = excluded.token, account_id = excluded.account_id`);
sql(`insert into integrations (id, token) values ('abby', 'abby-test-${jeu}') on conflict (id) do update set token = excluded.token`);
sql(`delete from integrations where id in ('trello','gocardless','agenda')`);
sql(`delete from releves`);
const cDir = ouvrirSession(direction);
const cSoc = ouvrirSession(sociale);
const cWeb = ouvrirSession(web);
const cPortail = ouvrirSession(portail);

const page = async (chemin, cookie) => {
  const r = await fetch(`${BASE}${chemin}`, { headers: cookie ? { Cookie: `pilot_session=${cookie}` } : {}, redirect: "manual", cache: "no-store" });
  const html = (await r.text()).replace(/<!--.*?-->/g, "");
  reponses.push(html);
  return { statut: r.status, location: r.headers.get("location") ?? "", html, visible: html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/&nbsp;|&#xa0;| /gi, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&") };
};
function actionsDe(manifestePage, fichier) {
  const m = path.join(RACINE, `.next/server/app/${manifestePage}/server-reference-manifest.json`);
  const j = JSON.parse(readFileSync(m, "utf8"));
  return Object.fromEntries(Object.entries(j.node).filter(([, v]) => String(v.filename ?? "").includes(fichier)).map(([id, v]) => [v.exportedName, id]));
}
const A = actionsDe("(agence)/reglages/page", "reglages/etape3-actions");
const AF = actionsDe("(agence)/contacts/[id]/page", "contacts/etape3-actions");
const AM = actionsDe("(agence)/page", "ce-matin-actions");
async function action(chemin, id, args, cookie) {
  const r = await fetch(`${BASE}${chemin}`, {
    method: "POST",
    headers: { "Next-Action": id, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component", Origin: BASE, ...(cookie ? { Cookie: `pilot_session=${cookie}` } : {}) },
    body: JSON.stringify(args),
    redirect: "manual",
  });
  const texte = await r.text();
  reponses.push(texte);
  const ligne = texte.split("\n").find((l) => l.startsWith("1:"));
  try {
    return { statut: r.status, resultat: ligne ? JSON.parse(ligne.slice(2)) : null };
  } catch {
    return { statut: r.status, resultat: null };
  }
}
/** Une action de formulaire (FormData). */
async function actionFormulaire(chemin, id, champs, cookie) {
  // Comme le navigateur sans JavaScript : un formulaire multipart avec $ACTION_ID_<id>.
  const fd = new FormData();
  fd.append(`$ACTION_ID_${id}`, "");
  for (const [k, v] of Object.entries(champs)) fd.append(k, v);
  const r = await fetch(`${BASE}${chemin}`, { method: "POST", headers: { Origin: BASE, ...(cookie ? { Cookie: `pilot_session=${cookie}` } : {}) }, body: fd, redirect: "manual" });
  reponses.push(await r.text());
  return r.status;
}
const reglage = (nom, arg, cookie = cDir) => action("/reglages", A[nom], [arg], cookie);
const matin = (nom, cles, cookie = cDir) => action("/", AM[nom], [cles], cookie);
const lignes = (source, filtre = "") => sql(`select e.external_id || '|' || e.title from directory_events e join directory_entries d on d.id = e.entry_id where e.source = '${source}' and (d.client_id in ('${garage}','${spm}') or d.id in ('${cafe}','${vanille}')) ${filtre} order by 1`).split("\n").filter(Boolean);
const ficheDe = (clientId) => un(`select id from directory_entries where client_id = '${clientId}'`);
const attendreReleve = async (service, apres) => {
  for (let i = 0; i < 60; i++) {
    const s = un(`select coalesce(extract(epoch from last_run_at)::bigint, 0) || '|' || coalesce((lease_until > now())::text, 'false') from releves where id = '${service}'`);
    const [t, bail] = (s || "0|false").split("|");
    if (Number(t) >= apres && bail !== "true") return true;
    await attendre(500);
  }
  return false;
};
const secondes = () => Math.floor(Date.now() / 1000) - 1;

let codeSortie = 0;
try {
  console.log("\n— rien de relié : on le dit —");
  ok("actions de Réglages et de la fiche présentes dans le build", Boolean(A.testerEtEnregistrerTrello && A.testerEtEnregistrerGoCardless && A.testerEtAjouterAgenda && A.synchroniserService && A.deconnecterService && AF.relierCarteTrello && AF.enregistrerMotsAgenda));
  let p = await page("/reglages", cDir);
  ok("Réglages : trois cartes « Trello », « GoCardless », « Google Agenda », non reliées", p.statut < 400 && ["Trello (lecture seule)", "GoCardless (lecture seule)", "Google Agenda (lecture seule)"].every((t) => p.visible.includes(t)) && (p.visible.match(/Non relié/g) ?? []).length >= 3);
  p = await page(`/contacts/${garage}`, cDir);
  ok("fiche : « Actions Trello », « Rendez-vous » et GoCardless disent « pas relié » (au lieu de zéro)", p.visible.includes('data-non-relie="trello"') && p.visible.includes('data-non-relie="agenda"') && p.visible.includes('data-non-relie="gocardless"'));
  p = await page("/", cDir);
  ok("« Ce matin » : Trello, GoCardless et l'agenda non reliés sont nommés", p.visible.includes('data-avis="trello-non_relie"') && p.visible.includes('data-avis="gocardless-non_relie"') && p.visible.includes("Google Agenda n'est pas relié"));

  /* ------------------------------------------------------ Trello -- */
  console.log("\n— Trello —");
  let r = await reglage("testerEtEnregistrerTrello", { cle: "pas-une-cle", jeton: JETON_TRELLO });
  ok("clé mal formée : refusée avant tout appel", r.resultat?.ok === false && /32 caractères/.test(r.resultat.erreur) && recues.trello.length === 0);
  r = await reglage("testerEtEnregistrerTrello", { cle: randomBytes(16).toString("hex"), jeton: JETON_TRELLO });
  ok(`mauvaise clé : erreur claire (« ${r.resultat?.erreur?.slice(0, 50)}… »), rien d'enregistré`, r.resultat?.ok === false && /refuse/.test(r.resultat.erreur) && un(`select count(*) from integrations where id='trello'`) === "0");
  let debut = secondes();
  r = await reglage("testerEtEnregistrerTrello", { cle: CLE_TRELLO, jeton: JETON_TRELLO });
  ok(`bonne clé : « ${r.resultat?.message?.slice(0, 60)}… »`, r.resultat?.ok === true && /Emmanuel Taochy/.test(r.resultat.message));
  const jetonT = un(`select token from integrations where id='trello'`);
  ok("clé et jeton chiffrés en base (v1:…), jamais en clair", jetonT.startsWith("v1:") && !jetonT.includes(CLE_TRELLO) && !jetonT.includes(JETON_TRELLO));
  ok("tableau « CEO / EMMANUEL TAOCHY » coché d'office, « Perso » non", un(`select config->>'suivis' from releves where id='trello'`) === '["b-ceo"]');
  ok("premier relevé lancé et terminé", await attendreReleve("trello", debut));
  ok("les requêtes portent l'en-tête OAuth, jamais la clé dans l'adresse", recues.trello.every((x) => !x.requete.includes(CLE_TRELLO) && !x.requete.includes(JETON_TRELLO)));
  const tr = lignes("trello");
  const sur = (id) => un(`select coalesce(d.client_id::text, d.id::text) from directory_events e join directory_entries d on d.id = e.entry_id where e.source='trello' and e.external_id='${id}${jeu}'`);
  ok("« 🌐 GARAGE SUD AUTO … » → fiche de « Garage Sud-Auto … » (symbole, casse, tiret)", sur("c1") === garage);
  ok("« SPM… — Créer le document PPSPS » (sans symbole) → client au nom court SPM…", sur("c2") === spm);
  ok("« 🏝️ cafe LAGON … » → fiche prospect « Café Lagon … » (accents)", sur("c8") === cafe);
  ok("« 🗂️ Agence — … » : aucune fiche ; « Inconnu … » : sans fiche", sur("c4") === "" && sur("c5") === "");
  ok("échéance (due_on) et « Terminé » (done_at) écrits", un(`select due_on::text from directory_events where source='trello' and external_id='c2${jeu}'`) === decale(-2) && un(`select (done_at is not null)::text from directory_events where source='trello' and external_id='c6${jeu}'`) === "true");
  ok(`${tr.length} cartes rattachées à une fiche (c1, c2, c3, c6, c7, c8)`, tr.length === 6);
  p = await page("/reglages", cDir);
  ok("Réglages : « Cartes Trello sans fiche » liste « Inconnu » et « Boutique Vanille », pas l'agence", p.visible.includes(`Cartes Trello sans fiche (2)`) && p.visible.includes(`Inconnu ${jeu} — Faire le site`) && !p.visible.includes(`Mettre à jour les CGV ${jeu}</a>`));
  p = await page(`/contacts/${garage}`, cDir);
  ok("fiche Garage : cartes ouvertes avec colonne et lien Trello", p.visible.includes(`data-carte-trello="c1${jeu}"`) && p.visible.includes(`data-carte-trello="c3${jeu}"`) && p.visible.includes("🔥 Cette semaine (7 cartes max)") && p.visible.includes(`https://trello.com/c/c1${jeu}`));
  ok("… et la terminée, repliée (« Dernières terminées (1) »)", p.visible.includes("Dernières terminées (1)") && !p.visible.includes(`data-carte-trello="c6${jeu}"`));
  ok("… les cartes apparaissent dans la frise", p.visible.includes("Carte Trello"));
  p = await page(`/contacts/${spm}`, cDir);
  ok("fiche SPM : carte en retard marquée « En retard »", p.visible.includes(`data-carte-trello="c2${jeu}"`) && p.visible.includes("En retard"));

  console.log("\n— lien manuel depuis la fiche —");
  let statut = await actionFormulaire(`/contacts/${vanille}`, AF.relierCarteTrello, { entryId: vanille, carte: `c9${jeu}`, chemin: `/contacts/${vanille}` }, cDir);
  ok("relier « Boutique Vanille » à la fiche « Vanille Bourbon » (choix enregistré dans links)", statut < 400 && un(`select links->>'trelloCartes' from directory_entries where id='${vanille}'`) === `["c9${jeu}"]`);
  debut = secondes();
  await reglage("synchroniserService", "trello");
  ok("… après relevé, la carte est sur la fiche, marquée « relié à la main »", sur("c9") === vanille && (await page(`/contacts/${vanille}`, cDir)).visible.includes("relié à la main"));
  statut = await actionFormulaire(`/contacts/${garage}`, AF.delierCarteTrello, { clientId: garage, carte: `c3${jeu}`, chemin: `/contacts/${garage}` }, cDir);
  await reglage("synchroniserService", "trello");
  ok("délier « Relancer pour les photos » de Garage : elle part, et le nom ne la reprend plus", statut < 400 && sur("c3") === "" && un(`select links->>'trelloExclues' from directory_entries where client_id='${garage}'`) === `["c3${jeu}"]`);
  await actionFormulaire(`/contacts/${garage}`, AF.relierCarteTrello, { clientId: garage, carte: `c3${jeu}`, chemin: `/contacts/${garage}` }, cDir);
  await reglage("synchroniserService", "trello");
  ok("la relier de nouveau à la main : elle revient", sur("c3") === garage);

  console.log("\n— Ce matin : Actions Trello —");
  p = await page(`/?client=${garage}`, cDir);
  const bloc = (texte) => {
    const i = p.visible.indexOf(texte);
    return i < 0 ? "" : p.visible.slice(Math.max(0, i - 300), i + 600);
  };
  ok("« 🔥 Cette semaine » : « Améliorer la page d'accueil », règle affichée", bloc("Améliorer la page d'accueil").includes("Dans « 🔥 Cette semaine »"));
  ok("« ⏳ En attente du client » depuis 10 j : « Relancer le client : … »", bloc("Relancer le client : Relancer pour les photos").includes("En attente du client depuis 10 j"));
  p = await page(`/?client=${spm}`, cDir);
  ok("carte en retard : « Échéance dépassée de 2 j »", bloc("Créer le document PPSPS").includes("Échéance dépassée de 2 j"));
  ok("en attente depuis 2 j seulement : pas dans Actions", !p.visible.includes("Attendre la validation"));
  r = await matin("marquerTraite", [`trello:c4${jeu}`]);
  ok("la carte « Agence — … » de « 🔥 Cette semaine » est bien une ligne (« Traité » accepté)", r.resultat?.ok === true);
  r = await matin("marquerTraite", [`trello:c1${jeu}`]);
  p = await page(`/?client=${garage}`, cDir);
  ok("« Traité » sur « Améliorer la page d'accueil » : la ligne part", r.resultat?.ok === true && !p.visible.includes("Améliorer la page d'accueil"));
  cartesTrello[0].dateLastActivity = iso(Date.now() - 60_000);
  cartesTrello[0].due = iso(Date.now() + 2 * JOUR);
  await reglage("synchroniserService", "trello");
  p = await page(`/?client=${garage}`, cDir);
  ok("la carte bouge (échéance posée) : la ligne revient, « Du nouveau depuis l'archivage »", bloc("Améliorer la page d'accueil").includes("Du nouveau depuis l"));

  /* -------------------------------------------------- GoCardless -- */
  console.log("\n— GoCardless —");
  r = await reglage("testerEtEnregistrerGoCardless", { jeton: "abc", environnement: "live" });
  ok("jeton mal formé : refusé avant tout appel", r.resultat?.ok === false && /live_/.test(r.resultat.erreur) && recues.gocardless.length === 0);
  r = await reglage("testerEtEnregistrerGoCardless", { jeton: JETON_GC, environnement: "live" });
  ok("jeton sandbox avec « Live » choisi : erreur claire", r.resultat?.ok === false && /Sandbox/.test(r.resultat.erreur));
  r = await reglage("testerEtEnregistrerGoCardless", { jeton: `sandbox_${randomBytes(24).toString("base64url")}`, environnement: "sandbox" });
  ok(`jeton refusé (401) : « ${r.resultat?.erreur?.slice(0, 50)}… »`, r.resultat?.ok === false && /401/.test(r.resultat.erreur) && un(`select count(*) from integrations where id='gocardless'`) === "0");
  debut = secondes();
  r = await reglage("testerEtEnregistrerGoCardless", { jeton: JETON_GC, environnement: "sandbox" });
  ok("bon jeton (sandbox) : enregistré chiffré", r.resultat?.ok === true && un(`select token from integrations where id='gocardless'`).startsWith("v1:") && !un(`select token from integrations where id='gocardless'`).includes(JETON_GC));
  ok("premier relevé terminé", await attendreReleve("gocardless", debut));
  ok("en-tête GoCardless-Version envoyé, pagination suivie (2 pages de clients)", recues.gocardless.every((x) => x.version === "2015-07-06") && recues.gocardless.filter((x) => x.chemin === "/customers" && x.requete.includes("after=")).length >= 1);
  const gc = lignes("gocardless");
  const surGc = (id) => un(`select coalesce(d.client_id::text, d.id::text) from directory_events e join directory_entries d on d.id = e.entry_id where e.source='gocardless' and e.external_id='${id}${jeu}' limit 1`);
  ok("client GoCardless relié par e-mail (Marie → Garage)", surGc("MD1") === garage && surGc("PM5") === garage);
  ok("client GoCardless relié par nom d'entreprise (« spm… » → SPM…)", surGc("MD2") === spm);
  ok("client inconnu : sans fiche (rien sur aucune fiche)", surGc("MD3") === "" && surGc("PM6") === "");
  ok(`${gc.length} lignes gardées (mandats, abonnement, paiements des clients reliés)`, gc.length === 8);
  p = await page(`/contacts/${garage}`, cDir);
  ok("fiche Garage, partie Argent : mandat actif, abonnement (montant, rythme, prochaine échéance)", p.visible.includes('data-mandat="active"') && p.visible.includes(`Forfait social ${jeu}`) && p.visible.includes("Abonnement mensuel · prochaine échéance"));
  ok("… paiements encaissés, à venir et en échec", p.visible.includes('data-paiement="encaisse"') && p.visible.includes('data-paiement="a_venir"') && p.visible.includes('data-paiement="echec"'));
  const enc = Number((p.html.match(/data-encaisse="(\d+)"/) ?? [])[1]);
  ok(`encaissé sans double compte : ${enc / 100} € (Abby 300 + 120, GoCardless +50 ; 300 et 120 déjà comptés)`, enc === 47000);
  ok("… le détail le dit (« 2 factures + 1 prélèvement », « 2 prélèvements déjà comptés… , 1 ajouté »)", p.visible.includes("2 factures + 1 prélèvement") && p.visible.includes("2 prélèvements déjà comptés dans une facture payée") && p.visible.includes(", 1 ajouté."));
  p = await page(`/?client=${garage}`, cDir);
  ok("Argent qui dort : le prélèvement en échec (300 €), règle affichée", bloc(`Prélèvement GoCardless en échec · Forfait octobre ${jeu}`).includes("Paiement GoCardless en échec depuis moins de 30 jours"));
  ok("… les prélèvements à venir dans les 7 jours, à part, pas dans le total", p.visible.includes("À venir dans les 7 jours (GoCardless, pour information)") && bloc("À venir dans les 7 jours").includes(`Forfait social ${jeu}`));
  ok("À répondre : paiement en échec d'un client sous contrat, urgent", /Urgent/.test(bloc("Prélèvement en échec (300 €)")) && bloc("Prélèvement en échec (300 €)").includes("Client sous contrat, paiement GoCardless en échec"));
  p = await page(`/?client=${spm}`, cDir);
  ok("À répondre : mandat annulé d'un client sous contrat sans mandat actif, urgent", /Urgent/.test(bloc("Mandat GoCardless annulé")) && bloc("Mandat GoCardless annulé").includes("sans mandat actif"));
  r = await matin("marquerTraite", ["gocardless-sans-fiche"]);
  ok("échecs de clients sans fiche : une ligne qui renvoie vers Réglages", r.resultat?.ok === true);
  r = await matin("retablir", ["gocardless-sans-fiche"]);
  r = await matin("marquerTraite", [`gocardless-mandat:MD2${jeu}`]);
  ok("« Traité » sur le mandat annulé", r.resultat?.ok === true && !(await page(`/?client=${spm}`, cDir)).visible.includes("Mandat GoCardless annulé"));
  MANDATS_GC[1].status = "expired";
  await reglage("synchroniserService", "gocardless");
  ok("le mandat change d'état (expiré) : la ligne revient", (await page(`/?client=${spm}`, cDir)).visible.includes("Mandat GoCardless expiré"));
  p = await page("/reglages", cDir);
  ok("Réglages : « Clients GoCardless sans fiche (1) » avec son paiement en échec", p.visible.includes("Clients GoCardless sans fiche (1)") && p.visible.includes("1 paiement en échec"));
  statut = await actionFormulaire(`/contacts/${vanille}`, AF.relierClientGoCardless, { entryId: vanille, client: `CU3${jeu}`, chemin: `/contacts/${vanille}` }, cDir);
  await reglage("synchroniserService", "gocardless");
  ok("lien manuel : le client inconnu relié à « Vanille Bourbon »", statut < 400 && surGc("MD3") === vanille);

  /* ------------------------------------------------------ Agenda -- */
  console.log("\n— Google Agenda —");
  r = await reglage("testerEtAjouterAgenda", { url: "https://evil.example/calendar/ical/x/private-y/basic.ics", nom: "Faux" });
  ok("adresse qui n'est pas une adresse iCal Google : refusée", r.resultat?.ok === false && /calendar\.google\.com/.test(r.resultat.erreur));
  r = await reglage("testerEtAjouterAgenda", { url: URL_ICS.replace(SECRET_ICS, "private-faux"), nom: "Faux" });
  ok("adresse réinitialisée (404) : erreur claire", r.resultat?.ok === false && /réinitialisée/.test(r.resultat.erreur));
  debut = secondes();
  r = await reglage("testerEtAjouterAgenda", { url: URL_ICS, nom: "Agenda principal" });
  ok(`agenda lu : « ${r.resultat?.message?.slice(0, 60)}… »`, r.resultat?.ok === true);
  r = await reglage("testerEtAjouterAgenda", { url: URL_ICS2, nom: "Agenda pro" });
  ok("un second agenda s'ajoute", r.resultat?.ok === true);
  const jetonA = un(`select token from integrations where id='agenda'`);
  ok("adresses chiffrées en base, jamais lisibles", jetonA.startsWith("v1:") && !jetonA.includes(SECRET_ICS));
  ok("relevé terminé", await attendreReleve("agenda", debut));
  await reglage("synchroniserService", "agenda");
  p = await page("/reglages", cDir);
  ok("Réglages : deux agendas, adresse masquée (jamais la partie secrète)", p.visible.includes("Agenda principal") && p.visible.includes("Agenda pro") && !p.html.includes(SECRET_ICS) && p.visible.includes("2 agendas reliés"));
  const ag = sql(`select e.title || '|' || e.occurred_at::text || '|' || coalesce(e.body,'') || '|' || coalesce(e.meta->>'visio', '') from directory_events e where e.source='agenda' and e.title like '%${jeu}%' or (e.source='agenda' and e.external_id like '%${jeu}%') order by e.occurred_at`).split("\n").filter(Boolean);
  const hebdo = ag.filter((l) => l.startsWith(`Point hebdo Garage Sud Auto ${jeu}|`));
  ok(`série hebdomadaire : ${hebdo.length} occurrences gardées (6 moins la date exclue, moins celle déplacée)`, hebdo.length === 4);
  ok("10 h à La Réunion = 06:00 UTC (TZID sans VTIMEZONE)", hebdo.every((l) => / 06:00:00\+00\|/.test(l)));
  ok("occurrence déplacée (RECURRENCE-ID) à 15 h, avec son titre", ag.some((l) => l.startsWith(`Point hebdo Garage Sud Auto ${jeu} (déplacé)|${decale(7)} 11:00:00+00`)));
  ok("10 h à Paris (heure d'hiver) = 09:00 UTC", ag.some((l) => l.startsWith(`Visio Garage Sud Auto ${jeu} depuis Paris|${decale(6)} 09:00:00+00`)));
  ok("événement annulé (STATUS:CANCELLED) : pas gardé", !ag.some((l) => l.includes("annulé")));
  ok("journée entière gardée (nom du prospect dans le titre)", ag.some((l) => l.startsWith(`Tournage ${CAFE}|`)));
  const chantier = un(`select coalesce(d.client_id::text,'') || '|' || (e.meta->>'visio') || '|' || (e.meta->>'lieu') from directory_events e join directory_entries d on d.id=e.entry_id where e.source='agenda' and e.external_id like 'chantier-${jeu}%'`);
  ok("invité connu (contact SPM) : rattaché à SPM, lien Meet et lieu gardés", chantier === `${spm}|https://meet.google.com/abc-defg-hij|Rue de Paris, Saint-Denis`);
  const bilan = un(`select length(e.body)::text || '|' || coalesce(d.client_id::text,'') from directory_events e join directory_entries d on d.id=e.entry_id where e.source='agenda' and e.external_id like 'bilan-${jeu}%'`);
  ok(`description : ${bilan.split("|")[0]} caractères gardés sur ${LONGUE.length} (280 au plus)`, Number(bilan.split("|")[0]) <= 280 && bilan.endsWith(garage));
  const dump = execFileSync("pg_dump", ["--data-only", PGURL], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  ok("confidentialité : le rendez-vous personnel n'est nulle part en base (titre, description, invité)", !dump.includes(`Dentiste ${jeu}`) && !dump.includes(SECRET_PERSO) && !dump.includes(`inconnu.${jeu}@gmail.com`));
  ok("confidentialité : ni la description complète, ni la fin du texte long", !dump.includes(`FIN-${jeu}`));
  ok("confidentialité : « Visite atelier Bellepierre » (rien de connu) pas gardé", !dump.includes(`Bellepierre ${jeu}`));
  ok("aucun secret lisible dans une copie de la base (clé Trello, jeton, jeton GoCardless, adresse iCal)", ![CLE_TRELLO, JETON_TRELLO, JETON_GC, SECRET_ICS].some((v) => dump.includes(v)));
  statut = await actionFormulaire(`/contacts/${spm}`, AF.enregistrerMotsAgenda, { clientId: spm, mots: "Bellepierre", chemin: `/contacts/${spm}` }, cDir);
  await reglage("synchroniserService", "agenda");
  ok("lien manuel (« Bellepierre » sur la fiche SPM) : le rendez-vous est gardé", statut < 400 && un(`select coalesce(d.client_id::text,'') from directory_events e join directory_entries d on d.id=e.entry_id where e.source='agenda' and e.external_id like 'bellepierre-${jeu}%'`) === spm);
  p = await page(`/contacts/${spm}`, cDir);
  ok("fiche SPM : section « Rendez-vous » (prochains) avec l'heure de La Réunion et la visio", p.visible.includes("Visite de chantier") && p.visible.includes("12:00–13:00") && p.visible.includes("Rejoindre la visio") && p.visible.includes(`Visite atelier Bellepierre ${jeu}`));
  p = await page(`/contacts/${garage}`, cDir);
  ok("fiche Garage : rendez-vous passés repliés, et dans la frise", p.visible.includes("Rendez-vous passés (") && (p.visible.match(/>Rendez-vous</g) ?? []).length >= 2);
  p = await page(`/?client=${spm}`, cDir);
  ok("« Ce matin » : « Rendez-vous du jour » avec l'heure et la fiche", p.visible.includes("data-rendez-vous-du-jour") && bloc("Rendez-vous du jour").includes("12:00") && bloc("Rendez-vous du jour").includes(SPM));
  p = await page(`/?client=${garage}`, cDir);
  ok("Actions : rendez-vous d'il y a 2 jours sans e-mail envoyé depuis → « Envoyer le compte rendu ou le devis »", bloc("Envoyer le compte rendu ou le devis").includes("aucun e-mail envoyé depuis à ce contact"));
  un(`insert into directory_events (entry_id, source, kind, external_id, occurred_at, title, meta) values ('${ficheDe(garage)}', 'gmail', 'email_sortant', 'cr-${jeu}', now() - interval '1 day', 'Compte rendu ${jeu}', '{}'::jsonb) returning id`);
  p = await page(`/?client=${garage}`, cDir);
  ok("… un e-mail envoyé depuis à ce contact : la ligne disparaît", !p.visible.includes("Envoyer le compte rendu ou le devis"));

  /* ------------------------------------------------- un seul relevé -- */
  console.log("\n— un seul relevé à la fois —");
  const avantCartes = recues.trello.filter((x) => x.chemin.endsWith("/cards")).length;
  const [s1, s2] = await Promise.all([reglage("synchroniserService", "trello"), reglage("synchroniserService", "trello")]);
  ok(`deux clics simultanés : un seul relevé (${recues.trello.filter((x) => x.chemin.endsWith("/cards")).length - avantCartes} lecture des cartes)`, s1.resultat?.ok && s2.resultat?.ok && recues.trello.filter((x) => x.chemin.endsWith("/cards")).length - avantCartes === 1);
  sql(`update releves set lease_until = now() + interval '5 minutes' where id='trello'`);
  const n0 = recues.trello.length;
  r = await reglage("synchroniserService", "trello");
  ok("bail pris ailleurs : « déjà en cours », aucune requête", /déjà en cours/.test(r.resultat?.message ?? "") && recues.trello.length === n0);
  sql(`update releves set lease_until = null where id='trello'`);

  /* -------------------------------------------------------- droits -- */
  console.log("\n— droits —");
  const avantDroits = { t: un(`select token from integrations where id='trello'`), l: un(`select links::text from directory_entries where id='${vanille}'`), n: lignes("trello").length };
  for (const [qui, c] of [
    ["membre du pôle social", cSoc],
    ["membre du pôle web", cWeb],
    ["client du portail", cPortail],
    ["visiteur sans session", null],
  ]) {
    p = await page("/reglages", c);
    ok(`${qui} : Réglages inaccessible`, p.statut >= 300 && p.statut < 400 && !p.visible.includes("Trello (lecture seule)"));
    const refus = [];
    for (const [nom, arg] of [
      ["testerEtEnregistrerTrello", { cle: CLE_TRELLO, jeton: JETON_TRELLO }],
      ["choisirTableauxTrello", { ids: [] }],
      ["testerEtEnregistrerGoCardless", { jeton: JETON_GC, environnement: "sandbox" }],
      ["testerEtAjouterAgenda", { url: URL_ICS, nom: "x" }],
      ["retirerAgendaAction", { position: 0 }],
      ["synchroniserService", "trello"],
      ["deconnecterService", { service: "trello", effacer: true }],
    ]) {
      const x = await reglage(nom, arg, c);
      if (x.resultat?.ok === true) refus.push(nom);
    }
    ok(`${qui} : les 7 actions de Réglages refusées${refus.length ? ` — acceptées : ${refus.join(", ")}` : ""}`, refus.length === 0);
    await actionFormulaire(`/contacts/${vanille}`, AF.delierCarteTrello, { entryId: vanille, carte: `c9${jeu}`, chemin: `/contacts/${vanille}` }, c);
    await actionFormulaire(`/contacts/${vanille}`, AF.enregistrerMotsAgenda, { entryId: vanille, mots: "piratage", chemin: `/contacts/${vanille}` }, c);
    ok(`${qui} : liens manuels de la fiche inchangés`, un(`select links::text from directory_entries where id='${vanille}'`) === avantDroits.l);
    r = await matin("marquerTraite", [`trello:c2${jeu}`], c);
    ok(`${qui} : « Traité » sur une carte Trello refusé`, r.resultat?.ok !== true);
  }
  ok("après ces tentatives : clé Trello, liens et cartes inchangés", un(`select token from integrations where id='trello'`) === avantDroits.t && lignes("trello").length === avantDroits.n);
  p = await page(`/contacts/${garage}`, cSoc);
  ok("pôle social : la fiche n'a ni « Actions Trello », ni « Rendez-vous », ni GoCardless, ni lignes dans la frise", p.statut < 400 && !p.visible.includes("Actions Trello") && !p.visible.includes("data-section=") && !p.html.includes("Améliorer la page d") && !p.html.includes("Réunion bilan"));
  p = await page("/", cSoc);
  ok("pôle social : « Ce matin » sans Trello, GoCardless ni rendez-vous", p.statut < 400 && !p.html.includes("Améliorer la page d") && !p.html.includes("data-rendez-vous-du-jour") && !p.html.includes("GoCardless"));
  p = await page(`/contacts/${garage}`, cPortail);
  ok("client du portail : la fiche le renvoie au portail", p.statut >= 300 && p.statut < 400 && p.location.includes("/portail"));
  p = await page(`/contacts/${spm}`, cWeb);
  ok("pôle web : rien (fiche d'un client du pôle social introuvable)", p.statut === 404 || !p.html.includes("Visite de chantier"));

  /* --------------------------------------------------- captures -- */
  if (CAPTURES) {
    console.log("\n— captures —");
    mkdirSync(CAPTURES, { recursive: true });
    const pw = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;
    const navigateur = await pw.chromium.launch();
    // L'application défile dans un conteneur intérieur : une fenêtre haute
    // laisse voir la page entière (même largeur, même appareil).
    const formats = [
      ["1440", { viewport: { width: 1440, height: 3400 }, deviceScaleFactor: 1 }],
      ["iphone13", { ...pw.devices["iPhone 13"], viewport: { width: 390, height: 5200 } }],
    ];
    for (const [nom, options] of formats) {
      const ctx = await navigateur.newContext({ ...options, locale: "fr-FR", timezoneId: "Indian/Reunion" });
      await ctx.addCookies([{ name: "pilot_session", value: cDir, url: BASE }]);
      const onglet = await ctx.newPage();
      const erreurs = [];
      onglet.on("pageerror", (e) => erreurs.push(e.message));
      for (const [ancre, fichier] of [
        ["trello", "reglages-trello"],
        ["gocardless", "reglages-gocardless"],
        ["agenda", "reglages-agenda"],
      ]) {
        await onglet.goto(`${BASE}/reglages#${ancre}`, { waitUntil: "networkidle" });
        const carteR = onglet.locator(`div#${ancre}`).locator("xpath=..");
        await carteR.screenshot({ path: path.join(CAPTURES, `${fichier}-${nom}.png`) });
      }
      await onglet.goto(`${BASE}/contacts/${garage}`, { waitUntil: "networkidle" });
      await onglet.screenshot({ path: path.join(CAPTURES, `fiche-garage-${nom}.png`), fullPage: true });
      await onglet.goto(`${BASE}/contacts/${spm}`, { waitUntil: "networkidle" });
      await onglet.screenshot({ path: path.join(CAPTURES, `fiche-spm-${nom}.png`), fullPage: true });
      await onglet.goto(`${BASE}/?client=${garage}`, { waitUntil: "networkidle" });
      await onglet.locator("section", { hasText: "Ce matin" }).first().screenshot({ path: path.join(CAPTURES, `ce-matin-${nom}.png`) });
      await onglet.goto(`${BASE}/`, { waitUntil: "networkidle" });
      await onglet.locator("section", { hasText: "Ce matin" }).first().screenshot({ path: path.join(CAPTURES, `ce-matin-tout-${nom}.png`) });
      ok(`captures ${nom} : aucune erreur JavaScript${erreurs.length ? ` — ${erreurs.join(" | ")}` : ""}`, erreurs.length === 0);
      await ctx.close();
    }
    await navigateur.close();
  }

  /* -------------------------------------------------- déconnecter -- */
  console.log("\n— déconnecter —");
  r = await reglage("deconnecterService", { service: "trello", effacer: true });
  ok("Trello déconnecté en effaçant : clé et cartes effacées", r.resultat?.ok === true && un(`select count(*) from integrations where id='trello'`) === "0" && un(`select count(*) from directory_events where source='trello'`) === "0");
  r = await reglage("deconnecterService", { service: "gocardless", effacer: false });
  ok("GoCardless déconnecté sans effacer : jeton effacé, lignes gardées", r.resultat?.ok === true && un(`select count(*) from integrations where id='gocardless'`) === "0" && lignes("gocardless").length > 0);
  r = await reglage("retirerAgendaAction", { position: 1 });
  ok("retirer le second agenda : il en reste un", r.resultat?.ok === true && (await page("/reglages", cDir)).visible.includes("1 agenda relié"));
  r = await reglage("deconnecterService", { service: "agenda", effacer: true });
  ok("agenda déconnecté en effaçant : adresses et rendez-vous effacés", r.resultat?.ok === true && un(`select count(*) from integrations where id='agenda'`) === "0" && un(`select count(*) from directory_events where source='agenda'`) === "0");
  p = await page("/", cDir);
  ok("« Ce matin » redit que Trello n'est pas relié", p.visible.includes('data-avis="trello-non_relie"'));
  r = await reglage("synchroniserService", "trello");
  ok("plus de relevé possible", r.resultat?.ok === false);

  console.log("\n— lecture seule, vue des faux serveurs —");
  const methodes = [...recues.trello, ...recues.gocardless, ...recues.ical].map((x) => x.methode);
  ok(`${methodes.length} requêtes reçues par les faux Trello, GoCardless et iCal : toutes en GET`, methodes.length > 20 && methodes.every((m) => m === "GET"));

  console.log("\n— aucun secret nulle part —");
  await arreter();
  const journal = readFileSync(JOURNAL, "utf8");
  const secrets = [CLE_TRELLO, JETON_TRELLO, JETON_GC, SECRET_ICS];
  ok(`journal du serveur (${journal.split("\n").length} lignes) : ni clé, ni jeton, ni adresse iCal`, !secrets.some((v) => journal.includes(v)));
  const tout = reponses.join("\n");
  ok(`${reponses.length} réponses de Pilot (pages et actions) : aucun secret`, !secrets.some((v) => tout.includes(v)));
} catch (e) {
  console.error(e);
  codeSortie = 1;
} finally {
  console.log("\n— nettoyage —");
  await arreter().catch(() => undefined);
  for (const s of [fauxTrello, fauxGc, fauxIcal, fauxAbby]) s.close();
  sql(`delete from ce_matin_archives where key like '%${jeu}%' or key = 'gocardless-sans-fiche'`);
  sql(`delete from directory_entries where name like '%${jeu}%' or client_id in (select id from clients where name like '%${jeu}%')`);
  sql(`delete from users where email like '%-${jeu}@exemple.test'`);
  sql(`delete from clients where name like '%${jeu}%'`);
  sql(`delete from integrations where id in ('trello','gocardless','agenda','gmail','abby')`);
  sql(`insert into integrations select * from json_populate_recordset(null::integrations, ${lit(sauvegarde)})`);
  sql(`delete from releves`);
  sql(`insert into releves select * from json_populate_recordset(null::releves, ${lit(releveAvant)})`);
  rmSync(dir, { recursive: true, force: true });
  console.log("décor effacé, serveur Pilot et faux services arrêtés");
}

console.log(`\n${verts} vérifications vertes, ${rouges.length} rouge(s).`);
if (rouges.length || codeSortie) {
  for (const x of rouges) console.log(`  ✗ ${x}`);
  process.exit(1);
}
process.exit(0);
