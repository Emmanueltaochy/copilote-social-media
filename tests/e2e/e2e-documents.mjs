/**
 * Les documents d'un client ont deux natures.
 *
 * Le contrat signé et la grille tarifaire vivent dans le même dossier que le
 * devis validé et la charte livrée. Jusqu'ici tout ce que l'équipe déposait
 * apparaissait dans le portail : on vérifie ici que le partage est devenu un
 * geste explicite, et que l'interne l'est vraiment — y compris pour qui tente
 * l'adresse du fichier directement.
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
const onglet = async () => (await b.newContext({ viewport: { width: 1400, height: 950 } })).newPage();
const errs = [];
const ok = (label, cond) => console.log(`${cond ? "OK  " : "ÉCHEC"} ${label}`);

const admin = await onglet();
admin.on("pageerror", (e) => errs.push(String(e)));
const shot = (page, n) => page.screenshot({ path: `${SP}/shots/${n}.png`, fullPage: true });

/* ---------------------------------------------------------- installation -- */

await admin.goto(`${BASE}/bienvenue`, { waitUntil: "domcontentloaded" });
await admin.fill('input[name="name"]', "Emmanuel Taochy");
await admin.fill('input[name="email"]', "emmanuel@taochy.re");
await admin.fill('input[name="password"]', "motdepasse-solide-2026");
await admin.click('button[type="submit"]');
await admin.waitForURL(`${BASE}/`, { timeout: 20000 });

await admin.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
await admin.fill('input[name="name"]', "Cap Marine");
await admin.fill('input[name="contentTarget"]', "6");
await admin.click('button:has-text("Créer le client")');
await admin.waitForURL(/\/clients\/[0-9a-f-]{36}/, { timeout: 20000 });
const client = admin.url().split("/").pop();

await admin.fill('input[name="contactName"]', "Sophie Rivière");
await admin.fill('input[name="contactEmail"]', "sophie@capmarine.re");
await admin.click('button:has-text("Créer l\'accès")');
await admin.waitForSelector("text=Sophie Rivière", { timeout: 20000 });
const lien = await admin.locator("input[readonly]").first().inputValue();

const sophie = await onglet();
await sophie.goto(lien, { waitUntil: "domcontentloaded" });
await sophie.fill('input[name="password"]', "mot-de-passe-client-2026");
await sophie.click('button[type="submit"]');
await sophie.waitForURL(/portail/, { timeout: 20000 });

/* =============== 1. DÉPOSER UN DOCUMENT, INTERNE OU PARTAGÉ ============= */

/** Joint un document depuis la fiche client. */
async function joindre(intitule, partager) {
  await admin.goto(`${BASE}/clients/${client}`, { waitUntil: "domcontentloaded" });
  await admin.fill('input[placeholder^="Intitulé"]', intitule);
  const casePartage = admin.locator('input[type="checkbox"]:near(:text("Partager avec le client"))').first();
  if (partager) await casePartage.check();
  else await casePartage.uncheck();
  await admin.setInputFiles('input[type="file"]', `${SP}/photo-test.jpg`);
  await admin.click('button:has-text("Joindre")');
  await admin.waitForTimeout(2000);
  return un(`select id from client_files where label='${intitule}'`);
}

const contrat = await joindre("Contrat 2026", false);
const charte = await joindre("Charte livrée", true);

ok(
  "un document joint sans rien cocher reste interne",
  un(`select visibility from client_files where id='${contrat}'`) === "interne",
);
ok(
  "la case « Partager » le rend visible au client",
  un(`select visibility from client_files where id='${charte}'`) === "client",
);

await admin.goto(`${BASE}/clients/${client}`, { waitUntil: "domcontentloaded" });
let vueAgence = await admin.textContent("main");
ok("la fiche montre les deux documents", vueAgence.includes("Contrat 2026") && vueAgence.includes("Charte livrée"));
ok(
  "chacun affiche son état",
  (await admin.textContent(`[data-fichier="${contrat}"]`)).includes("Interne") &&
    (await admin.textContent(`[data-fichier="${charte}"]`)).includes("Partagé"),
);
await shot(admin, "documents-fiche");

/* ================== 2. LE PORTAIL NE MONTRE QUE LE PARTAGÉ ============== */

await sophie.goto(`${BASE}/portail/documents`, { waitUntil: "domcontentloaded" });
let vueClient = await sophie.textContent("main");
ok("le client voit le document partagé", vueClient.includes("Charte livrée"));
ok("le contrat interne n'apparaît pas dans son portail", !vueClient.includes("Contrat 2026"));

