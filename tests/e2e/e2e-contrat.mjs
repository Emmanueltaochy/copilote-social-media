/**
 * Le contrat d'un client suit ses pôles.
 *
 * Le social se vend au mois et se pilote en contenus, le web se vend au projet
 * et ne laisse au client que ce qui court après la mise en ligne. Un client qui
 * achète les deux doit voir les deux, sans que l'un déborde sur l'autre.
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
/** fr-FR sépare les milliers par une espace fine insécable : on aplatit. */
const plat = (s) => s.replace(/[\u202f\u00a0]/g, " ");
const lire = async (page = p, sel = "main") => plat(await page.textContent(sel));

/* ---------------------------------------------------------- installation -- */

await p.goto(`${BASE}/bienvenue`, { waitUntil: "domcontentloaded" });
await p.fill('input[name="name"]', "Emmanuel Taochy");
await p.fill('input[name="email"]', "emmanuel@taochy.re");
await p.fill('input[name="password"]', "motdepasse-solide-2026");
await p.click('button[type="submit"]');
await p.waitForURL(`${BASE}/`, { timeout: 20000 });

/** Crée un client depuis /clients en cochant les pôles demandés. */
async function creer(nom, poles, champs = {}) {
  await p.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
  for (const d of ["social", "web"]) {
    const c = p.locator(`input[name="departments"][value="${d}"]`);
    if (poles.includes(d)) await c.check();
    else await c.uncheck();
  }
  await p.fill('input[name="name"]', nom);
  if (champs.webBilling) {
    await p.selectOption('select[name="webBilling"]', champs.webBilling);
    delete champs.webBilling;
  }
  for (const [k, v] of Object.entries(champs)) await p.fill(`input[name="${k}"]`, String(v));
  await p.click('button:has-text("Créer le client")');
  await p.waitForURL(/\/clients\/[0-9a-f-]{36}/, { timeout: 20000 });
  return p.url().split("/").pop();
}

/* ============ 1. LES CHAMPS SUIVENT LES PÔLES, EN DIRECT ================ */

await p.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
ok(
  "à l'ouverture, seul le contrat réseaux sociaux est proposé",
  (await p.locator('input[name="monthlyFee"]').count()) === 1 &&
    (await p.locator('input[name="webMaintenance"]').count()) === 0,
);

await p.check('input[name="departments"][value="web"]');
ok(
  "cocher Web fait apparaître le contrat web sans recharger",
  (await p.locator('input[name="webMaintenance"]').count()) === 1 &&
    (await p.locator('select[name="webBilling"]').count()) === 1,
);
const formulaire = await lire(p, "main form");
ok(
  "les deux blocs sont alors titrés",
  formulaire.includes("Contrat réseaux sociaux") && formulaire.includes("Contrat web"),
);

ok(
  "le web propose par défaut le forfait, sans taux horaire ni enveloppe",
  (await p.locator('select[name="webBilling"]').inputValue()) === "forfait" &&
    (await p.locator('input[name="webHourlyRate"]').count()) === 0 &&
    (await p.locator('input[name="webHoursSold"]').count()) === 0,
);
await p.selectOption('select[name="webBilling"]', "heure");
ok(
  "passer à la régie fait apparaître le tarif horaire et l'enveloppe",
  (await p.locator('input[name="webHourlyRate"]').count()) === 1 &&
    (await p.locator('input[name="webHoursSold"]').count()) === 1,
);
ok(
  "… et l'aide change de discours",
  (await lire(p, "main form")).includes("facturable au tarif"),
);
await p.selectOption('select[name="webBilling"]', "forfait");
ok(
  "revenir au forfait les retire",
  (await p.locator('input[name="webHourlyRate"]').count()) === 0 &&
    (await p.locator('input[name="webHoursSold"]').count()) === 0,
);

await p.uncheck('input[name="departments"][value="social"]');
ok(
  "décocher Réseaux sociaux retire le forfait mensuel et les contenus",
  (await p.locator('input[name="monthlyFee"]').count()) === 0 &&
    (await p.locator('input[name="contentTarget"]').count()) === 0,
);
ok(
  "un seul pôle : plus de titre de bloc, le formulaire reste simple",
  !(await lire(p, "main form")).includes("Contrat web") &&
    (await p.locator('input[name="webMaintenance"]').count()) === 1,
);
await shot("contrat-web-seul");

