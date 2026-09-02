/**
 * Le portail client, refondu en sections.
 *
 * Il tenait sur une page qui déroulait tout : validations, mois, médias,
 * fichiers, projets, charte. On vérifie ici que chaque chose a sa page, que la
 * barre du haut dit ce qui attend ailleurs, que la bibliothèque montre les
 * dossiers de l'agence, et qu'un client ne voit toujours que le sien.
 */
import pw from "/opt/node22/lib/node_modules/playwright/index.js";
const { chromium } = pw;
import { execFileSync } from "node:child_process";

const SP = "/tmp/claude-0/-home-claude/956d6f17-f290-5e1d-9e91-839fdc4ed875/scratchpad";
const BASE = "http://127.0.0.1:4030";
const sql = (q) =>
  execFileSync("psql", ["-h", "127.0.0.1", "-p", "5451", "-U", "postgres", "-d", "pilot", "-tA", "-c", q], {
    encoding: "utf8",
  }).trim();
const un = (q) => sql(q).split("\n")[0].trim();

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const errs = [];
const ok = (label, cond) => console.log(`${cond ? "OK  " : "ÉCHEC"} ${label}`);
const onglet = async (w = 1400, h = 950) =>
  (await b.newContext({ viewport: { width: w, height: h } })).newPage();
const shot = (page, n) => page.screenshot({ path: `${SP}/shots/${n}.png`, fullPage: true });

const admin = await onglet();
admin.on("pageerror", (e) => errs.push(String(e)));

/* ---------------------------------------------------------- installation -- */

await admin.goto(`${BASE}/bienvenue`, { waitUntil: "domcontentloaded" });
await admin.fill('input[name="name"]', "Emmanuel Taochy");
await admin.fill('input[name="email"]', "emmanuel@taochy.re");
await admin.fill('input[name="password"]', "motdepasse-solide-2026");
await admin.click('button[type="submit"]');
await admin.waitForURL(`${BASE}/`, { timeout: 20000 });

/**
 * Crée un client. Les pôles sont cochés explicitement : le formulaire propose
 * d'avance le pôle actif, et les champs affichés en dépendent — « contenus par
 * mois » n'existe pas pour un client purement web.
 */
async function creerClient(nom, cible, poles = ["social", "web"]) {
  await admin.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
  for (const d of ["social", "web"]) {
    const c = admin.locator(`input[name="departments"][value="${d}"]`);
    if (poles.includes(d)) await c.check();
    else await c.uncheck();
  }
  await admin.fill('input[name="name"]', nom);
  if (poles.includes("social")) await admin.fill('input[name="contentTarget"]', String(cible));
  await admin.click('button:has-text("Créer le client")');
  await admin.waitForURL(/\/clients\/[0-9a-f-]{36}/, { timeout: 20000 });
  return admin.url().split("/").pop();
}

async function accesClient(id, nom, email) {
  await admin.goto(`${BASE}/clients/${id}`, { waitUntil: "domcontentloaded" });
  await admin.fill('input[name="contactName"]', nom);
  await admin.fill('input[name="contactEmail"]', email);
  await admin.click('button:has-text("Créer l\'accès")');
  await admin.waitForSelector(`text=${nom}`, { timeout: 20000 });
  return admin.locator("input[readonly]").first().inputValue();
}

const capMarine = await creerClient("Cap Marine", 6);
const bistrot = await creerClient("Bistrot Zoé", 4);

const lienSophie = await accesClient(capMarine, "Sophie Rivière", "sophie@capmarine.re");
const lienZoe = await accesClient(bistrot, "Zoé Payet", "zoe@bistrot.re");

const sophie = await onglet();
sophie.on("pageerror", (e) => errs.push(String(e)));
await sophie.goto(lienSophie, { waitUntil: "domcontentloaded" });
await sophie.fill('input[name="password"]', "mot-de-passe-client-2026");
await sophie.click('button[type="submit"]');
await sophie.waitForURL(/portail/, { timeout: 20000 });

/* =================== 1. DE QUOI REMPLIR LES SECTIONS ==================== */

