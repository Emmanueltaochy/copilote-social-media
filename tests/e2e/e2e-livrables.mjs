import pw from "/opt/node22/lib/node_modules/playwright/index.js";
const { chromium } = pw;
import { execFileSync } from "node:child_process";

const SP = "/tmp/claude-0/-home-claude/956d6f17-f290-5e1d-9e91-839fdc4ed875/scratchpad";
const BASE = "http://127.0.0.1:4030";
const sql = (q) => execFileSync("psql", ["-h","127.0.0.1","-p","5451","-U","postgres","-d","pilot","-tA","-c",q], {encoding:"utf8"}).trim();
const un = (q) => sql(q).split("\n")[0].trim();

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const errs = [];
const ok = (label, cond) => console.log(`${cond ? "OK  " : "ÉCHEC"} ${label}`);
const onglet = async (w = 1440, h = 950) => {
  const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
  p.on("pageerror", (e) => errs.push(String(e)));
  return p;
};

/* ------------------------------------------------------------ décor -- */

const admin = await onglet();
await admin.goto(`${BASE}/bienvenue`, { waitUntil: "domcontentloaded" });
await admin.fill('input[name="name"]', "Emmanuel Taochy");
await admin.fill('input[name="email"]', "emmanuel@taochy.re");
await admin.fill('input[name="password"]', "motdepasse-solide-2026");
await admin.click('button[type="submit"]');
await admin.waitForURL(`${BASE}/`, { timeout: 20000 });

await admin.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
await admin.fill('input[name="name"]', "Cap Marine");
await admin.fill('input[name="sector"]', "Nautisme");
await admin.fill('input[name="monthlyFee"]', "2400");
await admin.fill('input[name="contentTarget"]', "6");
await admin.fill('input[name="hoursSold"]', "30");
await admin.check('input[name="departments"][value="web"]');
await admin.click('button:has-text("Créer le client")');
await admin.waitForURL(/\/clients\/[0-9a-f-]{36}/, { timeout: 20000 });
const client = admin.url().split("/").pop();
await admin.fill('input[name="contactName"]', "Sophie Rivière");
await admin.fill('input[name="contactEmail"]', "sophie@capmarine.re");
await admin.click('button:has-text("Créer l\'accès")');
await admin.waitForSelector("text=Sophie Rivière", { timeout: 20000 });
const lien = await admin.locator("input[readonly]").first().inputValue();

const sophie = await onglet(1200, 950);
await sophie.goto(lien, { waitUntil: "domcontentloaded" });
await sophie.fill('input[name="password"]', "mot-de-passe-client-2026");
await sophie.click('button[type="submit"]');
await sophie.waitForURL(/portail/, { timeout: 20000 });

await admin.goto(`${BASE}/web`, { waitUntil: "domcontentloaded" });
await admin.selectOption('select[name="clientId"]', client);
await admin.fill('input[name="name"]', "Site vitrine Cap Marine");
await admin.click('button:has-text("Créer le projet")');
await admin.waitForURL(/\/web\/[0-9a-f-]{36}/, { timeout: 20000 });
const projet = admin.url().split("/").pop();

/* ============== 1. UNE MAQUETTE SOUS FORME DE LIEN ==================== */

const formLivrable = '[data-form="livrable"]';
await admin.fill(`${formLivrable} input[name="label"]`, "Maquette page d'accueil");
await admin.fill(`${formLivrable} input[name="url"]`, "https://www.figma.com/proto/CAPMARINE/accueil");
await admin.fill(`${formLivrable} input[name="note"]`, "Regardez surtout le bandeau et les photos.");
await admin.click(`${formLivrable} button:has-text("Soumettre au client")`);
await admin.waitForSelector("text=Maquette page d'accueil", { timeout: 20000 });

ok("le livrable est enregistré", Number(un("select count(*) from web_deliverables")) === 1);
ok("… en attente de réponse", un("select status from web_deliverables") === "en_attente");
ok(
  "le client est prévenu",
  Number(un("select count(*) from notifications where title like 'À valider%'")) >= 1,
);
await admin.screenshot({ path: `${SP}/shots/l1-projet-livrable.png`, fullPage: true });

/* ============== 2. LE CLIENT LE VOIT ET RÉPOND ======================== */

await sophie.goto(`${BASE}/portail`, { waitUntil: "domcontentloaded" });
const accueil = await sophie.textContent("body");
ok("l'accueil annonce ce qu'on attend de lui", accueil.includes("à regarder et valider"));

// Les maquettes à approuver sont sur la page des validations, avec les
// contenus : le geste est le même, l'écran aussi.
await sophie.goto(`${BASE}/portail/valider`, { waitUntil: "domcontentloaded" });
const vue = await sophie.textContent("body");
ok("le livrable apparaît dans le portail", vue.includes("Maquette page d'accueil"));
ok("… avec la consigne", vue.includes("Regardez surtout le bandeau"));
const href = await sophie.locator('[data-livrable] a').first().getAttribute("href");
ok(`le lien mène bien à la maquette (${href})`, href === "https://www.figma.com/proto/CAPMARINE/accueil");
await sophie.screenshot({ path: `${SP}/shots/l2-portail-livrable.png`, fullPage: true });

