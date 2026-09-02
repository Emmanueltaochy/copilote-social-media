/**
 * Les factures dans le portail client.
 *
 * Un client réclame ses factures à son comptable près, souvent en janvier et
 * pour l'année entière. On vérifie ici qu'il les retrouve seul, groupées par
 * année et totalisées, qu'il ne voit que les siennes, et que la facturation
 * reste une affaire de direction.
 */
import pw from "/opt/node22/lib/node_modules/playwright/index.js";
const { chromium } = pw;
import { execFileSync } from "node:child_process";

const SP = "/tmp/claude-0/-home-claude/956d6f17-f290-5e1d-9e91-839fdc4ed875/scratchpad";
const BASE = "http://127.0.0.1:4030";
const PDF = `${SP}/contrat.pdf`;
const sql = (q) =>
  execFileSync("psql", ["-h", "127.0.0.1", "-p", "5451", "-U", "postgres", "-d", "pilot", "-tA", "-c", q], {
    encoding: "utf8",
  }).trim();
const un = (q) => sql(q).split("\n")[0].trim();

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const onglet = async (w = 1400, h = 950) =>
  (await b.newContext({ viewport: { width: w, height: h } })).newPage();
const errs = [];
const ok = (label, cond) => console.log(`${cond ? "OK  " : "ÉCHEC"} ${label}`);
const shot = (page, n) => page.screenshot({ path: `${SP}/shots/${n}.png`, fullPage: true });
const plat = (s) => s.replace(/[  ]/g, " ");
const lire = async (page, sel = "main") => plat(await page.textContent(sel));

const admin = await onglet();
admin.on("pageerror", (e) => errs.push(String(e)));

/* ---------------------------------------------------------- installation -- */

await admin.goto(`${BASE}/bienvenue`, { waitUntil: "domcontentloaded" });
await admin.fill('input[name="name"]', "Emmanuel Taochy");
await admin.fill('input[name="email"]', "emmanuel@taochy.re");
await admin.fill('input[name="password"]', "motdepasse-solide-2026");
await admin.click('button[type="submit"]');
await admin.waitForURL(`${BASE}/`, { timeout: 20000 });

async function creerClient(nom) {
  await admin.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
  await admin.fill('input[name="name"]', nom);
  await admin.fill('input[name="contentTarget"]', "6");
  await admin.click('button:has-text("Créer le client")');
  await admin.waitForURL(/\/clients\/[0-9a-f-]{36}/, { timeout: 20000 });
  return admin.url().split("/").pop();
}

async function accesClient(id, nom, email, mdp) {
  await admin.goto(`${BASE}/clients/${id}`, { waitUntil: "domcontentloaded" });
  await admin.fill('input[name="contactName"]', nom);
  await admin.fill('input[name="contactEmail"]', email);
  await admin.click('button:has-text("Créer l\'accès")');
  await admin.waitForSelector(`text=${nom}`, { timeout: 20000 });
  const lien = await admin.locator("input[readonly]").first().inputValue();
  const page = await onglet();
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(lien, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="password"]', mdp);
  await page.click('button[type="submit"]');
  await page.waitForURL(/portail/, { timeout: 20000 });
  return page;
}

const capMarine = await creerClient("Cap Marine");
const bistrot = await creerClient("Bistrot Zoé");
const sophie = await accesClient(capMarine, "Sophie Rivière", "sophie@capmarine.re", "mot-de-passe-sophie-2026");
const zoe = await accesClient(bistrot, "Zoé Payet", "zoe@bistrot.re", "mot-de-passe-zoe-2026");

/* ============ 1. L'ONGLET EXISTE AVANT LA PREMIÈRE FACTURE ============= */

// Il doit être là dès le premier jour : c'est ainsi que le client apprend
// où chercher, et que nous voyons que l'endroit existe.
await sophie.goto(`${BASE}/portail`, { waitUntil: "domcontentloaded" });
ok("l'onglet Factures est là même sans facture", (await sophie.textContent("nav")).includes("Factures"));
ok(
  "… sans pastille, puisqu'il n'y a rien à régler",
  !/Factures\s*\d/.test(await sophie.textContent("nav")),
);
await sophie.click('nav a:has-text("Factures")');
await sophie.waitForURL(/\/portail\/factures/, { timeout: 20000 });
ok("… et la page explique l'attente", (await lire(sophie)).includes("Aucune facture pour"));