// Un contenu soumis à validation.
await admin.goto(`${BASE}/contenu`, { waitUntil: "domcontentloaded" });
await admin.selectOption('select[name="clientId"]', capMarine);
await admin.fill('input[name="title"]', "Post cale sèche");
await admin.click('button:has-text("Créer")');
await admin.waitForURL(/\/contenu\/[0-9a-f-]{36}/, { timeout: 20000 });
const contenu = admin.url().split("/").pop();
sql(`update contents set status='validation', submitted_at=now() where id='${contenu}'`);

// Des médias, rangés en dossiers.
await admin.goto(`${BASE}/assets?client=${capMarine}`, { waitUntil: "domcontentloaded" });
await admin.fill('input[name="name"]', "Shooting mars");
await admin.click('button:has-text("Créer le dossier")');
await admin.waitForSelector("[data-dossier]", { timeout: 20000 });
const shooting = un(`select id from asset_folders where name='Shooting mars'`);

await admin.goto(`${BASE}/assets?client=${capMarine}&dossier=${shooting}`, { waitUntil: "domcontentloaded" });
await admin.setInputFiles('input[type="file"]', `${SP}/photo-test.jpg`);
await admin.click('button:has-text("Importer")');
await admin.waitForSelector("text=Import terminé", { timeout: 60000 }).catch(() => {});
await admin.waitForTimeout(800);

// Un document interne et un document partagé.
await admin.goto(`${BASE}/clients/${capMarine}`, { waitUntil: "domcontentloaded" });
await admin.fill('input[placeholder^="Intitulé"]', "Contrat 2026");
await admin.setInputFiles('input[type="file"]', `${SP}/photo-test.jpg`);
await admin.click('button:has-text("Joindre")');
await admin.waitForTimeout(2000);
await admin.goto(`${BASE}/clients/${capMarine}`, { waitUntil: "domcontentloaded" });
await admin.fill('input[placeholder^="Intitulé"]', "Devis validé");
await admin.locator('input[type="checkbox"]:near(:text("Partager avec le client"))').first().check();
await admin.setInputFiles('input[type="file"]', `${SP}/photo-test.jpg`);
await admin.click('button:has-text("Joindre")');
await admin.waitForTimeout(2000);

/* ==================== 2. L'ACCUEIL VA À L'ESSENTIEL ===================== */

await sophie.goto(`${BASE}/portail`, { waitUntil: "domcontentloaded" });
let txt = await sophie.textContent("main");
ok("l'accueil salue le contact", txt.includes("Bonjour Sophie Rivière"));
ok("il annonce ce qui attend une réponse", txt.includes("attend votre validation"));
ok("il montre le mois en cours", txt.includes("Votre mois en cours"));
ok("il ne déroule plus les médias", !txt.includes("Vos médias"));
ok("ni les documents", !txt.includes("Partagés par l'agence"));
ok("ni la charte", !txt.includes("Votre charte graphique"));
await shot(sophie, "portail-accueil");

const nav = await sophie.textContent("nav");
// « Projets » n'apparaît qu'une fois un projet ouvert : il est vérifié plus bas.
ok(
  "la barre porte les sections utiles",
  ["Accueil", "À valider", "Médias", "Documents", "Charte"].every((s) => nav.includes(s)),
);
ok("… sans onglet Projets tant qu'il n'y en a pas", !nav.includes("Projets"));
ok("la pastille annonce le contenu en attente", nav.includes("1"));

/* ======================== 3. À VALIDER ================================== */

await sophie.click('nav a:has-text("À valider")');
await sophie.waitForURL(/\/portail\/valider/, { timeout: 20000 });
txt = await sophie.textContent("main");
ok("la page à valider montre le contenu soumis", txt.includes("Post cale sèche"));
await shot(sophie, "portail-valider");

/* ======================== 4. LES MÉDIAS ================================= */

