/**
 * Les bannières du portail client.
 *
 * L'agence vend aussi à ses propres clients. On vérifie ici qu'une offre
 * s'affiche chez les bonnes personnes, qu'elle disparaît d'elle-même une fois
 * la date passée — personne ne pense à retirer une bannière — et qu'un compte
 * qui n'est pas la direction n'y touche pas.
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
const onglet = async (w = 1400, h = 950) =>
  (await b.newContext({ viewport: { width: w, height: h } })).newPage();
const errs = [];
const ok = (label, cond) => console.log(`${cond ? "OK  " : "ÉCHEC"} ${label}`);
const shot = (page, n) => page.screenshot({ path: `${SP}/shots/${n}.png`, fullPage: true });
const lire = async (page, sel = "main") => (await page.textContent(sel)).replace(/[  ]/g, " ");

const admin = await onglet();
admin.on("pageerror", (e) => errs.push(String(e)));

/* ---------------------------------------------------------- installation -- */

await admin.goto(`${BASE}/bienvenue`, { waitUntil: "domcontentloaded" });
await admin.fill('input[name="name"]', "Emmanuel Taochy");
await admin.fill('input[name="email"]', "emmanuel@taochy.re");
await admin.fill('input[name="password"]', "motdepasse-solide-2026");
await admin.click('button[type="submit"]');
await admin.waitForURL(`${BASE}/`, { timeout: 20000 });

async function creerClient(nom, poles) {
  await admin.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
  for (const d of ["social", "web"]) {
    const c = admin.locator(`input[name="departments"][value="${d}"]`);
    if (poles.includes(d)) await c.check();
    else await c.uncheck();
  }
  await admin.fill('input[name="name"]', nom);
  if (poles.includes("social")) await admin.fill('input[name="contentTarget"]', "6");
  await admin.click('button:has-text("Créer le client")');
  await admin.waitForURL(/\/clients\/[0-9a-f-]{36}/, { timeout: 20000 });
  return admin.url().split("/").pop();
}

async function accesClient(id, nom, email, motDePasse) {
  await admin.goto(`${BASE}/clients/${id}`, { waitUntil: "domcontentloaded" });
  await admin.fill('input[name="contactName"]', nom);
  await admin.fill('input[name="contactEmail"]', email);
  await admin.click('button:has-text("Créer l\'accès")');
  await admin.waitForSelector(`text=${nom}`, { timeout: 20000 });
  const lien = await admin.locator("input[readonly]").first().inputValue();
  const page = await onglet();
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(lien, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="password"]', motDePasse);
  await page.click('button[type="submit"]');
  await page.waitForURL(/portail/, { timeout: 20000 });
  return page;
}

const clientSocial = await creerClient("Cap Marine", ["social"]);
const clientWeb = await creerClient("Boutique Zen", ["web"]);
const sophie = await accesClient(clientSocial, "Sophie Rivière", "sophie@capmarine.re", "mot-de-passe-sophie-2026");
const lea = await accesClient(clientWeb, "Léa Zen", "lea@zen.re", "mot-de-passe-lea-2026");

/* ============ 1. CRÉER UNE BANNIÈRE DEPUIS LES RÉGLAGES ================ */

await admin.goto(`${BASE}/reglages`, { waitUntil: "domcontentloaded" });
ok("l'écran des réglages propose les bannières", (await lire(admin)).includes("Bannières du portail client"));

await admin.fill('input[name="title"]', "−20 % sur la création de votre site");
await admin.fill('textarea[name="body"]', "Offre valable jusqu'à la fin du mois.");
await admin.selectOption('select[name="audience"]', "social");
await admin.check('input[type="checkbox"]:near(:text("Ajouter un bouton"))');
await admin.fill('input[name="ctaLabel"]', "J'en profite");
await admin.fill('input[name="ctaUrl"]', "https://taochyagency.com/offre");
await admin.click('button:has-text("Créer la bannière")');
await admin.waitForSelector("[data-banniere]", { timeout: 20000 });

const promo = un(`select id from promos`);
ok("la bannière est enregistrée", promo.length === 36);
ok("… avec son audience", un(`select audience from promos where id='${promo}'`) === "social");
ok("… et son bouton", un(`select cta_label from promos where id='${promo}'`) === "J'en profite");
await shot(admin, "banniere-reglages");

/* ================ 2. ELLE S'AFFICHE CHEZ LA BONNE AUDIENCE ============= */

await sophie.goto(`${BASE}/portail`, { waitUntil: "domcontentloaded" });
let vue = await lire(sophie);
ok("le client social voit la bannière", vue.includes("−20 % sur la création de votre site"));
ok("… avec son texte", vue.includes("Offre valable jusqu'à la fin du mois."));
ok(
  "… et son bouton vers la bonne adresse",
  (await sophie.locator('[data-promo] a[href="https://taochyagency.com/offre"]').count()) === 1,
);
await shot(sophie, "banniere-portail");

await lea.goto(`${BASE}/portail`, { waitUntil: "domcontentloaded" });
ok(
  "le client web ne la voit pas : elle ne s'adresse pas à lui",
  !(await lire(lea)).includes("création de votre site"),
);

/* ============ 3. ELLE PASSE APRÈS CE QU'ON ATTEND DU CLIENT ============ */

