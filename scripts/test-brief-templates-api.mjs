#!/usr/bin/env node
//
// Tests d'autorisation de l'API des modèles de brief.
//
// C'est le seul endroit de ce chantier où une erreur a des conséquences
// réelles. Le reste est de la plomberie : un défaut de sérialisation se voit,
// un défaut d'autorisation ne se voit pas — il se découvre quand quelqu'un a
// déjà lu ce qu'il ne devait pas.
//
// D'où la forme : une assertion par couple rôle × route, systématiquement,
// plutôt que quelques cas choisis.
//
// Les sessions sont posées directement en base — l'empreinte du jeton, comme
// le fait `createSession()` — pour éviter de piloter un formulaire de
// connexion qui n'est pas le sujet.
//
// Usage :
//   BASE=http://127.0.0.1:4030 PGURL="postgres://…" node scripts/test-brief-templates-api.mjs

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

const jeu = randomBytes(3).toString("hex");

/** Une session valide, posée comme le ferait une connexion. */
function ouvrirSession(userId) {
  const jeton = randomBytes(32).toString("base64url");
  const empreinte = createHash("sha256").update(jeton).digest("hex");
  un(`insert into sessions (token_hash, user_id, expires_at)
      values ('${empreinte}', '${userId}', now() + interval '1 day') returning token_hash`);
  return jeton;
}

function creerCompte(nom, role, poles, clientId = null) {
  const id = un(`
    insert into users (email, name, initials, role, departments, client_id)
    values ('${nom}-${jeu}@taochy.re', '${nom} ${jeu}', 'XX', '${role}',
            '${JSON.stringify(poles)}'::jsonb, ${clientId ? `'${clientId}'` : "null"})
    returning id`);
  return { id, cookie: ouvrirSession(id) };
}

/** `redirect: "manual"` : une route d'API ne doit jamais renvoyer ailleurs. */
const appel = async (chemin, { methode = "GET", cookie, corps } = {}) => {
  const r = await fetch(`${BASE}${chemin}`, {
    method: methode,
    headers: {
      ...(cookie ? { Cookie: `pilot_session=${cookie}` } : {}),
      ...(corps ? { "Content-Type": "application/json" } : {}),
    },
    body: corps ? JSON.stringify(corps) : undefined,
    redirect: "manual",
    cache: "no-store",
  });
  const texte = await r.text();
  let json = null;
  try {
    json = JSON.parse(texte);
  } catch {
    json = null;
  }
  return { statut: r.status, corps: json, texte, entetes: r.headers };
};

/* ------------------------------------------------------------------ décor -- */

console.log(`\n— décor (jeu ${jeu}) —`);

const clientId = un(`insert into clients (name, short_name, departments)
  values ('Cap Marine ${jeu}','Cap Marine ${jeu}','["web","social"]'::jsonb) returning id`);

const direction = creerCompte("Direction", "direction", []);
const equipeWeb = creerCompte("EquipeWeb", "equipe", ["web"]);
const equipeSocial = creerCompte("EquipeSocial", "equipe", ["social"]);
const compteClient = creerCompte("Client", "client", [], clientId);

const STRUCTURE = {
  sections: [
    { id: "s1", title: "Section", fields: [{ id: "q1", label: "Question", type: "text" }] },
  ],
};

/** Modèles posés en base : on teste les autorisations, pas la création. */
function poserModele(slug, { scope, departments, isSystem = false }) {
  return un(`
    insert into brief_templates (slug, name, structure, scope, departments, is_system)
    values ('${slug}-${jeu}', '${slug}', '${JSON.stringify(STRUCTURE)}'::jsonb,
            '${scope}', '${JSON.stringify(departments)}'::jsonb, ${isSystem})
    returning id`);
}

const global = poserModele("global", { scope: "global", departments: [] });
const systeme = poserModele("systeme", { scope: "global", departments: [], isSystem: true });
const duWeb = poserModele("duweb", { scope: "department", departments: ["web"] });
const duSocial = poserModele("dusocial", { scope: "department", departments: ["social"] });

console.log("décor posé\n");

/* =================== 1. UN COMPTE CLIENT : 403 PARTOUT ================== */

console.log("— un compte client n'a accès à rien —");

