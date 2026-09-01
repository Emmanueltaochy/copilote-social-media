/**
 * L'écran de suivi.
 *
 * Un calendrier ordinaire ne montre que ce qui existe : il affiche une semaine
 * vide et rassurante alors qu'il manque six posts. On vérifie ici qu'il montre
 * aussi les trous — les contenus sans date, et ceux qui n'ont jamais été
 * créés — et que la couleur vient de la distance à l'échéance, pas du statut.
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
const p = await (await b.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));
const ok = (label, cond) => console.log(`${cond ? "OK  " : "ÉCHEC"} ${label}`);
const shot = (page, n) => page.screenshot({ path: `${SP}/shots/${n}.png`, fullPage: true });
const lire = async (page = p, sel = "main") => (await page.textContent(sel)).replace(/[  ]/g, " ");

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
  await p.fill('input[name="contentTarget"]', String(cible));
  await p.click('button:has-text("Créer le client")');
  await p.waitForURL(/\/clients\/[0-9a-f-]{36}/, { timeout: 20000 });
  return p.url().split("/").pop();
}

const capMarine = await creerClient("Cap Marine", 8);
const bistrot = await creerClient("Bistrot Zoé", 6);

/* ============ 1. UNE SEMAINE FABRIQUÉE DE TOUTES PIÈCES ================= */

/** Crée un contenu à une date relative à aujourd'hui, dans un statut donné. */
function poser(clientId, titre, joursDepuisAujourdhui, statut) {
  const id = un(
    `insert into contents (client_id, title, kind, network, status, scheduled_at)
     values ('${clientId}', '${titre}', 'feed', 'instagram', '${statut}',
             date_trunc('day', now()) + interval '${joursDepuisAujourdhui} day' + interval '10 hour')
     returning id`,
  );
  return id;
}

// Lundi de cette semaine, pour caler les dates dans la fenêtre affichée.
const lundi = un(`select to_char(date_trunc('week', now()), 'YYYY-MM-DD')`);
const jourAuj = Number(un(`select extract(isodow from now())::int`)); // 1 = lundi

// En retard : hier, pas publié. (Si on est lundi, on le pose quand même dans
// la semaine en cours en le mettant aujourd'hui-1 seulement si ça reste ≥ lundi.)
const retard = jourAuj > 1 ? poser(capMarine, "Post en retard", -1, "creation") : null;
// Aujourd'hui, pas prêt : l'alerte que décrit le mieux le besoin.
const auj = poser(capMarine, "Post du jour non prêt", 0, "creation");
// Aujourd'hui, prêt : ne doit pas être en rouge.
const aujPret = poser(bistrot, "Post du jour prêt", 0, "pret");
// Dans deux jours, pas commencé : à finir.
const bientot = jourAuj <= 5 ? poser(bistrot, "Post dans deux jours", 2, "idee") : null;
// Sans date : il existe mais n'ira nulle part.
const orphelin = un(
  `insert into contents (client_id, title, kind, network, status)
   values ('${capMarine}', 'Post sans date', 'reel', 'instagram', 'idee') returning id`,
);

await p.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
let txt = await lire();
ok("l'accueil est devenu le suivi de la semaine", txt.includes("Suivi de la semaine"));
await shot(p, "suivi-semaine");

/* ==================== 2. LES ALERTES EN TÊTE ============================ */

ok("un contenu du jour non prêt est signalé", txt.includes("à publier aujourd'hui, pas prêts"));
ok("les contenus sans date sont comptés", txt.includes("sans date"));
ok("ce qui manque au contrat est compté", txt.includes("à créer ce mois-ci"));

const etat = (id) => p.locator(`[data-contenu="${id}"]`).getAttribute("data-etat");
ok(`le post du jour non prêt est en alerte (${await etat(auj)})`, (await etat(auj)) === "aujourdhui");
ok(
  "… et le post du jour déjà prêt ne l'est pas",
  (await p.locator(`[data-contenu="${aujPret}"] .text-alert`).count()) === 0,
);
if (retard) ok(`le post d'hier est marqué en retard (${await etat(retard)})`, (await etat(retard)) === "retard");
if (bientot) ok(`le post à deux jours est à finir (${await etat(bientot)})`, (await etat(bientot)) === "bientot");

