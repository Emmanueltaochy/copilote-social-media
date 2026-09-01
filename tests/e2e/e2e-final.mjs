import pw from "/opt/node22/lib/node_modules/playwright/index.js";
const { chromium } = pw;
import { execFileSync } from "node:child_process";

const SP = "/tmp/claude-0/-home-claude/956d6f17-f290-5e1d-9e91-839fdc4ed875/scratchpad";
const BASE = "http://127.0.0.1:4030";
const sql = (q) =>
  execFileSync("psql", ["-h", "127.0.0.1", "-p", "5451", "-U", "postgres", "-d", "pilot", "-tA", "-c", q], {
    encoding: "utf8",
  }).trim();

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const agence = await b.newContext({ viewport: { width: 1440, height: 950 } });
const page = await agence.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
const shot = (n) => page.screenshot({ path: `${SP}/shots/${n}.png`, fullPage: true });
const firstLine = (s) => s.split("\n")[0].trim();
const ok = (label, cond) => console.log(`${cond ? "OK  " : "ÉCHEC"} ${label}`);

/* ---------------------------------------------------------- installation -- */

await page.goto(`${BASE}/bienvenue`, { waitUntil: "domcontentloaded" });
await page.fill('input[name="name"]', "Emmanuel Taochy");
await page.fill('input[name="email"]', "emmanuel@taochy.re");
await page.fill('input[name="password"]', "motdepasse-solide-2026");
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/`, { timeout: 20000 });

async function creerClient(nom, secteur) {
  await page.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="name"]', nom);
  await page.fill('input[name="sector"]', secteur);
  await page.fill('input[name="monthlyFee"]', "2400");
  await page.fill('input[name="contentTarget"]', "16");
  await page.fill('input[name="hoursSold"]', "30");
  await page.click('button:has-text("Créer le client")');
  await page.waitForURL(/\/clients\/[0-9a-f-]{36}/, { timeout: 20000 });
  return page.url().split("/").pop();
}

const capMarine = await creerClient("Cap Marine", "Nautisme");
const bistrot = await creerClient("Bistrot Zoé", "Restauration");
console.log("clients créés", capMarine, bistrot);

/* ------------------------------------- 1. le lien Drive dans le portail -- */

// Un accès portail pour Cap Marine.
await page.goto(`${BASE}/clients/${capMarine}`, { waitUntil: "domcontentloaded" });
await page.fill('input[name="contactName"]', "Sophie Rivière");
await page.fill('input[name="contactEmail"]', "sophie@capmarine.re");
await page.click('button:has-text("Créer l\'accès")');
await page.waitForSelector('text=Sophie Rivière', { timeout: 20000 });
const inviteUrl = await page.locator('input[readonly]').first().inputValue();
console.log("invitation :", inviteUrl);

const clientCtx = await b.newContext({ viewport: { width: 1200, height: 950 } });
const cpage = await clientCtx.newPage();
cpage.on("pageerror", (e) => errs.push("client: " + String(e)));
await cpage.goto(inviteUrl, { waitUntil: "domcontentloaded" });
await cpage.fill('input[name="password"]', "mot-de-passe-client-2026");
await cpage.click('button[type="submit"]');
await cpage.waitForURL(/portail/, { timeout: 20000 });
console.log("portail ouvert :", cpage.url());

// Un reel trop lourd pour être hébergé : seul un lien Drive existe.
await page.goto(`${BASE}/contenu`, { waitUntil: "domcontentloaded" });
await page.selectOption('select[name="clientId"]', capMarine);
await page.fill('input[name="title"]', "Reel drone lever de soleil");
await page.selectOption('select[name="kind"]', "reel");
await page.click('button:has-text("Créer le contenu")');
await page.waitForURL(/\/contenu\/[0-9a-f-]{36}/, { timeout: 20000 });
const contenuId = page.url().split("/").pop();

await page.fill('input[name="url"]', "https://drive.google.com/file/d/REEL-DRONE-42/view");
await page.fill('input[name="label"]', "Montage final — 1,8 Go");
await page.click('button:has-text("Ajouter le lien")');
await page.waitForSelector('text=Montage final', { timeout: 20000 });
ok("le lien est enregistré côté agence", true);

// Passage en validation client (l'étape elle-même est déjà couverte ailleurs).
sql(`update contents set status='validation', submitted_at=now() where id='${contenuId}'`);

// La validation a sa page depuis la refonte du portail : l'accueil annonce
// ce qui attend, la carte du contenu vit ailleurs.
await cpage.goto(`${BASE}/portail`, { waitUntil: "domcontentloaded" });
await cpage.waitForSelector("text=attend votre validation", { timeout: 20000 });
await cpage.goto(`${BASE}/portail/valider`, { waitUntil: "domcontentloaded" });
const portail = await cpage.textContent("body");
const lienVisible = await cpage
  .locator('a[href="https://drive.google.com/file/d/REEL-DRONE-42/view"]')
  .count();
ok("le portail affiche le libellé du lien", portail.includes("Montage final — 1,8 Go"));
ok("le portail rend le lien cliquable (2 accès attendus)", lienVisible === 2);
ok("la vignette n'annonce plus « Visuel à venir »", !portail.includes("Visuel à venir"));
ok("le client comprend pourquoi", portail.includes("trop lourd pour être affiché ici"));
await cpage.screenshot({ path: `${SP}/shots/f1-portail-lien.png`, fullPage: true });

// Le lien n'ouvre rien de plus que ce qu'on lui donne : il pointe hors du SaaS.
const href = await cpage.locator('a:has-text("Montage final")').first().getAttribute("href");
ok("le href est bien celui saisi", href === "https://drive.google.com/file/d/REEL-DRONE-42/view");

/* ---------------------------------- 2. la bibliothèque filtrée par client -- */

async function importer(clientId, fichier) {
  await page.goto(`${BASE}/assets`, { waitUntil: "domcontentloaded" });
  await page.locator("select").first().selectOption(clientId);
  await page.setInputFiles('input[type="file"]', fichier);
  await page.click('button:has-text("Importer")');
  await page.waitForSelector("text=Import terminé", { timeout: 60000 }).catch(() => {});
}

await importer(capMarine, `${SP}/photo-test.jpg`);
await importer(bistrot, `${SP}/photo-test.jpg`);
await importer(bistrot, `${SP}/photo-test.jpg`);

await page.goto(`${BASE}/assets`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('a[href="/assets"]:has-text("Tous les clients")', { timeout: 20000 });
const tous = await page.textContent("body");
ok("la barre de filtres liste les deux clients", tous.includes("Cap Marine") && tous.includes("Bistrot Zoé"));
ok("« tous » montre les 3 médias", (await page.locator('a[href^="/api/media/"]').count()) === 3);
await shot("f2-assets-tous");

await page.click('a[href*="/assets?client="] >> nth=0');
await page.waitForLoadState("domcontentloaded");
await page.goto(`${BASE}/assets?client=${capMarine}`, { waitUntil: "domcontentloaded" });
const filtre = await page.textContent("body");
ok("filtré sur Cap Marine : 1 média", (await page.locator('a[href^="/api/media/"]').count()) === 1);
ok("l'en-tête nomme le client filtré", filtre.includes("Cap Marine · 1 média"));
await shot("f2-assets-cap-marine");

await page.goto(`${BASE}/assets?client=${bistrot}`, { waitUntil: "domcontentloaded" });
ok("filtré sur Bistrot Zoé : 2 médias", (await page.locator('a[href^="/api/media/"]').count()) === 2);

// Un identifiant bricolé ne doit pas atteindre la base.
const bidon = await page.goto(`${BASE}/assets?client=pas-un-uuid`, { waitUntil: "domcontentloaded" });
ok("un identifiant invalide retombe sur « tous » sans erreur", bidon.status() === 200);
ok("… et affiche bien les 3 médias", (await page.locator('a[href^="/api/media/"]').count()) === 3);

const autreUuid = "00000000-0000-0000-0000-000000000000";
const inconnu = await page.goto(`${BASE}/assets?client=${autreUuid}`, { waitUntil: "domcontentloaded" });
ok("un uuid inconnu retombe sur « tous »", inconnu.status() === 200 &&
  (await page.locator('a[href^="/api/media/"]').count()) === 3);

// Le sélecteur de la barre latérale et les onglets doivent dire la même chose.
await page.goto(`${BASE}/assets`, { waitUntil: "domcontentloaded" });
await page.click('button:has-text("Client")');
await page.click('div.absolute button:has-text("Cap Marine")');
await page.waitForURL(/assets\?client=/, { timeout: 20000 });
ok("le sélecteur de la barre latérale filtre vraiment", (await page.locator('a[href^="/api/media/"]').count()) === 1);
const barre = await page.locator('button:has-text("Client") span.clip').first().textContent();
ok(`la barre latérale affiche le client filtré (${barre})`, barre.includes("Cap Marine"));
await shot("f2-assets-barre");

/* ------------------------------------------ 3. le matériel personnel -- */

await page.goto(`${BASE}/tournages`, { waitUntil: "domcontentloaded" });
await page.selectOption('select[name="clientId"]', capMarine);
await page.fill('input[name="title"]', "Tournage catamaran");
await page.fill('input[name="place"]', "Port de Saint-Gilles");
await page.fill('input[name="startsAt"]', "2026-09-12T07:00");
await page.click('button:has-text("Planifier")');
await page.waitForURL(/\/tournages\/[0-9a-f-]{36}/, { timeout: 20000 });
const tournage1 = page.url();
await page.waitForSelector("text=Mon matériel", { timeout: 20000 });
const vide = await page.textContent("body");
ok("la liste personnelle vide s'explique", vide.includes("Votre liste est vide"));

for (const item of ["Trépied Manfrotto", "Micro-cravate Rode", "Drone Mavic 3"]) {
  await page.fill('input[name="label"][placeholder^="Ajouter à ma liste"]', item);
  await page.click('button:has-text("Mémoriser")');
  await page.waitForSelector(`text=${item}`, { timeout: 20000 });
}
ok("les trois éléments sont mémorisés", true);
await shot("f3-materiel-liste");

// On coche deux éléments et on les verse dans le tournage.
await page.locator('label:has-text("Trépied Manfrotto") input[type="checkbox"]').check();
await page.locator('label:has-text("Drone Mavic 3") input[type="checkbox"]').check();
await page.click('button:has-text("Ajouter les cochés")');
await page.waitForSelector('span:has-text("Trépied Manfrotto")', { timeout: 20000 });

const gear1 = Number(sql(`select count(*) from shoot_gear`));
ok("2 lignes de matériel ajoutées au tournage", gear1 === 2);
const labels = sql(`select string_agg(label, ', ' order by position) from shoot_gear`);
ok(`les bons éléments : ${labels}`, labels.includes("Trépied Manfrotto") && labels.includes("Drone Mavic 3"));
await shot("f3-materiel-ajoute");

// Réafficher : ce qui est déjà là est coché et désactivé, pas masqué.
await page.goto(tournage1, { waitUntil: "domcontentloaded" });
const dejaLa = await page.locator('label:has-text("Trépied Manfrotto") input[type="checkbox"]').isDisabled();
ok("un élément déjà présent est désactivé", dejaLa);
ok("il reste visible dans la liste", (await page.textContent("body")).includes("déjà là"));

// Re-soumettre ne duplique pas.
await page.locator('label:has-text("Micro-cravate Rode") input[type="checkbox"]').check();
await page.click('button:has-text("Ajouter les cochés")');
await page.waitForTimeout(1500);
ok("le troisième s'ajoute sans dupliquer les autres", Number(sql(`select count(*) from shoot_gear`)) === 3);

// La liste est personnelle : un second compte ne la voit pas.
const invite = firstLine(sql(
  `insert into users (name, initials, email, role, password_hash, invite_token, invite_expires_at)
   values ('Léa Cadre', 'LC', 'lea@taochy.re', 'equipe', null, 'jeton-lea-2026', now() + interval '7 days') returning invite_token`,
));
const leaCtx = await b.newContext({ viewport: { width: 1200, height: 900 } });
const lpage = await leaCtx.newPage();
await lpage.goto(`${BASE}/invitation/${invite}`, { waitUntil: "domcontentloaded" });
await lpage.fill('input[name="password"]', "mot-de-passe-lea-2026");
await lpage.click('button[type="submit"]');
await lpage.waitForURL((u) => !u.pathname.includes("invitation"), { timeout: 20000 });
await lpage.goto(tournage1, { waitUntil: "domcontentloaded" });
await lpage.waitForSelector("text=Mon matériel", { timeout: 20000 });
const vueLea = await lpage.textContent("body");
ok("Léa ne voit pas la liste d'Emmanuel", vueLea.includes("Votre liste est vide"));
ok("… mais voit bien le matériel du tournage", vueLea.includes("Trépied Manfrotto"));
await lpage.screenshot({ path: `${SP}/shots/f3-materiel-lea.png`, fullPage: true });

// Un second tournage propose la liste sans rien ressaisir.
await page.goto(`${BASE}/tournages`, { waitUntil: "domcontentloaded" });
await page.selectOption('select[name="clientId"]', bistrot);
await page.fill('input[name="title"]', "Shooting carte d'automne");
await page.fill('input[name="place"]', "Saint-Denis");
await page.fill('input[name="startsAt"]', "2026-09-20T10:00");
await page.click('button:has-text("Planifier")');
await page.waitForURL(/\/tournages\/[0-9a-f-]{36}/, { timeout: 20000 });
await page.waitForSelector("text=Mon matériel", { timeout: 20000 });
const t2 = await page.textContent("body");
ok("le second tournage propose la liste personnelle", t2.includes("Micro-cravate Rode"));
ok("… et rien n'y est marqué « déjà là »", !t2.includes("déjà là"));
await shot("f3-materiel-tournage2");

// Retirer de sa liste ne touche pas au matériel déjà versé dans un tournage.
await page.goto(tournage1, { waitUntil: "domcontentloaded" });
await page.click('button[title="Retirer « Drone Mavic 3 » de ma liste"]');
await page.waitForTimeout(1500);
ok("le préréglage est retiré", Number(sql(`select count(*) from gear_presets`)) === 2);
ok("le matériel du tournage reste intact", Number(sql(`select count(*) from shoot_gear`)) === 3);

console.log("\nerreurs JS :", errs.length ? errs : "aucune");
await b.close();
