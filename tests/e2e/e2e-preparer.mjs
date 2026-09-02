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
const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));
const ok = (label, cond) => console.log(`${cond ? "OK  " : "ÉCHEC"} ${label}`);
const shot = (n) => p.screenshot({ path: `${SP}/shots/${n}.png`, fullPage: true });

/* ---------------------------------------------------------- installation -- */

await p.goto(`${BASE}/bienvenue`, { waitUntil: "domcontentloaded" });
await p.fill('input[name="name"]', "Emmanuel Taochy");
await p.fill('input[name="email"]', "emmanuel@taochy.re");
await p.fill('input[name="password"]', "motdepasse-solide-2026");
await p.click('button[type="submit"]');
await p.waitForURL(`${BASE}/`, { timeout: 20000 });

async function creerClient(nom, cible) {
  await p.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
  await p.fill('input[name="name"]', nom);
  await p.fill('input[name="sector"]', "Test");
  await p.fill('input[name="monthlyFee"]', "2400");
  await p.fill('input[name="contentTarget"]', String(cible));
  await p.fill('input[name="hoursSold"]', "30");
  await p.click('button:has-text("Créer le client")');
  await p.waitForURL(/\/clients\/[0-9a-f-]{36}/, { timeout: 20000 });
  return p.url().split("/").pop();
}

const capMarine = await creerClient("Cap Marine", 13);
const bistrot = await creerClient("Bistrot Zoé", 4);
const sansPlan = await creerClient("Atelier Vanille", 5);

/* ------------------------------------ 1. la décomposition de l'engagement -- */

async function ajouterLigne(clientId, label, kind, network, cible) {
  await p.goto(`${BASE}/clients/${clientId}`, { waitUntil: "domcontentloaded" });
  await p.fill('input[name="label"]', label);
  await p.selectOption('select[name="kind"]', kind);
  // Les réseaux sont désormais des cases : on décoche le défaut avant de
  // cocher celui qu'on veut, sinon la ligne en porterait deux.
  for (const n of ["instagram", "facebook", "linkedin", "tiktok", "google"]) {
    const c = p.locator(`input[name="networks"][value="${n}"]`);
    if (n === network) await c.check();
    else await c.uncheck();
  }
  await p.fill('input[name="monthlyTarget"]', String(cible));
  await p.click('button:has-text("Ajouter")');
  await p.waitForSelector(`text=${label}`, { timeout: 20000 });
}

await ajouterLigne(capMarine, "Posts feed", "feed", "instagram", 6);
await ajouterLigne(capMarine, "Stories", "story", "instagram", 4);
await ajouterLigne(capMarine, "Reels", "reel", "tiktok", 3);
await ajouterLigne(bistrot, "Carrousels", "carrousel", "linkedin", 4);

ok("les lignes sont enregistrées", Number(un("select count(*) from contract_lines")) === 4);
ok(
  "avec leur format et leur réseau",
  un("select kind||'/'||network from contract_lines where label='Reels'") === "reel/tiktok",
);
const fiche = await p.textContent("body");
ok("la fiche client les affiche en clair", fiche.includes("Carrousel") && fiche.includes("LinkedIn"));
await shot("p1-fiche-client");

/* ----------------------------------------- 2. l'écran annonce avant de créer -- */

await p.goto(`${BASE}/preparer`, { waitUntil: "domcontentloaded" });
const avant = await p.textContent("body");
ok("l'écran annonce ce qui sera créé", avant.includes("17 contenus à créer"));
ok("le détail est donné ligne par ligne", avant.includes("6 à créer") && avant.includes("3 à créer"));
ok(
  "un client sans décomposition est signalé, pas ignoré en silence",
  avant.includes("Atelier Vanille") && avant.includes("pas de décomposition"),
);
ok("rien n'a encore été créé", Number(un("select count(*) from contents")) === 0);
await shot("p2-preparer-avant");

/* ------------------------------------------------- 3. générer un client -- */

await p.click('form:has(input[value="' + capMarine + '"]) button:has-text("Créer les 13")');
await p.waitForSelector("text=13 contenus préparés", { timeout: 30000 });

ok("13 contenus créés pour Cap Marine", Number(un(`select count(*) from contents where client_id='${capMarine}'`)) === 13);
ok(
  "les formats suivent le contrat",
  un(`select string_agg(k||':'||n, ' ' order by k) from (select kind::text k, count(*) n from contents where client_id='${capMarine}' group by kind) t`) ===
    "feed:6 reel:3 story:4",
);
ok(
  "le réseau de chaque ligne est respecté",
  un(`select count(*) from contents where client_id='${capMarine}' and kind='reel' and network='tiktok'`) === "3",
);
ok(
  "tous naissent au statut idée, sans légende",
  un(`select count(*) from contents where client_id='${capMarine}' and status='idee' and caption is null`) === "13",
);
ok(
  "les titres disent quelle place ils occupent",
  un(`select count(*) from contents where client_id='${capMarine}' and title like 'Posts feed %/6'`) === "6",
);
await shot("p3-preparer-apres");

/* ------------------------------------------------- 4. la répartition -- */

