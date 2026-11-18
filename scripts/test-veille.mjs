#!/usr/bin/env node
//
// Veille : la mémoire des publications des comptes suivis, le choix de
// période (30 jours … « Depuis toujours »), « x fois sa moyenne », la
// récupération de l'historique par tranches et « Refaire cette idée ».
// Vérification de bout en bout contre un faux serveur Metricool local,
// jamais contre le vrai compte.
//
// Le faux Metricool reprend les formes de réponse lues par
// src/lib/metricool-competitors.ts ({ data: [...] }, publishedAt en objet
// { dateTime }, dates en millisecondes…) et ajoute deux contraintes que la
// documentation ne mentionne pas, pour éprouver l'adaptation du code :
//   - une période de plus de 120 jours est refusée (400) ;
//   - au plus `limit` publications par réponse (les plus récentes).
// Une tranche Facebook répond toujours 500 (réponse partielle à accepter).
//
// Ce que le script vérifie :
//   - les règles pures (src/lib/veille-regles.ts) : périodes, formats, score,
//     « x fois sa moyenne », tri, remontée par tranches (tranche pleine,
//     erreur, 429, fin de l'historique) ;
//   - le code : la mémoire et la remontée ne font que des GET ;
//   - le stockage sans doublon (deux remontées complètes, identifiants
//     manquants), le classement par période et « Depuis toujours » ;
//   - la remontée par tranches, bornée en durée, reprise jusqu'au bout ;
//   - « Refaire cette idée » (idée, lien de référence, note, jamais de
//     copie du texte) ;
//   - Jarvis : tendances_concurrents (30 jours par défaut, période facultative) ;
//   - les droits : direction, pôle social, pôle web, client du portail ;
//   - aucune requête d'écriture vers Metricool.
//
// Usage (local uniquement, après npm run build ; le script démarre et arrête
// lui-même le serveur Pilot et le faux Metricool) :
//   PGURL="postgres://pilot:pilot@localhost:5432/pilot" node scripts/test-veille.mjs
//   CAPTURES=/chemin/dossier …  → captures Playwright (1440 px et iPhone 13).

import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, "..");
const PGURL = process.env.PGURL ?? process.env.DATABASE_URL;
const PORT = Number(process.env.PORT_TEST ?? 3133);
const BASE = `http://127.0.0.1:${PORT}`;
const CAPTURES = process.env.CAPTURES ?? "";

if (!PGURL || !/localhost|127\.0\.0\.1/.test(PGURL)) {
  console.error("\n  ✗ PGURL local requis (ce test écrit en base).\n");
  process.exit(1);
}
if (!existsSync(path.join(RACINE, ".next", "BUILD_ID"))) {
  console.error("\n  ✗ Lancer d'abord npm run build.\n");
  process.exit(1);
}

/* ---------------------------------------------------------------- outils -- */

const sql = (q) => execFileSync("psql", [PGURL, "-tA", "-v", "ON_ERROR_STOP=1", "-c", q], { encoding: "utf8" }).trim();
const un = (q) => sql(q).split("\n")[0].trim();
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => createHash("sha256").update(s).digest("hex");
let verts = 0;
const rouges = [];
const ok = (label, condition) => {
  if (condition) {
    verts += 1;
    console.log(`OK    ${label}`);
  } else {
    rouges.push(label);
    console.log(`ÉCHEC ${label}`);
  }
};
const jeu = randomBytes(3).toString("hex");
const debutTest = new Date().toISOString();
const dir = mkdtempSync(path.join(os.tmpdir(), "pilot-test-veille-"));
const MEDIA = path.join(dir, "media");
mkdirSync(path.join(MEDIA, ".secrets"), { recursive: true, mode: 0o700 });
writeFileSync(path.join(MEDIA, ".secrets", "pilot-secrets.key"), randomBytes(32).toString("hex"), { mode: 0o600 });
const JOURNAL = path.join(dir, "serveur.log");
const JOUR = 86_400_000;
const maintenant = Date.now();
const LIMITE = 50; // VEILLE_LIMITE : petite, pour que des tranches soient pleines
const MAX_JOURS = 120; // le faux Metricool refuse une période plus longue

/* ---------------------------------------------------- 1. règles pures -- */

console.log("\n— règles (src/lib/veille-regles.ts) —");
const R = await import(path.join(RACINE, "src/lib/veille-regles.ts"));
const now = new Date(maintenant);
ok("périodes : 30 jours (défaut), 90 jours, 6 mois, 1 an, Depuis toujours", R.PERIODES.map((p) => p.label).join("|") === "30 jours|90 jours|6 mois|1 an|Depuis toujours" && R.periodeDe(undefined) === "30j" && R.periodeDe("n'importe") === "30j" && R.periodeDe("tout") === "tout");
ok("début de période : 90 jours avant ; « Depuis toujours » → aucun", Math.round((maintenant - R.debutPeriode("90j", now).getTime()) / JOUR) === 90 && R.debutPeriode("tout", now) === null);
ok(
  "formats : REEL → reel, CAROUSEL_ALBUM → carrousel, IMAGE → photo, YouTube → vidéo, lien /shorts/ → short",
  R.formatDe("REEL", "instagram") === "reel" &&
    R.formatDe("CAROUSEL_ALBUM", "instagram") === "carrousel" &&
    R.formatDe("IMAGE", "instagram") === "photo" &&
    R.formatDe("", "youtube") === "video" &&
    R.formatDe("VIDEO", "youtube", "https://www.youtube.com/shorts/abc") === "short" &&
    R.formatDe("POST", "facebook") === "publication",
);
ok("score inchangé : interactions + vues / 20", R.score({ interactions: 100, views: 2000 }) === 200);
const serie = [
  ...Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, compte: "ig:a", date: new Date(maintenant - (100 + i * 5) * JOUR), score: 100 })),
  { id: "a-viral", compte: "ig:a", date: new Date(maintenant - 112 * JOUR), score: 800 },
  ...Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, compte: "ig:b", date: new Date(maintenant - (10 + i * 5) * JOUR), score: 5000 })),
  { id: "seul", compte: "ig:c", date: new Date(maintenant - 5 * JOUR), score: 50 },
];
const fois = R.foisMoyenne(serie);
ok(`« x fois sa moyenne » : 800 parmi des publications à 100 → ×8 (calculé : ${fois.get("a-viral")})`, fois.get("a-viral") === 8);
ok("… un gros compte régulier → ×1 ; compte sans voisines → inconnu", fois.get("b0") === 1 && fois.get("seul") === null);
const classes = R.classer(
  serie.map((p) => ({ ...p, fois: fois.get(p.id) })),
  "moyenne",
);
ok("tri « × sa moyenne » : la publication ×8 du petit compte passe devant le gros compte", classes[0].id === "a-viral");
ok("tri « Engagement » : le gros compte d'abord (comme avant)", R.classer(serie.map((p) => ({ ...p, fois: fois.get(p.id) })), "engagement")[0].compte === "ig:b");
ok("« il y a 5 mois », « il y a 2 ans », « hier »", R.ilYa(new Date(maintenant - 152 * JOUR), now) === "il y a 5 mois" && R.ilYa(new Date(maintenant - 800 * JOUR), now) === "il y a 2 ans" && R.ilYa(new Date(maintenant - JOUR - 1000), now) === "hier");
ok("légende courte : 280 caractères au plus", R.legendeCourte("mot ".repeat(200)).length <= 280 && R.legendeCourte("  ") === null);

