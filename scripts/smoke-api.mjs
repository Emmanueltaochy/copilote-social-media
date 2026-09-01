#!/usr/bin/env node
//
// Tests fumigènes de l'API des agents.
//
// Pourquoi des appels HTTP réels plutôt que des tests unitaires : ce qui casse
// dans une couche de clés casse à la frontière HTTP — une garde qui redirige au
// lieu de répondre, un droit qu'on oublie de vérifier, un 302 que l'appelant lit
// comme un succès. Le défaut corrigé dans `currentDirection()` aurait passé
// n'importe quel test unitaire : la fonction faisait exactement ce qu'on lui
// demandait, et c'est `fetch` qui suivait la redirection.
//
// Aucune dépendance : Node a `fetch`, et `psql` sert à poser le décor et à
// vérifier l'état réel de la base — un écran qui dit « enregistré » ne prouve
// rien.
//
// Usage :
//   BASE=http://127.0.0.1:4030 \
//   PGURL="postgres://postgres@127.0.0.1:5451/pilot" \
//   node scripts/smoke-api.mjs

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";

const BASE = process.env.BASE ?? "http://127.0.0.1:4030";
const PGURL = process.env.PGURL ?? process.env.DATABASE_URL;
if (!PGURL) {
  console.error("\n  ✗ PGURL (ou DATABASE_URL) est requis.\n");
  process.exit(1);
}

const sql = (q) => execFileSync("psql", [PGURL, "-tA", "-c", q], { encoding: "utf8" }).trim();
const un = (q) => sql(q).split("\n")[0].trim();

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

/**
 * `redirect: "manual"` n'est pas un détail : sans lui, `fetch` suivrait une
 * redirection vers /connexion et rendrait un 200 qui ressemble à un succès.
 * C'est précisément ce qu'on veut prouver impossible.
 */
const appel = async (chemin, jeton) => {
  const reponse = await fetch(`${BASE}${chemin}`, {
    headers: jeton ? { Authorization: `Bearer ${jeton}` } : {},
    redirect: "manual",
    cache: "no-store",
  });
  const texte = await reponse.text();
  let corps = null;
  try {
    corps = JSON.parse(texte);
  } catch {
    corps = null;
  }
  return { statut: reponse.status, corps, texte, entetes: reponse.headers };
};

/* ------------------------------------------------------------------ décor -- */

const PREFIX = "tpk_";
const idJeu = randomBytes(4).toString("hex");

/** Pose une clé directement en base : le décor n'a pas à passer par le script
 *  de création, qui est testé séparément. */
function poserCle({ nom, scopes, poles, clientId = null, revoquee = false, expiree = false }) {
  const jeton = PREFIX + randomBytes(32).toString("base64url");
  const empreinte = createHash("sha256").update(jeton).digest("hex");
  const id = un(`
    insert into api_keys (name, token_hash, prefix, scopes, departments, client_id, revoked_at, expires_at)
    values (
      '${nom}', '${empreinte}', '${jeton.slice(0, 12)}',
      '${JSON.stringify(scopes)}'::jsonb, '${JSON.stringify(poles)}'::jsonb,
      ${clientId ? `'${clientId}'` : "null"},
      ${revoquee ? "now()" : "null"},
      ${expiree ? "now() - interval '1 day'" : "null"}
    )
    returning id
  `);
  return { id, jeton };
}

console.log(`\n— décor —`);

const clientSocial = un(`
  insert into clients (name, short_name, departments)
  values ('Cap Marine ${idJeu}', 'Cap Marine ${idJeu}', '["social"]'::jsonb)
  returning id
`);
const clientWeb = un(`
  insert into clients (name, short_name, departments)
  values ('Boutique Web ${idJeu}', 'Boutique Web ${idJeu}', '["web"]'::jsonb)
  returning id
`);

un(`
  insert into contents (client_id, title, status, scheduled_at)
  values ('${clientSocial}', 'Post social ${idJeu}', 'creation', now() + interval '2 days')
  returning id
`);
un(`
  insert into contents (client_id, title, status, scheduled_at)
  values ('${clientWeb}', 'Post web ${idJeu}', 'creation', now() + interval '2 days')
  returning id
`);
// Un second contenu social, à un autre statut : sans lui, le filtre de statut
// se vérifierait sur une liste vide, ce qui ne prouve rien.
un(`
  insert into contents (client_id, title, status, scheduled_at, published_at)
  values ('${clientSocial}', 'Post publié ${idJeu}', 'publie', now() - interval '3 days', now() - interval '3 days')
  returning id
`);