const ROUTES = [
  ["GET", `/api/brief-templates`],
  ["POST", `/api/brief-templates`],
  ["GET", `/api/brief-templates/global-${jeu}`],
  ["PATCH", `/api/brief-templates/${global}`],
  ["DELETE", `/api/brief-templates/${global}`],
  ["POST", `/api/brief-templates/${global}/duplicate`],
  ["GET", `/api/brief-templates/${global}/export`],
  ["POST", `/api/brief-templates/import`],
  ["POST", `/api/briefs`],
];

for (const [methode, chemin] of ROUTES) {
  const r = await appel(chemin, { methode, cookie: compteClient.cookie, corps: methode === "GET" ? undefined : {} });
  ok(
    `${methode} ${chemin.replace(jeu, "…").replace(global, "…")} → 403 (${r.statut})`,
    r.statut === 403,
  );
}

const clientSansRedirection = await appel("/api/brief-templates", { cookie: compteClient.cookie });
ok(
  "… et c'est une réponse, jamais une redirection",
  !clientSansRedirection.entetes.get("location") && !clientSansRedirection.texte.includes("<html"),
);

/* ==================== 2. SANS SESSION : 401 PARTOUT ==================== */

console.log("\n— sans session —");

for (const [methode, chemin] of ROUTES) {
  const r = await appel(chemin, { methode, corps: methode === "GET" ? undefined : {} });
  ok(
    `${methode} ${chemin.replace(jeu, "…").replace(global, "…")} → 401 (${r.statut})`,
    r.statut === 401,
  );
}

/* ================= 3. LA PORTÉE EN LECTURE ============================= */

console.log("\n— ce que chaque pôle voit —");

const vuPar = async (compte) =>
  ((await appel("/api/brief-templates", { cookie: compte.cookie })).corps?.modeles ?? []).map(
    (m) => m.slug,
  );

const vusWeb = await vuPar(equipeWeb);
const vusSocial = await vuPar(equipeSocial);
const vusDirection = await vuPar(direction);

ok("l'équipe web voit les modèles globaux", vusWeb.includes(`global-${jeu}`));
ok("… et ceux de son pôle", vusWeb.includes(`duweb-${jeu}`));
ok("… mais pas ceux du pôle voisin", !vusWeb.includes(`dusocial-${jeu}`));
ok("l'équipe social voit les siens", vusSocial.includes(`dusocial-${jeu}`));
ok("… et pas ceux du web", !vusSocial.includes(`duweb-${jeu}`));
ok("la direction voit les deux pôles", vusDirection.includes(`duweb-${jeu}`) && vusDirection.includes(`dusocial-${jeu}`));

const voleLecture = await appel(`/api/brief-templates/dusocial-${jeu}`, { cookie: equipeWeb.cookie });
ok(`ouvrir un modèle d'un autre pôle → 404 (${voleLecture.statut})`, voleLecture.statut === 404);
ok(
  "… avec le même message qu'un modèle inexistant",
  voleLecture.corps?.error ===
    (await appel(`/api/brief-templates/nexiste-pas-${jeu}`, { cookie: equipeWeb.cookie })).corps?.error,
);

/* ================= 4. LA PORTÉE EN ÉCRITURE =========================== */

console.log("\n— qui peut modifier quoi —");

const patch = (id, cookie, corps = { name: `Renommé ${jeu}` }) =>
  appel(`/api/brief-templates/${id}`, { methode: "PATCH", cookie, corps });

ok(
  `la direction modifie un modèle global (${(await patch(global, direction.cookie)).statut})`,
  (await patch(global, direction.cookie)).statut === 200,
);
const equipeSurGlobal = await patch(global, equipeWeb.cookie);
ok(`l'équipe ne modifie PAS un modèle global (${equipeSurGlobal.statut})`, equipeSurGlobal.statut === 403);
ok(
  "… et le message dit pourquoi",
  /direction/i.test(equipeSurGlobal.corps?.error ?? ""),
);
ok(
  `l'équipe web modifie un modèle de son pôle (${(await patch(duWeb, equipeWeb.cookie)).statut})`,
  (await patch(duWeb, equipeWeb.cookie)).statut === 200,
);
const webSurSocial = await patch(duSocial, equipeWeb.cookie);
ok(`… mais pas celui du pôle voisin → 404 (${webSurSocial.statut})`, webSurSocial.statut === 404);