/* ==================== 2. TROIS CLIENTS, TROIS CONTRATS ================== */

const social = await creer("Cap Marine", ["social"], {
  monthlyFee: 2400,
  contentTarget: 12,
  hoursSold: 30,
});
const webSeul = await creer("Boutique Zen", ["web"], {
  webMaintenance: 90,
});
const mixte = await creer("Groupe Océan", ["social", "web"], {
  monthlyFee: 1800,
  contentTarget: 8,
  hoursSold: 20,
  webBilling: "heure",
  webMaintenance: 150,
  webHourlyRate: 95,
  webHoursSold: 40,
});

ok(
  "le contrat web est enregistré en centimes",
  un(`select web_maintenance_cents from clients where id='${webSeul}'`) === "9000",
);
ok(
  "un client au forfait n'a ni tarif horaire ni enveloppe",
  un(
    `select web_billing || '/' || web_hourly_rate_cents || '/' || web_hours_sold from clients where id='${webSeul}'`,
  ) === "forfait/0/0",
);
ok(
  "un client en régie garde son tarif et son enveloppe",
  un(
    `select web_billing || '/' || web_hourly_rate_cents || '/' || web_hours_sold from clients where id='${mixte}'`,
  ) === "heure/9500/40",
);
ok(
  "un client web seul n'a aucun forfait social",
  un(`select monthly_fee_cents || '/' || content_target from clients where id='${webSeul}'`) === "0/0",
);
ok(
  "un client mixte porte bien les deux contrats",
  un(
    `select monthly_fee_cents || '/' || web_maintenance_cents from clients where id='${mixte}'`,
  ) === "180000/15000",
);

/* =============== 3. LA FICHE NE MONTRE QUE CE QUI EXISTE ================ */

await p.goto(`${BASE}/clients/${social}`, { waitUntil: "domcontentloaded" });
let txt = await lire();
ok("fiche social : l'engagement du mois est là", txt.includes("Engagement du mois"));
ok("fiche social : pas de bloc web", !txt.includes("Pôle web"));
ok("fiche social : la décomposition de l'engagement reste", txt.includes("Décomposition de l'engagement"));

await p.goto(`${BASE}/clients/${webSeul}`, { waitUntil: "domcontentloaded" });
txt = await lire();
ok("fiche web : pas d'engagement mensuel en contenus", !txt.includes("Engagement du mois"));
ok("fiche web : pas de décomposition posts / stories", !txt.includes("Décomposition de l'engagement"));
ok("fiche web : le bloc du pôle web porte le nom du client", txt.includes("Pôle web") && txt.includes("Boutique Zen"));
ok("fiche web : la maintenance mensuelle s'affiche", txt.includes("90 € / mois"));
ok("fiche web : au forfait, c'est le vendu en projets qui compte", txt.includes("Vendu en projets"));
ok("fiche web : pas de montant à facturer au temps passé", !txt.includes("À facturer"));
// Sans projet, la fiche ne se contente plus de le constater : elle dit ce que
// cela coûte au client — pas d'onglet Projets sur son portail, pas de montant
// comptabilisé — et propose de l'ouvrir sur place.
ok("fiche web : aucun projet encore", txt.includes("Aucun projet ouvert pour ce client"));
ok("… et la fiche dit ce que cela empêche", txt.includes("onglet Projets"));
await shot("fiche-web-seul");

await p.goto(`${BASE}/clients/${mixte}`, { waitUntil: "domcontentloaded" });
txt = await lire();
ok("fiche mixte : les deux blocs cohabitent", txt.includes("Engagement du mois") && txt.includes("Pôle web"));
ok(
  "fiche mixte : le formulaire propose les deux contrats",
  (await p.locator('input[name="monthlyFee"]').count()) === 1 &&
    (await p.locator('input[name="webMaintenance"]').count()) === 1,
);
await shot("fiche-mixte");

