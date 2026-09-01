/**
 * La bibliothèque se range en dossiers.
 *
 * Le mur de vignettes mélangeait les carrousels livrés et les photos brutes du
 * même shooting. On vérifie ici qu'on peut créer une arborescence, importer
 * directement dedans, déplacer ce qui existe déjà, et que supprimer un dossier
 * ne fait jamais disparaître un média.
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
const p = await (await b.newContext({ viewport: { width: 1440, height: 950 } })).newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));
const ok = (label, cond) => console.log(`${cond ? "OK  " : "ÉCHEC"} ${label}`);
const shot = (n) => p.screenshot({ path: `${SP}/shots/${n}.png`, fullPage: true });
const lire = async (sel = "main") => (await p.textContent(sel)).replace(/[  ]/g, " ");

/* ---------------------------------------------------------- installation -- */

await p.goto(`${BASE}/bienvenue`, { waitUntil: "domcontentloaded" });
await p.fill('input[name="name"]', "Emmanuel Taochy");
await p.fill('input[name="email"]', "emmanuel@taochy.re");
await p.fill('input[name="password"]', "motdepasse-solide-2026");
await p.click('button[type="submit"]');
await p.waitForURL(`${BASE}/`, { timeout: 20000 });

async function creerClient(nom) {
  await p.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
  await p.fill('input[name="name"]', nom);
  await p.fill('input[name="contentTarget"]', "8");
  await p.click('button:has-text("Créer le client")');
  await p.waitForURL(/\/clients\/[0-9a-f-]{36}/, { timeout: 20000 });
  return p.url().split("/").pop();
}

const capMarine = await creerClient("Cap Marine");
const bistrot = await creerClient("Bistrot Zoé");