// Un refus sans motif est refusé.
await sophie.click('button[name="decision"][value="modifications"]');
await sophie.waitForSelector("text=sans motif", { timeout: 20000 });
ok("un refus sans motif est refusé", un("select status from web_deliverables") === "en_attente");

// Avec un motif, il passe.
await sophie.fill('input[name="note"]', "Le bleu du bandeau est trop foncé.");
await sophie.click('button[name="decision"][value="modifications"]');
await sophie.waitForSelector("text=nous reprenons", { timeout: 20000 });
ok("la demande de reprise est enregistrée", un("select status from web_deliverables") === "modifications");
ok("… avec son motif", un("select client_note from web_deliverables").includes("trop foncé"));

await admin.goto(`${BASE}/web/${projet}`, { waitUntil: "domcontentloaded" });
const cote = await admin.textContent("body");
ok("l'agence voit la demande, motif compris", cote.includes("Le bleu du bandeau est trop foncé"));
ok("… et le livrable est marqué à reprendre", cote.includes("À reprendre"));

// Resoumettre remet en attente et efface la remarque traitée.
await admin.click('button:has-text("Resoumettre")');
await admin.waitForTimeout(1500);
ok("resoumettre remet en attente", un("select status from web_deliverables") === "en_attente");
ok("… et efface la remarque traitée", un("select coalesce(client_note,'—') from web_deliverables") === "—");

// Cette fois, le client valide.
await sophie.goto(`${BASE}/portail/valider`, { waitUntil: "domcontentloaded" });
await sophie.click('button[name="decision"][value="valide"]');
await sophie.waitForSelector("text=Validé, merci", { timeout: 20000 });
ok("la validation est enregistrée", un("select status from web_deliverables") === "valide");
ok(
  "l'équipe est prévenue de la validation",
  Number(un("select count(*) from notifications where title like 'Validé par le client%'")) >= 1,
);

/* ============== 3. UNE MAQUETTE SOUS FORME DE PDF ===================== */

await admin.goto(`${BASE}/web/${projet}`, { waitUntil: "domcontentloaded" });
await admin.click(`${formLivrable} button:has-text("Un fichier")`);
await admin.fill(`${formLivrable} input[name="label"]`, "Planche de maquettes v1");
await admin.setInputFiles(`${formLivrable} input[type="file"]`, `${SP}/contrat.pdf`);
await admin.click(`${formLivrable} button:has-text("Soumettre au client")`);
await admin.waitForSelector("text=Planche de maquettes v1", { timeout: 30000 });

ok("le PDF est soumis comme livrable", Number(un("select count(*) from web_deliverables")) === 2);
ok(
  "… et rattaché à un fichier du dossier client",
  un("select count(*) from web_deliverables where file_id is not null") === "1",
);

await sophie.goto(`${BASE}/portail/valider`, { waitUntil: "domcontentloaded" });
const hrefPdf = await sophie
  .locator('[data-livrable]:has-text("Planche de maquettes v1") a')
  .first()
  .getAttribute("href");
ok(`le client ouvre le PDF depuis son espace (${hrefPdf})`, hrefPdf.startsWith("/api/client-files/"));
const statutPdf = await sophie.evaluate(
  async (u) => (await fetch(u, { cache: "no-store" })).status,
  hrefPdf,
);
ok("… et le fichier lui est bien servi", statutPdf === 200);

/* ============== 4. CLOISONNEMENT ====================================== */

await admin.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
await admin.fill('input[name="name"]', "Bistrot Zoé");
await admin.fill('input[name="sector"]', "Restauration");
await admin.fill('input[name="monthlyFee"]', "900");
await admin.fill('input[name="contentTarget"]', "4");
await admin.fill('input[name="hoursSold"]', "10");
await admin.check('input[name="departments"][value="web"]');
await admin.click('button:has-text("Créer le client")');
await admin.waitForURL(/\/clients\/[0-9a-f-]{36}/, { timeout: 20000 });
await admin.fill('input[name="contactName"]', "Zoé Payet");
await admin.fill('input[name="contactEmail"]', "zoe@bistrot.re");
await admin.click('button:has-text("Créer l\'accès")');
await admin.waitForSelector("text=Zoé Payet", { timeout: 20000 });
const lienZoe = await admin.locator("input[readonly]").first().inputValue();

const zoe = await onglet(1100, 800);
await zoe.goto(lienZoe, { waitUntil: "domcontentloaded" });
await zoe.fill('input[name="password"]', "mot-de-passe-zoe-2026");
await zoe.click('button[type="submit"]');
await zoe.waitForURL(/portail/, { timeout: 20000 });
const vueZoe = await zoe.textContent("body");
ok("un autre client ne voit pas ces livrables", !vueZoe.includes("Planche de maquettes"));

console.log("\nerreurs JS :", errs.length ? errs : "aucune");
await b.close();
