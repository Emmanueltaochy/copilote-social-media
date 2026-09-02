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
const firstLine = (s) => s.split("\n")[0].trim();
const mails = () => (readFileSync(`${SP}/mails.log`, "utf8").match(/=== MAIL ===/g) ?? []).length;

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const errs = [];
const ok = (label, cond) => console.log(`${cond ? "OK  " : "ÉCHEC"} ${label}`);

async function nouvelOnglet(w = 1440, h = 950) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push(String(e)));
  return page;
}

const bulle = (p) => p.locator('button[aria-label*="messagerie" i]');
const pastilleBulle = (p) => bulle(p).locator("span");

/* ------------------------------------------------------------ installation -- */

const emma = await nouvelOnglet();
await emma.goto(`${BASE}/bienvenue`, { waitUntil: "domcontentloaded" });
await emma.fill('input[name="name"]', "Emmanuel Taochy");
await emma.fill('input[name="email"]', "emmanuel@taochy.re");
await emma.fill('input[name="password"]', "motdepasse-solide-2026");
await emma.click('button[type="submit"]');
await emma.waitForURL(`${BASE}/`, { timeout: 20000 });

// Une collaboratrice, invitée par l'écran Équipe.
await emma.goto(`${BASE}/equipe`, { waitUntil: "domcontentloaded" });
await emma.fill('input[name="name"]', "Léa Cadre");
await emma.fill('input[name="email"]', "lea@taochy.re");
await emma.click('button:has-text("Inviter")');
await emma.waitForSelector("text=Léa Cadre", { timeout: 20000 });

const jeton = firstLine(sql("select invite_token from users where email='lea@taochy.re'"));
const lea = await nouvelOnglet(1280, 900);
await lea.goto(`${BASE}/invitation/${jeton}`, { waitUntil: "domcontentloaded" });
await lea.fill('input[name="password"]', "mot-de-passe-lea-2026");
await lea.click('button[type="submit"]');
await lea.waitForURL((u) => !u.pathname.includes("invitation"), { timeout: 20000 });
console.log("les deux comptes sont ouverts");

/* --------------------------------------------------- 1. photo de profil -- */

await emma.goto(`${BASE}/compte`, { waitUntil: "domcontentloaded" });
const avant = await emma.textContent("body");
ok("la page Mon compte s'ouvre", avant.includes("Photo de profil") && avant.includes("Mot de passe"));

await emma.setInputFiles('input[type="file"]', `${SP}/photo-test.jpg`);
await emma.waitForSelector('button:has-text("Retirer")', { timeout: 30000 });

const chemin = firstLine(sql("select coalesce(avatar_path,'') from users where email='emmanuel@taochy.re'"));
ok(`la photo est enregistrée (${chemin})`, chemin.startsWith("avatars/") && chemin.endsWith(".webp"));

const dims = firstLine(
  execFileSync("node", [
    "-e",
    `const s=require('/home/claude/copilote-social-media/node_modules/sharp');s('${SP}/media/${chemin}').metadata().then(m=>console.log(m.width+'x'+m.height))`,
  ], { encoding: "utf8" }),
);
ok(`elle est recadrée en carré de 256 px (${dims})`, dims === "256x256");

// Elle doit être servie, et seulement à quelqu'un de connecté.
const idEmma = firstLine(sql("select id from users where email='emmanuel@taochy.re'"));
const servie = await emma.evaluate(
  async (u) => (await fetch(u, { cache: "no-store" })).status,
  `/api/avatar/${idEmma}`,
);
ok("la photo est servie à un compte connecté", servie === 200);

const anonyme = await b.newContext();
const inconnu = await anonyme.newPage();
const refus = await inconnu.evaluate(() => 0).catch(() => 0);
await inconnu.goto(`${BASE}/connexion`, { waitUntil: "domcontentloaded" });
const statutAnonyme = await inconnu.evaluate(
  async (u) => (await fetch(u, { cache: "no-store" })).status,
  `/api/avatar/${idEmma}`,
);
ok("elle est refusée à un visiteur non connecté", statutAnonyme === 401 && refus === 0);

await emma.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
ok(
  "la barre latérale affiche la photo et mène au compte",
  (await emma.locator('a[href="/compte"] img').count()) === 1,
);
await emma.screenshot({ path: `${SP}/shots/c1-compte.png`, fullPage: true });

/* ------------------------------------------------- 2. message à l'équipe -- */

const mailsAvant = mails();

await emma.click('button[aria-label*="messagerie" i]');
await emma.waitForSelector("text=Toute l'équipe", { timeout: 20000 });
const liste = await emma.textContent("body");
ok("la bulle liste le fil d'équipe et la collaboratrice", liste.includes("Toute l'équipe") && liste.includes("Léa Cadre"));
await emma.screenshot({ path: `${SP}/shots/c2-liste.png` });

const filEquipe = await emma.locator("[data-thread]").first().getAttribute("data-thread");
await emma.click(`[data-thread="${filEquipe}"]`);
await emma.waitForSelector("text=Ce fil est lu par toute l'équipe", { timeout: 20000 });
await emma.fill("textarea", "Réunion demain 9h, on cale le planning de septembre.");
await emma.click('button:has-text("Envoyer")');
await emma.waitForSelector("text=Réunion demain 9h", { timeout: 20000 });
ok("le message part dans le fil d'équipe", Number(sql("select count(*) from messages")) === 1);
await emma.screenshot({ path: `${SP}/shots/c3-fil-equipe.png` });

/* ------------------------------------- 3. réception : cloche et pastille -- */

await lea.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await lea.waitForTimeout(500);
const pastille = await pastilleBulle(lea).first().textContent();
ok(`la bulle porte une pastille (${pastille})`, pastille?.trim() === "1");