/* ============ 4. LE MONTANT D'UN SITE VIT SUR SON PROJET ================ */

await p.click('aside button[name="pole"][value="web"]');
await p.waitForURL(/\/web$/, { timeout: 20000 });
await p.selectOption('select[name="clientId"]', webSeul);
await p.fill('input[name="name"]', "Boutique en ligne");
await p.selectOption('select[name="type"]', "ecommerce");
await p.fill('input[name="price"]', "8500");
await p.click('button:has-text("Créer le projet")');
await p.waitForURL(/\/web\/[0-9a-f-]{36}/, { timeout: 20000 });

await p.goto(`${BASE}/clients/${webSeul}`, { waitUntil: "domcontentloaded" });
txt = await lire();
ok("le vendu de la fiche est la somme des projets", txt.includes("8 500 €"));
ok("le projet apparaît dans le bloc web", txt.includes("Boutique en ligne"));
ok("… avec son état d'avancement", txt.includes("1 en cours"));

/* ============ 5. LE PORTEFEUILLE SE LIT SELON LE PÔLE =================== */

await p.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
txt = await lire();
ok("portefeuille web : la colonne Projets remplace l'avancement", txt.includes("Projets") && !txt.includes("Avancement du mois"));
ok("portefeuille web : le montant vendu est en colonne", txt.includes("Vendu") && txt.includes("Maintenance"));
ok("portefeuille web : Boutique Zen est en chantier", txt.includes("En chantier"));
ok("portefeuille web : Cap Marine n'y est pas", !txt.includes("Cap Marine"));
ok(
  "sur le pôle web, le nouveau client est coché Web d'avance",
  (await p.locator('input[name="departments"][value="web"]').isChecked()) &&
    !(await p.locator('input[name="departments"][value="social"]').isChecked()),
);
await shot("portefeuille-web");

await p.click('aside button[name="pole"][value="social"]');
await p.waitForURL(`${BASE}/`, { timeout: 20000 });
await p.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
txt = await lire();
ok("portefeuille social : l'avancement du mois revient", txt.includes("Avancement du mois") && txt.includes("Forfait"));
ok("portefeuille social : Boutique Zen n'y est pas", !txt.includes("Boutique Zen"));
ok(
  "sur le pôle social, le nouveau client est coché Réseaux sociaux",
  await p.locator('input[name="departments"][value="social"]').isChecked(),
);

/* ====== 6. LES HEURES WEB NE MANGENT PAS LA MARGE DU SOCIAL ============= */

// Une semaine dont le lundi tombe dans le mois courant. La rentabilité
// rattache une semaine au mois de son lundi — sinon les mêmes heures
// pèseraient sur deux marges — et la semaine en cours commence parfois le mois
// précédent : au 1er septembre, son lundi est le 31 août. Le test choisit donc
// une semaine sans ambiguïté plutôt que de dépendre du jour où il s'exécute.
const semaineDuMois = un(
  `select (date_trunc('week', date_trunc('month', now()) + interval '7 day'))::date::text`,
);

// Quatre heures sur le pôle social pour le client mixte…
await p.goto(`${BASE}/heures`, { waitUntil: "domcontentloaded" });
await p.selectOption('select[name="clientId"]', mixte);
await p.fill('input[name="weekStart"]', semaineDuMois);
await p.fill('input[name="duration"]', "4");
await p.fill('input[name="activity"]', "Création des posts");
await p.click('button:has-text("Enregistrer")');
await p.waitForSelector("text=Création des posts", { timeout: 20000 });

// … puis douze heures sur le pôle web, pour le même client.
await p.click('aside button[name="pole"][value="web"]');
await p.waitForURL(/\/web$/, { timeout: 20000 });
await p.goto(`${BASE}/heures`, { waitUntil: "domcontentloaded" });
await p.selectOption('select[name="clientId"]', mixte);
await p.fill('input[name="weekStart"]', semaineDuMois);
await p.fill('input[name="duration"]', "12");
await p.fill('input[name="activity"]', "Intégration du site");
await p.click('button:has-text("Enregistrer")');
await p.waitForSelector("text=Intégration du site", { timeout: 20000 });

