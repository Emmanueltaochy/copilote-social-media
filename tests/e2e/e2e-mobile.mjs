import pw from "/opt/node22/lib/node_modules/playwright/index.js";
const { chromium } = pw;
import { execFileSync } from "node:child_process";

const SP = "/tmp/claude-0/-home-claude/956d6f17-f290-5e1d-9e91-839fdc4ed875/scratchpad";
const BASE = "http://127.0.0.1:4030";
const sql = (q) =>
  execFileSync("psql", ["-h", "127.0.0.1", "-p", "5451", "-U", "postgres", "-d", "pilot", "-tA", "-c", q], {
    encoding: "utf8",
  }).trim().split("\n")[0].trim();

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const errs = [];
const ok = (label, cond) => console.log(`${cond ? "OK  " : "ÉCHEC"} ${label}`);

async function onglet({ width, height, mobile }) {
  const ctx = await b.newContext({
    viewport: { width, height },
    isMobile: mobile,
    hasTouch: mobile,
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push(String(e)));
  return page;
}

async function connecter(page, email, mdp) {
  await page.goto(`${BASE}/connexion`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', mdp);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("connexion"), { timeout: 20000 });
}

/* --------------------------------------------------------- installation -- */

const desk = await onglet({ width: 1440, height: 900, mobile: false });
await desk.goto(`${BASE}/bienvenue`, { waitUntil: "domcontentloaded" });
await desk.fill('input[name="name"]', "Emmanuel Taochy");
await desk.fill('input[name="email"]', "emmanuel@taochy.re");
await desk.fill('input[name="password"]', "motdepasse-solide-2026");
await desk.click('button[type="submit"]');
await desk.waitForURL(`${BASE}/`, { timeout: 20000 });

await desk.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
await desk.fill('input[name="name"]', "Cap Marine");
await desk.fill('input[name="sector"]', "Nautisme");
await desk.fill('input[name="monthlyFee"]', "2400");
await desk.fill('input[name="contentTarget"]', "16");
await desk.fill('input[name="hoursSold"]', "30");
await desk.click('button:has-text("Créer le client")');
await desk.waitForURL(/\/clients\/[0-9a-f-]{36}/, { timeout: 20000 });
await desk.fill('input[name="contactName"]', "Sophie Rivière");
await desk.fill('input[name="contactEmail"]', "sophie@capmarine.re");
await desk.click('button:has-text("Créer l\'accès")');
await desk.waitForSelector("text=Sophie Rivière", { timeout: 20000 });
const lienClient = await desk.locator("input[readonly]").first().inputValue();

const cli = await onglet({ width: 390, height: 844, mobile: true });
await cli.goto(lienClient, { waitUntil: "domcontentloaded" });
await cli.fill('input[name="password"]', "mot-de-passe-client-2026");
await cli.click('button[type="submit"]');
await cli.waitForURL(/portail/, { timeout: 20000 });

/* ------------------------------------------- 1. le bureau ne bouge pas -- */

await desk.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
ok(
  "sur grand écran la barre latérale reste affichée en permanence",
  await desk.locator("aside").first().isVisible(),
);
ok(
  "… et aucun bouton de menu n'apparaît",
  !(await desk.locator('button[aria-label="Ouvrir le menu"]').isVisible()),
);
const largeurAside = (await desk.locator("aside").first().boundingBox())?.width;
ok(`… à sa largeur habituelle (${largeurAside} px)`, largeurAside === 232);

/* ---------------------------------------------- 2. le tiroir sur mobile -- */

const mob = await onglet({ width: 390, height: 844, mobile: true });
await connecter(mob, "emmanuel@taochy.re", "motdepasse-solide-2026");
await mob.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });

const aside = mob.locator("aside").first();
ok("sur téléphone la barre latérale est repliée hors de l'écran", ((await aside.boundingBox())?.x ?? 0) < 0);
ok(
  "le contenu occupe toute la largeur",
  ((await mob.locator("main").boundingBox())?.width ?? 0) === 390,
);
ok("un bouton de menu la rappelle", await mob.locator('button[aria-label="Ouvrir le menu"]').isVisible());
await mob.screenshot({ path: `${SP}/shots/mb-1-cockpit.png` });

await mob.click('button[aria-label="Ouvrir le menu"]');
await mob.waitForTimeout(400);
ok("le menu s'ouvre par-dessus l'écran", ((await aside.boundingBox())?.x ?? -1) === 0);
await mob.screenshot({ path: `${SP}/shots/mb-2-menu.png` });

// Toucher à côté referme : c'est le geste réflexe sur un téléphone.
await mob.mouse.click(370, 400);
await mob.waitForTimeout(400);
ok("toucher à côté referme le menu", ((await aside.boundingBox())?.x ?? 0) < 0);

// Naviguer referme aussi, sinon la page change derrière un menu resté ouvert.
await mob.click('button[aria-label="Ouvrir le menu"]');
await mob.waitForTimeout(300);
await mob.click('aside a[href="/tournages"]');
await mob.waitForURL(/tournages/, { timeout: 20000 });
await mob.waitForTimeout(400);
ok("naviguer referme le menu", ((await aside.boundingBox())?.x ?? 0) < 0);
ok("… et la page demandée est bien affichée", (await mob.textContent("body")).includes("Planning tournages"));