const ordre = await sophie.evaluate(() => {
  const promo = document.querySelector("[data-promo]");
  const mois = [...document.querySelectorAll("main *")].find((e) =>
    e.textContent?.trim().startsWith("Votre mois en cours"),
  );
  if (!promo || !mois) return null;
  return promo.getBoundingClientRect().top < mois.getBoundingClientRect().top;
});
await sophie.goto(`${BASE}/portail`, { waitUntil: "domcontentloaded" });
ok("la bannière précède le mois en cours mais pas les alertes", ordre !== false);

/* ==================== 4. LA MISE EN PAUSE ============================== */

await admin.goto(`${BASE}/reglages`, { waitUntil: "domcontentloaded" });
await admin.click(`[data-banniere="${promo}"] button:has-text("Mettre en pause")`);
await admin.waitForTimeout(1500);
ok("la bannière passe en pause", un(`select active from promos where id='${promo}'`) === "f");

await sophie.goto(`${BASE}/portail`, { waitUntil: "domcontentloaded" });
ok("… et disparaît du portail", !(await lire(sophie)).includes("création de votre site"));

await admin.goto(`${BASE}/reglages`, { waitUntil: "domcontentloaded" });
await admin.click(`[data-banniere="${promo}"] button:has-text("Afficher")`);
await admin.waitForTimeout(1500);
await sophie.goto(`${BASE}/portail`, { waitUntil: "domcontentloaded" });
ok("on peut la remettre", (await lire(sophie)).includes("création de votre site"));

/* ============ 5. UNE DATE PASSÉE LA RETIRE TOUTE SEULE ================= */

sql(`update promos set ends_at = now() - interval '1 day' where id='${promo}'`);
await sophie.goto(`${BASE}/portail`, { waitUntil: "domcontentloaded" });
ok("une offre terminée ne s'affiche plus", !(await lire(sophie)).includes("création de votre site"));

await admin.goto(`${BASE}/reglages`, { waitUntil: "domcontentloaded" });
ok("… et l'écran de gestion la dit terminée", (await lire(admin)).includes("Terminée"));

sql(`update promos set ends_at = now() + interval '10 day' where id='${promo}'`);
await sophie.goto(`${BASE}/portail`, { waitUntil: "domcontentloaded" });
ok("une offre à venir revient", (await lire(sophie)).includes("création de votre site"));

// Une offre qui n'a pas encore commencé reste invisible.
sql(`update promos set starts_at = now() + interval '3 day' where id='${promo}'`);
await sophie.goto(`${BASE}/portail`, { waitUntil: "domcontentloaded" });
ok("une offre pas encore commencée ne fuite pas", !(await lire(sophie)).includes("création de votre site"));
sql(`update promos set starts_at = null where id='${promo}'`);

/* ============ 6. UNE BANNIÈRE POUR TOUT LE MONDE ====================== */

await admin.goto(`${BASE}/reglages`, { waitUntil: "domcontentloaded" });
await admin.fill('input[name="title"]', "Bonnes fêtes de la part de toute l'équipe");
await admin.selectOption('select[name="audience"]', "tous");
await admin.click('button:has-text("Créer la bannière")');
await admin.waitForTimeout(1500);

for (const [nom, page] of [["le client social", sophie], ["le client web", lea]]) {
  await page.goto(`${BASE}/portail`, { waitUntil: "domcontentloaded" });
  ok(`${nom} voit la bannière adressée à tous`, (await lire(page)).includes("Bonnes fêtes"));
}

/* ==================== 7. LES REFUS DU FORMULAIRE ======================= */

await admin.goto(`${BASE}/reglages`, { waitUntil: "domcontentloaded" });
await admin.fill('input[name="title"]', "Bouton bancal");
await admin.check('input[type="checkbox"]:near(:text("Ajouter un bouton"))');
await admin.fill('input[name="ctaLabel"]', "Cliquez");
await admin.click('button:has-text("Créer la bannière")');
await admin.waitForTimeout(1200);
ok(
  "un bouton sans adresse est refusé",
  (await lire(admin)).includes("Un bouton demande un intitulé et une adresse"),
);
ok("… et rien n'est enregistré", un(`select count(*) from promos where title='Bouton bancal'`) === "0");

/* ============ 8. L'ÉQUIPE N'ADMINISTRE PAS LES BANNIÈRES =============== */

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
await romain.goto(`${BASE}/reglages`, { waitUntil: "domcontentloaded" });
ok("un compte équipe n'atteint pas les réglages", !romain.url().includes("/reglages"));

// « redirect: manual » : une route qui renverrait vers l'accueil au lieu de
// répondre ferait suivre le navigateur et rendrait une page en 200, que le
// code appelant lirait comme un succès.
const refus = await romain.evaluate(async (u) => {
  const r = await fetch(u, {
    method: "POST",
    body: "x",
    redirect: "manual",
    headers: { "content-type": "image/png" },
  });
  return r.status;
}, `/api/promo?id=${promo}`);
ok(`… ni la route du visuel, qui répond au lieu de rediriger (${refus})`, refus === 403);
ok(
  "… et le visuel de la bannière n'a pas bougé",
  un(`select coalesce(image_path,'-') from promos where id='${promo}'`) === "-",
);

const refusMarque = await romain.evaluate(async () => {
  const r = await fetch("/api/branding?kind=logo", {
    method: "POST",
    body: "x",
    redirect: "manual",
    headers: { "content-type": "image/png" },
  });
  return r.status;
});
ok(`… ni celle des images de marque (${refusMarque})`, refusMarque === 403);

console.log(`\nerreurs JS : ${errs.length ? errs.join(" | ") : "aucune"}`);
await b.close();