/* ==================== 2. LA DIRECTION DÉPOSE ========================== */

/** Dépose une facture depuis la fiche client. */
async function deposer({ numero, libelle, montant, emission, echeance }) {
  await admin.goto(`${BASE}/clients/${capMarine}`, { waitUntil: "domcontentloaded" });
  await admin.fill('input[placeholder^="N° "]', numero);
  if (libelle) await admin.fill('input[placeholder="Prestation août"]', libelle);
  await admin.fill('input[placeholder="1 800,00"]', montant);
  const dates = admin.locator('input[type="date"]');
  await dates.nth(0).fill(emission);
  if (echeance) await dates.nth(1).fill(echeance);
  await admin.setInputFiles('input[accept=".pdf,application/pdf"]', PDF);
  await admin.click('button:has-text("Ajouter la facture")');
  await admin.waitForTimeout(2200);
}

await deposer({
  numero: "2026-041",
  libelle: "Prestation juillet",
  montant: "1800,00",
  emission: "2026-07-31",
  echeance: "2026-08-30",
});
await deposer({
  numero: "2026-042",
  libelle: "Prestation août",
  montant: "1800,50",
  emission: "2026-08-31",
  echeance: "2026-09-30",
});
await deposer({
  numero: "2025-118",
  libelle: "Prestation décembre",
  montant: "1500,00",
  emission: "2025-12-31",
});

ok("les trois factures sont enregistrées", un(`select count(*) from invoices`) === "3");
ok(
  "le montant passe en centimes, sans arrondi douteux",
  un(`select amount_cents from invoices where number='2026-042'`) === "180050",
);
ok(
  "la date d'émission est gardée telle quelle",
  un(`select issued_on::text from invoices where number='2025-118'`) === "2025-12-31",
);
ok(
  "… et l'échéance quand il y en a une",
  un(`select coalesce(due_on::text,'-') from invoices where number='2025-118'`) === "-",
);
await shot(admin, "factures-fiche-client");

/* ============ 3. LE CLIENT LES RETROUVE, GROUPÉES PAR ANNÉE =========== */

await sophie.goto(`${BASE}/portail`, { waitUntil: "domcontentloaded" });
ok(
  "la pastille compte les factures à régler",
  /Factures\s*3/.test(await sophie.textContent("nav")),
);

await sophie.click('nav a:has-text("Factures")');
await sophie.waitForURL(/\/portail\/factures/, { timeout: 20000 });
let vue = await lire(sophie);
ok("les trois factures sont là", vue.includes("2026-041") && vue.includes("2026-042") && vue.includes("2025-118"));
ok("elles sont groupées par année", vue.includes("2026") && vue.includes("2025"));
ok("le total de l'année est calculé", vue.includes("3 600,50 €"));
ok("… et celui de l'année précédente aussi", vue.includes("1 500,00 €"));
ok("le rappel des impayés annonce le reste dû", vue.includes("5 100,50 €"));
await shot(sophie, "factures-portail");

/* ==================== 4. LE TÉLÉCHARGEMENT ============================ */

const facture = un(`select id from invoices where number='2026-042'`);
const tele = await sophie.evaluate(async (u) => {
  const r = await fetch(u, { cache: "no-store" });
  return { statut: r.status, nom: r.headers.get("content-disposition") ?? "" };
}, `/api/invoice/${facture}`);
ok(`le client télécharge sa facture (${tele.statut})`, tele.statut === 200);
ok(
  "… proposée sous son numéro, pas un identifiant",
  tele.nom.includes("facture-2026-042") && tele.nom.startsWith("attachment"),
);