const mesHeures = await lire();
ok(
  "l'écran des heures rappelle sous quelle casquette chaque saisie a été faite",
  mesHeures.includes("Intégration du site") && mesHeures.includes("Web") && mesHeures.includes("Social"),
);
ok(
  "chaque saisie garde son pôle",
  un(`select pole from time_entries where activity='Création des posts'`) === "social" &&
    un(`select pole from time_entries where activity='Intégration du site'`) === "web",
);

await p.goto(`${BASE}/clients/${mixte}`, { waitUntil: "domcontentloaded" });
txt = await lire();
ok("en régie, la fiche compte les heures contre l'enveloppe vendue", txt.includes("12,0 / 40 h"));
ok("… et calcule le montant à facturer", txt.includes("À facturer") && txt.includes("1 140 €"));
ok("… en rappelant le calcul", txt.includes("12,0 h × 95 €"));
ok("… au lieu d'un montant vendu en projets", !txt.includes("Vendu en projets"));
await shot("fiche-regie");

// Vingt heures sur le site vendu 8 500 € au forfait : le taux réellement
// obtenu doit apparaître de lui-même.
await p.goto(`${BASE}/heures`, { waitUntil: "domcontentloaded" });
await p.selectOption('select[name="clientId"]', webSeul);
await p.fill('input[name="weekStart"]', semaineDuMois);
await p.fill('input[name="duration"]', "20");
await p.fill('input[name="activity"]', "Intégration Boutique Zen");
await p.click('button:has-text("Enregistrer")');
await p.waitForSelector("text=Intégration Boutique Zen", { timeout: 20000 });

await p.goto(`${BASE}/clients/${webSeul}`, { waitUntil: "domcontentloaded" });
txt = await lire();
ok("au forfait, la fiche donne le taux horaire réellement obtenu", txt.includes("425 € / h vendus"));
ok("… sans enveloppe d'heures à respecter", txt.includes("20,0 h") && !txt.includes("20,0 / "));
await shot("fiche-forfait");

await p.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
txt = await lire();
ok(
  "le portefeuille web chiffre la régie au temps passé",
  txt.includes("1 140 €") && txt.includes("Facturé au temps passé"),
);
ok("… et laisse le forfait à son prix de vente", txt.includes("8 500 €"));

await p.click('aside button[name="pole"][value="social"]');
await p.waitForURL(`${BASE}/`, { timeout: 20000 });
await p.goto(`${BASE}/rentabilite`, { waitUntil: "domcontentloaded" });
const rentab = await lire();
ok(
  "la rentabilité social ne retient que les 4 heures sociales",
  rentab.includes("4 h") && !rentab.includes("16 h") && !rentab.includes("32 h"),
);
await shot("rentabilite-social");

/* ====== 7. DÉCOCHER UN PÔLE N'EFFACE PAS SES MONTANTS =================== */

await p.goto(`${BASE}/clients/${mixte}`, { waitUntil: "domcontentloaded" });
await p.uncheck('input[name="departments"][value="web"]');
await p.click('button:has-text("Enregistrer")');
await p.waitForTimeout(1500);
ok(
  "le client repasse au social seul",
  un(`select departments::text from clients where id='${mixte}'`) === '["social"]',
);
ok(
  "mais la maintenance web est conservée",
  un(`select web_maintenance_cents from clients where id='${mixte}'`) === "15000",
);

await p.goto(`${BASE}/clients/${mixte}`, { waitUntil: "domcontentloaded" });
await p.check('input[name="departments"][value="web"]');
ok(
  "et la case recochée retrouve le montant saisi",
  (await p.locator('input[name="webMaintenance"]').inputValue()) === "150",
);

/* ====== 8. CHANGER DE MODE NETTOIE CE QUI N'A PLUS DE SENS ============== */