await sophie.click('nav a:has-text("Médias")');
await sophie.waitForURL(/\/portail\/medias/, { timeout: 20000 });
txt = await sophie.textContent("main");
ok("la bibliothèque reprend les dossiers de l'agence", txt.includes("Shooting mars"));
ok("la racine ne déballe pas le contenu des dossiers", !txt.includes("photo-test.jpg"));

await sophie.click('a:has-text("Shooting mars")');
await sophie.waitForURL(/dossier=/, { timeout: 20000 });
txt = await sophie.textContent("main");
ok("ouvrir un dossier montre ses médias", txt.includes("photo-test.jpg"));
ok("le fil d'Ariane permet de remonter", txt.includes("Tous vos médias"));
await shot(sophie, "portail-medias");

// Le dossier d'un autre client ne s'ouvre pas, même en forçant l'adresse.
await admin.goto(`${BASE}/assets?client=${bistrot}`, { waitUntil: "domcontentloaded" });
await admin.fill('input[name="name"]', "Menus Bistrot");
await admin.click('button:has-text("Créer le dossier")');
await admin.waitForSelector("[data-dossier]", { timeout: 20000 });
const menus = un(`select id from asset_folders where name='Menus Bistrot'`);
await sophie.goto(`${BASE}/portail/medias?dossier=${menus}`, { waitUntil: "domcontentloaded" });
txt = await sophie.textContent("main");
ok("le dossier d'un autre client ne s'ouvre pas", !txt.includes("Menus Bistrot"));

/* ======================== 5. LES DOCUMENTS ============================== */

await sophie.goto(`${BASE}/portail/documents`, { waitUntil: "domcontentloaded" });
txt = await sophie.textContent("main");
ok("le document partagé est là", txt.includes("Devis validé"));
ok("le contrat interne n'y est pas", !txt.includes("Contrat 2026"));
ok("les deux listes sont distinctes", txt.includes("Partagés par l'agence") && txt.includes("Ce que vous nous envoyez"));

await sophie.setInputFiles('input[type="file"]', `${SP}/photo-test.jpg`);
await sophie.click('button:has-text("Envoyer")');
await sophie.waitForTimeout(2500);
await sophie.goto(`${BASE}/portail/documents`, { waitUntil: "domcontentloaded" });
const doc = await sophie.textContent("main");
ok("ce que le client envoie apparaît de son côté", doc.includes("photo-test.jpg"));
await shot(sophie, "portail-documents");

/* ======================== 6. LES PROJETS ================================ */

await admin.goto(`${BASE}/clients/${capMarine}`, { waitUntil: "domcontentloaded" });
await admin.click('aside button[name="pole"][value="web"]');
await admin.waitForURL(/\/web$/, { timeout: 20000 });
await admin.selectOption('select[name="clientId"]', capMarine);
await admin.fill('input[name="name"]', "Site vitrine Cap Marine");
await admin.click('button:has-text("Créer le projet")');
await admin.waitForURL(/\/web\/[0-9a-f-]{36}/, { timeout: 20000 });

await sophie.goto(`${BASE}/portail`, { waitUntil: "domcontentloaded" });
ok("l'onglet Projets apparaît dès qu'il y a un projet", (await sophie.textContent("nav")).includes("Projets"));
await sophie.click('nav a:has-text("Projets")');
await sophie.waitForURL(/\/portail\/projets/, { timeout: 20000 });
txt = await sophie.textContent("main");
ok("le projet et son avancement s'affichent", txt.includes("Site vitrine Cap Marine"));
await shot(sophie, "portail-projets");

/* ============ 7. UN CLIENT SANS PROJET N'A PAS L'ONGLET ================ */

const zoe = await onglet();
zoe.on("pageerror", (e) => errs.push(String(e)));
await zoe.goto(lienZoe, { waitUntil: "domcontentloaded" });
await zoe.fill('input[name="password"]', "mot-de-passe-zoe-2026");
await zoe.click('button[type="submit"]');
await zoe.waitForURL(/portail/, { timeout: 20000 });
const navZoe = await zoe.textContent("nav");
ok("sans projet web, l'onglet Projets ne s'affiche pas", !navZoe.includes("Projets"));
ok("les autres sections restent", navZoe.includes("Médias") && navZoe.includes("Documents"));