/* ================= 5. LE MODÈLE SYSTÈME =============================== */

console.log("\n— un modèle système —");

const supprSysteme = await appel(`/api/brief-templates/${systeme}`, {
  methode: "DELETE",
  cookie: direction.cookie,
});
ok(`la direction ne le supprime pas non plus → 403 (${supprSysteme.statut})`, supprSysteme.statut === 403);
ok("… et le message propose la duplication", /duplique/i.test(supprSysteme.corps?.error ?? ""));
ok(
  "… et il est toujours en base",
  un(`select count(*)::int from brief_templates where id='${systeme}'`) === "1",
);

const copie = await appel(`/api/brief-templates/${systeme}/duplicate`, {
  methode: "POST",
  cookie: equipeWeb.cookie,
});
ok(`l'équipe peut le dupliquer (${copie.statut})`, copie.statut === 201);
ok(
  "la copie n'est pas système",
  un(`select is_system from brief_templates where id='${copie.corps?.modele?.id}'`) === "f",
);
ok(
  "… et appartient au pôle de qui l'a faite",
  un(`select departments::text from brief_templates where id='${copie.corps?.modele?.id}'`) === '["web"]',
);

const copie2 = await appel(`/api/brief-templates/${systeme}/duplicate`, {
  methode: "POST",
  cookie: equipeWeb.cookie,
});
ok(`dupliquer deux fois aboutit quand même (${copie2.statut})`, copie2.statut === 201);
ok(
  `… avec un slug suffixé (${copie2.corps?.modele?.slug})`,
  copie2.corps?.modele?.slug !== copie.corps?.modele?.slug,
);

/* ================= 5 bis. LA SUPPRESSION SELON L'USAGE ================= */

console.log("\n— supprimer un modèle —");

const jamaisServi = poserModele("jamais-servi", { scope: "department", departments: ["web"] });
const supprNeuf = await appel(`/api/brief-templates/${jamaisServi}`, {
  methode: "DELETE",
  cookie: equipeWeb.cookie,
});
ok(`un modèle jamais utilisé se supprime (${supprNeuf.statut})`, supprNeuf.statut === 200);
ok(
  "… et il a bien disparu",
  un(`select count(*)::int from brief_templates where id='${jamaisServi}'`) === "0",
);

// Un modèle qui a servi : on lui fabrique un brief, puis on tente.
const dejaServi = poserModele("deja-servi", { scope: "department", departments: ["web"] });
un(`insert into briefs (client_id, title, template_id, template_version, structure_snapshot)
    values ('${clientId}', 'Brief issu du modèle', '${dejaServi}', 1,
            '${JSON.stringify(STRUCTURE)}'::jsonb) returning id`);

const supprServi = await appel(`/api/brief-templates/${dejaServi}`, {
  methode: "DELETE",
  cookie: equipeWeb.cookie,
});
ok(`un modèle déjà utilisé n'est pas supprimé → 409 (${supprServi.statut})`, supprServi.statut === 409);
ok(`… et le message donne le nombre de briefs (${supprServi.corps?.briefsCrees})`, supprServi.corps?.briefsCrees === 1);
ok("… et invite à archiver", /archive/i.test(supprServi.corps?.error ?? ""));
ok(
  "… le modèle est toujours là",
  un(`select count(*)::int from brief_templates where id='${dejaServi}'`) === "1",
);

const archive = await patch(dejaServi, equipeWeb.cookie, { isActive: false });
ok(`archiver fonctionne, lui (${archive.statut})`, archive.statut === 200);
ok(
  "… et le modèle quitte la galerie",
  !(await vuPar(equipeWeb)).includes(`deja-servi-${jeu}`),
);
ok(
  "… sans toucher au brief qu'il a produit",
  un(`select count(*)::int from briefs where template_id='${dejaServi}'`) === "1",
);

/* ================= 6. VERSIONNEMENT =================================== */

console.log("\n— le versionnement —");

const avant = Number(un(`select version from brief_templates where id='${duWeb}'`));
await patch(duWeb, equipeWeb.cookie, { description: "Juste la description" });
ok(
  "renommer n'incrémente pas la version",
  Number(un(`select version from brief_templates where id='${duWeb}'`)) === avant,
);

