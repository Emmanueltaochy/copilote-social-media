#!/usr/bin/env node
//
// L'annuaire et l'import des prospects : clés, absence de doublons, fiches,
// bloc « Ce matin », et surtout qu'un compte client du portail n'y entre pas.
//
// Usage (base locale uniquement, jamais la production) :
//   BASE=http://127.0.0.1:3111 PGURL="postgres://…" node scripts/test-annuaire.mjs
//
// Tout est fictif et suffixé au hasard ; le décor est effacé à la fin. Aucune
// donnée des fichiers réels de l'agent ventes n'est utilisée ici.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";

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
function creerCle(scopes) {
  const jeton = "tpk_" + randomBytes(32).toString("base64url");
  un(`insert into api_keys (name, token_hash, prefix, scopes, departments)
      values ('test annuaire ${jeu}', '${sha(jeton)}', '${jeton.slice(0, 12)}', '${JSON.stringify(scopes)}'::jsonb, '["social","web"]'::jsonb) returning id`);
  return jeton;
}

const page = async (chemin, cookie) => {
  const r = await fetch(`${BASE}${chemin}`, {
    headers: cookie ? { Cookie: `pilot_session=${cookie}` } : {},
    redirect: "manual",
    cache: "no-store",
  });
  return { statut: r.status, location: r.headers.get("location") ?? "", html: (await r.text()).replace(/<!--.*?-->/g, "") };
};
const importer = async (corps, cle, fichier) => {
  const r = await fetch(`${BASE}/api/annuaire/import${fichier ? `?fichier=${fichier}` : ""}`, {
    method: "POST",
    headers: { ...(cle ? { Authorization: `Bearer ${cle}` } : {}), "Content-Type": "application/json" },
    body: typeof corps === "string" ? corps : JSON.stringify(corps),
    redirect: "manual",
  });
  return { statut: r.status, corps: await r.json().catch(() => null) };
};

/* ------------------------------------------------------------------ décor -- */

console.log(`\n— décor (jeu ${jeu}) —`);
const direction = un(`insert into users (email,name,initials,role) values ('dir-${jeu}@exemple.test','Direction ${jeu}','DT','direction') returning id`);
const equipeSociale = un(`insert into users (email,name,initials,role,departments) values ('eq-${jeu}@exemple.test','Équipe ${jeu}','EQ','equipe','["social"]'::jsonb) returning id`);
const clientWeb = un(`insert into clients (name, short_name, departments) values ('Site Seul ${jeu}','Site Seul ${jeu}','["web"]'::jsonb) returning id`);
const clientPortail = un(`insert into clients (name, short_name, departments) values ('Portail ${jeu}','Portail ${jeu}','["social"]'::jsonb) returning id`);
const comptePortail = un(`insert into users (email,name,initials,role,client_id) values ('portail-${jeu}@exemple.test','Client ${jeu}','CP','client','${clientPortail}') returning id`);
const cDirection = ouvrirSession(direction);
const cEquipe = ouvrirSession(equipeSociale);
const cPortail = ouvrirSession(comptePortail);
const cleImport = creerCle(["annuaire:write"]);
const cleLecture = creerCle(["pipeline:read"]);

