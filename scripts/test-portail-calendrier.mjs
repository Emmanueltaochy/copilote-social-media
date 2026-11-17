#!/usr/bin/env node
//
// Le calendrier du portail client : un statut lisible par publication, les
// mêmes règles que l'agence, rien de la cuisine interne, et jamais les
// publications d'un autre client.
//
// Usage (base locale uniquement, jamais la production) :
//   BASE=http://127.0.0.1:3111 PGURL="postgres://…" node scripts/test-portail-calendrier.mjs
//
// Le décor est posé avec un suffixe aléatoire, puis effacé à la fin.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";

const BASE = process.env.BASE ?? "http://127.0.0.1:3111";
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

const jeu = randomBytes(3).toString("hex");
const sansCommentaires = (html) => html.replace(/<!--.*?-->/g, "");

function ouvrirSession(userId) {
  const jeton = randomBytes(32).toString("base64url");
  un(`insert into sessions (token_hash, user_id, expires_at)
      values ('${createHash("sha256").update(jeton).digest("hex")}','${userId}',
              now() + interval '1 day') returning token_hash`);
  return jeton;
}

const page = async (chemin, cookie) => {
  const r = await fetch(`${BASE}${chemin}`, {
    headers: cookie ? { Cookie: `pilot_session=${cookie}` } : {},
    redirect: "manual",
    cache: "no-store",
  });
  return { statut: r.status, html: sansCommentaires(await r.text()) };
};

/*
 * Les dates de Pilot : l'heure murale de La Réunion écrite en UTC. « Dans
 * deux jours à 10:00 » se calcule donc sur maintenant + 4 h, lu en UTC.
 */
const OFFSET = 4 * 3_600_000;
const murale = (jours, heure) => {
  const n = new Date(Date.now() + OFFSET);
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + jours, heure, 0));
};
const reel = (d) => new Date(d.getTime() - OFFSET);
const mois = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const ts = (d) => (d ? `'${d.toISOString()}'` : "null");

/* ------------------------------------------------------------------ décor -- */

console.log(`\n— décor (jeu ${jeu}) —`);

const clientA = un(`insert into clients (name, short_name, departments, metricool_brand_id)
  values ('Cap Vanille ${jeu}','Cap Vanille ${jeu}','["social"]'::jsonb, '1') returning id`);
const clientB = un(`insert into clients (name, short_name, departments)
  values ('Voisin ${jeu}','Voisin ${jeu}','["social"]'::jsonb) returning id`);
const compteA = un(`insert into users (email,name,initials,role,client_id)
  values ('cal-a-${jeu}@exemple.re','Alice ${jeu}','AA','client','${clientA}') returning id`);
const compteB = un(`insert into users (email,name,initials,role,client_id)
  values ('cal-b-${jeu}@exemple.re','Bruno ${jeu}','BB','client','${clientB}') returning id`);
const cookieA = ouvrirSession(compteA);
const cookieB = ouvrirSession(compteB);

const INTERNE = `CONSIGNE INTERNE ${jeu}`;
function contenu(client, titre, { status, quand, publie = null, etat = null, reseaux = ["instagram"], detail = [] }) {
  return un(`insert into contents (client_id, title, kind, network, networks, status, instructions,
      scheduled_at, published_at, metricool_state, metricool_networks, submitted_at)
    values ('${client}','${titre}','feed','${reseaux[0]}','${JSON.stringify(reseaux)}'::jsonb,'${status}',
      '${INTERNE}', ${ts(quand)}, ${ts(publie)}, ${etat ? `'${etat}'` : "null"},
      '${JSON.stringify(detail)}'::jsonb, ${status === "validation" ? "now()" : "null"})
    returning id`);
}

// Un contenu par statut, plus ce qui doit rester caché.
const cas = [
  { cle: "publie", label: "Publié", status: "publie", quand: murale(-3, 10), publie: reel(murale(-3, 10)), etat: "publie" },
  {
    cle: "partiel",
    label: "Publié en partie · échec sur Facebook",
    status: "publie",
    quand: murale(-2, 18),
    publie: reel(murale(-2, 18)),
    etat: "partiel",
    reseaux: ["instagram", "facebook"],
    detail: [
      { network: "instagram", status: "PUBLISHED" },
      { network: "facebook", status: "ERROR", detail: "jeton expiré" },
    ],
  },
  {
    cle: "echec",
    label: "En échec · échec sur Instagram",
    status: "pret",
    quand: murale(-1, 9),
    etat: "erreur",
    detail: [{ network: "instagram", status: "ERROR" }],
  },
  { cle: "programme", label: "Programmé", status: "pret", quand: murale(1, 18), etat: "programme" },
  { cle: "valide", label: "Validé", status: "pret", quand: murale(2, 11) },
  { cle: "aValider", label: "À valider", status: "validation", quand: murale(3, 10) },
  { cle: "preparation", label: "En préparation", status: "creation", quand: murale(4, 12) },
].map((c) => ({ ...c, titre: `Cal ${c.cle} ${jeu}`, id: contenu(clientA, `Cal ${c.cle} ${jeu}`, c) }));

// Publiée hors de Pilot, relevée par Metricool : pas de date prévue.
const externeQuand = new Date(Date.now() - 5 * 3_600_000);
const externe = un(`insert into contents (client_id, title, kind, network, status, published_at, metricool_state)
  values ('${clientA}','Cal externe ${jeu}','feed','facebook','publie','${externeQuand.toISOString()}','externe') returning id`);

