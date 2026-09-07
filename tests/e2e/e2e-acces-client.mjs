/**
 * L'accès au portail : le créer, le révoquer, le recréer ailleurs.
 *
 * Le cas qui a mordu en production : une adresse posée sur la mauvaise fiche
 * client, révoquée, puis refusée sur la bonne — « Un compte utilise déjà cette
 * adresse ». Révoquer désactive la ligne sans l'effacer (les validations du
 * contact restent rattachées à quelqu'un), donc l'adresse reste prise, et
 * l'écran ne montre plus la ligne qui la retient. Rien ne permettait de
 * comprendre le refus, ni d'en sortir sans passer par la base.
 *
 * On vérifie ici que le déblocage n'a pas ouvert de porte : un accès vivant
 * reste protégé, un compte de l'agence ne se transforme pas en compte client,
 * et un accès rouvert repart d'une invitation — pas de l'ancien mot de passe.
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
let rouges = 0;
const ok = (label, cond) => {
  if (!cond) rouges++;
  console.log(`${cond ? "OK  " : "ÉCHEC"} ${label}`);
};
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

async function creerClient(nom) {
  await admin.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
  await admin.locator('input[name="departments"][value="social"]').check();
  await admin.fill('input[name="name"]', nom);
  await admin.fill('input[name="contentTarget"]', "6");
  await admin.click('button:has-text("Créer le client")');
  await admin.waitForURL(/\/clients\/[0-9a-f-]{36}/, { timeout: 20000 });
  return admin.url().split("/").pop();
}

/** Soumet le formulaire d'accès et rend ce que l'écran affiche ensuite. */
async function soumettreAcces(clientId, nom, email) {
  await admin.goto(`${BASE}/clients/${clientId}`, { waitUntil: "domcontentloaded" });
  await admin.fill('input[name="contactName"]', nom);
  await admin.fill('input[name="contactEmail"]', email);
  await admin.click('button:has-text("Créer l\'accès")');
  await admin.waitForTimeout(1500);
  return admin.locator("body").innerText();
}

async function revoquer(clientId, email) {
  await admin.goto(`${BASE}/clients/${clientId}`, { waitUntil: "domcontentloaded" });
  const ligne = admin.locator("div").filter({ hasText: email }).last();
  await ligne.locator('button:has-text("Révoquer")').click();
  await admin.waitForTimeout(1500);
}

const mauvaise = await creerClient("Cap Marine");
const bonne = await creerClient("Bistrot Zoé");
const tierce = await creerClient("Garage Payet");

const ADRESSE = "contact@lebonclient.re";

/* ============ 1. L'ADRESSE POSÉE SUR LA MAUVAISE FICHE ================== */

await soumettreAcces(mauvaise, "Léa Hoarau", ADRESSE);
ok(
  "l'accès est créé sur la première fiche",
  un(`select client_id from users where email='${ADRESSE}'`) === mauvaise,
);
ok(
  "il attend son invitation : pas encore de mot de passe",
  un(`select password_hash is null from users where email='${ADRESSE}'`) === "t",
);

const lienMort = await admin.locator("input[readonly]").first().inputValue();
ok("un lien d'invitation est proposé à l'envoi", lienMort.includes("/invitation/"));

/* ==================== 2. LA RÉVOCATION ================================== */

await revoquer(mauvaise, ADRESSE);
const apresRevocation = await admin.locator("body").innerText();
ok("la fiche ne montre plus le contact révoqué", !apresRevocation.includes(ADRESSE));
ok(
  "la ligne reste en base, désactivée : l'historique garde son auteur",
  un(`select active from users where email='${ADRESSE}'`) === "f",
);

// C'est le cœur de la correction côté invitation : le lien encore en
// circulation ne doit plus ouvrir de compte.
const revoque = await onglet();
revoque.on("pageerror", (e) => errs.push(String(e)));
await revoque.goto(lienMort, { waitUntil: "domcontentloaded" });
await revoque.fill('input[name="password"]', "mot-de-passe-client-2026").catch(() => {});
await revoque.click('button[type="submit"]').catch(() => {});
await revoque.waitForTimeout(1200);
ok(
  "le lien d'invitation d'un accès révoqué ne donne plus rien",
  !revoque.url().includes("/portail") &&
    un(`select password_hash is null from users where email='${ADRESSE}'`) === "t",
);
await shot(revoque, "acces-lien-revoque");

/* ============ 3. LA MÊME ADRESSE SUR LA BONNE FICHE ===================== */