let e = R.etatInitial(now);
let t = R.trancheSuivante(e);
ok("remontée : la première tranche demande toute la période (jusqu'au lancement d'Instagram)", t.from.getTime() === R.PLANCHER.getTime() && t.to.getTime() === maintenant);
let r = R.apresErreur(e, t, 400, "période trop longue");
ok("erreur sur une longue tranche → coupée en deux, taille retenue", !r.pause && r.etat.tailleOk === Math.floor(t.jours / 2) && r.etat.curseur === e.curseur);
e = R.apresSucces({ ...r.etat, taille: 80 }, { from: new Date(maintenant - 80 * JOUR), to: now, jours: 80 }, 1000, 1000);
ok("tranche pleine (autant que la limite) → recoupée sans avancer", e.taille === 40 && e.curseur === now.toISOString());
e = R.apresSucces(e, { from: new Date(maintenant - 40 * JOUR), to: now, jours: 40 }, 10, 1000);
ok("tranche partielle → on avance, la suivante peut grandir (sans dépasser la taille qui a échoué)", e.curseur === new Date(maintenant - 40 * JOUR).toISOString() && e.taille === 80);
ok("429 → pause (on reprendra)", R.apresErreur(e, R.trancheSuivante(e), 429, "trop de requêtes").pause === true);
const court = { from: new Date(maintenant - 60 * JOUR), to: new Date(maintenant - 40 * JOUR), jours: 20 };
r = R.apresErreur(e, court, 500, "erreur");
ok("erreur sur une tranche courte d'un réseau qui répond → tranche sautée (réponse partielle acceptée)", !r.etat.fini && r.etat.curseur === court.from.toISOString());
ok("… un réseau qui n'a jamais répondu s'arrête", R.apresErreur(R.etatInitial(now), court, 400, "x").etat.fini === true);
let v = { ...R.etatInitial(now), taille: 100, tailleOk: 100, succes: true };
for (let i = 0; i < 5 && !v.fini; i++) v = R.apresSucces(v, R.trancheSuivante(v), 0, 1000);
ok("plus d'un an sans publication en remontant → historique terminé", v.fini === true && v.vide >= R.VIDE_MAX_JOURS);

/* ------------------------------------------- 2. lecture seule : le code -- */

