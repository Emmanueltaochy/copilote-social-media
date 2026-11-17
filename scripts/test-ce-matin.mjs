#!/usr/bin/env node
//
// « Ce matin » : le bouton « Traité ». Archiver, voir la ligne passer dans les
// archivés, la rétablir, la voir revenir d'elle-même quand quelque chose de
// nouveau arrive, le total de l'argent qui dort, et les droits (autre pôle,
// équipe face à l'argent, client du portail, sans session).
//
// Usage (base locale uniquement, jamais la production), sur un build de
// production (`npm run build && npx next start -p 3111`) :
//   BASE=http://127.0.0.1:3111 PGURL="postgres://…" node scripts/test-ce-matin.mjs
//
// Les boutons appellent des server actions : le script lit leur identifiant
// dans le manifeste du build (.next/…/server-reference-manifest.json) et les
// appelle comme le ferait le navigateur. Le décor est fictif, suffixé au
// hasard, et effacé à la fin.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://127.0.0.1:3111";
const PGURL = process.env.PGURL ?? process.env.DATABASE_URL;
if (!PGURL) {
  console.error("\n  ✗ PGURL (ou DATABASE_URL) est requis.\n");
  process.exit(1);
}
if (!/localhost|127\.0\.0\.1/.test(PGURL) || !/localhost|127\.0\.0\.1/.test(BASE)) {
  console.error("\n  ✗ Ce test écrit en base : il ne tourne qu'en local.\n");
  process.exit(1);
}

/* ------------------------------------------------- identifiants d'actions -- */

const manifestes = [
  ".next/server/app/(agence)/page/server-reference-manifest.json",
  ".next/dev/server/app/(agence)/page/server-reference-manifest.json",
].filter(existsSync);
if (!manifestes.length) {
  console.error("\n  ✗ Manifeste des server actions introuvable : lancer `npm run build` d'abord.\n");
  process.exit(1);
}
const manifeste = JSON.parse(readFileSync(manifestes[0], "utf8"));
const ACTIONS = Object.fromEntries(
  Object.entries(manifeste.node)
    .filter(([, v]) => String(v.filename ?? "").includes("ce-matin-actions"))
    .map(([id, v]) => [v.exportedName, id]),
);
if (!ACTIONS.marquerTraite || !ACTIONS.retablir) {
  console.error("\n  ✗ Actions marquerTraite / retablir absentes du manifeste.\n");
  process.exit(1);
}

/* ---------------------------------------------------------------- outils -- */

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

const jeu = randomBytes(3).toString("hex");
const sha = (s) => createHash("sha256").update(s).digest("hex");

function ouvrirSession(userId) {
  const jeton = randomBytes(32).toString("base64url");
  un(`insert into sessions (token_hash, user_id, expires_at) values ('${sha(jeton)}','${userId}', now() + interval '1 day') returning token_hash`);
  return jeton;
}

/** La page telle que rendue ; `visible` : le balisage sans les scripts (ni la charge RSC). */
const page = async (chemin, cookie) => {
  const r = await fetch(`${BASE}${chemin}`, {
    headers: cookie ? { Cookie: `pilot_session=${cookie}` } : {},
    redirect: "manual",
    cache: "no-store",
  });
  const html = (await r.text()).replace(/<!--.*?-->/g, "");
  return { statut: r.status, location: r.headers.get("location") ?? "", html, visible: html.replace(/<script[\s\S]*?<\/script>/g, "") };
};

/** Appelle une server action comme le navigateur (POST sur l'accueil, en-tête Next-Action). */
async function action(nom, cles, cookie) {
  const r = await fetch(`${BASE}/`, {
    method: "POST",
    headers: {
      "Next-Action": ACTIONS[nom],
      "Content-Type": "text/plain;charset=UTF-8",
      Accept: "text/x-component",
      Origin: BASE,
      ...(cookie ? { Cookie: `pilot_session=${cookie}` } : {}),
    },
    body: JSON.stringify([cles]),
    redirect: "manual",
  });
  const texte = await r.text();
  const ligne = texte.split("\n").find((l) => l.startsWith("1:"));
  let resultat = null;
  try {
    resultat = ligne ? JSON.parse(ligne.slice(2)) : null;
  } catch {
    resultat = null;
  }
  return { statut: r.status, resultat };
}

