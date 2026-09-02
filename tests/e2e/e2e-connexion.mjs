/**
 * Les écrans d'entrée.
 *
 * Deux volets sur un ordinateur — formulaire à gauche, visuel de l'agence à
 * droite. Sur téléphone, le visuel passe en fond et le formulaire se pose
 * dessus. Sans image envoyée, un dégradé aux couleurs de l'agence : jamais de
 * trou gris.
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
const onglet = async (w, h) => (await b.newContext({ viewport: { width: w, height: h } })).newPage();

const bureau = await onglet(1440, 950);
bureau.on("pageerror", (e) => errs.push(String(e)));
const shot = (page, n) => page.screenshot({ path: `${SP}/shots/${n}.png`, fullPage: false });

/** La largeur d'un élément, ou zéro s'il n'est pas rendu. */
const largeur = (page, sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.round(r.width);
  }, sel);

/* ================= 1. L'INSTALLATION, PREMIER ÉCRAN ===================== */

await bureau.goto(`${BASE}/bienvenue`, { waitUntil: "domcontentloaded" });
ok("l'installation s'ouvre sur la mise en page à deux volets", (await largeur(bureau, "main > div:last-child")) > 400);
ok("le formulaire garde une largeur de lecture", (await largeur(bureau, "main form")) < 460);
ok("le titre est celui de l'installation", (await bureau.textContent("h1")).includes("Créons ton compte"));
await shot(bureau, "connexion-installation");

await bureau.fill('input[name="name"]', "Emmanuel Taochy");
await bureau.fill('input[name="email"]', "emmanuel@taochy.re");
await bureau.fill('input[name="password"]', "motdepasse-solide-2026");
await bureau.click('button[type="submit"]');
await bureau.waitForURL(`${BASE}/`, { timeout: 20000 });

/* ==================== 2. LA CONNEXION, SANS VISUEL ====================== */

const visiteur = await onglet(1440, 950);
visiteur.on("pageerror", (e) => errs.push(String(e)));
await visiteur.goto(`${BASE}/connexion`, { waitUntil: "domcontentloaded" });

// Le formulaire est monté côté client — il lit le paramètre « suite » de
// l'adresse — donc il n'existe qu'une fois l'hydratation faite.
await visiteur.waitForSelector('input[name="email"]', { timeout: 20000 });
const volet = await largeur(visiteur, "main > div:last-child");
ok(`le volet visuel occupe sa colonne (${volet} px)`, volet > 400);
ok("le formulaire est à gauche", (await visiteur.evaluate(() => {
  const f = document.querySelector("main form");
  return f ? f.getBoundingClientRect().left < window.innerWidth / 2 : false;
})));

const fond = await visiteur.evaluate(() => {
  const el = document.querySelector("main > div:last-child");
  return el ? getComputedStyle(el).backgroundImage : "";
});
ok("sans visuel envoyé, un dégradé aux couleurs de l'agence tient la place", fond.includes("gradient"));
ok("aucune image de marque n'est réclamée", !fond.includes("/api/branding/cover"));
ok("le nom de l'agence est écrit dans le volet", (await visiteur.textContent("main")).includes("Taochy Consulting"));
await shot(visiteur, "connexion-bureau");

/* ================== 3. SUR TÉLÉPHONE, LE VISUEL PASSE EN FOND ========== */

const mobile = await onglet(390, 844);
mobile.on("pageerror", (e) => errs.push(String(e)));
await mobile.goto(`${BASE}/connexion`, { waitUntil: "domcontentloaded" });
await mobile.waitForSelector('input[name="email"]', { timeout: 20000 });
ok("le volet de droite disparaît", (await largeur(mobile, "main > div:last-child")) === 0);
ok("le formulaire occupe l'écran", (await largeur(mobile, "main form")) > 250);
ok(
  "le formulaire est dans la moitié basse, à portée de pouce",
  await mobile.evaluate(() => {
    const f = document.querySelector("main form");
    return f ? f.getBoundingClientRect().top > window.innerHeight / 2 : false;
  }),
);
const debordement = await mobile.evaluate(
  () => document.documentElement.scrollWidth <= window.innerWidth + 1,
);
ok("rien ne déborde en largeur", debordement);
await shot(mobile, "connexion-mobile");

/* ============ 4. LE VISUEL ENVOYÉ REMPLACE LE DÉGRADÉ ================== */

/** Envoie une image dans le n-ième emplacement des réglages. */
async function deposer(rang, fichier) {
  await bureau.goto(`${BASE}/reglages`, { waitUntil: "domcontentloaded" });
  await bureau.locator('input[type="file"]').nth(rang).setInputFiles(fichier);
  await bureau.click(`button:has-text("Envoyer") >> nth=${rang}`);
  await bureau.waitForTimeout(2500);
}

await deposer(0, `${SP}/logo-consulting.png`);
await deposer(1, `${SP}/logo-agency.png`);
await deposer(2, `${SP}/photo-test.jpg`);

ok("le logo du pôle social est enregistré", un(`select coalesce(logo_path,'') from settings`) !== "");
ok("celui du pôle web aussi", un(`select coalesce(logo_web_path,'') from settings`) !== "");
ok(
  "… et ce sont bien deux fichiers différents",
  un(`select logo_path from settings`) !== un(`select logo_web_path from settings`),
);
ok("le visuel de connexion est enregistré", un(`select coalesce(cover_path,'') from settings`) !== "");
await shot(bureau, "reglages-images");

const statutImg = (page, u) =>
  page.evaluate(async (x) => (await fetch(x, { cache: "no-store" })).status, u);