console.log("\n— lecture seule : le code —");
const codeVeille = readFileSync(path.join(RACINE, "src/lib/veille.ts"), "utf8");
const codeMc = readFileSync(path.join(RACINE, "src/lib/metricool-competitors.ts"), "utf8");
const entre = codeMc.slice(codeMc.indexOf("export async function competitorPostsBetween"));
ok("src/lib/veille.ts : aucun fetch ni méthode d'écriture", !/fetch\(/.test(codeVeille) && !/["'`](POST|PUT|PATCH|DELETE)["'`]/.test(codeVeille));
ok("competitorPostsBetween : appel sans méthode (GET par défaut)", /call<[^>]+>\(POSTS_PATH\[network\], \{[^}]*\}\);/.test(entre));

/* ------------------------------------------------ 3. le faux Metricool -- */

const TOKEN = `mc-${randomBytes(12).toString("hex")}`;
const USERID = `U${jeu}`;
const BRAND = `B${jeu}`;
const recues = [];
const json = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};
const reunion = (ms) => new Date(ms + 4 * 3_600_000).toISOString().slice(0, 19); // heure de La Réunion, sans fuseau
const depuisReunion = (s) => Date.parse(`${s}+04:00`);
const LEGENDE_VIRALE = `LEGENDE-ORIGINALE-${jeu} Trois erreurs à éviter quand on choisit son garage à La Réunion`;
const vignette = (id) => `https://scontent.cdninstagram.com/v/t51.2885-15/test-${jeu}-${id}.jpg?stp=dst-jpg&_nc_ht=x`;

// Instagram : un gros compte qui a grossi (300 → 4 300 interactions en deux ans), une vidéo virale il y a 5 mois,
// une rafale de 40 carrousels il y a 9 mois ; un petit compte d'inspiration avec une publication ×10.
const IG = [];
for (let age = 720, i = 0; age >= 2; age -= 5, i++) {
  const base = Math.round(300 + 4000 * (1 - age / 720));
  const reel = i % 3 === 0;
  IG.push({ postId: `ig-r-${i}`, screenName: "rivalreunion", age, type: reel ? "REEL" : "IMAGE", likes: Math.round(base * 0.9), comments: Math.round(base * 0.1), views: reel ? base * 10 : 0, content: `Publication ${i} du concurrent` });
}
IG.push({ postId: "ig-viral", screenName: "rivalreunion", age: 152, type: "REEL", likes: 15000, comments: 900, views: 400000, content: LEGENDE_VIRALE });
for (let k = 0; k < 40; k++) IG.push({ postId: `ig-rafale-${k}`, screenName: "rivalreunion", age: 262 + k * 0.2, type: "CAROUSEL_ALBUM", likes: 500, comments: 40, views: 0, content: `Série de l'été ${k}` });
for (let age = 360, i = 0; age >= 4; age -= 7, i++) IG.push({ postId: `ig-p-${i}`, screenName: "atelier.vanille", age, type: "IMAGE", likes: 55, comments: 5, views: 0, content: `Atelier ${i}` });
IG.push({ postId: "ig-petit-top", screenName: "atelier.vanille", age: 240, type: "CAROUSEL_ALBUM", likes: 560, comments: 40, views: 0, content: "Le carrousel qui a cartonné" });
const igBrut = (p) => ({
  postId: p.postId,
  screenName: p.screenName,
  content: p.content,
  url: `https://www.instagram.com/${p.type === "REEL" ? "reel" : "p"}/${p.postId}-${jeu}/`,
  thumbnailUrl: vignette(p.postId),
  type: p.type,
  publishedAt: { dateTime: reunion(maintenant - p.age * JOUR), timezone: "Indian/Reunion" },
  likes: p.likes,
  comments: p.comments,
  views: p.views,
});
// Facebook : une publication par mois sur trois ans ; l'une sans identifiant (lien seulement) ; une tranche en panne.
const FB = [];
for (let age = 1095, i = 0; age >= 3; age -= 30, i++) FB.push({ id: `fb-${i}`, age, sansId: i === 5, panne: false });
FB.push({ id: "fb-panne", age: 400, sansId: false, panne: true });
const PANNE = maintenant - 400 * JOUR;
const fbBrut = (p) => ({
  ...(p.sansId ? {} : { postId: p.id }),
  screenName: "garage.concurrent",
  message: `Publication Facebook ${p.id}`,
  link: `https://www.facebook.com/garage.concurrent/posts/${p.id}-${jeu}`,
  picture: vignette(p.id),
  type: "POST",
  created: maintenant - p.age * JOUR,
  reactions: 120 + (p.age % 7) * 10,
  comments: 12,
  shares: 3,
});
// YouTube : une chaîne, six vidéos en deux ans, dont un Short.
const YT = Array.from({ length: 6 }, (_, i) => ({ videoId: `yt-${i}`, age: 30 + i * 120 }));
const ytBrut = (p) => ({
  videoId: p.videoId,
  screenName: "chaine.reunion",
  title: `Vidéo ${p.videoId}`,
  watchUrl: p.videoId === "yt-1" ? `https://www.youtube.com/shorts/${p.videoId}${jeu}` : `https://www.youtube.com/watch?v=${p.videoId}${jeu}`,
  thumbnail: `https://i.ytimg.com/vi/${p.videoId}${jeu}/hqdefault.jpg`,
  publishedDate: new Date(maintenant - p.age * JOUR).toISOString(),
  likeCount: 300,
  commentCount: 20,
  viewCount: 15000,
});
const DONNEES = {
  instagram: IG.map((p) => ({ ms: maintenant - p.age * JOUR, brut: igBrut(p) })),
  facebook: FB.map((p) => ({ ms: maintenant - p.age * JOUR, brut: fbBrut(p) })),
  youtube: YT.map((p) => ({ ms: maintenant - p.age * JOUR, brut: ytBrut(p) })),
};
const CHEMINS = { "/v2/analytics/competitors/instagram/publications": "instagram", "/v2/analytics/competitors/facebook/posts": "facebook", "/v2/analytics/competitors/youtube/posts": "youtube" };
const COMPTES = {
  instagram: [
    { id: "101", screenName: "rivalreunion", displayName: "Rival Réunion", picture: null, followers: 48200, engagement: 3.1 },
    { id: "102", screenName: "atelier.vanille", displayName: "Atelier Vanille", picture: null, followers: 2100, engagement: 4.2 },
  ],
  facebook: [{ id: "201", screenName: "garage.concurrent", displayName: "Garage Concurrent", picture: null, followers: 9100, engagement: 1.2 }],
  youtube: [{ id: "301", screenName: "chaine.reunion", displayName: "Chaîne Réunion", picture: null, followers: 3200, engagement: 2.0 }],
};

const fauxMetricool = createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  const reseau = CHEMINS[u.pathname];
  const entree = { methode: req.method, chemin: u.pathname, reseau, from: u.searchParams.get("from"), to: u.searchParams.get("to"), limit: u.searchParams.get("limit"), statut: 200, n: 0, brand: u.searchParams.get("blogId") };
  recues.push(entree);
  if (req.method !== "GET") {
    entree.statut = 405;
    return json(res, 405, { detail: "lecture seule attendue" });
  }
  if (req.headers["x-mc-auth"] !== TOKEN || u.searchParams.get("userId") !== USERID) {
    entree.statut = 401;
    return json(res, 401, { title: "Unauthorized" });
  }
  const comp = u.pathname.match(/^\/v2\/analytics\/competitors\/(instagram|facebook|youtube)$/);
  if (comp) return json(res, 200, { data: u.searchParams.get("blogId") === BRAND ? COMPTES[comp[1]] : [] });
  if (!reseau) {
    entree.statut = 404;
    return json(res, 404, { title: "Not found" });
  }
  await attendre(60); // chaque tranche prend un peu de temps : la remontée doit rester bornée
  if (u.searchParams.get("blogId") !== BRAND) return json(res, 200, { data: [] });
  const de = depuisReunion(u.searchParams.get("from"));
  const a = depuisReunion(u.searchParams.get("to"));
  const limite = Number(u.searchParams.get("limit"));
  if (!Number.isFinite(de) || !Number.isFinite(a) || !limite || u.searchParams.get("timezone") !== "Indian/Reunion") {
    entree.statut = 400;
    return json(res, 400, { detail: "Paramètres invalides" });
  }
  if (a - de > MAX_JOURS * JOUR) {
    entree.statut = 400;
    return json(res, 400, { title: "Bad Request", detail: "Date range too long" });
  }
  if (reseau === "facebook" && de <= PANNE && PANNE <= a) {
    entree.statut = 500;
    return json(res, 500, { title: "Internal Server Error" });
  }
  const dedans = DONNEES[reseau].filter((p) => p.ms >= de && p.ms <= a).sort((x, y) => y.ms - x.ms);
  const rendu = dedans.slice(0, Math.min(limite, 5000));
  entree.n = rendu.length;
  json(res, 200, { data: rendu.map((p) => p.brut) });
});
await new Promise((ok_) => fauxMetricool.listen(0, "127.0.0.1", ok_));
const MC_BASE = `http://127.0.0.1:${fauxMetricool.address().port}`;

