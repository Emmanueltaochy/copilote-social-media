#!/usr/bin/env node
//
// Incrément 1 de l'interface : la galerie, la fiche d'un modèle, et le
// bandeau des briefs non convertis.
//
// Le rendu est vérifié sur le HTML servi, pas sur un navigateur : ce qui
// compte ici est que la bonne page réponde au bon compte, avec le bon
// contenu — le pixel viendra plus tard, dans les suites Playwright.
//
// Usage :
//   BASE=http://127.0.0.1:4030 PGURL="postgres://…" node scripts/test-brief-templates-ui.mjs

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

/**
 * Échappe une valeur pour un littéral SQL : l'apostrophe se double.
 *
 * Le décor porte volontairement des apostrophes et des accents — « Ce qu'il
 * faut savoir » — parce qu'un vrai modèle de brief en contient à chaque
 * phrase. Un décor aseptisé ne teste que des cas qui n'existent pas.
 */
const lit = (valeur) => String(valeur).replace(/'/g, "''");
const json = (valeur) => lit(JSON.stringify(valeur));

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

function ouvrirSession(userId) {
  const jeton = randomBytes(32).toString("base64url");
  un(`insert into sessions (token_hash, user_id, expires_at)
      values ('${createHash("sha256").update(jeton).digest("hex")}', '${userId}',
              now() + interval '1 day') returning token_hash`);
  return jeton;
}

function creerCompte(nom, role, poles, clientId = null) {
  const id = un(`insert into users (email, name, initials, role, departments, client_id)
    values ('${nom}-${jeu}@taochy.re','${nom} ${jeu}','XX','${role}',
            '${json(poles)}'::jsonb, ${clientId ? `'${clientId}'` : "null"}) returning id`);
  return { id, cookie: ouvrirSession(id) };
}

/**
 * React sépare deux expressions de texte adjacentes par un commentaire HTML :
 * « 2 sections » est servi « 2<!-- --> section<!-- -->s ». Les retirer permet
 * d'écrire les assertions sur ce que l'utilisateur lit, pas sur la façon dont
 * le rendu a été découpé.
 */
const sansCommentaires = (html) => html.replace(/<!--.*?-->/g, "");

const page = async (chemin, cookie) => {
  const r = await fetch(`${BASE}${chemin}`, {
    headers: cookie ? { Cookie: `pilot_session=${cookie}` } : {},
    redirect: "manual",
    cache: "no-store",
  });
  return {
    statut: r.status,
    html: sansCommentaires(await r.text()),
    location: r.headers.get("location"),
  };
};

/* ------------------------------------------------------------------ décor -- */

console.log(`\n— décor (jeu ${jeu}) —`);

const clientId = un(`insert into clients (name, short_name, departments)
  values ('Cap Marine ${jeu}','Cap Marine ${jeu}','["web"]'::jsonb) returning id`);

const direction = creerCompte("Direction", "direction", []);
const equipeWeb = creerCompte("EquipeWeb", "equipe", ["web"]);
const equipeSocial = creerCompte("EquipeSocial", "equipe", ["social"]);
const compteClient = creerCompte("Client", "client", [], clientId);

const STRUCTURE = {
  sections: [
    {
      id: "identification",
      title: `Identification ${jeu}`,
      description: "Ce qu'il faut savoir avant de commencer",
      fields: [
        { id: "raison_sociale", label: `Raison sociale ${jeu}`, type: "text", required: true },
        { id: "budget_valide", label: `Budget validé ${jeu}`, type: "checkbox", blocking: true },
        {
          id: "options",
          label: `Options ${jeu}`,
          type: "checkbox_group",
          options: [
            { value: "seo", label: "SEO" },
            { value: "photo", label: "Reportage photo", out_of_scope: true, note: "hors devis, à chiffrer" },
          ],
        },
        {
          id: "detail",
          label: `Détail ${jeu}`,
          type: "textarea",
          visible_if: { field: "options", operator: "includes", value: "photo" },
        },
      ],
    },
    {
      id: "etablissements",
      title: `Établissements ${jeu}`,
      fields: [
        {
          id: "liste_etabs",
          label: `Vos établissements ${jeu}`,
          type: "repeater",
          fields: [{ id: "etab_nom", label: `Nom ${jeu}`, type: "text" }],
        },
      ],
    },
  ],
};

const poser = (slug, { scope, departments, isSystem = false, isActive = true, categorie = "Site vitrine" }) =>
  un(`insert into brief_templates (slug, name, description, category, icon, structure, scope, departments, is_system, is_active)
      values ('${slug}-${jeu}', '${slug} ${jeu}', 'Description de ${slug}', '${categorie}', '🏫',
              '${json(STRUCTURE)}'::jsonb, '${scope}',
              '${json(departments)}'::jsonb, ${isSystem}, ${isActive}) returning id`);

// Les identifiants ne servent pas : les assertions portent sur les slugs, tels
// qu'ils apparaissent dans le HTML.
poser("modele-global", { scope: "global", departments: [], isSystem: true });
poser("modele-web", { scope: "department", departments: ["web"], categorie: "Refonte" });
poser("modele-social", { scope: "department", departments: ["social"] });
poser("modele-archive", { scope: "department", departments: ["web"], isActive: false });

console.log("décor posé\n");

/* ========================= 1. LA GALERIE ============================== */

console.log("— la galerie —");

const galerieWeb = await page("/web/briefs/templates", equipeWeb.cookie);
ok(`la galerie répond (${galerieWeb.statut})`, galerieWeb.statut === 200);
ok("le modèle global y est", galerieWeb.html.includes(`modele-global-${jeu}`));
ok("celui du pôle aussi", galerieWeb.html.includes(`modele-web-${jeu}`));
ok("celui du pôle voisin n'y est pas", !galerieWeb.html.includes(`modele-social-${jeu}`));
ok("un modèle archivé est masqué par défaut", !galerieWeb.html.includes(`modele-archive-${jeu}`));
ok("le badge « Système » est rendu", galerieWeb.html.includes("Système"));
ok("le badge « Personnalisé » aussi", galerieWeb.html.includes("Personnalisé"));
ok("le nombre de sections et de champs est affiché", /2 sections/.test(galerieWeb.html));

const avecArchives = await page("/web/briefs/templates?inactifs=1", equipeWeb.cookie);
ok("… et réapparaît quand on le demande", avecArchives.html.includes(`modele-archive-${jeu}`));

const parCategorie = await page("/web/briefs/templates?category=Refonte", equipeWeb.cookie);
ok("le filtre par catégorie retient", parCategorie.html.includes(`modele-web-${jeu}`));
ok("… et écarte", !parCategorie.html.includes(`modele-global-${jeu}`));

const recherche = await page(`/web/briefs/templates?q=modele-web`, equipeWeb.cookie);
ok("la recherche retient", recherche.html.includes(`modele-web-${jeu}`));
ok("… et écarte", !recherche.html.includes(`modele-global-${jeu}`));

const galerieSocial = await page("/web/briefs/templates", equipeSocial.cookie);
ok(
  `l'équipe social est renvoyée hors du pôle web (${galerieSocial.statut})`,
  galerieSocial.statut === 307 || galerieSocial.statut === 302,
);

const galerieClient = await page("/web/briefs/templates", compteClient.cookie);
ok(
  `un compte client est renvoyé à son portail (${galerieClient.statut})`,
  (galerieClient.statut === 307 || galerieClient.statut === 302) &&
    (galerieClient.location ?? "").includes("/portail"),
);

/* ========================= 2. LA FICHE D'UN MODÈLE ==================== */

console.log("\n— la fiche d'un modèle —");

const fiche = await page(`/web/briefs/templates/modele-web-${jeu}`, equipeWeb.cookie);
ok(`la fiche répond (${fiche.statut})`, fiche.statut === 200);
ok("les deux sections sont rendues", fiche.html.includes(`Identification ${jeu}`) && fiche.html.includes(`Établissements ${jeu}`));
ok("le champ obligatoire est signalé", fiche.html.includes("obligatoire"));
ok("le champ bloquant est signalé", fiche.html.includes("bloquant"));
ok("… et remonté dans un encart de points bloquants", fiche.html.includes("point bloquant"));
ok("les options sont listées", fiche.html.includes("Reportage photo"));
ok("l'option hors forfait porte sa note", fiche.html.includes("hors devis, à chiffrer"));
ok("la condition d'affichage est écrite en clair", fiche.html.includes("visible si"));
ok("le champ niché dans le bloc répétable est rendu", fiche.html.includes(`Nom ${jeu}`));
ok("le type de chaque champ est nommé", fiche.html.includes("bloc répétable"));

const ficheVolee = await page(`/web/briefs/templates/modele-social-${jeu}`, equipeWeb.cookie);
ok(`un modèle d'un autre pôle répond 404 (${ficheVolee.statut})`, ficheVolee.statut === 404);
const ficheInexistante = await page(`/web/briefs/templates/nexiste-pas-${jeu}`, equipeWeb.cookie);
ok(`… comme un modèle inexistant (${ficheInexistante.statut})`, ficheInexistante.statut === 404);

const ficheGlobalParEquipe = await page(`/web/briefs/templates/modele-global-${jeu}`, equipeWeb.cookie);
ok("un modèle global est lisible par l'équipe", ficheGlobalParEquipe.statut === 200);
ok(
  "… en disant que seule la direction peut le modifier",
  /seule la direction/i.test(ficheGlobalParEquipe.html),
);
ok(
  "… et qu'un modèle système ne se supprime pas",
  /ne se supprime jamais/i.test(ficheGlobalParEquipe.html),
);

const ficheGlobalParDirection = await page(`/web/briefs/templates/modele-global-${jeu}`, direction.cookie);
ok(
  "la direction, elle, lit qu'elle peut le modifier",
  /Tu peux modifier/i.test(ficheGlobalParDirection.html),
);

/* ================ 3. LE BANDEAU DES BRIEFS NON CONVERTIS ============== */

console.log("\n— le garde-fou des briefs non convertis —");

const sansBandeau = await page("/web/briefs", equipeWeb.cookie);
ok(`l'écran des briefs répond (${sansBandeau.statut})`, sansBandeau.statut === 200);
ok(
  "aucun bandeau quand tout est converti",
  !sansBandeau.html.includes("au format d&#x27;origine") && !sansBandeau.html.includes("format d'origine"),
);
ok("le lien vers la galerie est présent", sansBandeau.html.includes("/web/briefs/templates"));

// On fabrique un brief resté à l'ancien format : des brief_fields, pas de
// snapshot, pas de date de conversion.
const briefVieux = un(`insert into briefs (client_id, title) values ('${clientId}','Brief hérité ${jeu}') returning id`);
un(`insert into brief_fields (brief_id, section, label, kind, options, required, position)
    values ('${briefVieux}','S','Une question','texte','[]'::jsonb,false,0) returning id`);

const avecBandeau = await page("/web/briefs", equipeWeb.cookie);
ok("le bandeau apparaît", /format d(&#x27;|')origine/.test(avecBandeau.html));
ok("… et nomme le brief concerné", avecBandeau.html.includes(`Brief hérité ${jeu}`));
ok("… avec son client", avecBandeau.html.includes(`Cap Marine ${jeu}`));
ok(
  "… et le compteur en base le voit aussi",
  un(`select count(*)::int from briefs b where b.legacy_migrated_at is null
      and exists (select 1 from brief_fields f where f.brief_id = b.id)`) === "1",
);

// Une fois converti, le bandeau doit disparaître de lui-même.
un(`update briefs set structure_snapshot = '${json(STRUCTURE)}'::jsonb,
    legacy_migrated_at = now() where id = '${briefVieux}'`);
const apresConversion = await page("/web/briefs", equipeWeb.cookie);
ok(
  "le bandeau disparaît une fois le brief converti",
  !/format d(&#x27;|')origine/.test(apresConversion.html),
);
ok(
  "… mais le brief reste dans la liste, évidemment",
  apresConversion.html.includes(`Brief hérité ${jeu}`),
);

/* ================================= bilan ============================== */

console.log(`\n${"─".repeat(60)}`);
console.log(`${verts} vertes, ${rouges.length} rouges`);
if (rouges.length > 0) {
  console.log("\nÉchecs :");
  for (const r of rouges) console.log(`  · ${r}`);
  process.exitCode = 1;
}
console.log();