/* ------------------------------- 3. la cloche reste atteignable sur mobile -- */

await mob.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
const clocheHaut = mob.locator('header button[aria-label*="Notifications"]');
ok("la cloche est dans la barre du haut, sans ouvrir le menu", await clocheHaut.isVisible());
const boite = await clocheHaut.boundingBox();
ok(
  `elle est assez grande pour le pouce (${Math.round(boite?.width ?? 0)}×${Math.round(boite?.height ?? 0)})`,
  (boite?.height ?? 0) >= 32 && (boite?.width ?? 0) >= 32,
);
ok(
  "le client filtré est rappelé dans la barre du haut",
  (await mob.locator("header").first().textContent()).includes("Tous les clients"),
);

/* ------------------------------------------- 4. aucun écran ne déborde -- */

const clientId = sql("select id from clients limit 1");
const écrans = [
  "/", "/avancement", "/calendrier", "/preparer", "/production", "/approbations", "/a-publier",
  "/tournages", "/assets", "/ads", "/rapports", "/heures", "/clients", "/equipe",
  "/rentabilite", "/contenu", "/compte", `/clients/${clientId}`,
];
const fautifs = [];
for (const r of écrans) {
  await mob.goto(BASE + r, { waitUntil: "domcontentloaded" });
  await mob.waitForTimeout(350);
  const dehors = await mob.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const noms = [];
    for (const e of document.body.querySelectorAll("*")) {
      const rect = e.getBoundingClientRect();
      if (rect.width === 0 || rect.right <= vw + 1) continue;
      if (getComputedStyle(e).position === "fixed") continue;
      let cadre = false;
      for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
        const ox = getComputedStyle(a).overflowX;
        if (ox === "auto" || ox === "scroll" || ox === "hidden") { cadre = true; break; }
      }
      if (!cadre) noms.push(e.tagName);
    }
    return noms.length;
  });
  if (dehors > 0) fautifs.push(`${r} (${dehors})`);
}
ok(`les ${écrans.length} écrans tiennent dans la largeur${fautifs.length ? " — sauf " + fautifs.join(", ") : ""}`, fautifs.length === 0);

/* ------------------------------------- 5. la messagerie tient sur mobile -- */

await mob.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await mob.click('button[aria-label*="messagerie" i]');
await mob.waitForSelector("text=Toute l'équipe", { timeout: 20000 });
const panneau = await mob.locator('div.fixed:has-text("Messagerie")').first().boundingBox();
ok(
  `le panneau tient dans l'écran (${Math.round(panneau?.width ?? 0)} px de large)`,
  (panneau?.width ?? 0) > 300 && (panneau?.x ?? 0) >= 0 && (panneau?.x ?? 0) + (panneau?.width ?? 0) <= 390,
);
ok("… et ne dépasse pas en hauteur", (panneau?.y ?? 0) >= 0 && (panneau?.y ?? 0) + (panneau?.height ?? 0) <= 844);

const filEquipe = await mob.locator("[data-thread]").first().getAttribute("data-thread");
await mob.click(`[data-thread="${filEquipe}"]`);
await mob.fill("textarea", "Test depuis le téléphone.");
await mob.click('button:has-text("Envoyer")');
await mob.waitForSelector("text=Test depuis le téléphone", { timeout: 20000 });
// L'affichage peut précéder l'écriture : on attend la ligne elle-même plutôt
// que de lire la base à l'instant où le texte apparaît à l'écran.
let nbMessages = 0;
for (let i = 0; i < 20 && nbMessages === 0; i += 1) {
  nbMessages = Number(sql("select count(*) from messages"));
  if (nbMessages === 0) await mob.waitForTimeout(250);
}
ok(`on peut écrire un message depuis un téléphone (${nbMessages} en base)`, nbMessages === 1);
await mob.screenshot({ path: `${SP}/shots/mb-3-messagerie.png` });

/* --------------------------------------- 6. le portail client sur mobile -- */

await cli.goto(`${BASE}/portail`, { waitUntil: "domcontentloaded" });
await cli.waitForTimeout(400);
// Même règle que pour les écrans de l'agence : ce qui dépasse à l'intérieur
// d'un cadre à défilement — la barre d'onglets du portail, par exemple — ne
// fait pas déborder la page, il s'y fait glisser.
const dehorsPortail = await cli.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  let n = 0;
  for (const e of document.body.querySelectorAll("*")) {
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.right <= vw + 1) continue;
    if (getComputedStyle(e).position === "fixed") continue;
    let cadre = false;
    for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
      const ox = getComputedStyle(a).overflowX;
      if (ox === "auto" || ox === "scroll" || ox === "hidden") { cadre = true; break; }
    }
    if (!cadre) n += 1;
  }
  return n;
});
ok("le portail client tient dans la largeur d'un téléphone", dehorsPortail === 0);
await cli.screenshot({ path: `${SP}/shots/mb-4-portail.png`, fullPage: true });

console.log("\nerreurs JS :", errs.length ? errs : "aucune");
await b.close();