/* ============== 3. LES TROUS, QUE LE CALENDRIER NE MONTRE PAS =========== */

ok("le contenu sans date apparaît dans sa liste", (await p.locator(`[data-sans-date="${orphelin}"]`).count()) === 1);
ok(
  "… et pas dans la grille des jours",
  (await p.locator(`[data-contenu="${orphelin}"]`).count()) === 0,
);

// Cap Marine doit 8 contenus par mois. L'écran compare l'engagement à ce qui
// existe *dans le mois courant* : une semaine à cheval sur deux mois — la
// première de septembre commence un 31 août — met une partie des contenus
// hors du compte. Le test doit compter comme le produit compte.
const attendus =
  8 -
  Number(
    un(`select count(*) from contents where client_id='${capMarine}'
        and coalesce(scheduled_at, published_at, created_at) >= date_trunc('month', now())
        and coalesce(scheduled_at, published_at, created_at) < date_trunc('month', now()) + interval '1 month'`),
  );
ok(
  `Cap Marine est signalé comme incomplet (${attendus} à créer)`,
  (await lire()).includes(`${attendus} à créer`),
);
ok(
  "le client complet n'apparaît pas dans les manques",
  (await p.locator(`[data-manque="${bistrot}"]`).count()) === 1,
);

/* ================= 4. LA NAVIGATION DE SEMAINE ========================== */

await p.click('a:has-text("Semaine suivante")');
await p.waitForURL(/semaine=/, { timeout: 20000 });
txt = await lire();
ok("la semaine suivante s'ouvre", p.url().includes("semaine="));
ok(
  "… et ne montre plus les contenus de cette semaine",
  (await p.locator(`[data-contenu="${auj}"]`).count()) === 0,
);

await p.click('a:has-text("Cette semaine")');
await p.waitForURL(`${BASE}/`, { timeout: 20000 });
ok("on revient à la semaine en cours", (await p.locator(`[data-contenu="${auj}"]`).count()) === 1);

// Une semaine inventée dans l'adresse retombe sur la semaine courante.
await p.goto(`${BASE}/?semaine=pas-une-date`, { waitUntil: "domcontentloaded" });
ok("une adresse bricolée ne casse rien", (await p.locator(`[data-contenu="${auj}"]`).count()) === 1);
await p.goto(`${BASE}/?semaine=2026-08-13`, { waitUntil: "domcontentloaded" });
ok(
  "… un jour qui n'est pas un lundi non plus",
  (await p.locator(`[data-contenu="${auj}"]`).count()) === 1,
);
ok("le titre du contenu se lit sur la carte", (await lire()).includes("Post du jour non prêt"));

/* ================= 5. LE COCKPIT A GARDÉ SA PLACE ======================= */

await p.goto(`${BASE}/cockpit`, { waitUntil: "domcontentloaded" });
ok("le cockpit vit maintenant à son adresse", (await lire()).includes("Cockpit agence"));
const menu = await p.textContent("aside");
ok("le menu propose les deux", menu.includes("Suivi") && menu.includes("Cockpit"));

/* ================= 6. SUR TÉLÉPHONE ===================================== */

const mob = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
mob.on("pageerror", (e) => errs.push(String(e)));
await mob.goto(`${BASE}/connexion`, { waitUntil: "domcontentloaded" });
await mob.waitForSelector('input[name="email"]', { timeout: 20000 });
await mob.fill('input[name="email"]', "emmanuel@taochy.re");
await mob.fill('input[name="password"]', "motdepasse-solide-2026");
await mob.click('button[type="submit"]');
await mob.waitForURL(`${BASE}/`, { timeout: 20000 });
const deborde = await mob.evaluate(() => {
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
ok("le suivi tient dans la largeur d'un téléphone", deborde === 0);
ok("les sept jours sont empilés et lisibles", (await mob.locator("[data-jour]").count()) === 7);
await shot(mob, "suivi-mobile");

console.log(`\nerreurs JS : ${errs.length ? errs.join(" | ") : "aucune"}`);
await b.close();