await p.goto(`${BASE}/clients/${mixte}`, { waitUntil: "domcontentloaded" });
await p.check('input[name="departments"][value="web"]');
await p.selectOption('select[name="webBilling"]', "forfait");
await p.click('button:has-text("Enregistrer")');
await p.waitForTimeout(1500);
ok(
  "repasser au forfait efface le tarif horaire et l'enveloppe",
  un(
    `select web_billing || '/' || web_hourly_rate_cents || '/' || web_hours_sold from clients where id='${mixte}'`,
  ) === "forfait/0/0",
);
ok(
  "mais la maintenance, elle, ne bouge pas",
  un(`select web_maintenance_cents from clients where id='${mixte}'`) === "15000",
);

await p.goto(`${BASE}/clients/${mixte}`, { waitUntil: "domcontentloaded" });
txt = await lire();
ok("la fiche ne parle plus de facturation au temps passé", !txt.includes("À facturer"));

/* ====== 9. L'ÉQUIPE NE VOIT PAS LES MONTANTS DU CONTRAT WEB ============= */

await p.goto(`${BASE}/equipe`, { waitUntil: "domcontentloaded" });
await p.fill('input[name="name"]', "Nina Web");
await p.fill('input[name="email"]', "nina@taochy.re");
await p.click('button:has-text("Inviter")');
await p.waitForSelector("text=nina@taochy.re", { timeout: 20000 });
const idNina = un(`select id from users where email='nina@taochy.re'`);
sql(`update users set departments='["web"]'::jsonb, password_hash=(select password_hash from users where email='emmanuel@taochy.re'), invite_token=null where id='${idNina}'`);

/* ---- le projet se crée aussi depuis la fiche, sans passer par /web ---- */

// Le cas qui manquait : un client porte « web » dans son contrat mais n'a
// aucun projet ouvert. Rien ne le signalait sur sa fiche, et son portail
// n'affichait pas d'onglet Projets — un client web sur le papier, absent de
// l'outil. La fiche doit permettre d'ouvrir le projet sur place.
await p.goto(`${BASE}/clients/${webSeul}`, { waitUntil: "domcontentloaded" });
ok(
  "la fiche d'un client web propose d'ouvrir un projet",
  await p.locator('button:has-text("Créer le projet")').isVisible(),
);
ok(
  "… sans redemander de quel client il s'agit",
  (await p.locator('form:has(button:has-text("Créer le projet")) select[name="clientId"]').count()) === 0,
);

await p.fill('input[name="name"]', "Refonte vitrine");
await p.fill('input[name="price"]', "4200");
await p.click('button:has-text("Créer le projet")');
await p.waitForURL(/\/web\/[0-9a-f-]{36}/, { timeout: 20000 });
ok(
  "le projet est bien rattaché au client de la fiche",
  un(`select count(*)::int from web_projects where client_id='${webSeul}' and name='Refonte vitrine'`) === "1",
);

await p.goto(`${BASE}/clients/${webSeul}`, { waitUntil: "domcontentloaded" });
txt = await lire();
ok("il rejoint les autres sur la fiche", txt.includes("Refonte vitrine"));
ok("… et son montant s'ajoute au vendu", txt.includes("12 700 €"));

const nina = await (await b.newContext({ viewport: { width: 1440, height: 950 } })).newPage();
await nina.goto(`${BASE}/connexion`, { waitUntil: "domcontentloaded" });
await nina.fill('input[name="email"]', "nina@taochy.re");
await nina.fill('input[name="password"]', "motdepasse-solide-2026");
await nina.click('button[type="submit"]');
await nina.waitForURL(/\/web$/, { timeout: 20000 });

await nina.goto(`${BASE}/clients/${webSeul}`, { waitUntil: "domcontentloaded" });
const vueNina = await lire(nina);
ok("l'équipe web voit le projet", vueNina.includes("Boutique en ligne"));
ok("… mais aucun montant vendu", !vueNina.includes("8 500 €"));
ok("… ni la maintenance", !vueNina.includes("Maintenance"));
ok(
  "… et son formulaire ne propose ni montant ni mode de facturation web",
  (await nina.locator('input[name="webMaintenance"]').count()) === 0 &&
    (await nina.locator('select[name="webBilling"]').count()) === 0,
);

console.log(`\nerreurs JS : ${errs.length ? errs.join(" | ") : "aucune"}`);
await b.close();