// Les vignettes : déjà dans le cache de /api/vignette (aucune image n'est cherchée sur le réseau).
const sharp = (await import("sharp")).default;
const VIGNETTES = path.join(MEDIA, "veille-vignettes");
mkdirSync(VIGNETTES, { recursive: true });
const teintes = { rivalreunion: ["#1d3557", "#e63946"], "atelier.vanille": ["#2a9d8f", "#e9c46a"], "garage.concurrent": ["#264653", "#f4a261"], "chaine.reunion": ["#3d405b", "#81b29a"] };
async function fabriquerVignette(url, compte, texte) {
  const u = new URL(url);
  const cle = createHash("sha1").update(u.hostname + u.pathname).digest("hex");
  const [a, b] = teintes[compte] ?? ["#444", "#999"];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="400" height="500" fill="url(#g)"/><text x="200" y="260" font-family="sans-serif" font-size="34" font-weight="700" fill="white" text-anchor="middle">${texte}</text></svg>`;
  writeFileSync(path.join(VIGNETTES, `${cle}.img`), await sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer());
  writeFileSync(path.join(VIGNETTES, `${cle}.img.type`), "image/jpeg");
}
for (const p of IG) await fabriquerVignette(vignette(p.postId), p.screenName, p.postId === "ig-viral" ? "Vidéo virale" : p.type === "REEL" ? "Reel" : p.type === "CAROUSEL_ALBUM" ? "Carrousel" : "Photo");
for (const p of FB) await fabriquerVignette(vignette(p.id), "garage.concurrent", "Facebook");
for (const p of YT) await fabriquerVignette(`https://i.ytimg.com/vi/${p.videoId}${jeu}/hqdefault.jpg`, "chaine.reunion", "YouTube");

/* ------------------------------------------------------ 4. serveur Pilot -- */

let serveur = null;
async function demarrer() {
  const sortie = [];
  serveur = spawn(path.join(RACINE, "node_modules/.bin/next"), ["start", "-p", String(PORT), "-H", "127.0.0.1"], {
    cwd: RACINE,
    env: { ...process.env, DATABASE_URL: PGURL, MEDIA_ROOT: MEDIA, NODE_ENV: "production", METRICOOL_API_BASE: MC_BASE, VEILLE_LIMITE: String(LIMITE), VEILLE_BUDGET_MS: "2500" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serveur.stdout.on("data", (x) => sortie.push(x.toString()));
  serveur.stderr.on("data", (x) => sortie.push(x.toString()));
  serveur.sortie = sortie;
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1500) })).ok) return;
    } catch {
      // pas prêt
    }
    await attendre(500);
  }
  throw new Error(`Pilot n'a pas démarré :\n${sortie.join("").slice(-2000)}`);
}
async function arreter() {
  if (!serveur) return;
  const s = serveur;
  serveur = null;
  if (s.exitCode === null) {
    s.kill("SIGTERM");
    await Promise.race([new Promise((r_) => s.once("exit", r_)), attendre(8000)]);
    if (s.exitCode === null) s.kill("SIGKILL");
  }
  writeFileSync(JOURNAL, s.sortie.join(""), { flag: "a" });
}
process.on("exit", () => serveur?.kill("SIGKILL"));
await demarrer();

/* --------------------------------------------------------- 5. le décor -- */

const sauvegarde = sql(`select coalesce(json_agg(i), '[]') from integrations i where id in ('metricool','mcp')`);
const ouvrirSession = (userId) => {
  const jeton = randomBytes(32).toString("base64url");
  un(`insert into sessions (token_hash, user_id, expires_at) values ('${sha(jeton)}','${userId}', now() + interval '1 day') returning token_hash`);
  return jeton;
};
const direction = un(`insert into users (email,name,initials,role) values ('dir-${jeu}@exemple.test','Direction ${jeu}','DT','direction') returning id`);
const sociale = un(`insert into users (email,name,initials,role,departments) values ('soc-${jeu}@exemple.test','Sociale ${jeu}','SO','equipe','["social"]'::jsonb) returning id`);
const web = un(`insert into users (email,name,initials,role,departments) values ('web-${jeu}@exemple.test','Web ${jeu}','WE','equipe','["web"]'::jsonb) returning id`);
const client = un(`insert into clients (name, short_name, departments, metricool_brand_id) values ('Garage Lagon ${jeu}', 'Garage Lagon ${jeu}', '["social"]'::jsonb, '${BRAND}') returning id`);
const portail = un(`insert into users (email,name,initials,role,client_id) values ('portail-${jeu}@exemple.test','Client ${jeu}','CP','client','${client}') returning id`);
sql(`insert into veille_accounts (client_id, network, handle, kind) values ('${client}', 'instagram', 'atelier.vanille', 'inspiration')`);
sql(`insert into integrations (id, token, account_id) values ('metricool', '${TOKEN}', '${USERID}') on conflict (id) do update set token = excluded.token, account_id = excluded.account_id`);
const JETON_MCP = `mcp${randomBytes(20).toString("hex")}`;
sql(`insert into integrations (id, token, account_id) values ('mcp', '${JETON_MCP}', '${direction}') on conflict (id) do update set token = excluded.token, account_id = excluded.account_id`);
const cDir = ouvrirSession(direction);
const cSoc = ouvrirSession(sociale);
const cWeb = ouvrirSession(web);
const cPortail = ouvrirSession(portail);