const vol = await zoe.evaluate(
  async (u) => (await fetch(u, { cache: "no-store" })).status,
  `/api/invoice/${facture}`,
);
ok(`un autre client ne la télécharge pas (${vol})`, vol === 403);
await zoe.goto(`${BASE}/portail`, { waitUntil: "domcontentloaded" });
ok(
  "… et son onglet Factures reste vide de tout compteur",
  (await zoe.textContent("nav")).includes("Factures") &&
    !/Factures\s*\d/.test(await zoe.textContent("nav")),
);

/* ==================== 5. LE RÈGLEMENT ================================= */

vue = await lire(sophie);
ok("une facture non réglée est signalée au client", vue.includes("À régler") || vue.includes("En retard"));

await admin.goto(`${BASE}/clients/${capMarine}`, { waitUntil: "domcontentloaded" });
await admin.click(`[data-facture="${facture}"] button:has-text("Marquer réglée")`);
await admin.waitForTimeout(1500);
ok(
  "le règlement est daté, pas seulement coché",
  un(`select coalesce(paid_on::text,'-') from invoices where id='${facture}'`) !== "-",
);

await sophie.goto(`${BASE}/portail/factures`, { waitUntil: "domcontentloaded" });
ok("le client voit qu'elle est réglée", (await lire(sophie)).includes("Réglée"));

await admin.goto(`${BASE}/clients/${capMarine}`, { waitUntil: "domcontentloaded" });
await admin.click(`[data-facture="${facture}"] button:has-text("Marquer impayée")`);
await admin.waitForTimeout(1500);
ok(
  "on peut revenir en arrière",
  un(`select coalesce(paid_on::text,'-') from invoices where id='${facture}'`) === "-",
);

/* ==================== 6. LA SUPPRESSION =============================== */

const aSupprimer = un(`select id from invoices where number='2025-118'`);
await admin.goto(`${BASE}/clients/${capMarine}`, { waitUntil: "domcontentloaded" });
await admin.click(`[data-facture="${aSupprimer}"] button[title="Supprimer"]`);
await admin.waitForTimeout(1500);
ok("la facture supprimée disparaît", un(`select count(*) from invoices`) === "2");
await sophie.goto(`${BASE}/portail/factures`, { waitUntil: "domcontentloaded" });
ok("… et l'année vidée avec elle", !(await lire(sophie)).includes("2025-118"));

/* ============ 7. LA FACTURATION RESTE À LA DIRECTION ================== */

await admin.goto(`${BASE}/equipe`, { waitUntil: "domcontentloaded" });
await admin.fill('input[name="name"]', "Romain Payet");
await admin.fill('input[name="email"]', "romain@taochy.re");
await admin.click('button:has-text("Inviter")');
await admin.waitForSelector("text=romain@taochy.re", { timeout: 20000 });
sql(`update users set password_hash=(select password_hash from users where email='emmanuel@taochy.re'), invite_token=null where email='romain@taochy.re'`);

const romain = await onglet();
romain.on("pageerror", (e) => errs.push(String(e)));
await romain.goto(`${BASE}/connexion`, { waitUntil: "domcontentloaded" });
await romain.waitForSelector('input[name="email"]', { timeout: 20000 });
await romain.fill('input[name="email"]', "romain@taochy.re");
await romain.fill('input[name="password"]', "motdepasse-solide-2026");
await romain.click('button[type="submit"]');
await romain.waitForURL(`${BASE}/`, { timeout: 20000 });

await romain.goto(`${BASE}/clients/${capMarine}`, { waitUntil: "domcontentloaded" });
ok("l'équipe ne voit pas la carte des factures", !(await lire(romain)).includes("Ajouter la facture"));

const refus = await romain.evaluate(async (u) => {
  const r = await fetch(u, {
    method: "POST",
    body: "x",
    redirect: "manual",
    headers: {
      "content-type": "application/pdf",
      "x-number": "PIRATE",
      "x-issued": "2026-08-01",
      "x-filename": "x.pdf",
    },
  });
  return r.status;
}, `/api/invoice?clientId=${capMarine}`);
ok(`… ni ne peut en déposer (${refus})`, refus === 403);
ok("… et rien n'a été créé", un(`select count(*) from invoices where number='PIRATE'`) === "0");

console.log(`\nerreurs JS : ${errs.length ? errs.join(" | ") : "aucune"}`);
await b.close();
