#!/usr/bin/env node
//
// Chiffrement de toutes les clés enregistrées (table `integrations`) :
// vérification de bout en bout, en local, sur une base de test.
//
// Ce que le script vérifie :
//   - le garde-fou des chemins de médias (src/lib/chemin-media.ts) : aucun
//     chemin ne peut atteindre MEDIA_ROOT/.secrets, et chaque route qui sert
//     un fichier passe par lui ;
//   - sans clé de chiffrement : aucune conversion, un avertissement, aucune
//     clé créée, les intégrations marchent toujours (secrets en clair) ;
//   - clé illisible (PILOT_SECRETS_KEY abîmée) : même chose ;
//   - avec la clé (fichier dans le volume) : conversion sur place, chaque
//     secret se rouvre à l'identique, les marqueurs techniques ne bougent pas,
//     les intégrations marchent (Claude.ai par MCP, Abby et Metricool sur de
//     faux serveurs locaux qui relèvent la clé reçue, liens signés des médias) ;
//   - deuxième démarrage : rien ne change (idempotent) ;
//   - clé changée : conversion suspendue, rien n'est touché ;
//   - aucune valeur secrète dans une copie de la base (pg_dump), ni dans le
//     journal du serveur, ni dans les pages ;
//   - aucune route de fichier ne sert la clé, même si la base pointe dessus.
//
// Usage (local uniquement, après npm run build) :
//   PGURL="postgres://pilot:pilot@localhost:5432/pilot" node scripts/test-secrets.mjs
//
// Le script démarre et arrête lui-même le serveur (next start, port 3121) à
// chaque étape, et remet la table `integrations` et les réglages comme il les
// a trouvés.

import { execFileSync, spawn } from "node:child_process";
import { createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, "..");
const PGURL = process.env.PGURL ?? process.env.DATABASE_URL;
const PORT = Number(process.env.PORT_TEST ?? 3121);
const BASE = `http://127.0.0.1:${PORT}`;

if (!PGURL) {
  console.error("\n  ✗ PGURL (ou DATABASE_URL) est requis.\n");
  process.exit(1);
}
if (!/localhost|127\.0\.0\.1/.test(PGURL)) {
  console.error("\n  ✗ Ce test écrit en base : il ne tourne qu'en local.\n");
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
const dir = mkdtempSync(path.join(os.tmpdir(), "pilot-test-secrets-"));
const MEDIA = path.join(dir, "media");
mkdirSync(MEDIA, { recursive: true });
const JOURNAL = path.join(dir, "serveur.log");
const reponses = [];

/* ------------------------------------- 1. chemins de médias (règle pure) -- */

console.log("\n— chemins de médias : la clé n'est jamais servie —");
const { cheminDansMedias } = await import(path.join(RACINE, "src/lib/chemin-media.ts"));
const refuse = (p) => {
  try {
    cheminDansMedias("/data/assets", p);
    return false;
  } catch {
    return true;
  }
};
ok("chemin normal accepté (clients/abc/photo.webp)", cheminDansMedias("/data/assets", "clients/abc/photo.webp") === "/data/assets/clients/abc/photo.webp");
for (const p of [
  ".secrets/pilot-secrets.key",
  "./.secrets/pilot-secrets.key",
  ".SECRETS/pilot-secrets.key",
  "clients/../.secrets/pilot-secrets.key",
  "../assets/.secrets/pilot-secrets.key",
  "/data/assets/.secrets/pilot-secrets.key",
  "marque/.secrets",
  "clients/x.secrets.webp",
]) {
  ok(`refusé : « ${p} »`, refuse(p));
}
for (const p of ["../etc/passwd", "/etc/passwd", "..", ".", "", "a\0b", "../assets-autre/x.webp"]) ok(`refusé (hors de la racine) : « ${p.replace("\0", "\\0")} »`, refuse(p));

const routes = [];
const parcourir = (d) => {
  for (const f of readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) parcourir(p);
    else if (f.name === "route.ts") routes.push(p);
  }
};
parcourir(path.join(RACINE, "src/app/api"));
const lisent = routes.filter((f) => /createReadStream\(|readFile\(/.test(readFileSync(f, "utf8")));
const sansGarde = lisent.filter((f) => {
  const code = readFileSync(f, "utf8");
  if (f.includes(`${path.sep}vignette${path.sep}`)) return !/createHash\("sha1"\)/.test(code) || /searchParams\.get\([^)]*\)[^;]*path\.join/.test(code);
  return !/absolutePath\(/.test(code);
});
ok(
  `${lisent.length} routes servent un fichier : toutes passent par absolutePath (la vignette ne lit qu'un nom calculé)${sansGarde.length ? ` — sans garde : ${sansGarde.map((f) => path.relative(RACINE, f)).join(", ")}` : ""}`,
  lisent.length >= 9 && sansGarde.length === 0,
);
const storage = readFileSync(path.join(RACINE, "src/lib/storage.ts"), "utf8");
ok("absolutePath (storage.ts) délègue à cheminDansMedias", /export function absolutePath[\s\S]{0,300}cheminDansMedias\(MEDIA_ROOT, storagePath\)/.test(storage));

/* --------------------------------------------- 2. faux Abby et Metricool -- */

const recus = { abby: [], metricool: [] };
const fauxAbby = createServer((req, res) => {
  recus.abby.push(req.headers.authorization ?? "");
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ docs: [], hasNextPage: false }));
});
const fauxMetricool = createServer((req, res) => {
  recus.metricool.push(req.headers["x-mc-auth"] ?? "");
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify([{ id: 1, userId: 42, label: `Marque ${jeu}`, instagram: "x" }]));
});
await new Promise((r) => fauxAbby.listen(0, "127.0.0.1", r));
await new Promise((r) => fauxMetricool.listen(0, "127.0.0.1", r));