/** Le statut d'un téléchargement, tel que le voit le client. */
const statut = (page, id) =>
  page.evaluate(async (u) => (await fetch(u, { cache: "no-store" })).status, `/api/client-files/${id}`);

ok(`le fichier interne lui est refusé (${await statut(sophie, contrat)})`, (await statut(sophie, contrat)) === 403);
ok(`le fichier partagé s'ouvre (${await statut(sophie, charte)})`, (await statut(sophie, charte)) === 200);
ok("l'agence, elle, ouvre les deux", (await statut(admin, contrat)) === 200);

/* ==================== 3. LE PARTAGE SE BASCULE ========================== */

await admin.goto(`${BASE}/clients/${client}`, { waitUntil: "domcontentloaded" });
await admin.click(`[data-fichier="${contrat}"] form button:has-text("Interne")`);
await admin.waitForTimeout(1500);
ok(
  "un clic partage le contrat",
  un(`select visibility from client_files where id='${contrat}'`) === "client",
);
ok("… et le client peut alors l'ouvrir", (await statut(sophie, contrat)) === 200);

await admin.goto(`${BASE}/clients/${client}`, { waitUntil: "domcontentloaded" });
await admin.click(`[data-fichier="${contrat}"] form button:has-text("Partagé")`);
await admin.waitForTimeout(1500);
ok(
  "un second clic le retire du portail",
  un(`select visibility from client_files where id='${contrat}'`) === "interne",
);
ok("… et l'accès redevient refusé", (await statut(sophie, contrat)) === 403);

await sophie.goto(`${BASE}/portail/documents`, { waitUntil: "domcontentloaded" });
ok("… y compris dans la liste", !(await sophie.textContent("main")).includes("Contrat 2026"));

/* ============ 4. CE QUE LE CLIENT DÉPOSE RESTE VISIBLE POUR LUI ========= */

await sophie.goto(`${BASE}/portail/documents`, { waitUntil: "domcontentloaded" });
await sophie.setInputFiles('input[type="file"]', `${SP}/photo-test.jpg`);
await sophie.click('button:has-text("Envoyer")');
await sophie.waitForTimeout(2500);
const duClient = un(
  `select id from client_files where uploaded_by_id=(select id from users where email='sophie@capmarine.re')`,
);
ok("le dépôt du client est enregistré", duClient.length === 36);
ok(
  "… et reste visible pour lui : c'est lui qui l'a envoyé",
  un(`select visibility from client_files where id='${duClient}'`) === "client",
);
await sophie.goto(`${BASE}/portail/documents`, { waitUntil: "domcontentloaded" });
ok(
  "il le retrouve dans la liste de ce qu'il nous envoie",
  (await sophie.textContent("main")).includes("Ce que vous nous envoyez"),
);

/* ============ 5. UN LIVRABLE PUBLIÉ EST PARTAGÉ D'OFFICE =============== */

sql(`update clients set departments='["social", "web"]'::jsonb where id='${client}'`);
await admin.goto(`${BASE}/web`, { waitUntil: "domcontentloaded" });
await admin.click('aside button[name="pole"][value="web"]').catch(() => {});
await admin.goto(`${BASE}/web`, { waitUntil: "domcontentloaded" });
await admin.selectOption('select[name="clientId"]', client);
await admin.fill('input[name="name"]', "Site vitrine");
await admin.click('button:has-text("Créer le projet")');
await admin.waitForURL(/\/web\/[0-9a-f-]{36}/, { timeout: 20000 });

await admin.fill('[data-form="livrable"] input[name="label"]', "Maquette accueil");
// Le formulaire propose d'abord un lien : le champ fichier n'existe qu'après
// avoir choisi ce mode.
await admin.click('[data-form="livrable"] button:has-text("Un fichier")');
await admin.setInputFiles('[data-form="livrable"] input[type="file"]', `${SP}/photo-test.jpg`);
await admin.click(`[data-form="livrable"] button:has-text("Soumettre au client")`);
await admin.waitForTimeout(2500);

const fichierLivrable = un(
  `select file_id from web_deliverables where label='Maquette accueil'`,
);
ok("le livrable porte bien un fichier", fichierLivrable.length === 36);
ok(
  "une maquette publiée est partagée d'office",
  un(`select visibility from client_files where id='${fichierLivrable}'`) === "client",
);
ok("… et le client l'ouvre sans erreur", (await statut(sophie, fichierLivrable)) === 200);

console.log(`\nerreurs JS : ${errs.length ? errs.join(" | ") : "aucune"}`);
await b.close();
