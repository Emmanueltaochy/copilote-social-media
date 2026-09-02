import pw from "/opt/node22/lib/node_modules/playwright/index.js";
const { chromium } = pw;
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SP = "/tmp/claude-0/-home-claude/956d6f17-f290-5e1d-9e91-839fdc4ed875/scratchpad";
const BASE = "http://127.0.0.1:4030";
const sql = (q) =>
  execFileSync("psql", ["-h", "127.0.0.1", "-p", "5451", "-U", "postgres", "-d", "pilot", "-tA", "-c", q], {
    encoding: "utf8",
  }).trim();
const un = (q) => sql(q).split("\n")[0].trim();
const mails = () => readFileSync(`${SP}/mails.log`, "utf8");

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const errs = [];
const ok = (label, cond) => console.log(`${cond ? "OK  " : "ÉCHEC"} ${label}`);

async function onglet(w = 1440, h = 950) {
  const page = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
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

/* ---------------------------------------------------------- installation -- */

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

// Un accès portail pour le client.
await admin.fill('input[name="contactName"]', "Sophie Rivière");
await admin.fill('input[name="contactEmail"]', "sophie@capmarine.re");
await admin.click('button:has-text("Créer l\'accès")');
await admin.waitForSelector("text=Sophie Rivière", { timeout: 20000 });
const lienClient = await admin.locator("input[readonly]").first().inputValue();

const sophie = await onglet(1200, 950);
await sophie.goto(lienClient, { waitUntil: "domcontentloaded" });
await sophie.fill('input[name="password"]', "mot-de-passe-client-2026");
await sophie.click('button[type="submit"]');
await sophie.waitForURL(/portail/, { timeout: 20000 });

/* ======================= 1. PÔLES ET BASCULE ============================ */

ok(
  "l'admin a les deux pôles",
  un("select departments::text from users where email='emmanuel@taochy.re'") === '["social", "web"]',
);
const nav = await admin.textContent("aside");
ok("l'admin voit la bascule Social / Web", nav.includes("Social") && nav.includes("Web"));

await admin.goto(`${BASE}/web`, { waitUntil: "domcontentloaded" });
ok("il atteint le tableau des projets web", (await admin.textContent("body")).includes("Projets web"));

// Deux collaborateurs : un CM, un web.
for (const [nom, mail] of [["Romain CM", "romain@taochy.re"], ["Nina Web", "nina@taochy.re"]]) {
  await admin.goto(`${BASE}/equipe`, { waitUntil: "domcontentloaded" });
  await admin.fill('input[name="name"]', nom);
  await admin.fill('input[name="email"]', mail);
  await admin.click('button:has-text("Inviter")');
  await admin.waitForSelector(`text=${nom}`, { timeout: 20000 });
}

const idRomain = un("select id from users where email='romain@taochy.re'");
const idNina = un("select id from users where email='nina@taochy.re'");

ok(
  "un collaborateur invité démarre sur le social seul",
  un(`select departments::text from users where id='${idRomain}'`) === '["social"]',
);

// On bascule Nina sur le web seul.
await admin.goto(`${BASE}/equipe`, { waitUntil: "domcontentloaded" });
const casesNina = admin.locator(`[data-membre="${idNina}"] input[type="checkbox"]`);
await casesNina.nth(1).check(); // web
await admin.waitForTimeout(1200);
await casesNina.nth(0).uncheck(); // social
await admin.waitForTimeout(1500);
ok(
  `Nina passe sur le pôle web seul (${un(`select departments::text from users where id='${idNina}'`)})`,
  un(`select departments::text from users where id='${idNina}'`) === '["web"]',
);

// Les deux ouvrent leur session.
const jetonRomain = un(`select invite_token from users where id='${idRomain}'`);
const jetonNina = un(`select invite_token from users where id='${idNina}'`);
const romain = await onglet(1280, 900);
await romain.goto(`${BASE}/invitation/${jetonRomain}`, { waitUntil: "domcontentloaded" });
await romain.fill('input[name="password"]', "mot-de-passe-romain-2026");
await romain.click('button[type="submit"]');
await romain.waitForURL((u) => !u.pathname.includes("invitation"), { timeout: 20000 });

const nina = await onglet(1280, 900);
await nina.goto(`${BASE}/invitation/${jetonNina}`, { waitUntil: "domcontentloaded" });
await nina.fill('input[name="password"]', "mot-de-passe-nina-2026");
await nina.click('button[type="submit"]');
await nina.waitForURL((u) => !u.pathname.includes("invitation"), { timeout: 20000 });

await romain.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
const navRomain = await romain.textContent("aside");
ok("Romain (social) voit le menu social", navRomain.includes("Calendrier") && navRomain.includes("Tournages"));
ok("… et pas de bascule, il n'a qu'un pôle", !navRomain.includes("Web"));

await romain.goto(`${BASE}/web`, { waitUntil: "domcontentloaded" });
ok("Romain est renvoyé quand il tente le pôle web", !romain.url().includes("/web"));

await nina.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
ok("Nina (web) atterrit sur les projets web", nina.url().endsWith("/web"));
const navNina = await nina.textContent("aside");
ok("… avec le menu web", navNina.includes("Projets") && navNina.includes("Briefs"));
ok("… sans le calendrier éditorial", !navNina.includes("Calendrier"));
await nina.screenshot({ path: `${SP}/shots/w1-nina-web.png`, fullPage: true });

// L'admin bascule et le choix tient d'un écran à l'autre.
await admin.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await admin.click('aside button[name="pole"][value="web"]');
await admin.waitForURL(/\/web$/, { timeout: 20000 });
await admin.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
ok(
  "le pôle choisi survit à un écran partagé comme Clients",
  (await admin.textContent("aside")).includes("Briefs"),
);
await admin.click('aside button[name="pole"][value="social"]');
await admin.waitForURL(`${BASE}/`, { timeout: 20000 });
ok("et la bascule inverse ramène au social", (await admin.textContent("aside")).includes("Calendrier"));

/* ======================= 2. PROJET WEB ================================== */

await admin.click('aside button[name="pole"][value="web"]');
await admin.waitForURL(/\/web$/, { timeout: 20000 });
await admin.selectOption('select[name="clientId"]', client);
await admin.fill('input[name="name"]', "Boutique Cap Marine");
await admin.selectOption('select[name="type"]', "ecommerce");
await admin.fill('input[name="dueAt"]', "2026-11-15");
await admin.fill('input[name="price"]', "8500");
await admin.click('button:has-text("Créer le projet")');
await admin.waitForURL(/\/web\/[0-9a-f-]{36}/, { timeout: 20000 });
const projet = admin.url().split("/").pop();

const jalons = Number(un(`select count(*) from web_milestones where project_id='${projet}'`));
ok(`les jalons du type sont posés d'emblée (${jalons})`, jalons >= 10);
ok(
  "dont ceux propres à une boutique",
  Number(un(`select count(*) from web_milestones where project_id='${projet}' and label ilike '%paiement%'`)) === 1,
);
const fiche = await admin.textContent("body");
ok("la fiche annonce ce qui attend le client", fiche.includes("attendent le client") || fiche.includes("attend le client"));
await admin.screenshot({ path: `${SP}/shots/w2-projet.png`, fullPage: true });

// Avancer d'une étape depuis le tableau.
await admin.goto(`${BASE}/web`, { waitUntil: "domcontentloaded" });
const board = await admin.textContent("body");
ok(
  "le tableau a les huit étapes",
  ["Cadrage", "Brief", "Maquette", "Intégration", "Contenus", "Recette", "En ligne", "Maintenance"].every((c) =>
    board.includes(c),
  ),
);
await admin.click('button:has-text("→ Brief")');
await admin.waitForTimeout(1500);
ok("le bouton fait avancer d'une étape", un(`select phase from web_projects where id='${projet}'`) === "brief");

/* ======================= 3. BRIEF ======================================= */

const mailsAvant = (mails().match(/=== MAIL ===/g) ?? []).length;

await admin.goto(`${BASE}/web/${projet}`, { waitUntil: "domcontentloaded" });
await admin.click('button:has-text("Créer un brief")');
await admin.waitForURL(/\/web\/briefs\/[0-9a-f-]{36}/, { timeout: 20000 });
const brief = admin.url().split("/").pop();

const questions = Number(un(`select count(*) from brief_fields where brief_id='${brief}'`));
ok(`le brief reprend le modèle e-commerce (${questions} questions)`, questions > 15);
ok(
  "avec les questions propres à une boutique",
  Number(un(`select count(*) from brief_fields where brief_id='${brief}' and section='Boutique'`)) === 5,
);

// L'agence remplit une réponse elle-même.
await admin.fill('textarea >> nth=0', "Location de catamarans avec skipper au départ de Saint-Gilles.");
await admin.click("h1");
await admin.waitForTimeout(1500);
ok(
  "l'agence peut répondre à la place du client",
  un(`select count(*) from brief_fields where brief_id='${brief}' and answered_by_id is not null`) === "1",
);

// Envoi au client.
await admin.click('button:has-text("Envoyer au client")');
await admin.waitForSelector("text=Brief envoyé", { timeout: 30000 });
ok("le brief passe en « envoyé »", un(`select status from briefs where id='${brief}'`) === "envoye");

const nouveaux = mails().slice(mails().indexOf("=== MAIL ===", 0));
ok("un courriel est parti", (mails().match(/=== MAIL ===/g) ?? []).length > mailsAvant);
ok("… à l'adresse du contact", nouveaux.includes("sophie@capmarine.re"));
ok("… avec un lien vers le portail, pas le questionnaire", nouveaux.includes(`/portail/brief/${brief}`));

/* ======================= 4. LE CLIENT REMPLIT =========================== */

await sophie.goto(`${BASE}/portail`, { waitUntil: "domcontentloaded" });
const portail = await sophie.textContent("body");
ok("le portail annonce ce qu'on attend du client", portail.includes("Ce que nous attendons de vous"));
ok("… et nomme le brief", portail.includes("Brief"));
await sophie.screenshot({ path: `${SP}/shots/w3-portail.png`, fullPage: true });

// Le portail est découpé en sections : chacune a son adresse, l'accueil ne
// déroule plus tout.
await sophie.goto(`${BASE}/portail/projets`, { waitUntil: "domcontentloaded" });
ok(
  "le projet web apparaît avec son avancement",
  (await sophie.textContent("body")).includes("Boutique Cap Marine"),
);
await sophie.goto(`${BASE}/portail/charte`, { waitUntil: "domcontentloaded" });
ok(
  "la charte graphique a sa page",
  (await sophie.textContent("body")).includes("Votre charte graphique"),
);
await sophie.goto(`${BASE}/portail/documents`, { waitUntil: "domcontentloaded" });
ok("le dépôt de fichiers aussi", (await sophie.textContent("body")).includes("Vos documents"));

await sophie.goto(`${BASE}/portail/brief/${brief}`, { waitUntil: "domcontentloaded" });
ok("le client ouvre le brief", (await sophie.textContent("body")).includes("Brief"));
ok(
  "il retrouve la réponse déjà écrite par l'agence",
  (await sophie.locator("textarea").first().inputValue()).includes("catamarans"),
);

// Il répond à toutes les questions obligatoires.
const obligatoires = Number(
  un(`select count(*) from brief_fields where brief_id='${brief}' and required`),
);
for (let i = 0; i < 40; i += 1) {
  const restant = Number(
    un(`select count(*) from brief_fields where brief_id='${brief}' and required and coalesce(answer,'')=''`),
  );
  if (restant === 0) break;
  const [id, kind] = un(
    `select id||'|'||kind from brief_fields where brief_id='${brief}' and required and coalesce(answer,'')='' order by position limit 1`,
  ).split("|");
  const champ = sophie.locator(`[data-champ="${id}"]`);
  const existe = (await champ.count()) > 0;
  if (!existe) break;
  if (kind === "choix") {
    const options = await champ.locator("option").allTextContents();
    await champ.selectOption({ label: options[1] });
  } else if (kind === "nombre") {
    await champ.fill("120");
  } else {
    await champ.fill("Réponse du client.");
  }
  await sophie.click("h1");
  await sophie.waitForTimeout(500);
}

ok(
  `le client a répondu à toutes les questions obligatoires (${obligatoires})`,
  Number(un(`select count(*) from brief_fields where brief_id='${brief}' and required and coalesce(answer,'')=''`)) === 0,
);
ok(
  "le brief reste « en cours » tant que le client ne l'a pas déclaré fini",
  un(`select status from briefs where id='${brief}'`) === "en_cours",
);
ok(
  "l'agence a pourtant déjà toutes les réponses",
  Number(un(`select count(*) from brief_fields where brief_id='${brief}' and coalesce(answer,'') <> ''`)) >= 10,
);

// Le bouton de fin.
await sophie.click('button:has-text("J\'ai rempli le brief")');
await sophie.waitForSelector("text=nous prenons la suite", { timeout: 20000 });
ok("le client déclare le brief terminé", un(`select status from briefs where id='${brief}'`) === "complete");
ok("… et la date est posée", un(`select completed_at is not null from briefs where id='${brief}'`) === "t");
ok(
  "l'équipe est prévenue",
  Number(un(`select count(*) from notifications where title like 'Brief terminé%'`)) >= 1,
);
await sophie.screenshot({ path: `${SP}/shots/w5-brief-termine.png`, fullPage: true });
ok(
  "les réponses du client ne sont attribuées à personne en interne",
  Number(un(`select count(*) from brief_fields where brief_id='${brief}' and answered_at is not null and answered_by_id is null`)) > 5,
);

await sophie.goto(`${BASE}/portail`, { waitUntil: "domcontentloaded" });
ok(
  "la tâche disparaît du portail une fois le brief complet",
  !(await sophie.textContent("body")).includes("questions obligatoires sans réponse"),
);

/* ======================= 5. CHARTE ET FICHIERS ========================== */

await sophie.goto(`${BASE}/portail/charte`, { waitUntil: "domcontentloaded" });
await sophie.fill('input[name="palette"]', "#0F3B57 #2E9BC4");
await sophie.fill('input[name="fonts"]', "Montserrat, Georgia");
await sophie.fill('textarea[name="voice"]', "Chaleureux, on tutoie.");
await sophie.click('button:has-text("Enregistrer")');
await sophie.waitForSelector("text=✓ Enregistré", { timeout: 20000 });
ok(
  "la charte remplie par le client est enregistrée",
  un(`select palette::text from brands where client_id='${client}'`) === '["#0F3B57", "#2E9BC4"]',
);

await admin.goto(`${BASE}/clients/${client}`, { waitUntil: "domcontentloaded" });
ok("l'agence voit le même document", (await admin.textContent("body")).includes("Montserrat"));

// Dépôt d'une pièce jointe depuis le portail.
await sophie.goto(`${BASE}/portail/documents`, { waitUntil: "domcontentloaded" });
await sophie.setInputFiles('input[type="file"]', `${SP}/contrat.pdf`);
await sophie.locator('button:has-text("Envoyer")').first().click();
await sophie.waitForTimeout(6000);
ok(
  "le client peut déposer un fichier",
  Number(un(`select count(*) from client_files where client_id='${client}' and uploaded_by_id = (select id from users where email='sophie@capmarine.re')`)) === 1,
);

const idFichier = un(`select id from client_files where client_id='${client}' limit 1`);
const lecture = await sophie.evaluate(
  async (u) => (await fetch(u, { cache: "no-store" })).status,
  `/api/client-files/${idFichier}`,
);
ok("il peut le relire", lecture === 200);

/* ======================= 6. CLOISONNEMENT =============================== */

const autreClient = await onglet(1100, 800);
await admin.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
// L'admin est sur le pôle web : le formulaire coche Web d'avance et ne
// propose donc pas le forfait social tant qu'on n'a pas coché Réseaux sociaux.
await admin.check('input[name="departments"][value="social"]');
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
await autreClient.goto(lienZoe, { waitUntil: "domcontentloaded" });
await autreClient.fill('input[name="password"]', "mot-de-passe-zoe-2026");
await autreClient.click('button[type="submit"]');
await autreClient.waitForURL(/portail/, { timeout: 20000 });

const volBrief = await autreClient.goto(`${BASE}/portail/brief/${brief}`, {
  waitUntil: "domcontentloaded",
});
ok(`un client n'ouvre pas le brief d'un autre (statut ${volBrief.status()})`, volBrief.status() === 404);

const volFichier = await autreClient.evaluate(
  async (u) => (await fetch(u, { cache: "no-store" })).status,
  `/api/client-files/${idFichier}`,
);
ok(`ni ses fichiers (statut ${volFichier})`, volFichier === 403);

/* ======================= 7. RÉGLAGES ET COULEURS ======================== */

await admin.goto(`${BASE}/reglages`, { waitUntil: "domcontentloaded" });
await admin.fill('input[name="agencyName"]', "Taochy Consulting");
await admin.fill('input[name="primaryColor"]', "#1E88E5");
await admin.fill('input[name="darkColor"]', "#0B1E2D");
await admin.click('button:has-text("Enregistrer")');
await admin.waitForSelector("text=Réglages enregistrés", { timeout: 20000 });
ok(
  "les couleurs sont enregistrées",
  un("select primary_color||' '||dark_color from settings where id='agence'") === "#1E88E5 #0B1E2D",
);
await admin.screenshot({ path: `${SP}/shots/w4-reglages.png`, fullPage: true });

await sophie.goto(`${BASE}/portail`, { waitUntil: "domcontentloaded" });
// Le bandeau de marque est désormais l'en-tête de la coquille du portail.
const fond = await sophie
  .locator("header")
  .first()
  .evaluate((e) => getComputedStyle(e).backgroundColor);
ok(`le portail reprend le fond réglé (${fond})`, fond === "rgb(11, 30, 45)");

// Un compte non-direction ne règle rien.
await nina.goto(`${BASE}/reglages`, { waitUntil: "domcontentloaded" });
ok("un compte équipe n'atteint pas les réglages", !nina.url().includes("/reglages"));

console.log("\nerreurs JS :", errs.length ? errs : "aucune");
await b.close();
