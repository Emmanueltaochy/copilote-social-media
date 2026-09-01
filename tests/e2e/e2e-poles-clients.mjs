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

const admin = await onglet();
await admin.goto(`${BASE}/bienvenue`, { waitUntil: "domcontentloaded" });
await admin.fill('input[name="name"]', "Emmanuel Taochy");
await admin.fill('input[name="email"]', "emmanuel@taochy.re");
await admin.fill('input[name="password"]', "motdepasse-solide-2026");
await admin.click('button[type="submit"]');
await admin.waitForURL(`${BASE}/`, { timeout: 20000 });

/* ---------------------- trois clients, trois cas ---------------------- */

async function creerClient(nom, poles) {
  await admin.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
  await admin.fill('input[name="name"]', nom);
  await admin.fill('input[name="sector"]', "Test");
  await admin.fill('input[name="monthlyFee"]', "1000");
  await admin.fill('input[name="contentTarget"]', "4");
  await admin.fill('input[name="hoursSold"]', "10");
  for (const p of ["social", "web"]) {
    const c = admin.locator(`input[name="departments"][value="${p}"]`).first();
    if (poles.includes(p)) await c.check();
    else await c.uncheck();
  }
  await admin.click('button:has-text("Créer le client")');
  await admin.waitForURL(/\/clients\/[0-9a-f-]{36}/, { timeout: 20000 });
  return admin.url().split("/").pop();
}

const social = await creerClient("Bistrot Social", ["social"]);
const web = await creerClient("Boutique Web", ["web"]);
const deux = await creerClient("Cap Les Deux", ["social", "web"]);

ok("le client social n'a que le social", un(`select departments::text from clients where id='${social}'`) === '["social"]');
ok("le client web n'a que le web", un(`select departments::text from clients where id='${web}'`) === '["web"]');
ok("le client mixte a les deux", un(`select departments::text from clients where id='${deux}'`) === '["social", "web"]');

/* ---------------------- deux collaborateurs --------------------------- */

for (const [nom, mail, poles] of [
  ["Romain CM", "romain@taochy.re", ["social"]],
  ["Nina Web", "nina@taochy.re", ["web"]],
]) {
  await admin.goto(`${BASE}/equipe`, { waitUntil: "domcontentloaded" });
  await admin.fill('input[name="name"]', nom);
  await admin.fill('input[name="email"]', mail);
  for (const p of ["social", "web"]) {
    const c = admin.locator(`form input[name="departments"][value="${p}"]`).first();
    if (poles.includes(p)) await c.check();
    else await c.uncheck();
  }
  await admin.click('button:has-text("Inviter")');
  await admin.waitForSelector(`text=${nom}`, { timeout: 20000 });
}

async function ouvrirSession(email, mdp) {
  const jeton = un(`select invite_token from users where email='${email}'`);
  const p = await onglet(1280, 900);
  await p.goto(`${BASE}/invitation/${jeton}`, { waitUntil: "domcontentloaded" });
  await p.fill('input[name="password"]', mdp);
  await p.click('button[type="submit"]');
  await p.waitForURL((u) => !u.pathname.includes("invitation"), { timeout: 20000 });
  return p;
}
const romain = await ouvrirSession("romain@taochy.re", "mot-de-passe-romain-2026");
const nina = await ouvrirSession("nina@taochy.re", "mot-de-passe-nina-2026");

/* ---------------------- ce que chacun voit ---------------------------- */

await romain.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
const vueRomain = await romain.textContent("body");
ok("Romain (social) voit le client social", vueRomain.includes("Bistrot Social"));
ok("… et le client mixte", vueRomain.includes("Cap Les Deux"));
ok("… mais pas le client web", !vueRomain.includes("Boutique Web"));
await romain.screenshot({ path: `${SP}/shots/pc1-romain-clients.png`, fullPage: true });