/** Importe une photo dans le dossier ouvert (ou à la racine). */
async function importer() {
  await p.setInputFiles('input[type="file"]', `${SP}/photo-test.jpg`);
  await p.click('button:has-text("Importer")');
  await p.waitForSelector("text=Import terminé", { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(600);
}

/* ================= 1. CRÉER UNE ARBORESCENCE ============================ */

await p.goto(`${BASE}/assets?client=${capMarine}`, { waitUntil: "domcontentloaded" });
await p.fill('input[name="name"]', "Shooting mars");
await p.click('button:has-text("Créer le dossier")');
await p.waitForSelector("[data-dossier]", { timeout: 20000 });
const shooting = un(`select id from asset_folders where name='Shooting mars'`);
ok("un dossier se crée à la racine du client", shooting.length === 36);
ok(
  "il appartient au client ouvert, pas à un autre",
  un(`select client_id from asset_folders where id='${shooting}'`) === capMarine,
);

// Entrer dans le dossier, puis y créer deux sous-dossiers.
await p.goto(`${BASE}/assets?client=${capMarine}&dossier=${shooting}`, { waitUntil: "domcontentloaded" });
await p.fill('input[name="name"]', "Brut");
await p.click('button:has-text("Créer le dossier")');
await p.waitForSelector("[data-dossier]", { timeout: 20000 });
await p.fill('input[name="name"]', "Carrousels livrés");
await p.click('button:has-text("Créer le dossier")');
await p.waitForFunction(() => document.querySelectorAll("[data-dossier]").length === 2, null, { timeout: 20000 });

const brut = un(`select id from asset_folders where name='Brut'`);
const livres = un(`select id from asset_folders where name='Carrousels livrés'`);
ok(
  "un sous-dossier se range sous le dossier ouvert",
  un(`select parent_id from asset_folders where id='${brut}'`) === shooting &&
    un(`select parent_id from asset_folders where id='${livres}'`) === shooting,
);

let txt = await lire();
ok("le fil d'Ariane montre où l'on se trouve", txt.includes("Cap Marine") && txt.includes("Shooting mars"));
ok("les deux sous-dossiers sont listés", txt.includes("Brut") && txt.includes("Carrousels livrés"));
await shot("dossiers-arborescence");

/* ============ 2. L'IMPORT ATTERRIT DANS LE DOSSIER OUVERT =============== */

await p.goto(`${BASE}/assets?client=${capMarine}&dossier=${brut}`, { waitUntil: "domcontentloaded" });
ok(
  "le formulaire d'import propose le client et le dossier ouverts",
  (await p.locator("select").first().inputValue()) === capMarine &&
    (await p.locator('select').nth(1).inputValue()) === brut,
);
await importer();
ok(
  "la photo importée est rangée dans le dossier ouvert",
  un(`select folder_id from assets where client_id='${capMarine}'`) === brut,
);
txt = await lire();
ok("elle apparaît dans le dossier", txt.includes("photo-test.jpg"));

await p.goto(`${BASE}/assets?client=${capMarine}&dossier=${livres}`, { waitUntil: "domcontentloaded" });
txt = await lire();
ok("… et pas dans le dossier voisin", !txt.includes("photo-test.jpg"));
ok("… qui se dit vide", txt.includes("Ce dossier est vide"));

/* ================ 3. RANGER UN MÉDIA DÉJÀ IMPORTÉ ======================= */

await p.goto(`${BASE}/assets?client=${capMarine}`, { waitUntil: "domcontentloaded" });
await importer();
const racine = un(
  `select id from assets where client_id='${capMarine}' and folder_id is null`,
);
ok("un import à la racine y reste", racine.length === 36);
txt = await lire();
ok("l'écran signale ce qui traîne à la racine", txt.includes("encore à la racine"));

// La liste déroulante de rangement est la 3e du média (client, dossier d'import, puis la sienne).
await p.selectOption(`form:has(input[value="${racine}"]) select[name="folderId"]`, livres);
await p.waitForTimeout(1200);
ok(
  "le choix d'un dossier range le média aussitôt",
  un(`select folder_id from assets where id='${racine}'`) === livres,
);

await p.goto(`${BASE}/assets?client=${capMarine}&dossier=${livres}`, { waitUntil: "domcontentloaded" });
txt = await lire();
ok("il apparaît dans son nouveau dossier", txt.includes("photo-test.jpg"));

/* ============== 4. LES DOSSIERS NE FUITENT PAS D'UN CLIENT À L'AUTRE ==== */

await p.goto(`${BASE}/assets?client=${bistrot}`, { waitUntil: "domcontentloaded" });
txt = await lire();
ok(
  "les dossiers d'un autre client ne sont pas proposés",
  !txt.includes("Shooting mars") && !txt.includes("Carrousels livrés"),
);

// Une tentative directe : ranger le média de Cap Marine dans un dossier
// fabriqué à la main n'aboutit pas côté serveur.
sql(`insert into asset_folders (id, client_id, name) values ('11111111-1111-1111-1111-111111111111','${bistrot}','Piège')`);
await p.goto(`${BASE}/assets?client=${capMarine}&dossier=${livres}`, { waitUntil: "domcontentloaded" });
ok(
  "le dossier d'un autre client n'est pas dans la liste de rangement",
  !(await lire()).includes("Piège"),
);

/* ================= 5. SUPPRIMER UN DOSSIER NE PERD RIEN ================= */

const avant = Number(un(`select count(*) from assets where client_id='${capMarine}'`));
await p.goto(`${BASE}/assets?client=${capMarine}&dossier=${shooting}`, { waitUntil: "domcontentloaded" });
await p.click(`[data-dossier="${livres}"] button[type="submit"]`);
await p.waitForTimeout(1200);
ok(
  "le dossier supprimé disparaît",
  un(`select count(*) from asset_folders where id='${livres}'`) === "0",
);
ok(
  "aucun média n'est perdu",
  Number(un(`select count(*) from assets where client_id='${capMarine}'`)) === avant,
);
ok(
  "son contenu remonte dans le dossier parent",
  un(`select folder_id from assets where id='${racine}'`) === shooting,
);

// Supprimer un dossier qui porte des sous-dossiers les fait remonter aussi.
await p.goto(`${BASE}/assets?client=${capMarine}`, { waitUntil: "domcontentloaded" });
await p.click(`[data-dossier="${shooting}"] button[type="submit"]`);
await p.waitForTimeout(1200);
ok(
  "un sous-dossier remonte au lieu de disparaître avec son parent",
  un(`select count(*) from asset_folders where id='${brut}'`) === "1" &&
    un(`select parent_id from asset_folders where id='${brut}'`) === "",
);
ok(
  "et le média du dossier supprimé revient à la racine",
  un(`select folder_id from assets where id='${racine}'`) === "",
);
ok(
  "toujours aucun média perdu",
  Number(un(`select count(*) from assets where client_id='${capMarine}'`)) === avant,
);
await shot("dossiers-apres-suppression");

/* ============ 6. SANS CLIENT CHOISI, LA BIBLIOTHÈQUE RESTE PLATE ======== */

await p.goto(`${BASE}/assets`, { waitUntil: "domcontentloaded" });
txt = await lire();
ok(
  "tous les clients confondus, tous les médias sont visibles",
  (txt.match(/photo-test\.jpg/g) ?? []).length === avant,
);
ok("… et aucun fil d'Ariane ne s'affiche", !txt.includes("Créer le dossier"));

console.log(`\nerreurs JS : ${errs.length ? errs.join(" | ") : "aucune"}`);
await b.close();