/* ------------------------------------------------------ 3. serveur Pilot -- */

let serveur = null;
async function demarrer(env = {}) {
  const sortie = [];
  serveur = spawn(path.join(RACINE, "node_modules/.bin/next"), ["start", "-p", String(PORT), "-H", "127.0.0.1"], {
    cwd: RACINE,
    env: {
      ...process.env,
      PILOT_SECRETS_KEY: "",
      ANTHROPIC_API_KEY: "",
      ABBY_API_KEY: "",
      PILOT_MCP_TOKEN: "",
      STOCK_VIDEOS_KEY: "",
      METRICOOL_TOKEN: "",
      METRICOOL_USER_ID: "",
      GOOGLE_SERVICE_ACCOUNT_JSON: "",
      ...env,
      DATABASE_URL: PGURL,
      MEDIA_ROOT: MEDIA,
      ABBY_API_URL: `http://127.0.0.1:${fauxAbby.address().port}`,
      METRICOOL_API_BASE: `http://127.0.0.1:${fauxMetricool.address().port}`,
      APP_DOMAIN: "pilot.test",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serveur.stdout.on("data", (d) => sortie.push(d.toString()));
  serveur.stderr.on("data", (d) => sortie.push(d.toString()));
  serveur.sortie = sortie;
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1500) });
      if (r.ok) return sortie;
    } catch {
      // pas encore prêt
    }
    if (serveur.exitCode !== null) break;
    await attendre(500);
  }
  throw new Error(`Le serveur n'a pas démarré :\n${sortie.join("").slice(-2000)}`);
}
async function arreter() {
  if (!serveur) return "";
  const s = serveur;
  serveur = null;
  if (s.exitCode === null) {
    s.kill("SIGTERM");
    await Promise.race([new Promise((r) => s.once("exit", r)), attendre(8000)]);
    if (s.exitCode === null) s.kill("SIGKILL");
  }
  const texte = s.sortie.join("");
  writeFileSync(JOURNAL, texte, { flag: "a" });
  return texte;
}

/* -------------------------------------------------------- 4. le décor -- */

const sauvegarde = sql(`select coalesce(json_agg(i), '[]') from integrations i`);
const reglagesAvant = sql(`select coalesce(json_agg(s), '[]') from settings s where id = 'agence'`);

