/**
 * La demande de devis, depuis le portail client.
 *
 * Un client qui a une idée l'a le soir, pas au moment où on l'appelle. On
 * vérifie ici qu'il peut la déposer, qu'elle arrive chez la direction, qu'il
 * suit son avancement sans rappeler, et qu'il ne peut pas la déposer au nom
 * d'une autre entreprise.
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
const mails = () => {
  try {
    return execFileSync("cat", [`${SP}/mails.log`], { encoding: "utf8" });
  } catch {
    return "";
  }
};

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

/* ==================== 1. LE CLIENT DÉPOSE SA DEMANDE ==================== */

await sophie.goto(`${BASE}/portail`, { waitUntil: "domcontentloaded" });
ok("l'onglet Devis est proposé au client", (await sophie.textContent("nav")).includes("Devis"));

await sophie.click('nav a:has-text("Devis")');
await sophie.waitForURL(/\/portail\/devis/, { timeout: 20000 });
ok("la page invite à décrire son projet", (await lire(sophie)).includes("Demander un devis"));

const avantMails = (mails().match(/=== MAIL ===/g) ?? []).length;

await sophie.selectOption('select[name="kind"]', "site");
await sophie.fill('input[name="subject"]', "Refonte du site avec réservation en ligne");
await sophie.fill('textarea[name="details"]', "Nos clients réservent par téléphone, on aimerait en ligne.");
await sophie.fill('input[name="budget"]', "Autour de 6 000 €");
await sophie.fill('input[name="deadline"]', "2026-11-30");
await sophie.click('button:has-text("Envoyer ma demande")');
await sophie.waitForSelector("text=Votre demande est partie", { timeout: 20000 });

const devis = un(`select id from quote_requests`);
ok("la demande est enregistrée", devis.length === 36);
ok(
  "… au nom du bon client et de la bonne personne",
  un(`select client_id from quote_requests where id='${devis}'`) === capMarine &&
    un(`select u.email from quote_requests q join users u on u.id=q.requested_by_id where q.id='${devis}'`) ===
      "sophie@capmarine.re",
);
ok(
  "… avec ce qu'elle a rempli",
  un(`select kind || '|' || budget || '|' || deadline from quote_requests where id='${devis}'`) ===
    "site|Autour de 6 000 €|2026-11-30",
);
ok("… et démarre en « nouvelle »", un(`select status from quote_requests where id='${devis}'`) === "nouvelle");
await shot(sophie, "devis-portail");

/* ============ 2. L'AGENCE EST PRÉVENUE, ET TOUT DE SUITE =============== */

ok(
  "la direction reçoit une notification",
  Number(un(`select count(*) from notifications where kind='devis'`)) === 1,
);
ok(
  "… qui nomme le client et le sujet",
  un(`select title from notifications where kind='devis'`).includes("Cap Marine"),
);
ok(
  "un courriel part aussi : une demande de devis ne peut pas attendre",
  (mails().match(/=== MAIL ===/g) ?? []).length > avantMails,
);

/* ==================== 3. L'AGENCE LA TRAITE ============================ */

await admin.goto(`${BASE}/devis`, { waitUntil: "domcontentloaded" });
let vue = await lire(admin);
ok("l'écran de l'agence liste la demande", vue.includes("Refonte du site avec réservation en ligne"));
ok("… avec le budget annoncé", vue.includes("Autour de 6 000 €"));
ok("… et le détail écrit par le client", vue.includes("on aimerait en ligne"));
await shot(admin, "devis-agence");

await admin.selectOption(`[data-devis="${devis}"] select[name="status"]`, "envoye");
await admin.fill(`[data-devis="${devis}"] input[name="agencyNote"]`, "Devis à 6 400 € envoyé le 3.");
await admin.click(`[data-devis="${devis}"] button:has-text("Enregistrer")`);
await admin.waitForTimeout(1500);
ok("le statut avance", un(`select status from quote_requests where id='${devis}'`) === "envoye");
ok(
  "… et la note interne est gardée",
  un(`select agency_note from quote_requests where id='${devis}'`) === "Devis à 6 400 € envoyé le 3.",
);

/* ============ 4. LE CLIENT SUIT SANS AVOIR À RAPPELER ================== */

await sophie.goto(`${BASE}/portail/devis`, { waitUntil: "domcontentloaded" });
vue = await lire(sophie);
ok("le client voit que son devis est parti", vue.includes("Devis envoyé"));
ok("… mais pas la note interne de l'agence", !vue.includes("6 400"));

/* ============ 5. CHACUN CHEZ SOI ====================================== */

await zoe.goto(`${BASE}/portail/devis`, { waitUntil: "domcontentloaded" });
ok(
  "un autre client ne voit pas la demande du premier",
  !(await lire(zoe)).includes("Refonte du site"),
);

// Une demande déposée depuis un autre compte reste attachée à son client.
await zoe.fill('input[name="subject"]', "Menu photo pour la carte d'hiver");
await zoe.click('button:has-text("Envoyer ma demande")');
await zoe.waitForSelector("text=Votre demande est partie", { timeout: 20000 });
ok(
  "sa propre demande part sous son entreprise",
  un(`select client_id from quote_requests where subject='Menu photo pour la carte d''hiver'`) === bistrot,
);
await sophie.goto(`${BASE}/portail/devis`, { waitUntil: "domcontentloaded" });
ok(
  "… et n'apparaît pas chez le premier",
  !(await lire(sophie)).includes("Menu photo"),
);

/* ============ 6. LE FORMULAIRE REFUSE CE QUI EST VIDE ================== */

await sophie.goto(`${BASE}/portail/devis`, { waitUntil: "domcontentloaded" });
const avant = Number(un(`select count(*) from quote_requests`));
await sophie.evaluate(() => {
  // Le champ est « required » : on retire la contrainte du navigateur pour
  // vérifier que le serveur refuse aussi, et pas seulement le formulaire.
  document.querySelector('input[name="subject"]')?.removeAttribute("required");
});
await sophie.click('button:has-text("Envoyer ma demande")');
await sophie.waitForTimeout(1500);
ok(
  "une demande sans objet est refusée par le serveur",
  (await lire(sophie)).includes("Dites en une ligne ce que vous souhaitez"),
);
ok("… et rien n'est enregistré", Number(un(`select count(*) from quote_requests`)) === avant);

/* ============ 7. L'ÉQUIPE VOIT LES DEMANDES, PAS LE CLIENT ============= */

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
await romain.goto(`${BASE}/devis`, { waitUntil: "domcontentloaded" });
ok("l'équipe accède aux demandes", (await lire(romain)).includes("Refonte du site"));

// Un compte client n'entre pas dans l'écran de l'agence.
await sophie.goto(`${BASE}/devis`, { waitUntil: "domcontentloaded" });
ok("un compte client est renvoyé à son portail", sophie.url().includes("/portail"));

console.log(`\nerreurs JS : ${errs.length ? errs.join(" | ") : "aucune"}`);
await b.close();