await nina.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
const vueNina = await nina.textContent("body");
ok("Nina (web) voit le client web", vueNina.includes("Boutique Web"));
ok("… et le client mixte", vueNina.includes("Cap Les Deux"));
ok("… mais pas le client social", !vueNina.includes("Bistrot Social"));

// Le cockpit et le sélecteur de la barre latérale suivent la même règle.
await romain.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
const cockpit = await romain.textContent("body");
ok("le cockpit de Romain ignore le client web", !cockpit.includes("Boutique Web"));
ok("… et compte les deux autres", cockpit.includes("Bistrot Social") && cockpit.includes("Cap Les Deux"));

await romain.goto(`${BASE}/contenu`, { waitUntil: "domcontentloaded" });
const options = await romain.locator('select[name="clientId"] option').allTextContents();
ok(`la liste déroulante de contenu ne propose que le social (${options.filter(Boolean).length - 1})`,
   !options.includes("Boutique Web") && options.some((o) => o.includes("Bistrot Social")));

await nina.goto(`${BASE}/web`, { waitUntil: "domcontentloaded" });
const optionsWeb = await nina.locator('select[name="clientId"] option').allTextContents();
ok("la création de projet web ne propose que les clients web",
   !optionsWeb.includes("Bistrot Social") && optionsWeb.some((o) => o.includes("Boutique Web")));

/* ---------------------- l'adresse directe ne suffit pas --------------- */

const volSocial = await nina.goto(`${BASE}/clients/${social}`, { waitUntil: "domcontentloaded" });
ok(`Nina n'ouvre pas la fiche d'un client social (statut ${volSocial.status()})`, volSocial.status() === 404);

const volWeb = await romain.goto(`${BASE}/clients/${web}`, { waitUntil: "domcontentloaded" });
ok(`Romain n'ouvre pas la fiche d'un client web (statut ${volWeb.status()})`, volWeb.status() === 404);

const mixte = await romain.goto(`${BASE}/clients/${deux}`, { waitUntil: "domcontentloaded" });
ok("mais tous deux ouvrent le client mixte", mixte.status() === 200);

/* ---------------------- l'admin voit tout, selon le pôle actif -------- */

await admin.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
const adminSocial = await admin.textContent("body");
ok("l'admin en pôle social voit les clients sociaux", adminSocial.includes("Bistrot Social"));
ok("… et pas le client web", !adminSocial.includes("Boutique Web"));

await admin.click('aside button[name="pole"][value="web"]');
await admin.waitForURL(/\/web$/, { timeout: 20000 });
await admin.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
const adminWeb = await admin.textContent("body");
ok("après bascule, il voit les clients web", adminWeb.includes("Boutique Web"));
ok("… et plus le client social", !adminWeb.includes("Bistrot Social"));
ok("… le client mixte restant des deux côtés", adminWeb.includes("Cap Les Deux"));
await admin.screenshot({ path: `${SP}/shots/pc2-admin-web.png`, fullPage: true });

// L'admin garde l'accès direct aux deux fiches : il a les deux pôles.
const adminSurSocial = await admin.goto(`${BASE}/clients/${social}`, { waitUntil: "domcontentloaded" });
ok("l'admin ouvre malgré tout n'importe quelle fiche", adminSurSocial.status() === 200);

/* ---------------------- modifier les pôles d'un client ---------------- */

await admin.goto(`${BASE}/clients/${web}`, { waitUntil: "domcontentloaded" });
await admin.locator('input[name="departments"][value="social"]').first().check();
await admin.click('button:has-text("Enregistrer")');
await admin.waitForTimeout(1800);
ok(
  "on peut ajouter un pôle à un client existant",
  un(`select departments::text from clients where id='${web}'`) === '["social", "web"]',
);

await romain.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
ok("le client apparaît alors côté social", (await romain.textContent("body")).includes("Boutique Web"));

console.log("\nerreurs JS :", errs.length ? errs : "aucune");
await b.close();
