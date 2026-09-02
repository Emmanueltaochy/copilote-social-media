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
// Un second client social : la clé nominative n'en voit qu'un, la clé de pôle
// les deux. Sans cet écart, comparer leurs agrégats ne prouverait rien.
const clientSocial2 = un(`
  insert into clients (name, short_name, departments)
  values ('Voisin Social ${idJeu}', 'Voisin Social ${idJeu}', '["social"]'::jsonb)
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

// Un tournage et une personne de chaque côté de la frontière : sans eux, les
// routes /shoots et /team se vérifieraient sur des listes vides.
const membreSocial = un(`
  insert into users (email, name, initials, role, departments)
  values ('lea-${idJeu}@taochy.re', 'Lea Social ${idJeu}', 'LS', 'equipe', '["social"]'::jsonb)
  returning id
`);
un(`
  insert into users (email, name, initials, role, departments)
  values ('nina-${idJeu}@taochy.re', 'Nina Web ${idJeu}', 'NW', 'equipe', '["web"]'::jsonb)
  returning id
`);
un(`
  insert into contents (client_id, title, status, scheduled_at)
  values ('${clientSocial2}', 'Post voisin ${idJeu}', 'creation', now() + interval '2 days')
  returning id
`);
un(`
  update contents set owner_id = '${membreSocial}'
  where client_id in ('${clientSocial}', '${clientSocial2}')
`);

const tournageSocial = un(`
  insert into shoots (client_id, title, starts_at)
  values ('${clientSocial}', 'Tournage social ${idJeu}', now() + interval '5 days')
  returning id
`);
un(`
  insert into shoots (client_id, title, starts_at)
  values ('${clientWeb}', 'Tournage web ${idJeu}', now() + interval '5 days')
  returning id
`);
un(`
  insert into shoot_deliverables (shoot_id, label) values ('${tournageSocial}', 'Rushes ${idJeu}')
  returning id
`);
un(`
  insert into contract_lines (client_id, label, monthly_target)
  values ('${clientSocial}', 'Posts feed ${idJeu}', 8) returning id
`);

const contenuSocial = un(
  `select id from contents where title = 'Post social ${idJeu}'`,
);
const contenuWeb = un(`select id from contents where title = 'Post web ${idJeu}'`);
un(`
  insert into content_versions (content_id, number, note)
  values ('${contenuSocial}', 1, 'V1 sociale ${idJeu}'), ('${contenuWeb}', 1, 'V1 web ${idJeu}')
  returning id
`);
un(`
  insert into comments (content_id, body)
  values ('${contenuSocial}', 'Remarque sociale ${idJeu}'), ('${contenuWeb}', 'Remarque web ${idJeu}')
  returning id
`);

// Une anomalie de chaque nature, de chaque côté du périmètre : sans jumeau
// hors pôle, un agrégat qui déborde compterait pareil et paraîtrait juste.
for (const [client, suffixe] of [
  [clientSocial, "social"],
  [clientWeb, "web"],
]) {
  un(`
    insert into contents (client_id, title, status, due_at)
    values ('${client}', 'Retard ${suffixe} ${idJeu}', 'creation', now() - interval '4 days')
    returning id
  `);
  un(`
    insert into contents (client_id, title, status)
    values ('${client}', 'Manque ${suffixe} ${idJeu}', 'manque')
    returning id
  `);
  un(`
    insert into contents (client_id, title, status, submitted_at)
    values ('${client}', 'Attente ${suffixe} ${idJeu}', 'validation', now() - interval '9 days')
    returning id
  `);
}
// Un contenu publié et pourtant en retard d'échéance : il ne doit pas compter
// comme retard, sinon toute publication tardive resterait signalée à vie.
un(`
  insert into contents (client_id, title, status, due_at, published_at)
  values ('${clientSocial}', 'Publie tard ${idJeu}', 'publie', now() - interval '9 days', now())
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

// Vérifié sur le décor de ce passage, jamais sur un total absolu : le script
// doit pouvoir tourner contre un serveur qui porte déjà des données.
const deuxStatuts = await appel("/api/agent/contents?statut=creation,publie&limite=200", bonne.jeton);
const titresDeux = (deuxStatuts.corps?.contenus ?? []).map((c) => c.titre);
ok(
  `plusieurs statuts se demandent d'un coup (${deuxStatuts.corps?.contenus?.length ?? "?"})`,
  deuxStatuts.statut === 200 &&
    titresDeux.includes(`Post social ${idJeu}`) &&
    titresDeux.includes(`Post publié ${idJeu}`),
);
ok(
  "… et rien d'un autre statut ne s'y glisse",
  (deuxStatuts.corps?.contenus ?? []).every((c) => ["creation", "publie"].includes(c.statut)),
);

// Les dates portent sur la publication prévue : le publié d'il y a trois jours
// doit sortir d'une fenêtre qui commence aujourd'hui.
const demain = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const fenetre = await appel(`/api/agent/contents?debut=${demain}&limite=200`, bonne.jeton);
const titresFenetre = (fenetre.corps?.contenus ?? []).map((c) => c.titre);
ok(
  `le filtre de date garde ce qui vient (${fenetre.corps?.contenus?.length ?? "?"})`,
  fenetre.statut === 200 && titresFenetre.includes(`Post social ${idJeu}`),
);
ok(
  "… et écarte ce qui précède la fenêtre",
  !titresFenetre.includes(`Post publié ${idJeu}`),
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

/* ------------------------------------------- les autres routes de lecture -- */

/**
 * Le même contrôle pour chaque route : rien du pôle voisin, et aucune donnée
 * commerciale ni personnelle dans la réponse. Un module d'accès cloisonné
 * empêche la requête trop large ; il n'empêche pas la projection trop large,
 * et c'est le seul filet contre celle-ci.
 */
const propre = (corps) => {
  const brut = JSON.stringify(corps);
  return !/monthlyFee|hoursSold|webMaintenance|webHourlyRate|_cents/i.test(brut) && !/@/.test(brut);
};

console.log("\n— /clients —");

const surClients = await appel("/api/agent/clients", bonne.jeton);
ok(`le portefeuille se lit (${surClients.statut})`, surClients.statut === 200);
const nomsPortefeuille = (surClients.corps?.clients ?? []).map((c) => c.nomCourt);
ok("le client social est là", nomsPortefeuille.includes(`Cap Marine ${idJeu}`));
ok("le client hors pôle est absent des résultats", !nomsPortefeuille.includes(`Boutique Web ${idJeu}`));
ok("aucun _cents ni @ ne traverse la réponse", propre(surClients.corps));
ok(
  "les lignes de contrat suivent le client",
  (surClients.corps.clients.find((c) => c.nomCourt === `Cap Marine ${idJeu}`)?.contrat ?? []).some(
    (l) => l.libelle === `Posts feed ${idJeu}`,
  ),
);

console.log("\n— /contents/[id] —");

const detail = await appel(`/api/agent/contents/${contenuSocial}`, bonne.jeton);
ok(`un contenu du périmètre se lit (${detail.statut})`, detail.statut === 200);
ok("… avec ses versions", detail.corps?.contenu?.versions?.some((v) => v.note === `V1 sociale ${idJeu}`));
ok(
  "… et seulement les siennes",
  (detail.corps?.contenu?.versions ?? []).every((v) => v.note !== `V1 web ${idJeu}`),
);
ok(
  "… avec son fil de commentaires",
  detail.corps?.contenu?.commentaires?.some((c) => c.texte === `Remarque sociale ${idJeu}`),
);
ok("aucun _cents ni @ ne traverse la réponse", propre(detail.corps));

const detailVole = await appel(`/api/agent/contents/${contenuWeb}`, bonne.jeton);
ok(
  `un contenu hors pôle répond 404, pas 403 (${detailVole.statut})`,
  detailVole.statut === 404,
);
ok(
  "… avec le même message qu'un contenu inexistant",
  detailVole.corps?.error ===
    (await appel(`/api/agent/contents/00000000-0000-4000-8000-000000000000`, bonne.jeton)).corps
      ?.error,
);

const detailPasUuid = await appel("/api/agent/contents/bonjour", bonne.jeton);
ok(`un identifiant mal formé est refusé (${detailPasUuid.statut})`, detailPasUuid.statut === 400);

console.log("\n— /shoots —");

const surTournages = await appel("/api/agent/shoots", bonne.jeton);
ok(`les tournages se lisent (${surTournages.statut})`, surTournages.statut === 200);
const titresTournages = (surTournages.corps?.tournages ?? []).map((t) => t.titre);
ok("le tournage social est là", titresTournages.includes(`Tournage social ${idJeu}`));
ok("le tournage hors pôle est absent des résultats", !titresTournages.includes(`Tournage web ${idJeu}`));
ok(
  "… avec ses livrables attendus",
  (surTournages.corps.tournages.find((t) => t.titre === `Tournage social ${idJeu}`)?.livrables ?? [])
    .some((l) => l.libelle === `Rushes ${idJeu}`),
);
ok("aucun _cents ni @ ne traverse la réponse", propre(surTournages.corps));

console.log("\n— /team —");

const surEquipe = await appel("/api/agent/team", bonne.jeton);
ok(`l'équipe se lit (${surEquipe.statut})`, surEquipe.statut === 200);
const nomsEquipe = (surEquipe.corps?.equipe ?? []).map((m) => m.nom);
ok("le membre du pôle social est là", nomsEquipe.includes(`Lea Social ${idJeu}`));
ok("le membre du pôle voisin est absent", !nomsEquipe.includes(`Nina Web ${idJeu}`));
ok("aucun _cents ni @ ne traverse la réponse", propre(surEquipe.corps));

/*
 * L'agrégat est le point sensible de toute cette couche : un COUNT juste sur le
 * mauvais ensemble ressemble trait pour trait à un COUNT juste. La réponse ne
 * porte aucune trace de ce qu'il a compté.
 *
 * Comparer l'agrégat d'une clé à ses propres listes ne suffit pas : si le
 * périmètre fuyait, il fuirait des deux côtés et les chiffres coïncideraient
 * quand même. Il faut confronter deux clés de portées différentes — la clé de
 * pôle voit deux clients sociaux, la clé nominative un seul.
 */
const chargeDe = async (jeton) => {
  const equipe = (await appel("/api/agent/team", jeton)).corps.equipe;
  const liste = (await appel("/api/agent/contents?limite=200", jeton)).corps.contenus;
  return {
    agrege: equipe.find((m) => m.nom === `Lea Social ${idJeu}`)?.total ?? 0,
    listable: liste.filter((c) => c.responsable?.nom === `Lea Social ${idJeu}`).length,
  };
};

const large = await chargeDe(bonne.jeton);
const restreinte = await chargeDe(nominative.jeton);

ok(
  `clé de pôle : l'agrégat égale ce qu'elle peut lister (${large.agrege} vs ${large.listable})`,
  large.agrege === large.listable && large.listable > 0,
);
ok(
  `clé nominative : l'agrégat égale ce qu'elle peut lister (${restreinte.agrege} vs ${restreinte.listable})`,
  restreinte.agrege === restreinte.listable && restreinte.listable > 0,
);
ok(
  `l'agrégat suit le périmètre au lieu d'être constant (${restreinte.agrege} < ${large.agrege})`,
  restreinte.agrege < large.agrege,
);

console.log("\n— /pipeline —");

const surPipeline = await appel("/api/agent/pipeline", bonne.jeton);
ok(`l'agrégat se lit (${surPipeline.statut})`, surPipeline.statut === 200);
ok("aucun _cents ni @ ne traverse la réponse", propre(surPipeline.corps));

const nomsAnomalies = (liste) => (liste ?? []).map((c) => c.titre);
const retards = nomsAnomalies(surPipeline.corps?.anomalies?.retards);
const manques = nomsAnomalies(surPipeline.corps?.anomalies?.manques);
const attentes = nomsAnomalies(surPipeline.corps?.anomalies?.attentesDeValidation);

ok("le retard du pôle est signalé", retards.includes(`Retard social ${idJeu}`));
ok("celui du pôle voisin est absent", !retards.includes(`Retard web ${idJeu}`));
ok(
  "un contenu publié n'est pas en retard, même hors délai",
  !retards.includes(`Publie tard ${idJeu}`),
);
ok("le contenu manquant est signalé", manques.includes(`Manque social ${idJeu}`));
ok("celui du pôle voisin est absent", !manques.includes(`Manque web ${idJeu}`));
ok("l'attente de validation est signalée", attentes.includes(`Attente social ${idJeu}`));
ok("celle du pôle voisin est absente", !attentes.includes(`Attente web ${idJeu}`));

ok(
  "le seuil est rappelé avec le compte",
  surPipeline.corps?.anomalies?.seuilEnJours === 3,
);
const attenteCourte = await appel("/api/agent/pipeline?jours=30", bonne.jeton);
ok(
  "un seuil plus large écarte l'attente de neuf jours",
  !nomsAnomalies(attenteCourte.corps?.anomalies?.attentesDeValidation).includes(
    `Attente social ${idJeu}`,
  ),
);

const nomsClientsPipeline = (surPipeline.corps?.parClient ?? []).map((c) => c.nomCourt);
ok("le pôle voisin n'apparaît pas dans la ventilation par client",
   !nomsClientsPipeline.includes(`Boutique Web ${idJeu}`));

/*
 * Le même motif que pour /team, et pour la même raison : comparer un agrégat à
 * ses propres listes ne prouve rien, une fuite fuirait des deux côtés. Deux
 * clés de portées différentes, confrontées.
 */
const pipelineDe = async (jeton) => {
  const agg = (await appel("/api/agent/pipeline", jeton)).corps;
  const liste = (await appel("/api/agent/contents?limite=200", jeton)).corps.contenus;
  return { total: agg.total, listable: liste.length, retards: agg.anomalies.retards.length };
};

const largePipe = await pipelineDe(bonne.jeton);
const restreintePipe = await pipelineDe(nominative.jeton);

ok(
  `clé de pôle : le total agrégé égale ce qu'elle peut lister (${largePipe.total} vs ${largePipe.listable})`,
  largePipe.total === largePipe.listable && largePipe.listable > 0,
);
ok(
  `clé nominative : le total agrégé égale ce qu'elle peut lister (${restreintePipe.total} vs ${restreintePipe.listable})`,
  restreintePipe.total === restreintePipe.listable && restreintePipe.listable > 0,
);
ok(
  `le total agrégé suit le périmètre au lieu d'être constant (${restreintePipe.total} < ${largePipe.total})`,
  restreintePipe.total < largePipe.total,
);
ok(
  "la somme des ventilations par client égale le total",
  (surPipeline.corps?.parClient ?? []).reduce((n, c) => n + c.total, 0) === surPipeline.corps.total,
);
ok(
  "la somme des ventilations par statut égale le total",
  Object.values(surPipeline.corps?.parStatut ?? {}).reduce((n, v) => n + v, 0) ===
    surPipeline.corps.total,
);

const joursFous = await appel("/api/agent/pipeline?jours=999", bonne.jeton);
ok(`un seuil hors bornes est refusé (${joursFous.statut})`, joursFous.statut === 400);

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