const bonne = poserCle({ nom: `fumigène lecture ${idJeu}`, scopes: ["pipeline:read"], poles: ["social"] });
const sansDroit = poserCle({ nom: `fumigène sans droit ${idJeu}`, scopes: ["pipeline:write"], poles: ["social"] });
const revoquee = poserCle({ nom: `fumigène révoquée ${idJeu}`, scopes: ["pipeline:read"], poles: ["social"], revoquee: true });
const expiree = poserCle({ nom: `fumigène expirée ${idJeu}`, scopes: ["pipeline:read"], poles: ["social"], expiree: true });
const nominative = poserCle({ nom: `fumigène nominative ${idJeu}`, scopes: ["pipeline:read"], poles: ["social"], clientId: clientSocial });
const pourCadence = poserCle({ nom: `fumigène cadence ${idJeu}`, scopes: ["pipeline:read"], poles: ["social"] });

console.log(`décor posé (jeu ${idJeu})\n`);

/* ------------------------------------------------------------ les refus -- */

console.log("— les refus —");

const sansCle = await appel("/api/agent/contents");
ok(`sans clé, la route répond 401 et non 302 (${sansCle.statut})`, sansCle.statut === 401);
ok(
  "… avec un message en français",
  typeof sansCle.corps?.error === "string" && /clé/i.test(sansCle.corps.error),
);
ok(
  "… et jamais la page de connexion",
  !sansCle.texte.includes("<html") && !sansCle.entetes.get("location"),
);

const inventee = await appel("/api/agent/contents", "tpk_jeton-completement-invente");
ok(`une clé inventée est refusée (${inventee.statut})`, inventee.statut === 401);

const malForme = await fetch(`${BASE}/api/agent/contents`, {
  headers: { Authorization: "Basic quelquechose" },
  redirect: "manual",
});
ok(`un schéma d'authentification inconnu est refusé (${malForme.status})`, malForme.status === 401);

const mauvaisScope = await appel("/api/agent/contents", sansDroit.jeton);
ok(`une clé sans le bon droit reçoit 403 (${mauvaisScope.statut})`, mauvaisScope.statut === 403);
ok(
  "… et le message nomme le droit manquant",
  typeof mauvaisScope.corps?.error === "string" && mauvaisScope.corps.error.includes("pipeline:read"),
);

const surRevoquee = await appel("/api/agent/contents", revoquee.jeton);
ok(`une clé révoquée est refusée (${surRevoquee.statut})`, surRevoquee.statut === 401);

const surExpiree = await appel("/api/agent/contents", expiree.jeton);
ok(`une clé expirée est refusée (${surExpiree.statut})`, surExpiree.statut === 401);

/* ---------------------------------------------------------- la lecture -- */

console.log("\n— la lecture —");

const lecture = await appel("/api/agent/contents", bonne.jeton);
ok(`une clé valide lit le pipeline (${lecture.statut})`, lecture.statut === 200);
ok("la réponse porte une liste de contenus", Array.isArray(lecture.corps?.contenus));

const titres = (lecture.corps?.contenus ?? []).map((c) => c.titre);
ok("le contenu du client social est là", titres.includes(`Post social ${idJeu}`));

/* --- le point qui compte : le cloisonnement, vérifié dans la réponse --- */

ok(
  "le contenu d'un client hors pôle est absent des résultats",
  !titres.includes(`Post web ${idJeu}`),
);

const nomsClients = new Set((lecture.corps?.contenus ?? []).map((c) => c.client?.nomCourt));
ok("aucun client web ne remonte, même comme rattachement", !nomsClients.has(`Boutique Web ${idJeu}`));

// Demander explicitement un client hors périmètre ne doit pas l'ouvrir.
const volParParametre = await appel(`/api/agent/contents?client=${clientWeb}`, bonne.jeton);
ok(
  `demander un client hors pôle rend une liste vide, pas ses contenus (${volParParametre.statut})`,
  volParParametre.statut === 200 && volParParametre.corps?.contenus?.length === 0,
);

/* --- aucune donnée commerciale ne doit fuiter --- */

const brut = JSON.stringify(lecture.corps);
ok(
  "la réponse ne contient aucun montant ni tarif",
  !/monthlyFee|hoursSold|webMaintenance|webHourlyRate|_cents/i.test(brut),
);
ok("… ni courriel ni jeton d'invitation", !/@|inviteToken|passwordHash/i.test(brut));