const page = async (chemin, cookie) => {
  const r_ = await fetch(`${BASE}${chemin}`, { headers: cookie ? { Cookie: `pilot_session=${cookie}` } : {}, redirect: "manual", cache: "no-store" });
  const html = (await r_.text()).replace(/<!--.*?-->/g, "");
  return { statut: r_.status, location: r_.headers.get("location") ?? "", html, visible: html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&") };
};
function actionsDe(manifestePage, fichier) {
  const j = JSON.parse(readFileSync(path.join(RACINE, `.next/server/app/${manifestePage}/server-reference-manifest.json`), "utf8"));
  return Object.fromEntries(Object.entries(j.node).filter(([, x]) => String(x.filename ?? "").includes(fichier)).map(([id, x]) => [x.exportedName, id]));
}
const A = actionsDe("(agence)/veille/page", "veille/actions");
/** Une action (état précédent, FormData) appelée comme le fait React : multipart, racine « 0 », champs « _1_… ». */
async function actionEtat(id, champs, cookie) {
  const fd = new FormData();
  // Comme React : les champs d'abord, la racine « 0 » en dernier (le serveur lit le flux dans l'ordre).
  for (const [k, x] of Object.entries(champs)) fd.append(`_1_${k}`, x);
  fd.append("0", JSON.stringify([{}, "$K1"]));
  const r_ = await fetch(`${BASE}/veille?client=${client}`, {
    method: "POST",
    headers: { "Next-Action": id, Accept: "text/x-component", Origin: BASE, ...(cookie ? { Cookie: `pilot_session=${cookie}` } : {}) },
    body: fd,
    redirect: "manual",
  });
  const texte = await r_.text();
  if (process.env.TRACE) console.log(`[trace] ${r_.status} ${texte.slice(0, 400)}`);
  const ligne = texte.split("\n").find((l) => l.startsWith("1:"));
  let resultat = null;
  try {
    resultat = ligne ? JSON.parse(ligne.slice(2)) : null;
  } catch {
    resultat = null;
  }
  return { statut: r_.status, resultat, redirection: r_.headers.get("x-action-redirect") ?? r_.headers.get("location") ?? "" };
}
async function mcp(methode, params) {
  const r_ = await fetch(`${BASE}/api/mcp/${JETON_MCP}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: methode, params }) });
  return (await r_.json()).result;
}
const enMemoire = (filtre = "") => Number(un(`select count(*) from veille_posts where client_id='${client}' ${filtre}`));
const etat = () => un(`select coalesce(backfill_status,'') || '|' || coalesce((lease_until > now())::text,'false') from veille_sync where client_id='${client}'`);
async function attendreFinRemontee() {
  for (let i = 0; i < 120; i++) {
    const [statut, bail] = (etat() || "|false").split("|");
    if (statut && bail !== "true") return statut;
    await attendre(250);
  }
  return "délai";
}
const ordre = (html) => [...html.matchAll(/data-publication="([0-9a-f-]{36})"/g)].map((m) => m[1]);
const externe = (id) => un(`select external_id from veille_posts where id='${id}'`);
const idInterne = (ext) => un(`select id from veille_posts where client_id='${client}' and external_id='${ext}'`);

let codeSortie = 0;
try {
  console.log("\n— page Veille, 30 jours (par défaut) —");
  ok("actions présentes dans le build (refaireIdee, recupererHistoriqueAction)", Boolean(A.refaireIdee && A.recupererHistoriqueAction));
  let p = await page(`/veille?client=${client}`, cDir);
  ok("direction : la page s'ouvre", p.statut === 200);
  ok("titre « Ce qui marche · 30 derniers jours » et le choix de période (5 choix)", p.visible.includes("Ce qui marche · 30 derniers jours") && ["30 jours", "90 jours", "6 mois", "1 an", "Depuis toujours"].every((l) => p.visible.includes(`>${l}</a>`)));
  ok("l'explication de « x fois sa moyenne » en une phrase", p.visible.includes("data-explication") && /fois le score moyen du même compte/.test(p.visible));
  const recentsAttendus = DONNEES.instagram.concat(DONNEES.facebook, DONNEES.youtube).filter((x) => x.ms >= maintenant - 30 * JOUR).length;
  ok(`le relevé des 30 jours est gardé en mémoire (${enMemoire()} publications, ${recentsAttendus} attendues au moins)`, enMemoire() >= recentsAttendus);
  let ids = ordre(p.html);
  ok(`30 jours : ${ids.length} publications classées, toutes de moins de 30 jours`, ids.length > 0 && ids.every((id) => Number(un(`select extract(epoch from now() - published_at)::int from veille_posts where id='${id}'`)) <= 30 * 86400 + 3600));
  ok("30 jours : la vidéo virale d'il y a 5 mois n'y est pas", !ids.map(externe).includes("ig-viral"));
  ok("chaque carte : lien d'origine, date relative, format, métriques, « Refaire cette idée »", p.visible.includes("Voir l'original ↗") && /il y a \d+ (jours|semaines)|hier/.test(p.visible) && p.visible.includes("Refaire cette idée") && /j'aime · \d+ comm\./.test(p.visible) && />(Reel|Photo|Carrousel|Vidéo|Short|Publication)</.test(p.visible));
  ok("direction : bouton « Récupérer l'historique »", p.html.includes('data-bouton="historique"'));

  console.log("\n— premier remplissage (backfill) par tranches, durée bornée —");
  let statut = await attendreFinRemontee();
  const apresPremier = enMemoire();
  const requetesPremier = recues.filter((x) => x.reseau && x.brand === BRAND).length;
  ok(`lancé tout seul à la première ouverture ; borné à 2,5 s : « ${statut} » après ${requetesPremier} requêtes, ${apresPremier} publications`, statut === "en_cours" && apresPremier > recentsAttendus);
  if (process.env.TRACE) console.log(sql(`select backfill_state, last_error from veille_sync where client_id='${client}'`), JSON.stringify(recues.slice(0, 20)));
  const curseurs = sql(`select backfill_state->'instagram'->>'curseur' from veille_sync where client_id='${client}'`);
  ok("l'état de la remontée est gardé (curseur par réseau) pour reprendre", Boolean(curseurs));
  let tours = 1;
  for (; statut === "en_cours" && tours < 25; tours++) {
    const x = await actionEtat(A.recupererHistoriqueAction, { clientId: client }, cDir);
    if (tours === 1) ok(`« Récupérer l'historique » (direction) : « ${x.resultat?.ok?.slice(0, 50)}… »`, /Récupération lancée|déjà en cours/.test(x.resultat?.ok ?? ""));
    await attendre(300);
    statut = await attendreFinRemontee();
  }
  ok(`remontée terminée en ${tours} tours (reprise là où elle s'était arrêtée)`, statut === "termine");
  const tranches = recues.filter((x) => x.reseau && x.brand === BRAND && x.from);
  const jours = (x) => (depuisReunion(x.to) - depuisReunion(x.from)) / JOUR;
  ok("toute la période demandée d'abord (depuis 2010), puis découpée après le refus (400)", tranches.some((x) => x.statut === 400 && jours(x) > 5000) && tranches.some((x) => x.statut === 200 && jours(x) > 60 && jours(x) <= MAX_JOURS));
  const premierOkIg = tranches.findIndex((x) => x.reseau === "instagram" && x.statut === 200 && jours(x) > 31);
  ok("après le premier succès, plus aucune tranche Instagram trop longue", tranches.slice(premierOkIg).filter((x) => x.reseau === "instagram").every((x) => jours(x) <= MAX_JOURS));
  const pleine = tranches.findIndex((x) => x.reseau === "instagram" && x.statut === 200 && x.n === LIMITE && jours(x) > 31);
  ok("tranche pleine (50 = la limite) → la même période redemandée en plus court", pleine >= 0 && tranches.slice(pleine + 1).some((x) => x.reseau === "instagram" && x.to === tranches[pleine].to && jours(x) < jours(tranches[pleine])));
  ok(`Instagram : toutes les publications gardées (${enMemoire("and network='instagram'")} / ${IG.length}), rafale de 40 comprise`, enMemoire("and network='instagram'") === IG.length);
  ok(`YouTube : ${enMemoire("and network='youtube'")} / ${YT.length}`, enMemoire("and network='youtube'") === YT.length);
  const fb = enMemoire("and network='facebook'");
  ok(`Facebook : tranche en panne sautée, le reste gardé (${fb} / ${FB.length}, sans « fb-panne »)`, fb >= FB.length - 2 && fb < FB.length && !idInterne("fb-panne"));
  ok("publication sans identifiant : gardée sous son lien", idInterne(`https://www.facebook.com/garage.concurrent/posts/fb-5-${jeu}`) !== "");
  ok("format, lien, vignette, légende courte et métriques enregistrés", un(`select format || '|' || (url like 'https://www.instagram.com/reel/%')::text || '|' || (image_url like 'https://scontent.cdninstagram.com/%')::text || '|' || (length(caption) <= 280)::text || '|' || likes || '|' || views from veille_posts where client_id='${client}' and external_id='ig-viral'`) === "reel|true|true|true|15000|400000");
  ok("légende stockée courte (280 caractères au plus) partout", un(`select count(*) from veille_posts where client_id='${client}' and length(caption) > 280`) === "0");

  console.log("\n— sans doublon —");
  const total = enMemoire();
  ok("aucun doublon (client, réseau, publication)", un(`select count(*) from (select network, external_id from veille_posts where client_id='${client}' group by 1,2 having count(*) > 1) d`) === "0");
  // Une seconde remontée complète (terminée → repart d'aujourd'hui) : mêmes publications, métriques mises à jour.
  const avantMetrics = un(`select max(metrics_at) from veille_posts where client_id='${client}'`);
  statut = "termine";
  let x = await actionEtat(A.recupererHistoriqueAction, { clientId: client }, cDir);
  await attendre(300);
  statut = await attendreFinRemontee();
  for (let i = 0; statut === "en_cours" && i < 25; i++) {
    await actionEtat(A.recupererHistoriqueAction, { clientId: client }, cDir);
    await attendre(300);
    statut = await attendreFinRemontee();
  }
  ok(`seconde remontée complète : toujours ${enMemoire()} publications (${total} avant), métriques rafraîchies`, x.resultat?.ok && statut === "termine" && enMemoire() === total && un(`select max(metrics_at) from veille_posts where client_id='${client}'`) > avantMetrics);

  console.log("\n— classement par période —");
  p = await page(`/veille?client=${client}&periode=tout`, cDir);
  const tout = ordre(p.html);
  ok("« Depuis toujours » : titre et rappel de la limite de Metricool", p.visible.includes("Ce qui marche · depuis toujours") && p.visible.includes("Metricool ne relève un compte qu'à partir de son ajout"));
  ok("« Depuis toujours » : la vidéo virale d'il y a 5 mois est n° 1", externe(tout[0]) === "ig-viral" && /il y a 5 mois/.test(p.visible));
  ok(`« Depuis toujours » compte toute la mémoire (« sur ${total} publications »)`, p.visible.includes(`sur ${total.toLocaleString("fr-FR")} publications`));
  ok("mémoire affichée : nombre de publications et date de la plus ancienne", p.html.includes("data-memoire") && /depuis le \d+ [^\s,]+ 20\d\d/.test(p.visible) && p.visible.includes("historique récupéré"));
  const six = ordre((await page(`/veille?client=${client}&periode=6m`, cDir)).html).map(externe);
  const quatreVingtDix = ordre((await page(`/veille?client=${client}&periode=90j`, cDir)).html).map(externe);
  ok("6 mois : la vidéo virale y est (n° 1) ; 90 jours : non", six[0] === "ig-viral" && !quatreVingtDix.includes("ig-viral"));
  const memeOrdre = (a, b) => {
    const c_ = a.filter((e_) => b.includes(e_));
    return { n: c_.length, ok: c_.every((e_, i) => i === 0 || b.indexOf(e_) > b.indexOf(c_[i - 1])) };
  };
  const m1 = memeOrdre(quatreVingtDix, six);
  ok(`classement comparable : « 90 jours » et « 6 mois » rangent leurs ${m1.n} publications communes dans le même ordre`, m1.n >= 5 && m1.ok);
  const trente = ids.map(externe);
  const toutExt = ordre((await page(`/veille?client=${client}&periode=tout`, cDir)).html).map(externe);
  const communs = trente.filter((e_) => toutExt.includes(e_));
  ok(`classement comparable : les publications communes à « 30 jours » et « Depuis toujours » gardent le même ordre (${communs.length})`, communs.length > 0 && communs.every((e_, i) => i === 0 || toutExt.indexOf(e_) > toutExt.indexOf(communs[i - 1])));
  p = await page(`/veille?client=${client}&periode=tout&tri=moyenne`, cDir);
  const moy = ordre(p.html).map(externe);
  ok(`tri « × sa moyenne » : le carrousel ×10 du petit compte remonte dans les 3 premiers (${moy.slice(0, 3).join(", ")})`, moy.slice(0, 3).includes("ig-petit-top"));
  ok("badge « ×… sa moyenne » sur les cartes", /×\d+(,\d)? sa moyenne/.test(p.visible));
  p = await page(`/veille?client=${client}&periode=tout&vue=inspirations`, cDir);
  ok("filtre « Inspirations » : seulement @atelier.vanille", ordre(p.html).length > 0 && ordre(p.html).every((id) => un(`select handle from veille_posts where id='${id}'`) === "atelier.vanille"));

  console.log("\n— Refaire cette idée —");
  const viral = idInterne("ig-viral");
  const avant = Number(un(`select count(*) from contents where client_id='${client}'`));
  x = await actionEtat(A.refaireIdee, { postId: viral }, cSoc);
  ok("pôle social : l'idée est créée", x.resultat?.ok === true && /^[0-9a-f-]{36}$/.test(x.resultat?.contenuId ?? ""));
  const c = x.resultat?.contenuId ?? "00000000-0000-0000-0000-000000000000";
  const ligne = sql(`select status || '|' || kind || '|' || network || '|' || coalesce(caption,'(vide)') || '|' || title from contents where id='${c}'`);
  ok(`contenu « idée », format reel, Instagram, sans légende : ${ligne}`, ligne.startsWith("idee|reel|instagram|(vide)|Refaire : reel de @rivalreunion"));
  const consignes = un(`select replace(instructions, E'\\n', ' ¶ ') from contents where id='${c}'`);
  ok("consignes : « Inspiré de @rivalreunion, publication du … » et le lien de référence", /Inspiré de @rivalreunion, publication du \d+ \w+ 20\d\d/.test(consignes) && consignes.includes(`https://www.instagram.com/reel/ig-viral-${jeu}/`));
  if (process.env.TRACE) console.log(consignes);
  ok("consignes : « Jamais de copie » et ce qui a marché (format, chiffres, × sa moyenne)", consignes.includes("Jamais de copie") && /Reel · 15 k j'aime/.test(consignes.replace(/ /g, " ")) && /fois la moyenne du compte/.test(consignes));
  ok("jamais de copie : ni la légende ni le texte d'origine dans le contenu", !sql(`select coalesce(title,'') || coalesce(caption,'') || coalesce(instructions,'') from contents where id='${c}'`).includes("LEGENDE-ORIGINALE") && !consignes.includes("Trois erreurs à éviter"));
  ok("lien de référence attaché au contenu, avec la note", un(`select url || '|' || label from content_links where content_id='${c}'`).startsWith(`https://www.instagram.com/reel/ig-viral-${jeu}/|Inspiré de @rivalreunion, publication du`));
  ok("version V1 et fil d'activité, comme une création ordinaire", un(`select count(*) from content_versions where content_id='${c}' and number=1`) === "1" && un(`select count(*) from activity where content_id='${c}' and actor_id='${sociale}'`) === "1");
  x = await actionEtat(A.refaireIdee, { postId: idInterne("ig-petit-top") }, cDir);
  ok("direction : « Refaire cette idée » (carrousel → contenu carrousel)", x.resultat?.ok === true && un(`select kind from contents where id='${x.resultat.contenuId}'`) === "carrousel");
  x = await actionEtat(A.refaireIdee, { postId: "pas-un-id" }, cSoc);
  ok("publication inconnue : message clair, rien de créé", /introuvable/.test(x.resultat?.error ?? "") && Number(un(`select count(*) from contents where client_id='${client}'`)) === avant + 2);

  console.log("\n— droits —");
  p = await page(`/veille?client=${client}`, cSoc);
  ok("pôle social : la page s'ouvre, sans « Récupérer l'historique »", p.statut === 200 && p.visible.includes("Refaire cette idée") && !p.html.includes('data-bouton="historique"'));
  x = await actionEtat(A.recupererHistoriqueAction, { clientId: client }, cSoc);
  ok("pôle social : « Récupérer l'historique » refusé (« Réservé à la direction. »)", x.resultat?.error === "Réservé à la direction.");
  p = await page(`/veille?client=${client}`, cWeb);
  ok("pôle web : renvoyé vers le web", p.statut >= 300 && p.statut < 400 && p.location.includes("/web"));
  x = await actionEtat(A.refaireIdee, { postId: viral }, cWeb);
  ok("pôle web : « Refaire cette idée » refusé, rien de créé", x.resultat?.ok !== true && Number(un(`select count(*) from contents where client_id='${client}'`)) === avant + 2);
  x = await actionEtat(A.recupererHistoriqueAction, { clientId: client }, cWeb);
  ok("pôle web : « Récupérer l'historique » refusé", x.resultat?.ok === undefined);
  p = await page(`/veille?client=${client}`, cPortail);
  ok("client du portail : renvoyé vers son portail", p.statut >= 300 && p.statut < 400 && p.location.includes("/portail"));
  x = await actionEtat(A.refaireIdee, { postId: viral }, cPortail);
  const x2 = await actionEtat(A.recupererHistoriqueAction, { clientId: client }, cPortail);
  ok("client du portail : aucune action possible, rien de créé", x.resultat?.ok !== true && x2.resultat?.ok === undefined && Number(un(`select count(*) from contents where client_id='${client}'`)) === avant + 2);
  p = await page(`/veille?client=${client}`, null);
  ok("sans session : renvoyé vers la connexion", p.statut >= 300 && p.statut < 400 && p.location.includes("/connexion"));

  console.log("\n— Jarvis : tendances_concurrents —");
  const liste = await mcp("tools/list", {});
  const outil = liste.tools.find((o) => o.name === "tendances_concurrents");
  ok("l'outil existe, client_id requis, période facultative", outil && outil.inputSchema.required?.join() === "client_id" && JSON.stringify(outil.inputSchema.properties.periode.enum) === '["30j","90j","6m","1a","tout"]');
  let res = await mcp("tools/call", { name: "tendances_concurrents", arguments: { client_id: client } });
  let j = JSON.parse(res.content[0].text);
  ok(`sans période : 30 jours (${j.publications?.length} publications, toutes récentes)`, !res.isError && j.periode === "30j" && j.publications.length > 0 && j.publications.every((x_) => Date.parse(x_.date) >= maintenant - 31 * JOUR));
  res = await mcp("tools/call", { name: "tendances_concurrents", arguments: { client_id: client, periode: "tout" } });
  j = JSON.parse(res.content[0].text);
  ok("periode « tout » : la vidéo virale en tête, avec sa date, son format et « fois_moyenne »", !res.isError && j.publications[0].url.includes("ig-viral") && j.publications[0].format === "reel" && j.publications[0].fois_moyenne > 2);

  console.log("\n— aucune écriture vers Metricool —");
  const methodes = [...new Set(recues.map((x_) => x_.methode))];
  ok(`${recues.length} requêtes reçues par le faux Metricool, toutes en GET (${methodes.join(", ")})`, recues.length > 0 && methodes.length === 1 && methodes[0] === "GET");

  /* --------------------------------------------------- captures -- */
  if (CAPTURES) {
    console.log("\n— captures —");
    mkdirSync(CAPTURES, { recursive: true });
    const pw = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;
    const navigateur = await pw.chromium.launch();
    const formats = [
      ["1440", { viewport: { width: 1440, height: 3000 }, deviceScaleFactor: 1 }],
      ["iphone13", { ...pw.devices["iPhone 13"], viewport: { width: 390, height: 7400 } }],
    ];
    for (const [nom, options] of formats) {
      const ctx = await navigateur.newContext({ ...options, locale: "fr-FR", timezoneId: "Indian/Reunion" });
      await ctx.addCookies([{ name: "pilot_session", value: cDir, url: BASE }]);
      const onglet = await ctx.newPage();
      const erreurs = [];
      onglet.on("pageerror", (err) => erreurs.push(err.message));
      await onglet.goto(`${BASE}/veille?client=${client}&periode=tout`, { waitUntil: "networkidle" });
      await onglet.screenshot({ path: path.join(CAPTURES, `veille-tout-${nom}.png`) });
      const panneau = onglet.locator("section", { hasText: "Ce qui marche" }).first();
      await panneau.screenshot({ path: path.join(CAPTURES, `veille-tout-classement-${nom}.png`) });
      // Le bouton dans le navigateur : l'idée se crée, le bouton propose de l'ouvrir.
      await onglet.locator("[data-publication] button", { hasText: "Refaire cette idée" }).first().click();
      await onglet.getByText("Idée créée · ouvrir").first().waitFor({ timeout: 10_000 });
      await panneau.locator("[data-publication]").first().screenshot({ path: path.join(CAPTURES, `veille-carte-refaite-${nom}.png`) });
      ok(`captures ${nom} : aucune erreur JavaScript${erreurs.length ? ` — ${erreurs.join(" | ")}` : ""}, bouton cliqué dans le navigateur`, erreurs.length === 0);
      await ctx.close();
    }
    await navigateur.close();
  }
} catch (err) {
  console.error(err);
  codeSortie = 1;
} finally {
  console.log("\n— nettoyage —");
  await arreter().catch(() => undefined);
  fauxMetricool.close();
  sql(`delete from users where email like '%-${jeu}@exemple.test'`);
  sql(`delete from clients where name like '%${jeu}%'`);
  // Les relevés réguliers du serveur de test ont pu toucher d'autres clients (faux Metricool : rien) : on efface leurs traces.
  sql(`delete from veille_posts where first_seen_at >= '${debutTest}'`);
  sql(`delete from veille_sync where updated_at >= '${debutTest}'`);
  sql(`delete from integrations where id in ('metricool','mcp')`);
  sql(`insert into integrations select * from json_populate_recordset(null::integrations, ${lit(sauvegarde)})`);
  if (process.env.TRACE) console.log(readFileSync(JOURNAL, "utf8").slice(-4000));
  rmSync(dir, { recursive: true, force: true });
  console.log("décor effacé, serveur Pilot et faux Metricool arrêtés");
}

console.log(`\n${verts} vérifications vertes, ${rouges.length} rouge(s).`);
if (rouges.length || codeSortie) {
  for (const x of rouges) console.log(`  ✗ ${x}`);
  process.exit(1);
}
process.exit(0);