const aujourdhui = new Date(Date.now() + 4 * 3_600_000).toISOString().slice(0, 10);
const prospects = (idA = `t-${jeu}-a`) => ({
  note: "fictif",
  prospects: [
    {
      id: idA,
      ajoute: aujourdhui,
      entreprise: `Taxi Fictif ${jeu}`,
      contact: "Alex Fictif",
      ville: "Saint-Fictif",
      pays: "La Réunion",
      email: `alex-${jeu}@fictif.test`,
      site: "https://fictif.test",
      statut: "repondu",
      responsable: "agent",
      dernier_contact: aujourdhui,
      prochaine_action: "Appeler Alex",
      prochaine_date: aujourdhui,
      historique: [
        { date: aujourdhui, action: `E-mail envoyé : « Bonjour ${jeu} »` },
        { date: aujourdhui, action: `Réponse reçue de Alex ${jeu} : « Rappelez-moi »` },
      ],
    },
    {
      id: `t-${jeu}-b`,
      ajoute: aujourdhui,
      entreprise: `Navette Fictive ${jeu}`,
      ville: "Lyon",
      pays: "France",
      email: "",
      statut: "contacte",
      responsable: "agent",
      dernier_contact: null,
      prochaine_action: "Aucune",
      prochaine_date: null,
      historique: [{ date: aujourdhui, action: "Repéré" }],
    },
  ],
});
const sansSite = {
  maj: aujourdhui,
  exclure: [`Exclu ${jeu}`],
  prospects: [
    { id: `s-${jeu}-1`, place: "x", ajoute: aujourdhui, nom: `Salon Fictif ${jeu}`, metier: "salon de coiffure", ville: "Le Fictif", tel: "0262 00 00 00", avis: 3, note: 4.5, presence: "aucune", fiche: "https://maps.google.com/?cid=0", adresse: "1 rue Fictive" },
    { id: `s-${jeu}-2`, place: "y", ajoute: aujourdhui, nom: `Exclu ${jeu}`, metier: "garage", ville: "Le Fictif", tel: "", avis: 0, note: 0, presence: "aucune", fiche: "", adresse: "" },
  ],
};

const fiches = () => Number(un(`select count(*) from directory_entries where name like '%${jeu}%'`));
const evenements = () => Number(un(`select count(*) from directory_events e join directory_entries d on d.id = e.entry_id where d.name like '%${jeu}%'`));