const jours = sql(
  `select distinct extract(isodow from scheduled_at)::int from contents where client_id='${capMarine}' order by 1`,
).split("\n").map((x) => Number(x.trim()));
ok(`aucune publication le week-end (jours ${jours.join(",")})`, jours.every((j) => j >= 1 && j <= 5));

const heures = sql(`select distinct extract(hour from scheduled_at)::int from contents where client_id='${capMarine}'`);
ok(`toutes à l'heure choisie (${heures.replace(/\n/g, ",")})`, heures.split("\n").length === 1);

const distincts = Number(un(`select count(distinct date(scheduled_at)) from contents where client_id='${capMarine}'`));
ok(`elles sont étalées sur ${distincts} jours différents`, distincts >= 6);

const dansLeMois = Number(un(
  `select count(*) from contents where client_id='${capMarine}'
   and scheduled_at >= date_trunc('month', now()) and scheduled_at < date_trunc('month', now()) + interval '1 month'`,
));
ok("toutes tombent dans le mois demandé", dansLeMois === 13);

/* --------------------------------------- 5. appuyer deux fois ne duplique pas -- */

await p.goto(`${BASE}/preparer`, { waitUntil: "domcontentloaded" });
const après = await p.textContent("body");
ok("l'écran voit que Cap Marine est à jour", après.includes("à jour"));
ok("il ne reste que les 4 de Bistrot Zoé", après.includes("4 contenus à créer"));

// Le bouton d'un client à jour est désactivé : on ne peut pas doubler par erreur.
const désactivé = await p
  .locator('form:has(input[value="' + capMarine + '"]) button[type="submit"]')
  .isDisabled();
ok("le bouton d'un client à jour est désactivé", désactivé);

/* ------------------------------- 6. le rattrapage en milieu de mois -- */

// On supprime deux reels : le bouton doit en recréer exactement deux.
sql(`delete from contents where id in (select id from contents where client_id='${capMarine}' and kind='reel' limit 2)`);
await p.goto(`${BASE}/preparer`, { waitUntil: "domcontentloaded" });
const manque = await p.textContent("body");
ok("il repère les deux contenus manquants", manque.includes("2 à créer"));

await p.click('form:has(input[value="' + capMarine + '"]) button:has-text("Créer les 2")');
await p.waitForSelector("text=2 contenus préparés", { timeout: 30000 });
ok(
  "il en recrée deux, pas treize",
  Number(un(`select count(*) from contents where client_id='${capMarine}'`)) === 13,
);
ok(
  "et ce sont bien des reels",
  un(`select count(*) from contents where client_id='${capMarine}' and kind='reel'`) === "3",
);

/* ------------------------------------------- 7. tout le portefeuille -- */

await p.goto(`${BASE}/preparer`, { waitUntil: "domcontentloaded" });
await p.click('button:has-text("Préparer tout le portefeuille")');
await p.waitForSelector("text=contenus préparés", { timeout: 40000 });
const bilan = await p.textContent("body");
ok("Bistrot Zoé est servi", Number(un(`select count(*) from contents where client_id='${bistrot}'`)) === 4);
ok("Cap Marine, déjà à jour, n'est pas doublé", Number(un(`select count(*) from contents where client_id='${capMarine}'`)) === 13);
ok(
  "le client sans décomposition est nommé dans le bilan",
  bilan.includes("Atelier Vanille") && Number(un(`select count(*) from contents where client_id='${sansPlan}'`)) === 0,
);
await shot("p4-tout-le-portefeuille");

/* ---------------------------------------- 8. un autre mois, à part -- */

const moisProchain = new Date();
moisProchain.setDate(1);
moisProchain.setMonth(moisProchain.getMonth() + 1);
const code = `${moisProchain.getFullYear()}-${String(moisProchain.getMonth() + 1).padStart(2, "0")}`;

await p.goto(`${BASE}/preparer?mois=${code}`, { waitUntil: "domcontentloaded" });
const futur = await p.textContent("body");
ok("le mois suivant repart à zéro", futur.includes("17 contenus à créer"));

await p.click('form:has(input[value="' + capMarine + '"]) button:has-text("Créer les 13")');
await p.waitForSelector("text=13 contenus préparés", { timeout: 30000 });
ok(
  "le mois courant n'a pas bougé",
  Number(un(`select count(*) from contents where client_id='${capMarine}'
     and scheduled_at >= date_trunc('month', now()) and scheduled_at < date_trunc('month', now()) + interval '1 month'`)) === 13,
);
ok(
  "et le mois suivant a bien ses 13",
  Number(un(`select count(*) from contents where client_id='${capMarine}'
     and scheduled_at >= date_trunc('month', now()) + interval '1 month'
     and scheduled_at < date_trunc('month', now()) + interval '2 month'`)) === 13,
);

/* ------------------------------------ 9. les contenus vivent vraiment -- */

await p.goto(`${BASE}/production`, { waitUntil: "domcontentloaded" });
const prod = await p.textContent("body");
ok("les contenus apparaissent dans le pipeline", prod.includes("Posts feed"));

await p.goto(`${BASE}/calendrier`, { waitUntil: "domcontentloaded" });
const cal = await p.textContent("body");
ok("et dans le calendrier", cal.includes("Posts feed") || cal.includes("Stories"));

console.log("\nerreurs JS :", errs.length ? errs : "aucune");
await b.close();
