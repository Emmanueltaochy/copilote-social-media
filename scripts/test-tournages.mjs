#!/usr/bin/env node
//
// Tournages : les vidéos prévues côté agence, la publication au client, la
// page « Tournages » du portail et son bloc d'accueil, les gestes du client
// (« Je suis prêt », cases à cocher, question), « Ajouter au prochain
// tournage » depuis la veille et depuis un contenu, la ligne « Ce matin »
// « Relancer le client avant le tournage » avec « Traité », les
// notifications et les droits.
//
// Vidéaste (second chantier) : invitation, ajout à l'équipe d'un tournage,
// « Mes tournages » et la fiche vue par lui, « tournée », note de tournage,
// lien des rushes, et chacun des accès interdits (argent, contacts, e-mails,
// réglages, veille, Jarvis, boîte, autres tournages, portail).
//
// Usage (local uniquement, après npm run build ; le script démarre et arrête
// lui-même le serveur Pilot sur le port 3111) :
//   PGURL="postgres://pilot:pilot@localhost:5432/pilot" node scripts/test-tournages.mjs
//   CAPTURES=/chemin/dossier …  → captures Playwright (1440 px et iPhone 13).

import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, "..");
const PGURL = process.env.PGURL ?? process.env.DATABASE_URL;
const PORT = Number(process.env.PORT_TEST ?? 3111);
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
const dir = mkdtempSync(path.join(os.tmpdir(), "pilot-test-tournages-"));
const MEDIA = path.join(dir, "media");
mkdirSync(path.join(MEDIA, ".secrets"), { recursive: true, mode: 0o700 });
writeFileSync(path.join(MEDIA, ".secrets", "pilot-secrets.key"), randomBytes(32).toString("hex"), { mode: 0o600 });
const JOURNAL = path.join(dir, "serveur.log");
const JOUR = 86_400_000;

/* ------------------------------------------------------ 1. règles pures -- */

console.log("\n— règles (src/lib/tournages-regles.ts) —");
const R = await import(path.join(RACINE, "src/lib/tournages-regles.ts"));
ok(
  "plateformes : Instagram, TikTok, YouTube (youtu.be, shorts), Facebook, autre",
  R.plateformeDe("https://www.instagram.com/reel/abc/") === "instagram" &&
    R.plateformeDe("https://www.tiktok.com/@x/video/1") === "tiktok" &&
    R.plateformeDe("https://youtu.be/dQw4w9WgXcQ") === "youtube" &&
    R.plateformeDe("https://m.facebook.com/watch?v=1") === "facebook" &&
    R.plateformeDe("https://drive.google.com/x") === "autre",
);
ok(
  "identifiant YouTube : watch, youtu.be, shorts ; rien pour une page quelconque",
  R.youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ") === "dQw4w9WgXcQ" &&
    R.youtubeId("https://youtu.be/dQw4w9WgXcQ?t=3") === "dQw4w9WgXcQ" &&
    R.youtubeId("https://youtube.com/shorts/abcDEF12345") === "abcDEF12345" &&
    R.youtubeId("https://youtube.com/channel/x") === null,
);
ok("liens : http(s) seulement, sans doublon, 5 au plus", R.lireLiens("https://a.re/1 https://a.re/1\njavascript:alert(1) ftp://x https://b.re/2,").length === 2);
const prep1 = R.lirePreparation("- Tenue claire\nLes produits\n\nTenue claire", [], () => "n1".concat(Math.random()));
const prep2 = R.lirePreparation("tenue  CLAIRE\nUn badge", prep1, () => "nouveau");
ok("à préparer : une ligne par élément, doublons retirés, identifiant gardé si le libellé reste", prep1.length === 2 && prep2[0].id === prep1[0].id && prep2[1].id === "nouveau");
const d = new Date(Date.UTC(2026, 11, 3, 9, 0));
ok("dates en heure murale de La Réunion : « jeudi 3 décembre », « 9 h – 12 h 30 », « 3 h 30 »", R.jourLong(d) === "jeudi 3 décembre" && R.creneauDit(d, new Date(Date.UTC(2026, 11, 3, 12, 30))) === "9 h – 12 h 30" && R.dureeDite(d, new Date(Date.UTC(2026, 11, 3, 12, 30))) === "3 h 30");
ok("résumé : « 5 vidéos · 2 choses à préparer »", R.resumeDit(R.resume([
  { prep: [{ id: "a", label: "x" }, { id: "b", label: "y" }], prepDone: ["a"], clientReadyAt: null, script: null, speaker: null },
  { prep: [{ id: "c", label: "z" }], prepDone: [], clientReadyAt: new Date(), script: "t", speaker: "client" },
  ...[1, 2, 3].map(() => ({ prep: [], prepDone: [], clientReadyAt: null, script: null, speaker: null })),
])) === "5 vidéos · 2 choses à préparer");
const mural = new Date(Date.now() + 4 * 3_600_000);
const dans2j = new Date(mural.getTime() + 2 * JOUR);
const v = [{ visibleToClient: true, clientReadyAt: null }];
ok(
  "règle de relance : publié, dans 3 jours ou moins, une vidéo visible pas prête ; jamais brouillon, annulé, lointain ou passé",
  R.aRelancer({ startsAt: dans2j, status: "confirme", publishedAt: new Date() }, v, mural) &&
    !R.aRelancer({ startsAt: dans2j, status: "confirme", publishedAt: null }, v, mural) &&
    !R.aRelancer({ startsAt: dans2j, status: "annule", publishedAt: new Date() }, v, mural) &&
    !R.aRelancer({ startsAt: new Date(mural.getTime() + 5 * JOUR), status: "confirme", publishedAt: new Date() }, v, mural) &&
    !R.aRelancer({ startsAt: new Date(mural.getTime() - JOUR), status: "confirme", publishedAt: new Date() }, v, mural) &&
    !R.aRelancer({ startsAt: dans2j, status: "confirme", publishedAt: new Date() }, [{ visibleToClient: true, clientReadyAt: new Date() }], mural),
);

/* -------------------------------------------------------- 2. le serveur -- */

let serveur = null;
async function demarrer() {
  const sortie = [];
  serveur = spawn(path.join(RACINE, "node_modules/.bin/next"), ["start", "-p", String(PORT), "-H", "127.0.0.1"], {
    cwd: RACINE,
    env: { ...process.env, DATABASE_URL: PGURL, MEDIA_ROOT: MEDIA, NODE_ENV: "production", SMTP_HOST: "", SMTP_USER: "", SMTP_PASSWORD: "" },
    stdio: ["ignore", "pipe", "pipe"],
    // Son propre groupe de processus : `next start` lance un next-server
    // enfant, qu'il faut arrêter avec lui (sinon il garde le port).
    detached: true,
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
  const groupe = (sig) => {
    try {
      process.kill(-s.pid, sig);
    } catch {
      // déjà arrêté
    }
  };
  if (s.exitCode === null) {
    groupe("SIGTERM");
    await Promise.race([new Promise((r_) => s.once("exit", r_)), attendre(8000)]);
  }
  groupe("SIGKILL");
  writeFileSync(JOURNAL, s.sortie.join(""), { flag: "a" });
}
process.on("exit", () => {
  try {
    if (serveur) process.kill(-serveur.pid, "SIGKILL");
  } catch {
    // déjà arrêté
  }
});
// Un serveur déjà présent sur le port fausserait tout : on refuse de tester contre lui.
try {
  await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1000) });
  console.error(`\n  ✗ Un serveur répond déjà sur ${BASE} : l'arrêter d'abord.\n`);
  process.exit(1);
} catch {
  // port libre
}
await demarrer();