const ecran = await soumettreAcces(bonne, "Léa Hoarau", ADRESSE);
ok("plus de refus « adresse déjà utilisée »", !ecran.includes("utilise déjà cette adresse"));
ok("le contact apparaît sur la bonne fiche", ecran.includes(ADRESSE));
ok(
  "l'accès a changé de fiche, il n'a pas été dupliqué",
  un(`select count(*) from users where email='${ADRESSE}'`) === "1" &&
    un(`select client_id from users where email='${ADRESSE}'`) === bonne,
);
ok("l'accès est de nouveau actif", un(`select active from users where email='${ADRESSE}'`) === "t");
ok(
  "une invitation neuve est émise",
  un(`select invite_token is not null and invite_expires_at > now() from users where email='${ADRESSE}'`) === "t",
);
ok(
  "le compte reste un compte client, rattaché à un portail",
  un(`select role from users where email='${ADRESSE}'`) === "client",
);
await shot(admin, "acces-recree-bonne-fiche");

// L'accès rouvert sert vraiment : le contact choisit son mot de passe et entre.
const lienVivant = await admin.locator("input[readonly]").first().inputValue();
const lea = await onglet();
lea.on("pageerror", (e) => errs.push(String(e)));
await lea.goto(lienVivant, { waitUntil: "domcontentloaded" });
await lea.fill('input[name="password"]', "mot-de-passe-client-2026");
await lea.click('button[type="submit"]');
await lea.waitForURL(/portail/, { timeout: 20000 }).catch(() => {});
ok("le contact entre dans son portail avec la nouvelle invitation", lea.url().includes("/portail"));
// L'invitation redirige, et la redirection recharge : on attend la page
// d'arrivée plutôt que de lire un corps encore vide.
await lea.waitForLoadState("load");
await lea.waitForTimeout(500);
// Le bandeau du portail est en capitales par la feuille de style, et
// `innerText` rend ce que l'œil voit : la comparaison ignore la casse.
const portail = (await lea.locator("body").innerText()).toLowerCase();
ok("et c'est bien le portail de la bonne fiche", portail.includes("bistrot zoé"));

/* ============ 4. CE QUI DOIT RESTER REFUSÉ ============================== */

const surTierce = await soumettreAcces(tierce, "Quelqu'un d'autre", ADRESSE);
ok(
  "une adresse déjà active ailleurs est refusée",
  surTierce.includes("ouvre déjà le portail"),
);
ok("le refus nomme la fiche qui la détient", surTierce.includes("Bistrot Zoé"));
ok(
  "et l'accès vivant n'a pas bougé",
  un(`select client_id from users where email='${ADRESSE}'`) === bonne,
);

// Un compte de l'agence ne se recycle pas en compte client : ce serait un
// changement de rôle décidé par un formulaire qui ne le dit pas.
const interne = await soumettreAcces(tierce, "Emmanuel Taochy", "emmanuel@taochy.re");
ok(
  "l'adresse d'un compte de l'agence est refusée",
  interne.includes("compte de l'agence"),
);
ok(
  "le compte de l'agence garde son rôle",
  un(`select role from users where email='emmanuel@taochy.re'`) === "direction",
);
ok(
  "et il n'a pas été rattaché à un client",
  un(`select client_id is null from users where email='emmanuel@taochy.re'`) === "t",
);

// Le compte interne désactivé : refusé aussi, mais avec ce qu'il faut pour
// s'en sortir.
sql(`insert into users (email, name, initials, role, active) values ('ancien@taochy.re', 'Ancien Collègue', 'AC', 'equipe', false)`);
const ancien = await soumettreAcces(tierce, "Ancien Collègue", "ancien@taochy.re");
ok(
  "l'adresse d'un ancien compte de l'agence est refusée, et l'écran dit où aller",
  ancien.includes("ancien compte de l'agence") && ancien.includes("Équipe"),
);
ok(
  "il reste dans l'équipe, désactivé",
  un(`select role || ':' || active from users where email='ancien@taochy.re'`) === "equipe:false",
);

/* ============ 5. LE CAS ORDINAIRE N'A PAS CHANGÉ ======================== */

const neuve = await soumettreAcces(tierce, "Marc Payet", "marc@garage.re");
ok("une adresse jamais vue crée toujours un accès", neuve.includes("marc@garage.re"));
ok(
  "un seul compte, sur la fiche demandée",
  un(`select count(*) from users where email='marc@garage.re'`) === "1" &&
    un(`select client_id from users where email='marc@garage.re'`) === tierce,
);

console.log(`erreurs JS : ${errs.length}${errs.length ? " — " + errs.join(" | ") : ""}`);
await b.close();
process.exit(rouges > 0 || errs.length > 0 ? 1 : 0);