try {
  console.log("\n— la porte de l'import —");
  ok("sans clé : 401", (await importer(prospects(), null)).statut === 401);
  ok("clé sans le droit annuaire:write : 403", (await importer(prospects(), cleLecture)).statut === 403);
  {
    const r = await fetch(`${BASE}/api/annuaire/import`, { method: "POST", headers: { Cookie: `pilot_session=${cDirection}` }, body: "{}", redirect: "manual" });
    ok("une session de navigateur (direction) n'ouvre pas l'import : 401", r.status === 401);
  }
  ok("JSON invalide : 400", (await importer("{pas du json", cleImport)).statut === 400);
  ok("forme inconnue : 422", (await importer({ prospects: [{ truc: 1 }] }, cleImport)).statut === 422);
  ok("fichier contraire à la forme : 422", (await importer(prospects(), cleImport, "sans-site")).statut === 422);

  console.log("\n— import et absence de doublons —");
  let r = await importer(prospects(), cleImport);
  ok(`prospects.json : 2 créées (${JSON.stringify(r.corps)})`, r.statut === 200 && r.corps.creees === 2);
  ok("2 fiches en base", fiches() === 2);
  ok("3 lignes d'historique", evenements() === 3);
  ok("source Réunion déduite du pays", un(`select source from directory_entries where external_id='t-${jeu}-a'`) === "agent_ventes_reunion");
  ok("source France déduite du pays", un(`select source from directory_entries where external_id='t-${jeu}-b'`) === "agent_ventes_france");
  ok("« Aucune » n'est pas une prochaine action", un(`select coalesce(next_action,'∅') from directory_entries where external_id='t-${jeu}-b'`) === "∅");
  ok("e-mail reçu reconnu dans l'historique", un(`select count(*) from directory_events e join directory_entries d on d.id=e.entry_id where d.external_id='t-${jeu}-a' and e.kind='email_entrant'`) === "1");

  r = await importer(prospects(), cleImport);
  ok("second envoi : 0 créée, 2 mises à jour", r.corps.creees === 0 && r.corps.misesAJour === 2);
  ok("toujours 2 fiches, 3 lignes d'historique", fiches() === 2 && evenements() === 3);

  r = await importer(prospects(`t-${jeu}-renomme`), cleImport);
  ok("identifiant changé mais même e-mail : retrouvée, pas recréée", r.corps.creees === 0 && fiches() === 2);

  // Une fiche saisie à la main, retrouvée par nom et ville.
  un(`insert into directory_entries (name, kind, source, city, name_key) values ('Salon Fictif ${jeu}', 'prospect', 'bouche_a_oreille', 'Le Fictif', 'salon fictif ${jeu}|le fictif') returning id`);
  r = await importer(sansSite, cleImport);
  ok(`sans-site.json : rapprochée par nom et ville, l'exclue ignorée (${JSON.stringify(r.corps)})`, r.corps.creees === 0 && r.corps.misesAJour === 1 && r.corps.ignorees === 1);
  ok("la source d'origine est gardée (bouche-à-oreille)", un(`select source from directory_entries where name='Salon Fictif ${jeu}'`) === "bouche_a_oreille");
  ok("le téléphone importé complète la fiche", un(`select phone from directory_entries where name='Salon Fictif ${jeu}'`) === "0262 00 00 00");
  ok("3 fiches au total", fiches() === 3);

  console.log("\n— écrans de l'agence —");
  const idA = un(`select id from directory_entries where name='Taxi Fictif ${jeu}'`);
  let p = await page("/contacts?filtre=prospects", cDirection);
  ok("annuaire : 200 et la fiche importée y figure", p.statut === 200 && p.html.includes(`Taxi Fictif ${jeu}`));
  p = await page(`/contacts?q=${encodeURIComponent(`navette fictive ${jeu}`)}`, cDirection);
  ok("recherche sans accents ni majuscules", p.html.includes(`Navette Fictive ${jeu}`) && !p.html.includes(`Taxi Fictif ${jeu}`));
  p = await page(`/contacts/${idA}`, cDirection);
  ok("fiche prospect : 200, historique repris", p.statut === 200 && p.html.includes(`Rappelez-moi`) && p.html.includes("Agent ventes"));
  // Étape 3 : sections « Actions Trello » et « Rendez-vous » ; un service non relié le dit.
  ok("fiche prospect : Gmail, Trello, Agenda présents, ou « n'est pas relié » le cas échéant", p.html.includes("Actions Trello") && p.html.includes("Rendez-vous") && (/n(&#x27;|')est pas relié/.test(p.html) || p.html.includes('data-section="trello"')));
  p = await page("/", cDirection);
  ok("accueil : bloc « Ce matin » avec le prospect qui a répondu, urgent", p.html.includes("Ce matin") && p.html.includes(`Taxi Fictif ${jeu}`) && p.html.includes("Urgent"));
  ok("accueil : l'argent qui dort est présent pour la direction", p.html.includes("Argent qui dort"));
  p = await page("/", cEquipe);
  ok("accueil : l'équipe ne voit pas l'argent qui dort", p.statut === 200 && !p.html.includes("Argent qui dort"));
  p = await page(`/contacts/${clientWeb}`, cEquipe);
  ok("un client d'un autre pôle n'existe pas pour l'équipe sociale : 404", p.statut === 404);
  p = await page("/contacts", cEquipe);
  ok("ni dans sa liste", p.statut === 200 && !p.html.includes(`Site Seul ${jeu}`));
  p = await page(`/contacts/${clientPortail}`, cDirection);
  ok("un client sans fiche a quand même la sienne (adresse du compte)", p.statut === 200 && p.html.includes(`Portail ${jeu}`));

  console.log("\n— un compte client du portail n'entre jamais —");
  for (const chemin of ["/contacts", `/contacts/${idA}`, `/contacts/${clientPortail}`, "/contacts?filtre=swapiles"]) {
    p = await page(chemin, cPortail);
    ok(`portail → ${chemin} : renvoyé au portail (${p.statut} ${p.location})`, p.statut >= 300 && p.statut < 400 && p.location.includes("/portail") && !p.html.includes(`Taxi Fictif ${jeu}`));
  }
  p = await page("/contacts");
  ok("sans session → connexion", p.statut >= 300 && p.statut < 400 && p.location.includes("/connexion"));
} finally {
  console.log("\n— nettoyage —");
  sql(`delete from directory_entries where name like '%${jeu}%'`);
  sql(`delete from api_keys where name = 'test annuaire ${jeu}'`);
  sql(`delete from users where email like '%${jeu}@exemple.test'`);
  sql(`delete from clients where name like '%${jeu}'`);
  console.log("décor effacé");
}

console.log(`\n${verts} vérifications vertes, ${rouges.length} rouge(s).`);
if (rouges.length) {
  for (const r of rouges) console.log(`  ✗ ${r}`);
  process.exit(1);
}