/* ---------------------------------------------------------- 3. le décor -- */

const ouvrirSession = (userId) => {
  const jeton = randomBytes(32).toString("base64url");
  un(`insert into sessions (token_hash, user_id, expires_at) values ('${sha(jeton)}','${userId}', now() + interval '1 day') returning token_hash`);
  return jeton;
};
const direction = un(`insert into users (email,name,initials,role) values ('dir-${jeu}@exemple.test','Emmanuel Direction${jeu}','ED','direction') returning id`);
const sociale = un(`insert into users (email,name,initials,role,departments) values ('soc-${jeu}@exemple.test','Léa Sociale${jeu}','LS','equipe','["social"]'::jsonb) returning id`);
const web = un(`insert into users (email,name,initials,role,departments) values ('web-${jeu}@exemple.test','Nina Web${jeu}','NW','equipe','["web"]'::jsonb) returning id`);
const clientA = un(`insert into clients (name, short_name, departments) values ('Atelier Vanille ${jeu}', 'Atelier Vanille ${jeu}', '["social"]'::jsonb) returning id`);
const clientB = un(`insert into clients (name, short_name, departments) values ('Bistrot Lagon ${jeu}', 'Bistrot Lagon ${jeu}', '["social"]'::jsonb) returning id`);
const portailA = un(`insert into users (email,name,initials,role,client_id) values ('sophie-${jeu}@exemple.test','Sophie ${jeu}','SO','client','${clientA}') returning id`);
const portailB = un(`insert into users (email,name,initials,role,client_id) values ('zoe-${jeu}@exemple.test','Zoé ${jeu}','ZO','client','${clientB}') returning id`);
const cDir = ouvrirSession(direction);
const cSoc = ouvrirSession(sociale);
const cWeb = ouvrirSession(web);
const cA = ouvrirSession(portailA);
const cB = ouvrirSession(portailB);

// Le tournage : dans deux jours, 9 h – 12 h, heure de La Réunion (écrite en UTC).
const jourT = new Date(Date.now() + 4 * 3_600_000 + 2 * JOUR);
const debut = `${jourT.toISOString().slice(0, 10)}T09:00:00Z`;
const fin = `${jourT.toISOString().slice(0, 10)}T12:00:00Z`;
const NOTE = `NOTE-INTERNE-${jeu} parking à l'arrière`;
const MATERIEL = `Boitier-secret-${jeu}`;
const DROIT = `Personne-filmee-${jeu}`;
const shoot = un(`insert into shoots (client_id, title, place, starts_at, ends_at, status, note) values ('${clientA}', 'Atelier en action ${jeu}', 'Atelier, 12 rue des Vanilliers, Saint-Pierre', '${debut}', '${fin}', 'confirme', ${lit(NOTE)}) returning id`);
sql(`insert into shoot_gear (shoot_id, label) values ('${shoot}', '${MATERIEL}')`);
sql(`insert into shoot_rights (shoot_id, person) values ('${shoot}', '${DROIT}')`);
sql(`insert into shoot_crew (shoot_id, user_id, state) values ('${shoot}', '${sociale}', 'Confirmé'), ('${shoot}', '${direction}', 'Confirmé')`);
// Un tournage du client B, publié : jamais visible du client A.
const shootB = un(`insert into shoots (client_id, title, starts_at, status, published_at) values ('${clientB}', 'Tournage secret B ${jeu}', '${debut}', 'confirme', now()) returning id`);
sql(`insert into shoot_videos (shoot_id, title) values ('${shootB}', 'Vidéo du bistrot ${jeu}')`);

const sansCommentaires = (html) => html.replace(/<!--.*?-->/g, "");
const dump = (nom, html) => {
  if (process.env.DUMP) writeFileSync(path.join(process.env.DUMP, `${nom}.html`), html);
};
const page = async (chemin, cookie, extra = "") => {
  const r_ = await fetch(`${BASE}${chemin}`, {
    headers: cookie ? { Cookie: `pilot_session=${cookie}${extra}` } : {},
    redirect: "manual",
    cache: "no-store",
  });
  const html = sansCommentaires(await r_.text());
  return {
    statut: r_.status,
    location: r_.headers.get("location") ?? "",
    html,
    visible: html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&"),
  };
};
function actionsDe(manifestePage, fichier) {
  const j = JSON.parse(readFileSync(path.join(RACINE, `.next/server/app/${manifestePage}/server-reference-manifest.json`), "utf8"));
  return Object.fromEntries(Object.entries(j.node).filter(([, x]) => String(x.filename ?? "").includes(fichier)).map(([id, x]) => [x.exportedName, id]));
}
const AG = actionsDe("(agence)/tournages/[id]/page", "actions-videos");
const PO = actionsDe("portail/tournages/page", "actions-tournages");
const VE = actionsDe("(agence)/veille/page", "veille/actions");
const CM = actionsDe("(agence)/page", "ce-matin-actions");
const CT = actionsDe("(agence)/contenu/[id]/page", "actions-videos");
const TO = actionsDe("(agence)/tournages/[id]/page", "tournages/actions.ts");
const EQ = actionsDe("(agence)/equipe/page", "equipe/actions");
const VI = actionsDe("videaste/[id]/page", "videaste/actions");

/**
 * Une action appelée comme le fait React : multipart, champs « _1_… », racine
 * « 0 » en dernier. `etat` : action à état (useActionState), sinon un seul
 * argument FormData.
 */