const cacheRetard = contenu(clientA, `Cal CACHE retard ${jeu}`, { status: "creation", quand: murale(-1, 15) });
const cacheManque = contenu(clientA, `Cal CACHE manque ${jeu}`, { status: "manque", quand: murale(-2, 15) });

// Chez le voisin : le même jour qu'un contenu de A, et un mois où A n'a rien.
const loin = murale(400, 9);
contenu(clientB, `Cal SECRET proche ${jeu}`, { status: "validation", quand: murale(3, 14) });
contenu(clientB, `Cal SECRET lointain ${jeu}`, { status: "pret", quand: loin });

console.log("décor posé\n");

try {
  /* ===================== 1. UN STATUT PAR PUBLICATION =================== */
  console.log("— les statuts —");
  const vues = new Map();
  const vue = async (m) => {
    if (!vues.has(m)) vues.set(m, await page(`/portail/calendrier?mois=${m}`, cookieA));
    return vues.get(m);
  };

  const courant = await vue(mois(murale(0, 12)));
  ok(`le calendrier répond (${courant.statut})`, courant.statut === 200);
  ok("l'onglet « Calendrier » est dans la navigation", courant.html.includes('href="/portail/calendrier"'));
  ok("aujourd'hui est mis en évidence", courant.html.includes("Aujourd&#x27;hui"));

  for (const c of cas) {
    const { html } = await vue(mois(c.quand));
    // L'infobulle de la pastille : « HH:MM · titre · format · réseaux · statut ».
    const attendu = new RegExp(`title="\\d\\d:\\d\\d · ${c.titre} · [^"]* · ${c.label}"`);
    ok(`« ${c.cle} » apparaît avec le statut « ${c.label} »`, attendu.test(html));
    ok(`« ${c.cle} » mène à sa page du portail`, html.includes(`/portail/contenu/${c.id}?depuis=calendrier`));
  }
  const heureProgramme = `${String(cas[3].quand.getUTCHours()).padStart(2, "0")}:00`;
  ok(
    "l'heure affichée est l'heure murale de La Réunion (18:00 reste 18:00)",
    heureProgramme === "18:00" && new RegExp(`title="18:00 · Cal programme ${jeu}`).test((await vue(mois(cas[3].quand))).html),
  );
  const ext = await vue(mois(new Date(externeQuand.getTime() + OFFSET)));
  ok("une publication faite hors de Pilot est placée à son jour de publication", ext.html.includes(`Cal externe ${jeu}`) && ext.html.includes(externe));

  /* ===================== 2. RIEN DE LA CUISINE INTERNE ================== */
  console.log("\n— ce qui reste interne —");
  const tout = [...vues.values()].map((v) => v.html).join("\n");
  ok("un retard de fabrication daté du passé n'apparaît pas", !tout.includes(`Cal CACHE retard ${jeu}`) && !tout.includes(cacheRetard));
  ok("un créneau abandonné (« non publié ») n'apparaît pas", !tout.includes(`Cal CACHE manque ${jeu}`) && !tout.includes(cacheManque));
  ok("la consigne interne n'est jamais servie", !tout.includes(INTERNE));
  ok("le détail technique de Metricool non plus", !tout.includes("jeton expiré"));

  /* ===================== 3. LE CLOISONNEMENT ============================ */
  console.log("\n— le cloisonnement —");
  ok("le contenu du voisin, le même jour, n'apparaît pas", !tout.includes(`Cal SECRET proche ${jeu}`));
  const lointainA = await page(`/portail/calendrier?mois=${mois(loin)}`, cookieA);
  ok(
    `un mois où seul le voisin publie reste vide pour A (${lointainA.statut})`,
    lointainA.statut === 200 && !lointainA.html.includes(`SECRET lointain ${jeu}`) && lointainA.html.includes("Rien de prévu"),
  );
  const lointainB = await page(`/portail/calendrier?mois=${mois(loin)}`, cookieB);
  ok("… alors que le voisin, lui, y voit sa publication", lointainB.html.includes(`Cal SECRET lointain ${jeu}`));
  const proche = await page(`/portail/calendrier?mois=${mois(murale(3, 14))}`, cookieB);
  ok("et le voisin ne voit aucune publication de A", !cas.some((c) => proche.html.includes(c.titre)));
  const bizarre = await page(`/portail/calendrier?mois=../../etc`, cookieA);
  ok(`un mois mal formé retombe sur le mois en cours (${bizarre.statut})`, bizarre.statut === 200);
  const sansSession = await page(`/portail/calendrier`);
  ok(`sans session, on est renvoyé à la connexion (${sansSession.statut})`, [302, 307].includes(sansSession.statut));

  /* ===================== 4. LE RETOUR DEPUIS UN CONTENU ================= */
  console.log("\n— le retour —");
  const fiche = await page(`/portail/contenu/${cas[3].id}?depuis=calendrier&mois=${mois(cas[3].quand)}`, cookieA);
  ok(`la page du contenu s'ouvre (${fiche.statut})`, fiche.statut === 200);
  ok("… avec un lien de retour vers le même mois", fiche.html.includes(`href="/portail/calendrier?mois=${mois(cas[3].quand)}"`));
} finally {
  // Les sessions et les contenus partent avec les comptes et les clients.
  sql(`delete from users where id in ('${compteA}','${compteB}')`);
  sql(`delete from clients where id in ('${clientA}','${clientB}')`);
}

/* ================================= bilan ============================== */

console.log(`\n${"─".repeat(58)}`);
console.log(`${verts} vertes, ${rouges.length} rouges`);
if (rouges.length > 0) {
  console.log("\nÉchecs :");
  for (const r of rouges) console.log(`  · ${r}`);
  process.exitCode = 1;
}
console.log();