const vueZoe = await zoe.textContent("main");
ok("elle ne voit rien du client voisin", !vueZoe.includes("Cap Marine") && !vueZoe.includes("Post cale sèche"));

/* ============ 8. CHAQUE CLIENT VOIT LA MARQUE DE SON PÔLE ============== */

// Deux logos réglés : celui du social et celui du web.
await admin.goto(`${BASE}/reglages`, { waitUntil: "domcontentloaded" });
await admin.locator('input[type="file"]').nth(0).setInputFiles(`${SP}/logo-consulting.png`);
await admin.click('button:has-text("Envoyer") >> nth=0');
await admin.waitForTimeout(2500);
await admin.goto(`${BASE}/reglages`, { waitUntil: "domcontentloaded" });
await admin.locator('input[type="file"]').nth(1).setInputFiles(`${SP}/logo-agency.png`);
await admin.click('button:has-text("Envoyer") >> nth=1');
await admin.waitForTimeout(2500);
ok(
  "les deux logos sont réglés",
  un(`select coalesce(logo_path,'') from settings`) !== "" &&
    un(`select coalesce(logo_web_path,'') from settings`) !== "",
);

// Cap Marine achète les deux : elle garde la marque historique.
await sophie.goto(`${BASE}/portail`, { waitUntil: "domcontentloaded" });
ok(
  "un client qui prend les deux pôles voit la marque principale",
  (await sophie.locator('header img[src="/api/branding/logo"]').count()) === 1 &&
    (await sophie.locator('header img[src="/api/branding/logo-web"]').count()) === 0,
);

// Un client purement web voit la marque du web.
const siteSeul = await creerClient("Boutique Zen", 0, ["web"]);
const lienZen = await accesClient(siteSeul, "Léa Zen", "lea@zen.re");
const lea = await onglet();
lea.on("pageerror", (e) => errs.push(String(e)));
await lea.goto(lienZen, { waitUntil: "domcontentloaded" });
await lea.fill('input[name="password"]', "mot-de-passe-lea-2026");
await lea.click('button[type="submit"]');
await lea.waitForURL(/portail/, { timeout: 20000 });
ok(
  "un client purement web voit la marque du pôle web",
  (await lea.locator('header img[src="/api/branding/logo-web"]').count()) === 1 &&
    (await lea.locator('header img[src="/api/branding/logo"]').count()) === 0,
);
await shot(lea, "portail-marque-web");

/* ================= 9. LA CHARTE ET LE TÉLÉPHONE ======================== */

await sophie.goto(`${BASE}/portail/charte`, { waitUntil: "domcontentloaded" });
ok("la charte a sa page", (await sophie.textContent("main")).includes("Votre charte graphique"));

const mobile = await onglet(390, 844);
mobile.on("pageerror", (e) => errs.push(String(e)));
await mobile.goto(`${BASE}/connexion`, { waitUntil: "domcontentloaded" });
await mobile.waitForSelector('input[name="email"]', { timeout: 20000 });
await mobile.fill('input[name="email"]', "sophie@capmarine.re");
await mobile.fill('input[name="password"]', "mot-de-passe-client-2026");
await mobile.click('button[type="submit"]');
await mobile.waitForURL(/portail/, { timeout: 20000 });
const deborde = await mobile.evaluate(
  () => document.documentElement.scrollWidth <= window.innerWidth + 1,
);
ok("le portail tient dans la largeur d'un téléphone", deborde);
ok("la navigation reste atteignable", (await mobile.locator("nav a").count()) >= 5);
await shot(mobile, "portail-mobile");

/* ================ 10. UN COMPTE INTERNE N'A PAS DE PORTAIL ============= */

await admin.goto(`${BASE}/portail/documents`, { waitUntil: "domcontentloaded" });
ok("un compte de l'agence est renvoyé vers son outil", !admin.url().includes("/portail"));

console.log(`\nerreurs JS : ${errs.length ? errs.join(" | ") : "aucune"}`);
await b.close();