const direction = un(`insert into users (email,name,initials,role) values ('dir-${jeu}@exemple.test','Direction ${jeu}','DT','direction') returning id`);
const client = un(`insert into clients (name, short_name) values ('Client secrets ${jeu}','Secrets ${jeu}') returning id`);
const ouvrirSession = (userId) => {
  const jeton = randomBytes(32).toString("base64url");
  un(`insert into sessions (token_hash, user_id, expires_at) values ('${sha(jeton)}','${userId}', now() + interval '1 day') returning token_hash`);
  return jeton;
};
const cDir = ouvrirSession(direction);

const CLAIRS = {
  anthropic: `sk-ant-api03-TEST-${jeu}-${randomBytes(16).toString("hex")}`,
  abby: `abby-TEST-${jeu}-${randomBytes(16).toString("hex")}`,
  "google-drive": JSON.stringify({ type: "service_account", client_email: `pilot-${jeu}@test.iam.gserviceaccount.com`, private_key: `-----BEGIN PRIVATE KEY-----\nTEST${jeu}${randomBytes(24).toString("base64")}\n-----END PRIVATE KEY-----\n` }),
  mcp: randomBytes(24).toString("base64url"),
  "stock-videos": `tvp_TEST${jeu}${randomBytes(8).toString("hex")}`,
  metricool: `METRICOOLTEST${jeu}${randomBytes(12).toString("hex")}`,
  "media-signing": randomBytes(32).toString("hex"),
};
const COMPTES = { mcp: direction, metricool: "42" };
// Un marqueur technique (pas un secret) : la conversion ne doit pas y toucher.
const MARQUEUR_ID = `tache:test-${jeu}`;
const MARQUEUR = "fait";

sql(`delete from integrations`);
for (const [id, token] of Object.entries(CLAIRS)) {
  sql(`insert into integrations (id, token, account_id) values (${lit(id)}, ${lit(token)}, ${COMPTES[id] ? lit(COMPTES[id]) : "null"})`);
}
sql(`insert into integrations (id, token) values (${lit(MARQUEUR_ID)}, ${lit(MARQUEUR)})`);

// Un média, pour le lien signé (clé de signature) et les chemins piégés.
const CONTENU = `IMAGE-${jeu}`;
mkdirSync(path.join(MEDIA, "clients", jeu), { recursive: true });
writeFileSync(path.join(MEDIA, "clients", jeu, "photo.webp"), CONTENU);
const asset = un(`insert into assets (client_id, filename, storage_path, mime_type) values ('${client}', 'photo.webp', 'clients/${jeu}/photo.webp', 'image/webp') returning id`);
const lienSigne = (secret, id) => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const sig = createHmac("sha256", secret).update(`${id}.${exp}`).digest("base64url");
  return `/api/media-public/${id}?exp=${exp}&sig=${sig}`;
};

// La vidéo du portail pose son propre marqueur au démarrage : hors comparaison.
const tokens = () => Object.fromEntries(sql(`select id || '|' || coalesce(token, '') from integrations where id <> 'portal-video-bundle' order by id`).split("\n").filter(Boolean).map((l) => [l.slice(0, l.indexOf("|")), l.slice(l.indexOf("|") + 1)]));
const FORME = /^v1:[A-Za-z0-9+/]{16}:[A-Za-z0-9+/]{22}==:[A-Za-z0-9+/]*={0,2}$/;
const ouvrir = (valeur, cle) => {
  const [iv, tag, corps] = valeur.slice(3).split(":");
  const d = createDecipheriv("aes-256-gcm", cle, Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(corps, "base64")), d.final()]).toString("utf8");
};

