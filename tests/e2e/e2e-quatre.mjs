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

/* ---------------------------------------------------------- installation -- */

await p.goto(`${BASE}/bienvenue`, { waitUntil: "domcontentloaded" });
await p.fill('input[name="name"]', "Emmanuel Taochy");
await p.fill('input[name="email"]', "emmanuel@taochy.re");
await p.fill('input[name="password"]', "motdepasse-solide-2026");
await p.click('button[type="submit"]');
await p.waitForURL(`${BASE}/`, { timeout: 20000 });

await p.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
await p.fill('input[name="name"]', "Cap Marine");
await p.fill('input[name="sector"]', "Nautisme");
await p.fill('input[name="monthlyFee"]', "2400");
await p.fill('input[name="contentTarget"]', "6");
await p.fill('input[name="hoursSold"]', "30");
await p.click('button:has-text("Créer le client")');
await p.waitForURL(/\/clients\/[0-9a-f-]{36}/, { timeout: 20000 });
const client = p.url().split("/").pop();

/* ============================ 1. RÉSEAUX MULTIPLES ======================== */

await p.goto(`${BASE}/contenu`, { waitUntil: "domcontentloaded" });
await p.selectOption('select[name="clientId"]', client);
await p.fill('input[name="title"]', "Lever de soleil sur le lagon");
const cases = await p.locator('input[name="networks"]').count();
ok(`le formulaire propose des cases à cocher (${cases} réseaux)`, cases === 5);
await p.check('input[name="networks"][value="instagram"]');
await p.check('input[name="networks"][value="facebook"]');
await p.check('input[name="networks"][value="linkedin"]');
await p.click('button:has-text("Créer le contenu")');
await p.waitForURL(/\/contenu\/[0-9a-f-]{36}/, { timeout: 20000 });
const contenu = p.url().split("/").pop();

ok(
  "les trois réseaux sont enregistrés",
  un(`select networks::text from contents where id='${contenu}'`) ===
    '["instagram", "facebook", "linkedin"]',
);
ok(
  "le réseau principal reste renseigné pour les tris",
  un(`select network from contents where id='${contenu}'`) === "instagram",
);
const fiche = await p.textContent("body");
ok("la fiche les affiche tous les trois", fiche.includes("Instagram · Facebook · LinkedIn"));
await shot("q1-contenu-reseaux");

// Décocher doit retirer, pas ajouter.
await p.uncheck('input[name="networks"][value="linkedin"]');
await p.click('button:has-text("Enregistrer")');
await p.waitForTimeout(1500);
ok(
  "décocher un réseau le retire",
  un(`select networks::text from contents where id='${contenu}'`) === '["instagram", "facebook"]',
);

// Les cases rouvrent sur ce qui est enregistré, pas sur un formulaire vierge.
await p.reload({ waitUntil: "domcontentloaded" });
const cochées = await p.locator('input[name="networks"]:checked').count();
ok(`le formulaire rouvre sur les 2 réseaux enregistrés (${cochées})`, cochées === 2);

/* ============================ 2. « À PUBLIER » =========================== */

// Un contenu prêt mais daté d'hier : il doit apparaître, alors que l'ancienne
// version ne montrait que la journée en cours.
sql(`update contents set status='pret', scheduled_at = now() - interval '1 day' where id='${contenu}'`);

// Un deuxième, prêt et daté dans une semaine.
await p.goto(`${BASE}/contenu`, { waitUntil: "domcontentloaded" });
await p.selectOption('select[name="clientId"]', client);
await p.fill('input[name="title"]', "Carrousel tarifs 2027");
await p.click('button:has-text("Créer le contenu")');
await p.waitForURL(/\/contenu\/[0-9a-f-]{36}/, { timeout: 20000 });
const futur = p.url().split("/").pop();
sql(`update contents set status='pret', scheduled_at = now() + interval '7 days' where id='${futur}'`);

// Un troisième, programmé aujourd'hui mais encore en création.
await p.goto(`${BASE}/contenu`, { waitUntil: "domcontentloaded" });
await p.selectOption('select[name="clientId"]', client);
await p.fill('input[name="title"]', "Story coulisses");
await p.click('button:has-text("Créer le contenu")');
await p.waitForURL(/\/contenu\/[0-9a-f-]{36}/, { timeout: 20000 });
const enCours = p.url().split("/").pop();
sql(`update contents set status='creation', scheduled_at = date_trunc('day', now()) + interval '15 hours' where id='${enCours}'`);

await p.goto(`${BASE}/a-publier`, { waitUntil: "domcontentloaded" });
const aPublier = await p.textContent("body");
ok("le contenu prêt d'hier apparaît", aPublier.includes("Lever de soleil sur le lagon"));
ok("… dans la section « En retard »", aPublier.includes("En retard"));
ok("le contenu prêt de la semaine prochaine apparaît aussi", aPublier.includes("Carrousel tarifs 2027"));
ok(
  "celui d'aujourd'hui non encore prêt est signalé à part",
  aPublier.includes("Programmés aujourd'hui, pas encore prêts") && aPublier.includes("Story coulisses"),
);
ok("les réseaux multiples y sont lisibles", aPublier.includes("Instagram · Facebook"));
await shot("q2-a-publier");