const archive = (cle) => sql(`select state || '|' || coalesce(archived_by::text, '') from ce_matin_archives where key = '${cle}'`);
const euros = (s) => (s ? Number(s.replace(/\D/g, "")) : 0);
const totalArgent = (html) => euros(/data-total-argent="?[^>]*>([^<]+)</.exec(html)?.[1]);
const archivesArgent = (html) => euros(/data-archives-argent="?[^>]*>([^<]+)</.exec(html)?.[1]);
/** « Voir les archivés (N) », colonne par colonne, dans l'ordre de l'écran. */
const compteurs = (html) => [...html.matchAll(/Voir les archivés \((\d+)\)/g)].map((m) => Number(m[1]));

/* ------------------------------------------------------------------ décor -- */

console.log(`\n— décor (jeu ${jeu}) —`);
const direction = un(`insert into users (email,name,initials,role) values ('dir-${jeu}@exemple.test','Direction ${jeu}','DT','direction') returning id`);
const equipeSociale = un(`insert into users (email,name,initials,role,departments) values ('soc-${jeu}@exemple.test','Sociale ${jeu}','SO','equipe','["social"]'::jsonb) returning id`);
const equipeWeb = un(`insert into users (email,name,initials,role,departments) values ('web-${jeu}@exemple.test','Web ${jeu}','WE','equipe','["web"]'::jsonb) returning id`);
const clientSocial = un(`insert into clients (name, short_name, departments) values ('Boutique Test ${jeu}','Boutique Test ${jeu}','["social"]'::jsonb) returning id`);
const clientWeb = un(`insert into clients (name, short_name, departments) values ('Site Test ${jeu}','Site Test ${jeu}','["web"]'::jsonb) returning id`);
const comptePortail = un(`insert into users (email,name,initials,role,client_id) values ('portail-${jeu}@exemple.test','Client ${jeu}','CP','client','${clientSocial}') returning id`);

// Un prospect qui a répondu hier (À répondre), un autre relié au client du pôle web.
const prospect = un(`insert into directory_entries (name, contact_name, kind, source, status, last_activity_at)
  values ('Prospect Test ${jeu}', 'Alex', 'prospect', 'agent_ventes', 'repondu', now() - interval '1 day') returning id`);
const prospectWeb = un(`insert into directory_entries (name, client_id, kind, source, status, last_activity_at)
  values ('Fiche Site Test ${jeu}', '${clientWeb}', 'client', 'agence', 'repondu', now() - interval '1 day') returning id`);
// Deux prochaines étapes du jour (Actions), pour « tout marquer traité ».
const etapeA = un(`insert into directory_entries (name, kind, source, status, next_action, next_action_on)
  values ('Étape A ${jeu}', 'prospect', 'agence', 'contacte', 'Rappeler A ${jeu}', current_date) returning id`);
const etapeB = un(`insert into directory_entries (name, kind, source, status, next_action, next_action_on)
  values ('Étape B ${jeu}', 'prospect', 'agence', 'contacte', 'Rappeler B ${jeu}', current_date) returning id`);
// Une facture Pilot impayée en retard, montant rond pour lire le total au centime près.
const facture = un(`insert into invoices (client_id, number, label, amount_cents, issued_on, due_on, filename, storage_path, mime_type)
  values ('${clientSocial}', 'T-${jeu}', 'Test', 123400, current_date - 40, current_date - 10, 'f.pdf', 'x/f.pdf', 'application/pdf') returning id`);

const cDirection = ouvrirSession(direction);
const cSociale = ouvrirSession(equipeSociale);
const cWeb = ouvrirSession(equipeWeb);
const cPortail = ouvrirSession(comptePortail);

const KP = `prospect-repondu:${prospect}`;
const KW = `prospect-repondu:${prospectWeb}`;
const KF = `facture-pilot:${facture}`;
const KA = `action:prochaine-etape:${etapeA}`;
const KB = `action:prochaine-etape:${etapeB}`;
const nom = `Prospect Test ${jeu}`;

try {
  console.log("\n— archiver, voir disparaître, retrouver dans les archivés —");
  let p = await page("/", cDirection);
  ok("accueil direction : 200, le prospect est à répondre, avec le bouton « Traité »", p.statut === 200 && p.visible.includes(nom) && p.visible.includes("Traité"));
  ok("chaque ligne a son bouton (libellé accessible « Marquer traité : … »)", p.visible.includes(`Marquer traité : ${nom}`));
  const avant = compteurs(p.visible);
  ok("trois colonnes, chacune avec « Voir les archivés (N) »", avant.length === 3);

  let r = await action("marquerTraite", [KP], cSociale);
  ok("un membre du pôle social archive la ligne", r.statut === 200 && r.resultat?.ok === true && r.resultat?.n === 1);
  const dateReponse = un(`select to_char(last_activity_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') from directory_entries where id = '${prospect}'`);
  ok("enregistré en base avec l'état du moment (date de la dernière réponse) et son auteur", archive(KP) === `${dateReponse}|${equipeSociale}`);

  p = await page("/", cDirection);
  ok("la ligne a disparu de l'accueil… pour toute l'équipe (vue par la direction)", p.statut === 200 && !p.visible.includes(nom));
  const apres = compteurs(p.visible);
  ok(`… et compte dans « Voir les archivés » de À répondre (${avant[0]} → ${apres[0]})`, apres[0] === avant[0] + 1);
  ok("la liste des archivés porte qui a archivé (charge de la page)", p.html.includes(`Sociale ${jeu}`));

  console.log("\n— rétablir —");
  r = await action("retablir", [KP], cDirection);
  ok("« Rétablir » : accepté", r.resultat?.ok === true);
  ok("l'archive est effacée", archive(KP) === "");
  p = await page("/", cDirection);
  ok("la ligne est de retour sur l'accueil", p.visible.includes(nom) && compteurs(p.visible)[0] === avant[0]);
  r = await action("retablir", [KP], cDirection);
  ok("rétablir une ligne qui n'est pas archivée : refusé proprement", r.resultat?.ok === false);

  console.log("\n— une ligne archivée revient d'elle-même —");
  await action("marquerTraite", [KP], cDirection);
  p = await page("/", cDirection);
  ok("archivée de nouveau : absente", !p.visible.includes(nom));
  sql(`update directory_entries set last_activity_at = now() where id = '${prospect}'`);
  p = await page("/", cDirection);
  ok("nouvelle réponse du prospect : la ligne revient sans qu'on la rétablisse", p.visible.includes(nom));
  ok("… marquée « Du nouveau depuis l'archivage »", p.visible.includes("Du nouveau depuis l"));
  ok("… et ne compte plus dans les archivés", compteurs(p.visible)[0] === avant[0]);
  r = await action("marquerTraite", [KP], cDirection);
  ok("re-archivée : l'empreinte enregistrée devient la nouvelle date", r.resultat?.ok === true && archive(KP).startsWith(un(`select to_char(last_activity_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') from directory_entries where id = '${prospect}'`)));
  p = await page("/", cDirection);
  ok("… et elle reste archivée tant que rien de neuf n'arrive", !p.visible.includes(nom));

  console.log("\n— argent qui dort —");
  p = await page("/", cDirection);
  const total0 = totalArgent(p.visible);
  const arch0 = archivesArgent(p.visible);
  ok(`total lisible (${total0} €), la facture de test y figure`, total0 >= 1234 && p.visible.includes(`Facture T-${jeu}`));
  r = await action("marquerTraite", [KF], cSociale);
  ok("l'équipe (hors direction) ne peut pas archiver une ligne d'argent", r.resultat?.ok === false && archive(KF) === "");
  r = await action("marquerTraite", [KF], cDirection);
  ok("la direction archive la facture (bouton « Traité »)", r.resultat?.ok === true);
  p = await page("/", cDirection);
  const total1 = totalArgent(p.visible);
  const arch1 = archivesArgent(p.visible);
  ok(`le total ne compte plus que le non-archivé (${total0} € → ${total1} €)`, total1 === total0 - 1234);
  ok(`« + X € archivés » affiché à côté (${arch0} € → ${arch1} €)`, arch1 === arch0 + 1234 && p.visible.includes("archivés"));
  ok("la facture n'est plus dans la liste", !p.visible.includes(`Facture T-${jeu}`));
  sql(`update invoices set amount_cents = 100000 where id = '${facture}'`);
  p = await page("/", cDirection);
  ok("montant changé : la facture revient d'elle-même", p.visible.includes(`Facture T-${jeu}`) && totalArgent(p.visible) === total0 - 234);
  p = await page("/", cSociale);
  ok("l'équipe ne voit toujours pas l'argent qui dort", p.statut === 200 && !p.visible.includes("Argent qui dort") && !p.html.includes(`T-${jeu}`));

  console.log("\n— tout marquer traité —");
  p = await page("/", cDirection);
  // Les prospects passent après les clients et la colonne n'en montre que 8 :
  // on lit les étapes dans les données de la page, pas forcément à l'écran.
  ok("les deux étapes du jour sont dans Actions", p.html.includes(`Rappeler A ${jeu}`) && p.html.includes(`Rappeler B ${jeu}`));
  const actions0 = compteurs(p.visible)[2];
  ok("le bouton « Tout marquer traité » est proposé", p.visible.includes("Tout marquer traité"));
  r = await action("marquerTraite", [KA, KB, KW.replace(prospectWeb, "00000000-0000-0000-0000-000000000000"), "action:inconnue:x"], cSociale);
  ok("archivage groupé : seules les lignes visibles sont prises (2 sur 4 clés)", r.resultat?.ok === true && r.resultat?.n === 2);
  p = await page("/", cDirection);
  ok(`… elles passent dans les archivés de Actions (${actions0} → ${compteurs(p.visible)[2]})`, compteurs(p.visible)[2] === actions0 + 2 && !p.visible.includes(`Rappeler A ${jeu}`));
  r = await action("retablir", [KA, KB], cSociale);
  ok("« Annuler » d'un archivage groupé : les deux reviennent", r.resultat?.ok === true && r.resultat?.n === 2 && archive(KA) === "" && archive(KB) === "");

  console.log("\n— droits —");
  p = await page("/", cSociale);
  ok("pôle social : la fiche d'un client du pôle web n'est pas affichée", p.statut === 200 && !p.visible.includes(`Site Test ${jeu}`));
  r = await action("marquerTraite", [KW], cSociale);
  ok("… et ne peut pas être archivée par ce membre", r.resultat?.ok === false && archive(KW) === "");
  r = await action("marquerTraite", [KA], cWeb);
  ok("membre du seul pôle web (il ne voit pas l'accueil) : refusé", r.resultat?.ok === false && r.resultat?.erreur === "Accès refusé." && archive(KA) === "");
  p = await page("/", cDirection);
  ok("la direction voit la ligne du client web", p.visible.includes(`Site Test ${jeu}`));
  r = await action("marquerTraite", [KW], cDirection);
  ok("… et peut l'archiver", r.resultat?.ok === true && archive(KW) !== "");
  r = await action("retablir", [KW], cSociale);
  ok("le membre du pôle social ne peut pas la rétablir non plus", r.resultat?.ok === false && archive(KW) !== "");

  r = await action("marquerTraite", [KA], cPortail);
  ok("client du portail : « Traité » refusé, rien d'écrit", r.resultat?.ok !== true && archive(KA) === "");
  r = await action("retablir", [KP], cPortail);
  ok("client du portail : « Rétablir » refusé, l'archive reste", r.resultat?.ok !== true && archive(KP) !== "");
  p = await page("/", cPortail);
  ok("client du portail : l'accueil le renvoie au portail", p.statut >= 300 && p.statut < 400 && p.location.includes("/portail"));
  r = await action("marquerTraite", [KA], null);
  ok("sans session : refusé, rien d'écrit", r.resultat?.ok !== true && archive(KA) === "");
  r = await action("marquerTraite", "pas une liste", cDirection);
  ok("demande mal formée : refusée", r.resultat?.ok === false);
} finally {
  console.log("\n— nettoyage —");
  sql(`delete from ce_matin_archives where key in ('${KP}','${KW}','${KF}','${KA}','${KB}')`);
  sql(`delete from directory_entries where name like '%${jeu}%'`);
  sql(`delete from users where email like '%-${jeu}@exemple.test'`);
  sql(`delete from clients where name like '%${jeu}'`);
  console.log("décor effacé");
}

console.log(`\n${verts} vérifications vertes, ${rouges.length} rouge(s).`);
if (rouges.length) {
  for (const r of rouges) console.log(`  ✗ ${r}`);
  process.exit(1);
}