const page = async (chemin, cookie) => {
  const r = await fetch(`${BASE}${chemin}`, { headers: cookie ? { Cookie: `pilot_session=${cookie}` } : {}, redirect: "manual", cache: "no-store" });
  const corps = Buffer.from(await r.arrayBuffer()).toString("utf8");
  reponses.push(corps);
  return { statut: r.status, corps };
};
const mcp = async (jeton) => {
  const r = await fetch(`${BASE}/api/mcp/${encodeURIComponent(jeton)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  });
  const t = await r.text();
  reponses.push(t);
  return { statut: r.status, nom: (() => { try { return JSON.parse(t).result?.serverInfo?.name ?? null; } catch { return null; } })() };
};
/** Les intégrations répondent-elles avec les bonnes clés ? */
async function integrationsMarchent(etape) {
  const m = await mcp(CLAIRS.mcp);
  ok(`${etape} : Claude.ai (MCP) accepte l'adresse secrète`, m.statut === 200 && m.nom === "taochy-pilot");
  ok(`${etape} : … et refuse une adresse fausse`, (await mcp(`${CLAIRS.mcp}x`)).statut === 401);
  recus.abby.length = 0;
  recus.metricool.length = 0;
  const accueil = await page("/", cDir);
  ok(`${etape} : Abby interrogé avec la bonne clé (accueil, « Argent qui dort »)`, accueil.statut === 200 && recus.abby.length > 0 && recus.abby.every((h) => h === `Bearer ${CLAIRS.abby}`));
  const reglages = await page("/reglages", cDir);
  ok(`${etape} : Metricool interrogé avec la bonne clé (Réglages)`, reglages.statut === 200 && recus.metricool.length > 0 && recus.metricool.every((h) => h === CLAIRS.metricool));
  const visible = reglages.corps.replace(/<script[\s\S]*?<\/script>/g, "");
  ok(`${etape} : Réglages dit Claude, Drive, Abby et stock vidéos « Connecté / Relié »`, /Assistant IA \(Jarvis\)[\s\S]{0,400}Connecté/.test(visible) && /Google Drive \(rushs\)[\s\S]{0,200}Connecté/.test(visible) && /Abby \(devis et factures\)[\s\S]{0,200}Connecté/.test(visible) && /Stock vidéos taochyagency\.com[\s\S]{0,200}Relié/.test(visible));
  ok(`${etape} : la marque Metricool s'affiche`, visible.includes(`Marque ${jeu}`));
  const media = await page(lienSigne(CLAIRS["media-signing"], asset));
  ok(`${etape} : un lien de média signé avec la clé de signature d'origine s'ouvre`, media.statut === 200 && media.corps === CONTENU);
}

let codeSortie = 0;
try {
  /* ------------------------------------------------- 5. sans clé -- */
  console.log("\n— démarrage sans clé de chiffrement —");
  const avant = tokens();
  let log = await demarrer();
  await attendre(500);
  ok("avertissement au démarrage : aucune conversion, clé absente", /\[pilot\] secrets : aucune conversion, clé de chiffrement absente/.test(log.join("")));
  ok("aucun secret modifié", JSON.stringify(tokens()) === JSON.stringify(avant));
  await integrationsMarchent("sans clé");
  ok("aucune clé créée dans le volume par le démarrage ni par les lectures", !existsSync(path.join(MEDIA, ".secrets")));
  await arreter();

  /* --------------------------------------------- 6. clé illisible -- */
  console.log("\n— démarrage avec une clé illisible (PILOT_SECRETS_KEY abîmée) —");
  log = await demarrer({ PILOT_SECRETS_KEY: "pas-une-cle" });
  await attendre(500);
  ok("avertissement : aucune conversion, clé illisible (sans la valeur de la variable)", /aucune conversion, clé de chiffrement illisible/.test(log.join("")) && !log.join("").includes("pas-une-cle"));
  ok("aucun secret modifié", JSON.stringify(tokens()) === JSON.stringify(avant));
  const m = await mcp(CLAIRS.mcp);
  ok("Claude.ai (MCP) marche toujours", m.statut === 200);
  await arreter();

  /* -------------------------------------------- 7. avec la clé -- */
  console.log("\n— démarrage avec la clé (fichier du volume) : conversion —");
  const CLE = randomBytes(32);
  mkdirSync(path.join(MEDIA, ".secrets"), { recursive: true, mode: 0o700 });
  writeFileSync(path.join(MEDIA, ".secrets", "pilot-secrets.key"), CLE.toString("hex"), { mode: 0o600 });
  chmodSync(path.join(MEDIA, ".secrets", "pilot-secrets.key"), 0o600);
  log = await demarrer();
  await attendre(500);
  ok(`journal : « ${(log.join("").match(/\[pilot\] secrets : [^\n]*/) ?? ["(rien)"])[0]} »`, /\[pilot\] secrets : 7 chiffré\(s\) sur place, 0 déjà chiffré\(s\)\./.test(log.join("")));
  const apres = tokens();
  for (const [id, clair] of Object.entries(CLAIRS)) {
    ok(`${id} : chiffré (v1:…) et se rouvre à l'identique avec la clé`, FORME.test(apres[id]) && ouvrir(apres[id], CLE) === clair);
  }
  ok("un marqueur technique (« tache:… », pas un secret) n'est pas touché", apres[MARQUEUR_ID] === MARQUEUR);
  ok("les comptes (account_id) ne bougent pas", un(`select account_id from integrations where id='mcp'`) === direction && un(`select account_id from integrations where id='metricool'`) === "42");
  await integrationsMarchent("après conversion");

  console.log("\n— routes de fichiers : la base pointe vers la clé —");
  const piege = ".secrets/pilot-secrets.key";
  const piege2 = "clients/../.secrets/pilot-secrets.key";
  const cleHex = CLE.toString("hex");
  const sansCle = (r) => !r.corps.includes(cleHex) && r.statut !== 200;
  sql(`update users set avatar_path = ${lit(piege)} where id = '${direction}'`);
  ok("/api/avatar/<id> : refusé", sansCle(await page(`/api/avatar/${direction}`, cDir)));
  sql(`update assets set storage_path = ${lit(piege2)} where id = '${asset}'`);
  ok("/api/media/<id> (original) : refusé", sansCle(await page(`/api/media/${asset}?format=original`, cDir)));
  ok("/api/media/<id> (miniature) : refusé", sansCle(await page(`/api/media/${asset}?format=thumb`, cDir)));
  ok("/api/media-public/<id> (lien signé valide) : refusé", sansCle(await page(lienSigne(CLAIRS["media-signing"], asset))));
  const facture = un(`insert into invoices (client_id, number, issued_on, filename, storage_path, mime_type) values ('${client}', 'F-${jeu}', current_date, 'f.pdf', ${lit(piege)}, 'application/pdf') returning id`);
  ok("/api/invoice/<id> : refusé", sansCle(await page(`/api/invoice/${facture}`, cDir)));
  const fichier = un(`insert into client_files (client_id, filename, storage_path, mime_type) values ('${client}', 'k.txt', ${lit(piege2)}, 'text/plain') returning id`);
  ok("/api/client-files/<id> : refusé", sansCle(await page(`/api/client-files/${fichier}`, cDir)));
  const archive = await page(`/api/client-files/archive?clientId=${client}`, cDir);
  ok("/api/client-files/archive : la clé n'est pas dans l'archive", !archive.corps.includes(cleHex));
  const promo = un(`insert into promos (title, image_path) values ('Promo ${jeu}', ${lit(piege)}) returning id`);
  ok("/api/promo/<id> : refusé", sansCle(await page(`/api/promo/${promo}`, cDir)));
  sql(`insert into settings (id, logo_path, logo_web_path, cover_path, portal_video_path) values ('agence', ${lit(piege)}, ${lit(piege2)}, ${lit(piege)}, ${lit(piege)}) on conflict (id) do update set logo_path = excluded.logo_path, logo_web_path = excluded.logo_web_path, cover_path = excluded.cover_path, portal_video_path = excluded.portal_video_path`);
  for (const k of ["logo", "logo-web", "cover"]) ok(`/api/branding/${k} : refusé`, sansCle(await page(`/api/branding/${k}`)));
  ok("/api/portail-video : refusé", sansCle(await page(`/api/portail-video`, cDir)));
  ok("/api/vignette?u=…/.secrets : refusé (hôte inconnu)", sansCle(await page(`/api/vignette?u=${encodeURIComponent("https://pilot.test/.secrets/pilot-secrets.key")}`, cDir)));
  ok("/.secrets/pilot-secrets.key en adresse directe : rien", sansCle(await page(`/.secrets/pilot-secrets.key`, cDir)));
  sql(`update users set avatar_path = null where id = '${direction}'`);
  sql(`update assets set storage_path = 'clients/${jeu}/photo.webp' where id = '${asset}'`);
  await arreter();

  /* ------------------------------------------- 8. deuxième démarrage -- */
  console.log("\n— deuxième démarrage : rien ne change —");
  log = await demarrer();
  await attendre(500);
  ok("aucune nouvelle conversion annoncée", !/chiffré\(s\) sur place/.test(log.join("")));
  ok("valeurs en base identiques, octet pour octet", JSON.stringify(tokens()) === JSON.stringify(apres));
  await integrationsMarchent("deuxième démarrage");
  await arreter();

  console.log("\n— copie de la base —");
  const dump = execFileSync("pg_dump", ["--data-only", PGURL], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  const lisibles = Object.entries(CLAIRS).filter(([id, v]) => dump.includes(id === "google-drive" ? JSON.parse(v).private_key.split("\n")[1] : v));
  ok(`pg_dump : aucun des ${Object.keys(CLAIRS).length} secrets lisible${lisibles.length ? ` — trouvé : ${lisibles.map(([id]) => id).join(", ")}` : ""}`, lisibles.length === 0);
  ok("pg_dump : ni la clé de chiffrement", !dump.includes(CLE.toString("hex")));

  /* ------------------------------------------------ 9. clé changée -- */
  console.log("\n— clé changée : la conversion s'arrête —");
  const NOUVEAU = `sk-ant-api03-NOUVEAU-${jeu}`;
  sql(`update integrations set token = ${lit(NOUVEAU)} where id = 'anthropic'`);
  const avantChangement = tokens();
  log = await demarrer({ PILOT_SECRETS_KEY: randomBytes(32).toString("hex") });
  await attendre(500);
  ok("avertissement : conversion suspendue, secrets chiffrés illisibles avec cette clé", /conversion suspendue, 6 secret\(s\) déjà chiffré\(s\) ne s'ouvrent pas/.test(log.join("")));
  ok("rien n'a été modifié (le secret en clair est resté en clair)", JSON.stringify(tokens()) === JSON.stringify(avantChangement) && tokens().anthropic === NOUVEAU);
  await arreter();
  log = await demarrer();
  await attendre(500);
  ok("retour de la bonne clé : le secret recollé en clair est chiffré à son tour", /1 chiffré\(s\) sur place, 6 déjà chiffré\(s\)/.test(log.join("")) && ouvrir(tokens().anthropic, CLE) === NOUVEAU);
  await arreter();

  console.log("\n— aucun secret dans le journal ni dans les réponses —");
  const journal = readFileSync(JOURNAL, "utf8");
  const tout = reponses.join("\n");
  const fuites = (texte) => [...Object.values(CLAIRS), NOUVEAU, CLE.toString("hex")].filter((v) => texte.includes(v.length > 60 ? v.slice(0, 60) : v));
  ok(`journal du serveur (${journal.split("\n").length} lignes) : aucun secret ni la clé`, fuites(journal).length === 0);
  // Réglages affiche l'adresse MCP à la direction (c'est son rôle) : on l'exclut ici.
  const sansMcp = tout.split(CLAIRS.mcp).join("");
  ok(`${reponses.length} réponses de Pilot : aucun autre secret ni la clé`, fuites(sansMcp).filter((v) => v !== CLAIRS.mcp).length === 0);
} catch (e) {
  console.error(e);
  codeSortie = 1;
} finally {
  console.log("\n— nettoyage —");
  await arreter().catch(() => undefined);
  fauxAbby.close();
  fauxMetricool.close();
  sql(`delete from integrations`);
  sql(`insert into integrations select * from json_populate_recordset(null::integrations, ${lit(sauvegarde)})`);
  sql(`delete from settings where id = 'agence'`);
  sql(`insert into settings select * from json_populate_recordset(null::settings, ${lit(reglagesAvant)})`);
  sql(`delete from promos where title = 'Promo ${jeu}'`);
  sql(`delete from clients where id = '${client}'`);
  sql(`delete from users where email = 'dir-${jeu}@exemple.test'`);
  rmSync(dir, { recursive: true, force: true });
  console.log("décor effacé, table integrations et réglages remis comme avant, serveur et faux services arrêtés");
}

console.log(`\n${verts} vérifications vertes, ${rouges.length} rouge(s).`);
if (rouges.length || codeSortie) {
  for (const r of rouges) console.log(`  ✗ ${r}`);
  process.exit(1);
}
process.exit(0);