ok("les trois images se servent", 
  (await statutImg(bureau, "/api/branding/logo")) === 200 &&
  (await statutImg(bureau, "/api/branding/logo-web")) === 200 &&
  (await statutImg(bureau, "/api/branding/cover")) === 200);
ok(
  "un quatrième nom d'image n'existe pas",
  (await statutImg(bureau, "/api/branding/logo-imprimerie")) === 404,
);

await visiteur.goto(`${BASE}/connexion`, { waitUntil: "domcontentloaded" });
const fond2 = await visiteur.evaluate(() => {
  const el = document.querySelector("main > div:last-child");
  return el ? getComputedStyle(el).backgroundImage : "";
});
ok("la page de connexion affiche le visuel envoyé", fond2.includes("/api/branding/cover"));
ok(
  "les deux logos s'affichent côte à côte sur la connexion",
  (await visiteur.locator('img[src="/api/branding/logo"]').count()) > 0 &&
    (await visiteur.locator('img[src="/api/branding/logo-web"]').count()) > 0,
);
// Quand de vrais logos sont réglés, ils portent le nom : le répéter en toutes
// lettres à côté ferait doublon. C'est en leur absence que le nom doit rester.
// « :visible » compte ce qui est réellement affiché : le bloc de marques du
// téléphone reste dans la page, simplement masqué sur grand écran.
ok(
  "… et sur ordinateur le formulaire n'en montre qu'un, la marque principale",
  (await visiteur.locator('main > div:first-child img[src^="/api/branding/logo"]:visible').count()) === 1,
);

const tel = await onglet(390, 844);
tel.on("pageerror", (e) => errs.push(String(e)));
await tel.goto(`${BASE}/connexion`, { waitUntil: "domcontentloaded" });
await tel.waitForSelector('input[name="email"]', { timeout: 20000 });
const placement = await tel.evaluate(() => {
  const logos = [...document.querySelectorAll('img[src^="/api/branding/logo"]')]
    .map((i) => i.getBoundingClientRect())
    .filter((r) => r.width > 0);
  const f = document.querySelector("main form")?.getBoundingClientRect();
  return {
    nb: logos.length,
    hauteur: logos.length ? Math.round(Math.max(...logos.map((r) => r.height))) : 0,
    basLogos: logos.length ? Math.max(...logos.map((r) => r.bottom)) : 0,
    hautForm: f ? f.top : 0,
    ecran: window.innerHeight,
  };
});
ok(`sur téléphone, les deux marques sont en haut (${placement.nb})`, placement.nb === 2);
ok(
  `… et plus grandes qu'au-dessus du formulaire (${placement.hauteur} px)`,
  placement.hauteur >= 40,
);
ok(
  "… au-dessus du formulaire, resté en bas",
  placement.basLogos < placement.hautForm && placement.hautForm > placement.ecran / 2,
);
await shot(tel, "connexion-mobile-logos");
await shot(visiteur, "connexion-avec-visuel");

/* ============ 5. LES IMAGES SONT SERVIES SANS SESSION ================== */

const statut = (page, u) => page.evaluate(async (x) => (await fetch(x, { cache: "no-store" })).status, u);
ok(`le visuel se charge sans être connecté (${await statut(visiteur, "/api/branding/cover")})`,
  (await statut(visiteur, "/api/branding/cover")) === 200);
ok("le logo aussi", (await statut(visiteur, "/api/branding/logo")) === 200);
ok(
  "mais rien d'autre : une troisième image n'existe pas",
  (await statut(visiteur, "/api/branding/contrat")) === 404,
);
ok(
  "et un visiteur non connecté n'atteint toujours pas le cockpit",
  (await visiteur.goto(`${BASE}/`, { waitUntil: "domcontentloaded" }), visiteur.url().includes("/connexion")),
);

/* ============ 6. L'INVITATION D'UN CLIENT PORTE LE MÊME ÉCRAN ========== */

await bureau.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
await bureau.fill('input[name="name"]', "Cap Marine");
await bureau.fill('input[name="contentTarget"]', "6");
await bureau.click('button:has-text("Créer le client")');
await bureau.waitForURL(/\/clients\/[0-9a-f-]{36}/, { timeout: 20000 });
await bureau.fill('input[name="contactName"]', "Sophie Rivière");
await bureau.fill('input[name="contactEmail"]', "sophie@capmarine.re");
await bureau.click('button:has-text("Créer l\'accès")');
await bureau.waitForSelector("text=Sophie Rivière", { timeout: 20000 });
const lien = await bureau.locator("input[readonly]").first().inputValue();

const sophie = await onglet(1440, 950);
sophie.on("pageerror", (e) => errs.push(String(e)));
await sophie.goto(lien, { waitUntil: "domcontentloaded" });
ok("l'invitation accueille le contact par son nom", (await sophie.textContent("h1")).includes("Sophie"));
ok("… avec le même volet visuel", (await largeur(sophie, "main > div:last-child")) > 400);
await shot(sophie, "connexion-invitation");

await sophie.fill('input[name="password"]', "mot-de-passe-client-2026");
await sophie.click('button[type="submit"]');
await sophie.waitForURL(/portail/, { timeout: 20000 });
ok("le client entre dans son portail", sophie.url().includes("/portail"));

// Un lien déjà utilisé ne rouvre pas la création de mot de passe.
await sophie.goto(`${BASE}/connexion`, { waitUntil: "domcontentloaded" });
const perime = await onglet(1200, 900);
await perime.goto(`${BASE}/invitation/jeton-invente`, { waitUntil: "domcontentloaded" });
ok("un jeton inventé tombe sur « Lien expiré »", (await perime.textContent("h1")).includes("Lien expiré"));

console.log(`\nerreurs JS : ${errs.length ? errs.join(" | ") : "aucune"}`);
await b.close();