// Le compte de l'en-tête doit dire la vérité.
ok("l'en-tête compte les deux prêts", aPublier.includes("2 prêts"));

// Publier retire de la file et alimente « publiés aujourd'hui ».
await p.fill('input[name="url"] >> nth=0', "https://instagram.com/p/ABC123");
await p.click('button:has-text("Publié") >> nth=0');
// Attendre le résultat plutôt qu'un délai : le rendu revient du serveur, et
// une mesure prise trop tôt décrit l'écran d'avant.
await p.waitForSelector("text=Publiés aujourd'hui", { timeout: 20000 });
ok(
  "le contenu publié quitte la file des retards",
  (await p.locator('main :text-is("En retard")').count()) === 0,
);
ok(
  "… et rejoint « publiés aujourd'hui »",
  (await p.locator('main:has-text("Publiés aujourd\'hui")').count()) === 1,
);
ok(
  "il n'est plus proposé à la publication",
  Number(un(`select count(*) from contents where id='${contenu}' and published_at is not null`)) === 1,
);

/* ============================ 3. KANBAN TOURNAGES ======================== */

await p.goto(`${BASE}/tournages`, { waitUntil: "domcontentloaded" });
await p.selectOption('select[name="clientId"]', client);
await p.fill('input[name="title"]', "Tournage catamaran");
await p.fill('input[name="place"]', "Port de Saint-Gilles");
await p.fill('input[name="startsAt"]', "2026-09-12T07:00");
await p.click('button:has-text("Planifier")');
await p.waitForURL(/\/tournages\/[0-9a-f-]{36}/, { timeout: 20000 });
const tournage = p.url().split("/").pop();

await p.goto(`${BASE}/tournages`, { waitUntil: "domcontentloaded" });
const board = await p.textContent("body");
const colonnes = ["En préparation", "À sécuriser", "Confirmé", "Réalisé", "Annulé"];
ok("les cinq colonnes d'étape sont là", colonnes.every((c) => board.includes(c)));
ok("le tournage est dans la colonne « En préparation »", board.includes("Tournage catamaran"));
ok("la carte dit ce qui bloque le départ", board.includes("aucune personne assignée"));
ok("… et le lieu", board.includes("Port de Saint-Gilles"));
await shot("q3-tournages-kanban");

// Avancer d'une étape depuis le tableau, sans ouvrir la fiche.
await p.click('button:has-text("→ À sécuriser")');
await p.waitForTimeout(1800);
ok(
  "le bouton fait avancer d'une étape",
  un(`select status from shoots where id='${tournage}'`) === "a_securiser",
);
ok(
  "sans effacer le lieu au passage",
  un(`select place from shoots where id='${tournage}'`) === "Port de Saint-Gilles",
);

await p.click('button:has-text("→ Confirmé")');
await p.waitForTimeout(1800);
ok("puis jusqu'à confirmé", un(`select status from shoots where id='${tournage}'`) === "confirme");

const boardApres = await p.textContent("body");
ok("aucun bouton ne mène à « Annulé » depuis le tableau", !boardApres.includes("→ Annulé"));

// La fiche reste accessible d'un clic.
await p.click('a[href="/tournages/' + tournage + '"]');
await p.waitForURL(new RegExp(tournage), { timeout: 20000 });
ok("la carte ouvre toujours la fiche du tournage", (await p.textContent("body")).includes("Shotlist"));

/* ============================ 4. LA CLOCHE ============================== */

// Une notification à afficher.
const moi = un("select id from users where email='emmanuel@taochy.re'");
sql(`insert into notifications (user_id, kind, title, body) values ('${moi}', 'message', 'Essai de cloche', 'Le panneau doit passer au-dessus du contenu.')`);

await p.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await p.click('aside button[aria-label*="Notifications"]');
await p.waitForSelector("text=Essai de cloche", { timeout: 20000 });

const verdict = await p.evaluate(() => {
  const panneau = [...document.querySelectorAll("div.fixed")].find((d) =>
    d.textContent?.includes("Essai de cloche"),
  );
  if (!panneau) return { trouvé: false };
  const r = panneau.getBoundingClientRect();
  // Ce qui est réellement peint au centre du panneau : si c'est le contenu de
  // la page, c'est que le panneau passe dessous.
  const dessus = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return {
    trouvé: true,
    dansLePanneau: panneau.contains(dessus),
    horsDeLaBarre: !document.querySelector("aside")?.contains(panneau),
    dansLEcran: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth,
  };
});
ok("le panneau de la cloche s'affiche", verdict.trouvé);
ok("il est peint au-dessus du contenu, plus derrière", verdict.dansLePanneau);
ok("il est monté à la racine, hors de la barre latérale", verdict.horsDeLaBarre);
ok("il tient dans l'écran", verdict.dansLEcran);
await shot("q4-cloche");

// Il se ferme toujours au clic extérieur, malgré le déménagement.
await p.mouse.click(1200, 700);
await p.waitForTimeout(400);
ok(
  "il se referme au clic extérieur",
  (await p.locator('div.fixed:has-text("Essai de cloche")').count()) === 0,
);

console.log("\nerreurs JS :", errs.length ? errs : "aucune");
await b.close();