async function action(id, chemin, champs, cookie, { etat = true, extra = "" } = {}) {
  const fd = new FormData();
  for (const [k, x] of Object.entries(champs)) {
    for (const val of Array.isArray(x) ? x : [x]) fd.append(`_1_${k}`, val);
  }
  fd.append("0", JSON.stringify(etat ? [{}, "$K1"] : ["$K1"]));
  const r_ = await fetch(`${BASE}${chemin}`, {
    method: "POST",
    headers: { "Next-Action": id, Accept: "text/x-component", Origin: BASE, ...(cookie ? { Cookie: `pilot_session=${cookie}${extra}` } : {}) },
    body: fd,
    redirect: "manual",
  });
  const texte = await r_.text();
  if (process.env.TRACE) console.log(`[trace] ${r_.status} ${texte.slice(0, 300)}`);
  const ligne = texte.split("\n").find((l) => l.startsWith("1:"));
  let resultat = null;
  try {
    resultat = ligne ? JSON.parse(ligne.slice(2)) : null;
  } catch {
    resultat = null;
  }
  return { statut: r_.status, resultat, redirection: r_.headers.get("x-action-redirect") ?? r_.headers.get("location") ?? "" };
}
async function actionJson(id, chemin, args, cookie) {
  const r_ = await fetch(`${BASE}${chemin}`, {
    method: "POST",
    headers: { "Next-Action": id, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component", Origin: BASE, Cookie: `pilot_session=${cookie}` },
    body: JSON.stringify(args),
    redirect: "manual",
  });
  const ligne = (await r_.text()).split("\n").find((l) => l.startsWith("1:"));
  try {
    return ligne ? JSON.parse(ligne.slice(2)) : null;
  } catch {
    return null;
  }
}
const fiche = `/tournages/${shoot}`;
const videos = () => sql(`select id || '|' || title || '|' || position from shoot_videos where shoot_id='${shoot}' order by position`).split("\n").filter(Boolean).map((l) => l.split("|"));
const notifs = (userId, filtre = "") => Number(un(`select count(*) from notifications where user_id='${userId}' and kind='tournage' ${filtre}`));

let codeSortie = 0;
try {
  ok("actions présentes dans le build (agence, portail, veille, Ce matin, contenu)", Boolean(AG.enregistrerVideo && AG.publierTournage && PO.basculerPret && PO.commenterVideo && VE.ajouterAuProchainTournage && CM.marquerTraite && CT.ajouterDepuisContenu));

  console.log("\n— agence : trois vidéos prévues —");
  let p = await page(fiche, cSoc);
  ok("pôle social : la fiche s'ouvre, section « Vidéos prévues pour ce tournage », brouillon interne", p.statut === 200 && p.visible.includes("Vidéos prévues pour ce tournage") && p.html.includes('data-etat-client="brouillon"') && p.visible.includes("Publier au client"));
  const IG = `https://www.instagram.com/reel/C${jeu}xyz/`;
  let r = await action(AG.enregistrerVideo, fiche, {
    shootId: shoot,
    title: `Visite de l'atelier ${jeu}`,
    description: `On suit Sophie qui ouvre l'atelier. Message : tout est fait main ${jeu}.`,
    references: `${IG}\nhttps://drive.google.com/interne`,
    script: `Bienvenue à l'Atelier Vanille ${jeu} !`,
    speaker: "client",
    prep: "Tenue claire, sans logo\nLes trois produits phares",
    duration: "30",
    format: "reel",
    visible: "on",
  }, cSoc);
  ok("vidéo 1 (référence Instagram, script dit par le client, 2 choses à préparer) ajoutée", r.resultat?.ok === "Vidéo ajoutée.");
  r = await action(AG.enregistrerVideo, fiche, { shootId: shoot, title: `Les mains au travail ${jeu}`, description: "Gros plans sur le geste.", references: "https://youtu.be/dQw4w9WgXcQ", prep: "Un tablier propre", format: "story", duration: "15", visible: "on" }, cSoc);
  ok("vidéo 2 (référence YouTube) ajoutée", r.resultat?.ok === "Vidéo ajoutée.");
  r = await action(AG.enregistrerVideo, fiche, { shootId: shoot, title: `Le mot de la fin ${jeu}`, script: "Merci et à bientôt", speaker: "voix_off", format: "reel", visible: "on" }, cSoc);
  ok("vidéo 3 (voix off) ajoutée", r.resultat?.ok === "Vidéo ajoutée.");
  r = await action(AG.enregistrerVideo, fiche, { shootId: shoot, title: `Idée cachée ${jeu}`, description: "Interne, pas encore validée" }, cSoc);
  ok("vidéo 4, « visible par le client » décoché : enregistrée masquée", r.resultat?.ok === "Vidéo ajoutée." && un(`select visible_to_client from shoot_videos where title='Idée cachée ${jeu}'`) === "f");
  r = await action(AG.enregistrerVideo, fiche, { shootId: shoot, title: `Mauvais lien ${jeu}`, references: "pas un lien" }, cSoc);
  ok("un lien de référence invalide est refusé avec un message clair", r.resultat?.error?.includes("https://"));
  const refs = JSON.parse(un(`select "references" from shoot_videos where title='Visite de l''atelier ${jeu}'`));
  ok("références : Instagram reconnu (carte), le lien Drive gardé comme « Lien »", refs[0].plateforme === "instagram" && refs[0].url === IG && refs[1]?.plateforme === "autre");
  const refYt = JSON.parse(un(`select "references" from shoot_videos where title='Les mains au travail ${jeu}'`));
  ok("YouTube : vignette sans clé (i.ytimg.com)", refYt[0].vignette === "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  let liste = videos();
  ok("ordre de saisie gardé (positions 0 à 3)", liste.length === 4 && liste.map((x) => x[2]).join(",") === "0,1,2,3");
  await action(AG.deplacerVideo, fiche, { id: liste[2][0], shootId: shoot, sens: "haut" }, cSoc, { etat: false });
  liste = videos();
  ok("« ↑ » : la vidéo 3 passe en 2", liste[1][1] === `Le mot de la fin ${jeu}`);
  await action(AG.deplacerVideo, fiche, { id: liste[1][0], shootId: shoot, sens: "bas" }, cSoc, { etat: false });
  liste = videos();
  const [v1, v2, v3, v4] = liste.map((x) => x[0]);
  p = await page(fiche, cSoc);
  ok("la fiche montre les 4 vidéos, la carte de référence Instagram et « Masquée au client »", [1, 2, 3, 4].every((i) => p.html.includes(`data-video="${liste[i - 1][0]}"`)) && p.html.includes('data-reference="instagram"') && p.visible.includes("Masquée au client"));
  const prepIds = JSON.parse(un(`select prep from shoot_videos where id='${v1}'`));

  console.log("\n— brouillon : invisible côté client —");
  p = await page("/portail/tournages", cA);
  ok("portail : « Aucun tournage n'est prévu », aucun titre du brouillon", p.statut === 200 && p.html.includes("data-aucun-tournage") && !p.visible.includes(`Visite de l'atelier ${jeu}`));
  p = await page("/portail", cA);
  ok("accueil du portail : pas de bloc tournage, pas d'onglet Tournages", !p.html.includes("data-bloc-tournage") && !p.html.includes('href="/portail/tournages"'));
  ok("aucune notification envoyée tant que c'est un brouillon", notifs(portailA) === 0);

  console.log("\n— publication au client —");
  await action(AG.publierTournage, fiche, { id: shoot }, cSoc, { etat: false });
  ok("le tournage est publié (date de publication posée)", un(`select published_at is not null from shoots where id='${shoot}'`) === "t");
  ok("le client reçoit une notification « Votre prochain tournage », par le mécanisme existant (courriel tenté : messagerie non configurée en test)", notifs(portailA, "and title like 'Votre prochain tournage%' and (emailed_at is not null or email_error is not null)") === 1);
  await action(AG.publierTournage, fiche, { id: shoot }, cSoc, { etat: false });
  ok("double clic sur « Publier » : pas de seconde notification", notifs(portailA) === 1);
  p = await page(fiche, cSoc);
  ok("fiche agence : « Publié au client », état côté client « 0/3 vidéos marquées prêt »", p.html.includes('data-etat-client="publie"') && p.visible.includes("Client prêt pour 0 vidéo sur 3"));

  console.log("\n— vue client —");
  p = await page("/portail/tournages", cA);
  const v_ = p.visible;
  ok("page Tournages : le prochain tournage, date, heure (La Réunion), lieu, durée", p.statut === 200 && p.html.includes(`data-prochain-tournage="${shoot}"`) && v_.includes("9 h – 12 h") && v_.includes("3 h prévues") && v_.includes("heure de La Réunion") && v_.includes("12 rue des Vanilliers"));
  ok("l'équipe en prénoms seulement (« Emmanuel et Léa »), jamais le nom complet", v_.includes("Avec Emmanuel et Léa") && !v_.includes(`Sociale${jeu}`));
  ok("les 3 vidéos visibles dans l'ordre, pas la vidéo masquée", v_.indexOf(`Visite de l'atelier ${jeu}`) > 0 && v_.indexOf(`Visite de l'atelier ${jeu}`) < v_.indexOf(`Les mains au travail ${jeu}`) && v_.indexOf(`Les mains au travail ${jeu}`) < v_.indexOf(`Le mot de la fin ${jeu}`) && !v_.includes(`Idée cachée ${jeu}`));
  ok("description, script « C'est vous qui le dites », référence Instagram qui s'ouvre dans un nouvel onglet", v_.includes(`tout est fait main ${jeu}`) && v_.includes(`Bienvenue à l'Atelier Vanille ${jeu}`) && v_.includes("C'est vous qui le dites") && new RegExp(`href="${IG.replace(/[.?]/g, "\\$&")}" target="_blank" rel="noreferrer noopener"`).test(p.html));
  ok("« À préparer avant le tournage » regroupe tout (3 choses, avec la vidéo concernée) et le texte à préparer", p.html.includes("data-recapitulatif") && v_.includes("À préparer avant le tournage") && v_.includes("Tenue claire, sans logo") && v_.includes("Un tablier propre") && v_.includes(`Vidéo 2 · Les mains au travail ${jeu}`) && v_.includes("Un texte à préparer"));
  ok("rien d'interne : ni note d'équipe, ni matériel, ni droit à l'image, ni état de fabrication", !v_.includes(NOTE) && !p.html.includes(MATERIEL) && !p.html.includes(DROIT) && !v_.includes("Marquer prête"));
  ok("jamais le tournage d'un autre client", !p.html.includes(`Tournage secret B ${jeu}`) && !p.html.includes(`Vidéo du bistrot ${jeu}`));
  ok("cibles tactiles : « Je suis prêt » en 48 px, cases en 44 px", /min-h-12[^"]*"[^>]*data-bouton-pret|data-bouton-pret[^>]*min-h-12/.test(p.html) || p.html.includes("min-h-12 w-full"));
  ok("la notification est signalée (« Du nouveau depuis votre dernière visite »)", p.html.includes("data-nouveautes"));
  p = await page("/portail", cA);
  ok("accueil : « Prochain tournage : <jour>, 9 h » · 3 vidéos · 3 choses à préparer, lien vers la page", p.html.includes(`data-bloc-tournage="${shoot}"`) && /Prochain tournage : \w+ \d+ \w+, 9 h/.test(p.visible) && p.visible.includes("3 vidéos · 3 choses à préparer"));
  ok("barre du portail : onglet Tournages, pastille 3 (vidéos pas encore prêtes)", /href="\/portail\/tournages"[\s\S]{0,700}?Tournages[\s\S]{0,300}?>3</.test(p.html));
  p = await page("/portail/tournages", cB);
  ok("client B : son tournage, jamais celui de A", p.visible.includes(`Vidéo du bistrot ${jeu}`) && !p.visible.includes(`Visite de l'atelier ${jeu}`));

  console.log("\n— nouvelle vidéo sur un tournage publié —");
  await action(AG.enregistrerVideo, fiche, { shootId: shoot, title: `Bonus produit ${jeu}`, visible: "on" }, cSoc);
  ok("le client est prévenu dans le portail ; pas de second courriel dans les 2 heures", notifs(portailA, "and title like 'Nouvelle vidéo%' and emailed_at is null and email_error is null") === 1);
  const v5 = un(`select id from shoot_videos where title='Bonus produit ${jeu}'`);
  await action(AG.enregistrerVideo, fiche, { shootId: shoot, id: v4, title: `Idée cachée ${jeu}`, visible: "on" }, cSoc);
  ok("une vidéo masquée rendue visible compte comme ajoutée (notification)", notifs(portailA, `and title like '%Idée cachée ${jeu}%'`) === 1);
  await action(AG.enregistrerVideo, fiche, { shootId: shoot, id: v4, title: `Idée cachée ${jeu}` }, cSoc);
  await action(AG.supprimerVideo, fiche, { id: v5, shootId: shoot }, cSoc, { etat: false });

  console.log("\n— gestes du client —");
  r = await action(PO.basculerPret, "/portail/tournages", { videoId: v1 }, cA);
  ok("« Je suis prêt » sur la vidéo 1 : enregistré", r.resultat?.ok?.includes("prêt") && un(`select client_ready_at is not null from shoot_videos where id='${v1}'`) === "t");
  ok("l'équipe du tournage est prévenue (Léa et Emmanuel, pas Nina)", notifs(sociale, "and title like 'Client prêt%'") === 1 && notifs(direction, "and title like 'Client prêt%'") === 1 && notifs(web, "and title like 'Client prêt%'") === 0);
  r = await action(PO.cocherPreparation, "/portail/tournages", { videoId: v1, item: prepIds[0].id }, cA);
  ok("une case « à préparer » cochée", r.resultat?.ok === "Coché." && un(`select prep_done::text from shoot_videos where id='${v1}'`).includes(prepIds[0].id));
  r = await action(PO.cocherPreparation, "/portail/tournages", { videoId: v1, item: "inventé" }, cA);
  ok("un élément inconnu est refusé", Boolean(r.resultat?.error));
  const QUESTION = `Je préfère dire « fait avec amour » ${jeu}`;
  r = await action(PO.commenterVideo, "/portail/tournages", { videoId: v1, body: QUESTION }, cA);
  ok("question du client enregistrée, l'équipe prévenue (avec courriel, comme un commentaire de contenu)", r.resultat?.ok?.includes("envoyé") && notifs(sociale, "and title like 'Question du client%' and (emailed_at is not null or email_error is not null)") === 1);
  r = await action(PO.basculerPret, "/portail/tournages", { videoId: v4 }, cA);
  ok("client : impossible d'agir sur une vidéo masquée", Boolean(r.resultat?.error) && un(`select client_ready_at is null from shoot_videos where id='${v4}'`) === "t");
  r = await action(PO.basculerPret, "/portail/tournages", { videoId: v1 }, cB);
  ok("client B : impossible d'agir sur une vidéo de A", Boolean(r.resultat?.error) && un(`select client_ready_by_id from shoot_videos where id='${v1}'`) === portailA);
  r = await action(PO.commenterVideo, "/portail/tournages", { videoId: v2, body: "aperçu" }, cDir, { extra: `; pilot-apercu=${clientA}` });
  ok("aperçu de l'agence : lecture seule, aucun geste enregistré", r.resultat?.error?.startsWith("Aperçu") && Number(un(`select count(*) from shoot_video_comments where video_id='${v2}'`)) === 0);
  r = await action(PO.basculerPret, "/portail/tournages", { videoId: v1 }, null);
  ok("sans session : refusé", r.statut !== 200 || !r.resultat?.ok);
  p = await page(fiche, cSoc);
  ok("côté agence : « Client prêt », la case cochée, la question du client sans réponse", p.visible.includes("Client prêt") && p.visible.includes("1/2 cochées") && p.visible.includes(QUESTION) && p.visible.includes("Question du client, sans réponse") && p.visible.includes("Client prêt pour 1 vidéo sur 3"));
  p = await page("/", cDir);
  dump("accueil-question", p.visible);
  ok("« Ce matin » : la question du client dans « À répondre »", p.visible.includes(`Question sur la vidéo « Visite de l'atelier ${jeu} »`));
  await action(AG.repondreVideo, fiche, { id: v1, shootId: shoot, body: `Bien sûr, dites-le comme vous le sentez ${jeu}` }, cSoc, { etat: false });
  p = await page("/portail/tournages", cA);
  ok("la réponse de l'équipe s'affiche sous la vidéo, signée du prénom", p.visible.includes(`dites-le comme vous le sentez ${jeu}`) && p.html.includes('data-echange="equipe"') && p.visible.includes("Léa ·"));
  p = await page("/", cDir);
  ok("après la réponse, la question sort de « À répondre »", !p.visible.includes(`Question sur la vidéo « Visite de l'atelier ${jeu} »`));

  console.log("\n— « Ce matin » : relancer le client avant le tournage —");
  const cle = `action:tournage-relance:${shoot}`;
  ok("la ligne est là (tournage dans 2 jours, 2 vidéos sur 3 pas prêtes), avec la règle en clair", p.visible.includes("Relancer le client avant le tournage") && p.visible.includes("2 vidéos sur 3 pas encore prêtes") && p.visible.includes("Tournage dans 3 jours ou moins"));
  const res = await actionJson(CM.marquerTraite, "/", [[cle]], cDir);
  ok("« Traité » : la ligne est archivée pour l'équipe", res?.ok === true && un(`select count(*) from ce_matin_archives where key='${cle}'`) === "1");
  p = await page("/", cDir);
  ok("archivée : elle ne s'affiche plus dans les actions", !p.visible.includes("2 vidéos sur 3 pas encore prêtes"));
  await action(AG.enregistrerVideo, fiche, { shootId: shoot, id: v4, title: `Idée cachée ${jeu}`, visible: "on" }, cSoc);
  p = await page("/", cDir);
  ok("une vidéo visible ajoutée : la ligne revient d'elle-même (« 3 vidéos sur 4 »)", p.visible.includes("3 vidéos sur 4 pas encore prêtes"));
  await action(AG.enregistrerVideo, fiche, { shootId: shoot, id: v4, title: `Idée cachée ${jeu}` }, cSoc);
  for (const id of [v2, v3]) await action(PO.basculerPret, "/portail/tournages", { videoId: id }, cA);
  p = await page("/", cDir);
  ok("toutes les vidéos prêtes : plus de relance", !new RegExp(`Atelier en action ${jeu} », [^<]*vidéos? sur`).test(p.visible));
  sql(`delete from ce_matin_archives where key='${cle}'`);

  console.log("\n— ajout depuis la veille —");
  sql(`update clients set metricool_brand_id = 'brand-${jeu}' where id='${clientA}'`);
  sql(`insert into veille_accounts (client_id, network, handle, kind) values ('${clientA}', 'instagram', 'atelier.concurrent', 'inspiration')`);
  const post = un(`insert into veille_posts (client_id, network, external_id, handle, published_at, format, url, image_url) values ('${clientA}', 'instagram', 'ext-${jeu}', 'atelier.concurrent', now() - interval '3 days', 'reel', 'https://www.instagram.com/reel/V${jeu}/', 'https://exemple.test/vignette.jpg') returning id`);
  r = await action(VE.ajouterAuProchainTournage, `/veille?client=${clientA}`, { postId: post }, cSoc);
  ok("« Ajouter au prochain tournage » : ajoutée au tournage à venir du client", r.resultat?.ok?.startsWith("Ajoutée au tournage du") && r.resultat?.shootId === shoot);
  const veilleRef = JSON.parse(un(`select "references" from shoot_videos where shoot_id='${shoot}' and title like '%atelier.concurrent%'`) || "[]");
  ok("la vidéo porte le lien de référence et la vignette relevée, jamais la légende d'origine", veilleRef[0]?.url === `https://www.instagram.com/reel/V${jeu}/` && veilleRef[0]?.vignette === "https://exemple.test/vignette.jpg");
  p = await page(`/veille?client=${clientA}`, cSoc);
  dump("veille", p.visible);
  ok("le bouton est à côté de « Refaire cette idée »", /Refaire cette idée[\s\S]{0,1500}Ajouter au prochain tournage/.test(p.visible));
  r = await action(VE.ajouterAuProchainTournage, `/veille?client=${clientA}`, { postId: post }, cWeb);
  ok("pôle web : refusé (mêmes droits que la Veille)", !r.resultat?.ok);
  const postB = un(`insert into veille_posts (client_id, network, external_id, handle, url) values ('${clientB}', 'instagram', 'extB-${jeu}', 'autre', 'https://www.instagram.com/p/B${jeu}/') returning id`);
  sql(`update shoots set status='realise' where id='${shootB}'`);
  r = await action(VE.ajouterAuProchainTournage, `/veille?client=${clientB}`, { postId: postB }, cSoc);
  ok("client sans tournage à venir : message clair, rien de créé", r.resultat?.error?.includes("Aucun tournage à venir"));

  console.log("\n— ajout depuis une idée ou un contenu —");
  const idee = un(`insert into contents (client_id, title, kind, status, instructions) values ('${clientA}', 'Idée tendance ${jeu}', 'reel', 'idee', 'CONSIGNE-INTERNE-${jeu}') returning id`);
  sql(`insert into content_links (content_id, url) values ('${idee}', 'https://www.tiktok.com/@x/video/123'), ('${idee}', 'https://drive.google.com/rushs-${jeu}')`);
  r = await action(CT.ajouterDepuisContenu, `/contenu/${idee}`, { shootId: shoot, contentId: idee }, cSoc);
  const depuis = un(`select "references"::text || '|' || coalesce(content_id::text,'') || '|' || coalesce(description,'') from shoot_videos where shoot_id='${shoot}' and title='Idée tendance ${jeu}'`);
  ok("depuis un contenu : la vidéo reprend le titre, reste reliée, garde le lien TikTok mais pas le dossier Drive ni la consigne interne", r.resultat?.ok?.startsWith("Ajoutée") && depuis.includes("tiktok.com") && !depuis.includes("drive.google") && depuis.includes(idee) && !depuis.includes("CONSIGNE"));
  ok("le contenu sait de quel tournage il sort", un(`select shoot_id from contents where id='${idee}'`) === shoot);
  r = await action(CT.ajouterDepuisContenu, `/contenu/${idee}`, { shootId: shoot, contentId: idee }, cSoc);
  ok("deux fois le même contenu : refusé", r.resultat?.error?.includes("déjà prévu"));
  const ideeB = un(`insert into contents (client_id, title, status) values ('${clientB}', 'Idée de B ${jeu}', 'idee') returning id`);
  r = await action(CT.ajouterDepuisContenu, `/contenu/${ideeB}`, { shootId: shoot, contentId: ideeB }, cSoc);
  ok("le contenu d'un autre client : refusé", Boolean(r.resultat?.error));
  p = await page(`/contenu/${idee}`, cSoc);
  dump("contenu", p.visible);
  ok("fiche du contenu : « Prévu au tournage … »", new RegExp(`Prévu au tournage[\\s\\S]{0,300}Atelier en action ${jeu}`).test(p.visible));
  await action(AG.creerContenuDepuisVideo, fiche, { id: v2, shootId: shoot }, cSoc, { etat: false });
  const cree = un(`select content_id from shoot_videos where id='${v2}'`);
  ok("« Créer le contenu » : une idée en production, reliée à la vidéo et au tournage", Boolean(cree) && un(`select status || '|' || shoot_id from contents where id='${cree}'`) === `idee|${shoot}`);

  console.log("\n— droits —");
  p = await page("/portail/tournages", null);
  ok("sans session : renvoyé à la connexion", p.statut >= 300 && p.statut < 400 && p.location.includes("/connexion"));
  p = await page(fiche, cA);
  ok("client du portail : la fiche agence lui est refusée", p.statut >= 300 && p.statut < 400 && p.location.includes("/portail"));
  p = await page(fiche, cWeb);
  ok("pôle web : la fiche tournage lui est refusée (règle existante des tournages)", p.statut >= 300 && p.statut < 400 && !p.visible.includes(`Visite de l'atelier ${jeu}`));
  const avant = videos().length;
  await action(AG.enregistrerVideo, fiche, { shootId: shoot, title: `Intrus web ${jeu}`, visible: "on" }, cWeb);
  await action(AG.enregistrerVideo, fiche, { shootId: shoot, title: `Intrus client ${jeu}`, visible: "on" }, cA);
  await action(AG.publierTournage, fiche, { id: shootB }, cA, { etat: false });
  ok("pôle web et client : aucune écriture côté agence", videos().length === avant && !sql(`select title from shoot_videos where title like 'Intrus%${jeu}'`));
  p = await page("/portail/tournages", cDir, `; pilot-apercu=${clientA}`);
  ok("aperçu de la direction : la page du client, lecture seule", p.statut === 200 && p.visible.includes(`Visite de l'atelier ${jeu}`));
  sql(`update shoots set published_at = null where id='${shoot}'`);
  p = await page("/portail/tournages", cA);
  ok("repassé en brouillon : il disparaît du portail", !p.html.includes(`data-prochain-tournage="${shoot}"`) && !p.html.includes(`data-video-client="${v1}"`));
  sql(`update shoots set published_at = now() where id='${shoot}'`);

  console.log("\n— vidéaste —");
  ok("actions vidéaste présentes dans le build", Boolean(VI.basculerTournee && VI.noterTournage && VI.indiquerRushes && EQ.inviteTeammate && TO.addCrew));
  r = await action(EQ.inviteTeammate, "/equipe", { name: `Yohan Vidéaste${jeu}`, email: `video-${jeu}@exemple.test`, role: "videaste", duration: "permanent", departments: "social" }, cDir);
  const videaste = un(`select id from users where email='video-${jeu}@exemple.test'`);
  ok("Équipe : la direction invite un vidéaste (même lien d'invitation, aucun pôle)", r.resultat?.ok?.startsWith("Invitation créée") && un(`select role || '|' || departments::text || '|' || (invite_token is not null) from users where id='${videaste}'`) === "videaste|[]|true");
  r = await action(EQ.inviteTeammate, "/equipe", { name: "Intrus", email: `intrus-${jeu}@exemple.test`, role: "videaste", duration: "permanent" }, cSoc);
  ok("le pôle social ne peut pas inviter (direction seulement)", !un(`select id from users where email='intrus-${jeu}@exemple.test'`));
  const jetonInvit = un(`select invite_token from users where id='${videaste}'`);
  p = await page(`/invitation/${jetonInvit}`, null);
  ok("le lien d'invitation s'ouvre", p.statut === 200);
  p = await page("/equipe", cDir);
  ok("la page Équipe le montre : « Vidéaste · ses tournages seulement »", p.html.includes(`data-role-videaste="${videaste}"`));
  sql(`update users set password_hash='x', invite_token=null where id='${videaste}'`);
  const cVid = ouvrirSession(videaste);
  p = await page(fiche, cSoc);
  ok("fiche du tournage : le vidéaste est proposé dans « Qui part ? »", p.visible.includes(`Yohan Vidéaste${jeu} (vidéaste)`));
  await action(TO.addCrew, fiche, { shootId: shoot, userId: videaste, roleLabel: "Cadre" }, cSoc, { etat: false });
  ok("ajouté à l'équipe du tournage", un(`select count(*) from shoot_crew where shoot_id='${shoot}' and user_id='${videaste}'`) === "1");
  ok("il reçoit une notification « Nouveau tournage », avec le courriel d'une assignation (tenté)", notifs(videaste, "and title like 'Nouveau tournage%' and (emailed_at is not null or email_error is not null)") === 1);
  // Un autre tournage, du client B, où il n'est pas.
  const shootAutre = un(`insert into shoots (client_id, title, starts_at, status, note) values ('${clientB}', 'Tournage interdit ${jeu}', '${debut}', 'confirme', 'NOTE-B-${jeu}') returning id`);
  const videoAutre = un(`insert into shoot_videos (shoot_id, title) values ('${shootAutre}', 'Vidéo interdite ${jeu}') returning id`);
  sql(`update shoots set on_site_contact = 'Sophie, 0692 11 22 33' where id='${shoot}'`);
  sql(`insert into shots (shoot_id, label, kind) values ('${shoot}', 'Plan-large-atelier-${jeu}', 'Vidéo')`);

  p = await page("/videaste", cVid);
  ok("« Mes tournages » : son tournage (client, date, lieu), jamais celui où il n'est pas", p.statut === 200 && p.html.includes(`data-mon-tournage="${shoot}"`) && p.visible.includes(`Atelier Vanille ${jeu}`) && !p.visible.includes(`Tournage interdit ${jeu}`));
  ok("la notification est affichée (« Du nouveau »)", p.html.includes("data-nouveautes-videaste"));
  ok("barre réduite : Mes tournages et Mon compte seulement", p.html.includes('href="/videaste/compte"') && !/href="\/(contacts|rentabilite|devis|reglages|veille|boite|jarvis|equipe|production|calendrier|portail)"/.test(p.html));
  p = await page(`/videaste/${shoot}`, cVid);
  const fv = p.visible;
  ok("sa fiche : adresse complète, contact sur place, équipe, note interne de l'équipe", p.statut === 200 && fv.includes("12 rue des Vanilliers") && fv.includes("Sur place : Sophie, 0692 11 22 33") && fv.includes(`Léa Sociale${jeu}`) && fv.includes(NOTE));
  ok("matériel, droit à l'image et plans prévus", fv.includes(MATERIEL) && fv.includes(DROIT) && fv.includes(`Plan-large-atelier-${jeu}`));
  ok("chaque vidéo : description, référence, script, ce que le client a coché, « client prêt », questions du client", fv.includes(`tout est fait main ${jeu}`) && p.html.includes('data-reference="instagram"') && fv.includes(`Bienvenue à l'Atelier Vanille ${jeu}`) && fv.includes("✓ Tenue claire, sans logo") && fv.includes("client prêt") && fv.includes(QUESTION));
  ok("aucun montant ni document client sur sa fiche", !/€|forfait|facture|devis/i.test(fv.replace(/<[^>]+>/g, " ")));
  p = await page(`/videaste/${shootAutre}`, cVid);
  ok("le tournage d'un autre (adresse tapée) : introuvable", p.statut === 404 && !p.visible.includes(`NOTE-B-${jeu}`));
  r = await action(VI.basculerTournee, `/videaste/${shoot}`, { videoId: v1 }, cVid);
  ok("« Marquer tournée » : la vidéo passe « tournée », avec son auteur", r.resultat?.ok === "Marquée tournée." && un(`select status || '|' || shot_by_id from shoot_videos where id='${v1}'`) === `tourne|${videaste}`);
  const NOTE_T = `Prise 3 la meilleure ${jeu}`;
  r = await action(VI.noterTournage, `/videaste/${shoot}`, { videoId: v1, body: NOTE_T }, cVid);
  ok("note de tournage enregistrée", r.resultat?.ok?.startsWith("Note enregistrée"));
  r = await action(VI.indiquerRushes, `/videaste/${shoot}`, { shootId: shoot, url: `https://drive.google.com/drive/folders/rushes-${jeu}` }, cVid);
  ok("lien des rushes enregistré, l'équipe interne du tournage prévenue (sans courriel)", r.resultat?.ok?.startsWith("Lien des rushes") && notifs(sociale, "and title like 'Rushes déposés%' and email_error is null and emailed_at is null") === 1 && notifs(videaste, "and title like 'Rushes%'") === 0);
  r = await action(VI.indiquerRushes, `/videaste/${shoot}`, { shootId: shoot, url: "javascript:alert(1)" }, cVid);
  ok("un lien qui n'est pas http(s) est refusé", Boolean(r.resultat?.error));
  r = await action(VI.basculerTournee, `/videaste/${shoot}`, { videoId: videoAutre }, cVid);
  const r2 = await action(VI.indiquerRushes, `/videaste/${shoot}`, { shootId: shootAutre, url: "https://exemple.test/x" }, cVid);
  const r3 = await action(VI.noterTournage, `/videaste/${shoot}`, { videoId: videoAutre, body: "intrus" }, cVid);
  ok("sur le tournage d'un autre : aucun geste possible", Boolean(r.resultat?.error && r2.resultat?.error && r3.resultat?.error) && un(`select status || '|' || coalesce((select rushes_url from shoots where id='${shootAutre}'),'') from shoot_videos where id='${videoAutre}'`) === "a_preparer|");
  r = await action(VI.basculerTournee, `/videaste/${shoot}`, { videoId: v2 }, cSoc);
  ok("un compte de l'équipe n'utilise pas l'espace vidéaste (renvoyé)", !r.resultat?.ok && un(`select status from shoot_videos where id='${v2}'`) !== "tourne");
  p = await page(fiche, cSoc);
  ok("côté agence : « Tournée par Yohan … », la note de tournage, le lien des rushes, « vidéaste » dans l'équipe", p.html.includes(`data-tournee-par="${v1}"`) && p.visible.includes(`Tournée par Yohan Vidéaste${jeu}`) && p.visible.includes(NOTE_T) && p.html.includes("data-rushes-agence") && p.visible.includes(" · vidéaste"));
  p = await page("/portail/tournages", cA);
  ok("le client ne voit jamais les notes de tournage ni le lien des rushes", !p.visible.includes(NOTE_T) && !p.visible.includes(`rushes-${jeu}`));

  console.log("\n— vidéaste : accès interdits —");
  const factureA = un(`insert into invoices (client_id, number, amount_cents, issued_on, filename, storage_path, mime_type) values ('${clientA}', 'F-${jeu}', 10000, current_date, 'f-${jeu}.pdf', 'x/f-${jeu}.pdf', 'application/pdf') returning id`) || null;
  const fichierA = un(`insert into client_files (client_id, filename, storage_path, size_bytes, mime_type, visibility) values ('${clientA}', 'contrat-${jeu}.pdf', 'x/contrat-${jeu}.pdf', 10, 'application/pdf', 'interne') returning id`) || null;
  const pages = ["/", "/rentabilite", "/devis", "/contacts", `/contacts/${clientA}`, "/clients", "/boite", "/reglages", "/veille", "/jarvis", "/equipe", "/cockpit", "/heures", "/production", "/calendrier", "/tournages", fiche, `/tournages/${shootAutre}`, "/terrain", `/terrain/${shoot}`, "/portail", "/portail/tournages", "/statistiques", "/a-publier", "/ads"];
  const fuites = [];
  for (const chemin of pages) {
    const q = await page(chemin, cVid);
    const refuse = (q.statut >= 300 && q.statut < 400 && /\/videaste/.test(q.location)) || q.statut === 404;
    if (!refuse) fuites.push(`${chemin} → ${q.statut} ${q.location}`);
  }
  ok(`${pages.length} pages de l'agence et du portail refusées (renvoi vers « Mes tournages ») : argent, devis, contacts, annuaire, boîte, réglages (Gmail, Trello, GoCardless, Abby), veille, Jarvis, équipe, tournages des autres${fuites.length ? ` — fuites : ${fuites.join(", ")}` : ""}`, fuites.length === 0);
  const api = async (chemin, init = {}) => (await fetch(`${BASE}${chemin}`, { ...init, headers: { ...(init.headers ?? {}), Cookie: `pilot_session=${cVid}` }, redirect: "manual" })).status;
  const statuts = {
    jarvis: await api("/api/jarvis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: "liste les clients" }] }) }),
    boite: await api("/api/boite"),
    facture: factureA ? await api(`/api/invoice/${factureA}`) : 403,
    document: fichierA ? await api(`/api/client-files/${fichierA}`) : 403,
    depot: await api(`/api/client-files?clientId=${clientA}`, { method: "POST", body: "x" }),
  };
  ok(`API refusées au vidéaste : Jarvis ${statuts.jarvis}, boîte ${statuts.boite}, facture ${statuts.facture}, document client ${statuts.document}, dépôt ${statuts.depot}`, Object.values(statuts).every((x) => x === 401 || x === 403));
  r = await action(AG.enregistrerVideo, fiche, { shootId: shoot, title: `Intrus vidéaste ${jeu}`, visible: "on" }, cVid);
  const r4 = await actionJson(CM.marquerTraite, "/", [[`action:tournage-relance:${shoot}`]], cVid);
  const r5 = await action(PO.commenterVideo, "/portail/tournages", { videoId: v2, body: "intrus" }, cVid);
  const r6 = await action(VE.ajouterAuProchainTournage, `/veille?client=${clientA}`, { postId: post }, cVid);
  ok("actions de l'agence et du portail refusées (vidéo, « Traité », question client, veille)", !sql(`select id from shoot_videos where title='Intrus vidéaste ${jeu}'`) && r4?.ok !== true && !r5.resultat?.ok && !r6.resultat?.ok);
  p = await page("/connexion", cVid);
  ok("connecté, la page de connexion le renvoie chez lui", p.statut >= 300 && p.statut < 400);
  p = await page("/videaste", cSoc);
  ok("un compte de l'équipe qui ouvre /videaste est renvoyé vers les tournages", p.statut >= 300 && p.location.includes("/tournages"));
  p = await page("/videaste", cA);
  ok("un client qui ouvre /videaste est renvoyé vers son portail", p.statut >= 300 && p.location.includes("/portail"));
  p = await page("/videaste", null);
  ok("sans session : renvoyé à la connexion", p.statut >= 300 && p.location.includes("/connexion"));

  /* --------------------------------------------------------- captures -- */
  if (CAPTURES) {
    console.log("\n— captures —");
    mkdirSync(CAPTURES, { recursive: true });
    // Un tournage avec des vidéos pas toutes prêtes, pour des captures parlantes.
    sql(`update shoot_videos set client_ready_at = null where id in ('${v2}','${v3}')`);
    sql(`update shoot_videos set prep_done = '[]'::jsonb where id='${v2}'`);
    const pw = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;
    const navigateur = await pw.chromium.launch();
    const formats = [
      // L'outil agence défile dans son propre panneau : une fenêtre haute
      // montre toute la fiche sur la capture.
      ["1440", { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }, 4200],
      ["iphone13", { ...pw.devices["iPhone 13"] }, 9000],
    ];
    for (const [nom, options, hauteurAgence] of formats) {
      for (const [quoi, cookie, chemin, extra] of [
        ["agence-fiche-tournage", cSoc, fiche, null],
        ["portail-tournages", cA, "/portail/tournages", null],
        ["portail-accueil", cA, "/portail", "[data-bloc-tournage]"],
        ["videaste-mes-tournages", cVid, "/videaste", null],
        ["videaste-fiche-tournage", cVid, `/videaste/${shoot}`, null],
      ]) {
        const agence = !chemin.startsWith("/portail") && !chemin.startsWith("/videaste");
        const ctx = await navigateur.newContext({
          ...options,
          ...(agence ? { viewport: { width: options.viewport.width, height: hauteurAgence } } : {}),
          locale: "fr-FR",
          timezoneId: "Indian/Reunion",
        });
        await ctx.addCookies([{ name: "pilot_session", value: cookie, url: BASE }]);
        const onglet = await ctx.newPage();
        const erreurs = [];
        onglet.on("pageerror", (err) => erreurs.push(err.message));
        await onglet.goto(`${BASE}${chemin}`, { waitUntil: "networkidle" });
        // La vidéo d'accueil s'ouvre à la première visite : on la ferme.
        await onglet.keyboard.press("Escape");
        await attendre(300);
        const debord = await onglet.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        await onglet.screenshot({ path: path.join(CAPTURES, `${quoi}-${nom}.png`), fullPage: true });
        if (extra) await onglet.locator(extra).first().screenshot({ path: path.join(CAPTURES, `${quoi}-bloc-${nom}.png`) });
        let petites = [];
        if (nom === "iphone13" && (quoi.startsWith("portail") || quoi.startsWith("videaste"))) {
          // Nos éléments seulement : la page Tournages entière, le bloc sur l'accueil.
          const zone = quoi === "portail-accueil" ? "[data-bloc-tournage]" : "main";
          petites = await onglet.evaluate((z) =>
            [...document.querySelectorAll(`${z} button, ${z} a, ${z} summary, a${z}`)]
              .filter((e) => e.offsetParent !== null)
              .map((e) => ({ t: (e.textContent || "").trim().slice(0, 40), h: e.getBoundingClientRect().height }))
              .filter((x) => x.h > 0 && x.h < 44),
          zone);
        }
        ok(`${quoi} ${nom} : aucune erreur JS, rien ne déborde (${debord} px)${petites.length ? `, cibles < 44 px : ${JSON.stringify(petites)}` : ""}`, erreurs.length === 0 && debord <= 0 && petites.length === 0);
        await ctx.close();
      }
    }
    // Le geste dans le navigateur : « Je suis prêt » sur téléphone.
    const ctx = await navigateur.newContext({ ...pw.devices["iPhone 13"], locale: "fr-FR" });
    await ctx.addCookies([{ name: "pilot_session", value: cA, url: BASE }]);
    const onglet = await ctx.newPage();
    await onglet.goto(`${BASE}/portail/tournages`, { waitUntil: "networkidle" });
    await onglet.locator(`[data-bouton-pret="${v2}"]`).click();
    await onglet.locator(`[data-bouton-pret="${v2}"][aria-pressed="true"]`).waitFor({ timeout: 10_000 });
    await attendre(800);
    ok("navigateur (iPhone 13) : « Je suis prêt » cliqué et enregistré", un(`select client_ready_at is not null from shoot_videos where id='${v2}'`) === "t");
    await ctx.close();
    await navigateur.close();
  }
} catch (err) {
  console.error(err);
  codeSortie = 1;
} finally {
  console.log("\n— nettoyage —");
  await arreter().catch(() => undefined);
  sql(`delete from ce_matin_archives where key like '%${shoot}%'`);
  sql(`delete from users where email like '%-${jeu}@exemple.test'`);
  sql(`delete from clients where name like '%${jeu}%'`);
  if (process.env.TRACE) console.log(readFileSync(JOURNAL, "utf8").slice(-4000));
  rmSync(dir, { recursive: true, force: true });
  console.log("décor effacé, serveur arrêté");
}

console.log(`\n${verts} vérifications vertes, ${rouges.length} rouge(s).`);
if (rouges.length || codeSortie) {
  for (const r_ of rouges) console.log(`  ✗ ${r_}`);
  process.exit(1);
}