const structureV2 = {
  sections: [
    { id: "s1", title: "Section", fields: [{ id: "q1", label: "Question modifiée", type: "text" }] },
  ],
};
await patch(duWeb, equipeWeb.cookie, { structure: structureV2 });
ok(
  "modifier la structure incrémente la version",
  Number(un(`select version from brief_templates where id='${duWeb}'`)) === avant + 1,
);
ok(
  "… et archive l'état précédent",
  un(`select count(*)::int from brief_template_versions where template_id='${duWeb}' and version=${avant}`) === "1",
);

/* ================= 7. IMPORT ========================================== */

console.log("\n— l'import —");

const importCasse = await appel("/api/brief-templates/import", {
  methode: "POST",
  cookie: equipeWeb.cookie,
  corps: {
    slug: `importe-${jeu}`,
    name: "Importé",
    scope: "department",
    departments: ["web"],
    structure: { sections: [{ id: "s", title: "S", fields: [{ id: "a", label: "A", type: "select" }] }] },
  },
});
ok(`une structure invalide est refusée en 422 (${importCasse.statut})`, importCasse.statut === 422);
ok(
  "… avec le chemin exact du champ fautif",
  importCasse.corps?.details?.[0]?.chemin === "sections[0].fields[0].options",
);
ok("… et une version lisible d'un coup", typeof importCasse.corps?.lisible === "string");

const importOk = await appel("/api/brief-templates/import", {
  methode: "POST",
  cookie: equipeWeb.cookie,
  corps: {
    slug: `duweb-${jeu}`,
    name: "Importé sur un slug pris",
    scope: "department",
    departments: ["web"],
    structure: STRUCTURE,
  },
});
ok(`un import valide passe (${importOk.statut})`, importOk.statut === 201);
ok(
  `… sans écraser le modèle existant (slug ${importOk.corps?.modele?.slug})`,
  importOk.corps?.modele?.slug !== `duweb-${jeu}` && importOk.corps?.slugModifie !== null,
);

const trop = await fetch(`${BASE}/api/brief-templates/import`, {
  method: "POST",
  headers: { Cookie: `pilot_session=${equipeWeb.cookie}`, "Content-Type": "application/json" },
  body: JSON.stringify({ slug: "x", name: "y", structure: { bourrage: "a".repeat(600 * 1024) } }),
  redirect: "manual",
});
ok(`un fichier de 600 Ko est refusé en 413 (${trop.status})`, trop.status === 413);

/* ================= 8. CRÉATION D'UN BRIEF ============================= */

console.log("\n— créer un brief depuis un modèle —");

const brief = await appel("/api/briefs", {
  methode: "POST",
  cookie: equipeWeb.cookie,
  corps: { template_slug: `duweb-${jeu}`, client_id: clientId },
});
ok(`le brief est créé (${brief.statut})`, brief.statut === 201);
const briefId = brief.corps?.brief?.id;
ok(
  "… avec un snapshot figé",
  un(`select structure_snapshot is not null from briefs where id='${briefId}'`) === "t",
);
ok(
  "… et la version du modèle au moment de la création",
  un(`select template_version from briefs where id='${briefId}'`) ===
    un(`select version from brief_templates where id='${duWeb}'`),
);

// Le point de la règle : modifier le modèle ne doit rien changer au brief.
const avantSnapshot = un(`select structure_snapshot::text from briefs where id='${briefId}'`);
await patch(duWeb, equipeWeb.cookie, {
  structure: { sections: [{ id: "neuf", title: "Tout autre", fields: [{ id: "z", label: "Z", type: "text" }] }] },
});
ok(
  "modifier le modèle ne modifie PAS le brief déjà créé",
  un(`select structure_snapshot::text from briefs where id='${briefId}'`) === avantSnapshot,
);

const briefVoisin = await appel("/api/briefs", {
  methode: "POST",
  cookie: equipeSocial.cookie,
  corps: { template_slug: `duweb-${jeu}`, client_id: clientId },
});
ok(
  `créer depuis un modèle d'un autre pôle → 404 (${briefVoisin.statut})`,
  briefVoisin.statut === 404,
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