const cloche = await lea.locator('aside button[aria-label*="Notifications"]').getAttribute("aria-label");
ok(`la cloche annonce le message (${cloche})`, /1 non lues?/.test(cloche ?? ""));

await lea.click('aside button[aria-label*="Notifications"]');
await lea.waitForSelector("text=a écrit à l'équipe", { timeout: 20000 });
const panneau = await lea.textContent("body");
ok("la notification cite l'auteur et le début du message", panneau.includes("Emmanuel Taochy a écrit à l'équipe") && panneau.includes("Réunion demain 9h"));
await lea.screenshot({ path: `${SP}/shots/c4-cloche.png`, fullPage: true });
await lea.keyboard.press("Escape");

ok("aucun courriel n'est parti pour un message interne", mails() === mailsAvant);

/* ----------------------------------------- 4. lecture : les compteurs tombent -- */

await lea.click('button[aria-label*="messagerie" i]');
await lea.click(`[data-thread="${filEquipe}"]`);
await lea.waitForSelector("text=Réunion demain 9h", { timeout: 20000 });
await lea.waitForTimeout(1200);

const idLea = firstLine(sql("select id from users where email='lea@taochy.re'"));
ok(
  "la conversation est marquée lue",
  Number(sql(`select count(*) from conversation_members where user_id='${idLea}' and last_read_at is not null`)) >= 1,
);
ok(
  "la notification de la cloche s'est éteinte avec la lecture",
  Number(sql(`select count(*) from notifications where user_id='${idLea}' and read_at is null`)) === 0,
);
ok("la pastille de la bulle a disparu", (await pastilleBulle(lea).count()) === 0);

/* --------------------------------------------------- 5. message privé -- */

await lea.click('button[aria-label="Revenir aux conversations"]');
await lea.click(`[data-thread="peer:${idEmma}"]`);
await lea.waitForSelector("text=Aucun message avec Emmanuel", { timeout: 20000 });
await lea.fill("textarea", "Je peux décaler à 9h30 ? J'ai un tournage tôt.");
await lea.click('button:has-text("Envoyer")');
await lea.waitForSelector("text=Je peux décaler", { timeout: 20000 });
ok("le tête-à-tête est créé au premier message", Number(sql("select count(*) from conversations where kind='direct'")) === 1);
await lea.screenshot({ path: `${SP}/shots/c5-prive.png` });

// Une deuxième réponse ne doit pas ouvrir un second fil.
await lea.fill("textarea", "Sinon 9h me va aussi.");
await lea.click('button:has-text("Envoyer")');
await lea.waitForSelector("text=Sinon 9h me va", { timeout: 20000 });
ok("réécrire ne crée pas un second fil", Number(sql("select count(*) from conversations where kind='direct'")) === 1);

await emma.reload({ waitUntil: "domcontentloaded" });
await emma.waitForTimeout(600);
const pastilleEmma = await pastilleBulle(emma).first().textContent();
ok(`Emmanuel voit 2 messages privés en attente (${pastilleEmma})`, pastilleEmma?.trim() === "2");

// La notification mène directement à la bonne conversation.
const href = firstLine(
  sql(`select href from notifications where user_id='${idEmma}' order by created_at desc limit 1`),
);
ok(`la notification pointe vers la conversation (${href})`, /^\/\?chat=[0-9a-f-]{36}$/.test(href));

await emma.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded" });
await emma.waitForSelector("text=Je peux décaler", { timeout: 20000 });
ok("le lien de la cloche ouvre la bulle sur la bonne conversation", true);
await emma.screenshot({ path: `${SP}/shots/c6-ouverture-notification.png`, fullPage: true });

/* ------------------------------------- 6. cloisonnement : le client dehors -- */

await emma.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
await emma.fill('input[name="name"]', "Cap Marine");
await emma.fill('input[name="sector"]', "Nautisme");
await emma.fill('input[name="monthlyFee"]', "2400");
await emma.fill('input[name="contentTarget"]', "16");
await emma.fill('input[name="hoursSold"]', "30");
await emma.click('button:has-text("Créer le client")');
await emma.waitForURL(/\/clients\/[0-9a-f-]{36}/, { timeout: 20000 });
await emma.fill('input[name="contactName"]', "Sophie Rivière");
await emma.fill('input[name="contactEmail"]', "sophie@capmarine.re");
await emma.click('button:has-text("Créer l\'accès")');
await emma.waitForSelector("text=Sophie Rivière", { timeout: 20000 });
const lienClient = await emma.locator("input[readonly]").first().inputValue();

const sophie = await nouvelOnglet(1200, 900);
await sophie.goto(lienClient, { waitUntil: "domcontentloaded" });
await sophie.fill('input[name="password"]', "mot-de-passe-client-2026");
await sophie.click('button[type="submit"]');
await sophie.waitForURL(/portail/, { timeout: 20000 });

ok("le portail client n'a pas de bulle de messagerie", (await bulle(sophie).count()) === 0);
const tentative = await sophie.evaluate(async () => {
  const r = await fetch("/api/chat", { cache: "no-store", redirect: "manual" });
  return r.status;
});
ok(`un compte client n'atteint pas la messagerie (statut ${tentative})`, tentative !== 200);
ok(
  "il n'apparaît pas non plus dans la liste des interlocuteurs",
  !(await emma.textContent("body")).includes("Sophie Rivière") ||
    Number(sql("select count(*) from conversation_members m join users u on u.id=m.user_id where u.role='client'")) === 0,
);

console.log("\nerreurs JS :", errs.length ? errs : "aucune");
await b.close();
