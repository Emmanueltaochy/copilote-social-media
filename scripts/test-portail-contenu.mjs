#!/usr/bin/env node
//
// Le portail client : les contenus à valider sur l'accueil, la page d'un
// contenu en grand, et la bannière rapetissée.
//
// Usage :
//   BASE=http://127.0.0.1:4030 PGURL="postgres://…" node scripts/test-portail-contenu.mjs

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
const lit = (v) => String(v).replace(/'/g, "''");

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

/** React sépare deux expressions de texte par un commentaire : on les retire. */
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

/* ------------------------------------------------------------------ décor -- */

console.log(`\n— décor (jeu ${jeu}) —`);

const clientA = un(`insert into clients (name, short_name, departments, content_target)
  values ('Cap Marine ${jeu}','Cap Marine ${jeu}','["social"]'::jsonb, 10) returning id`);
const clientB = un(`insert into clients (name, short_name, departments)
  values ('Bistrot ${jeu}','Bistrot ${jeu}','["social"]'::jsonb) returning id`);

const compteA = un(`insert into users (email,name,initials,role,client_id)
  values ('sophie-${jeu}@capmarine.re','Sophie ${jeu}','SR','client','${clientA}') returning id`);
const compteB = un(`insert into users (email,name,initials,role,client_id)
  values ('zoe-${jeu}@bistrot.re','Zoé ${jeu}','ZP','client','${clientB}') returning id`);
const cookieA = ouvrirSession(compteA);
const cookieB = ouvrirSession(compteB);

const LEGENDE = `Le soleil se lève sur Saint-Gilles ☀️\n\nRéservez votre sortie en mer.`;
const CONSIGNE = `INTERNE ${jeu} : cadrer serré, ne pas montrer le ponton`;

const aValider = un(`
  insert into contents (client_id, title, kind, status, caption, instructions, hashtags, scheduled_at, submitted_at)
  values ('${clientA}','Post à valider ${jeu}','carrousel','validation',
          '${lit(LEGENDE)}','${lit(CONSIGNE)}','["bateau","reunion"]'::jsonb,
          now() + interval '3 days', now() - interval '2 days')
  returning id`);

const enCreation = un(`
  insert into contents (client_id, title, kind, status, caption)
  values ('${clientA}','Post en création ${jeu}','feed','creation','Légende en cours') returning id`);

const chezLeVoisin = un(`
  insert into contents (client_id, title, kind, status)
  values ('${clientB}','Post du voisin ${jeu}','feed','validation') returning id`);

// Une bannière avec une image, pour vérifier son plafond de hauteur.
// `audience` est une colonne texte — « tous » ou un nom de pôle — et non un
// tableau : y écrire du jsonb rendait la bannière invisible sans rien dire.
un(`insert into promos (title, body, cta_label, cta_url, audience, active, image_path)
    values ('Offre ${jeu}','Une remise sur la création de site cette semaine',
            'En profiter','https://exemple.re','social', true, 'promo/x.jpg')
    returning id`);

console.log("décor posé\n");

/* ===================== 1. L'ACCUEIL MONTRE LES POSTS =================== */

console.log("— l'accueil —");

const accueil = await page("/portail", cookieA);
ok(`l'accueil répond (${accueil.statut})`, accueil.statut === 200);
ok("le post à valider y apparaît nommément", accueil.html.includes(`Post à valider ${jeu}`));
ok("… avec son format", accueil.html.includes("Carrousel"));
ok("… et il est cliquable vers sa page", accueil.html.includes(`/portail/contenu/${aValider}`));
ok("… avec un repère de test", accueil.html.includes(`data-a-valider="${aValider}"`));
ok("le compteur reste affiché", /1 élément attend/.test(accueil.html));
ok("le lien « Tout voir » mène à la liste", accueil.html.includes("/portail/valider"));
ok(
  "un post qui n'attend pas de réponse n'est pas dans ce bloc",
  !accueil.html.includes(`data-a-valider="${enCreation}"`),
);
ok(
  "la consigne interne ne fuite jamais sur l'accueil",
  !accueil.html.includes(`INTERNE ${jeu}`),
);

/* ===================== 2. LA PAGE D'UN CONTENU ========================= */

console.log("\n— la page d'un contenu —");

const fiche = await page(`/portail/contenu/${aValider}`, cookieA);
ok(`elle répond (${fiche.statut})`, fiche.statut === 200);
ok("le titre est en grand", fiche.html.includes(`Post à valider ${jeu}`));
ok("la légende est affichée", fiche.html.includes("Le soleil se lève sur Saint-Gilles"));
ok("… avec ses retours à la ligne préservés", fiche.html.includes("whitespace-pre-wrap"));
ok("les hashtags sont là", fiche.html.includes("#bateau"));
ok("le format et le réseau sont rappelés", fiche.html.includes("Carrousel"));
ok("le statut est affiché", fiche.html.includes("Validation client"));
ok("l'attente est datée", /En attente depuis le/.test(fiche.html));
ok("les boutons de réponse sont là", fiche.html.includes("Valider") && fiche.html.includes("Demander une modification"));

ok(
  "LA CONSIGNE INTERNE N'EST PAS SERVIE AU CLIENT",
  !fiche.html.includes(`INTERNE ${jeu}`),
);

const ficheAutre = await page(`/portail/contenu/${enCreation}`, cookieA);
ok(`un contenu non soumis s'ouvre aussi (${ficheAutre.statut})`, ficheAutre.statut === 200);
ok(
  "… sans boutons de réponse",
  !ficheAutre.html.includes("Demander une modification"),
);

/* ===================== 3. LE CLOISONNEMENT ============================= */

console.log("\n— le cloisonnement —");

const vol = await page(`/portail/contenu/${chezLeVoisin}`, cookieA);
ok(`le contenu d'un autre client répond 404 (${vol.statut})`, vol.statut === 404);
const inexistant = await page(`/portail/contenu/00000000-0000-4000-8000-000000000000`, cookieA);
ok(`… comme un contenu inexistant (${inexistant.statut})`, inexistant.statut === 404);
ok(
  "et le voisin ne voit pas non plus le post de Cap Marine",
  !(await page("/portail", cookieB)).html.includes(`Post à valider ${jeu}`),
);
const sansSession = await page(`/portail/contenu/${aValider}`);
ok(
  `sans session, on est renvoyé à la connexion (${sansSession.statut})`,
  sansSession.statut === 307 || sansSession.statut === 302,
);

/* ===================== 4. LA BANNIÈRE ================================== */

console.log("\n— la bannière —");

ok("la bannière est présente", accueil.html.includes(`Offre ${jeu}`));
ok(
  "son image porte un plafond de hauteur",
  /max-h-\[200px\][^"]*sm:max-h-\[260px\]/.test(accueil.html),
);
ok(
  "… sans rogner : ni recadrage, ni bandes vides",
  !/promo\/[^"]*"[^>]*object-(cover|contain)/.test(accueil.html) &&
    /promo\/[^"]*"[^>]*w-auto/.test(accueil.html),
);
ok("son texte est borné à deux lignes", accueil.html.includes("line-clamp-2"));
ok(
  "elle passe après ce qui attend une réponse",
  accueil.html.indexOf(`data-a-valider="${aValider}"`) < accueil.html.indexOf(`Offre ${jeu}`),
);

/* ================================= bilan ============================== */

console.log(`\n${"─".repeat(58)}`);
console.log(`${verts} vertes, ${rouges.length} rouges`);
if (rouges.length > 0) {
  console.log("\nÉchecs :");
  for (const r of rouges) console.log(`  · ${r}`);
  process.exitCode = 1;
}
console.log();