/* --- la clé nominative ne voit que son client --- */

const surNominative = await appel("/api/agent/contents", nominative.jeton);
ok(
  "une clé nominative ne voit que son client",
  surNominative.statut === 200 &&
    surNominative.corps.contenus.length > 0 &&
    surNominative.corps.contenus.every((c) => c.client.id === clientSocial),
);

/* --- les filtres --- */

const filtreStatut = await appel("/api/agent/contents?statut=publie", bonne.jeton);
const publies = filtreStatut.corps?.contenus ?? [];
ok(
  `le filtre de statut retient ce qu'il doit (${publies.length})`,
  filtreStatut.statut === 200 &&
    publies.length > 0 &&
    publies.some((c) => c.titre === `Post publié ${idJeu}`),
);
ok(
  "… et écarte le reste",
  publies.every((c) => c.statut === "publie") &&
    !publies.some((c) => c.titre === `Post social ${idJeu}`),
);

const deuxStatuts = await appel("/api/agent/contents?statut=creation,publie", bonne.jeton);
ok(
  `plusieurs statuts se demandent d'un coup (${deuxStatuts.corps?.contenus?.length ?? "?"})`,
  deuxStatuts.statut === 200 && deuxStatuts.corps.contenus.length === 2,
);

// Les dates portent sur la publication prévue : le publié d'il y a trois jours
// doit sortir d'une fenêtre qui commence aujourd'hui.
const demain = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const fenetre = await appel(`/api/agent/contents?debut=${demain}`, bonne.jeton);
ok(
  `le filtre de date écarte ce qui précède la fenêtre (${fenetre.corps?.contenus?.length ?? "?"})`,
  fenetre.statut === 200 &&
    fenetre.corps.contenus.length === 1 &&
    fenetre.corps.contenus[0].titre === `Post social ${idJeu}`,
);

const statutInconnu = await appel("/api/agent/contents?statut=nimportequoi", bonne.jeton);
ok(`un statut inconnu est refusé en 400 (${statutInconnu.statut})`, statutInconnu.statut === 400);
ok(
  "… et le message énumère les statuts acceptés",
  typeof statutInconnu.corps?.error === "string" && statutInconnu.corps.error.includes("idee"),
);

const limiteFolle = await appel("/api/agent/contents?limite=99999", bonne.jeton);
ok(`une limite hors bornes est refusée (${limiteFolle.statut})`, limiteFolle.statut === 400);

const clientPasUuid = await appel("/api/agent/contents?client=bonjour", bonne.jeton);
ok(`un identifiant de client mal formé est refusé (${clientPasUuid.statut})`, clientPasUuid.statut === 400);

/* --- la trace d'usage --- */

ok(
  "l'usage de la clé est horodaté en base",
  un(`select last_used_at is not null from api_keys where id = '${bonne.id}'`) === "t",
);

/* ------------------------------------------------------------ la cadence -- */

console.log("\n— la cadence —");

ok(
  "une réponse annonce le plafond restant",
  Number(lecture.entetes.get("x-ratelimit-remaining")) > 0,
);

// Le plafond de lecture est de 120 par minute : on le dépasse avec une clé
// dédiée, pour ne pas épuiser le budget des autres vérifications.
let dernier = null;
for (let i = 0; i < 125; i += 1) {
  dernier = await appel("/api/agent/contents?limite=1", pourCadence.jeton);
  if (dernier.statut === 429) break;
}
ok(`au-delà du plafond, la route répond 429 (${dernier.statut})`, dernier.statut === 429);
ok("… avec un Retry-After exploitable", Number(dernier.entetes.get("retry-after")) >= 1);
ok(
  "… et un message en français",
  typeof dernier.corps?.error === "string" && /Réessaie/.test(dernier.corps.error),
);

// La clé de lecture ordinaire ne doit pas avoir été punie pour l'autre.
const apresCadence = await appel("/api/agent/contents", bonne.jeton);
ok(
  `le plafond est propre à chaque clé (${apresCadence.statut})`,
  apresCadence.statut === 200,
);

/* ------------------------------------------------------------------ bilan -- */

console.log(`\n${"─".repeat(60)}`);
console.log(`${verts} vertes, ${rouges.length} rouges`);
if (rouges.length > 0) {
  console.log("\nÉchecs :");
  for (const r of rouges) console.log(`  · ${r}`);
  process.exitCode = 1;
}
console.log();
