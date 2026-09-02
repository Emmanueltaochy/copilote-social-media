#!/usr/bin/env node
//
// Tests du schéma de structure des modèles de brief.
//
// Isolés : aucune base, aucun serveur, aucune dépendance. Node exécute
// directement le TypeScript du projet — le résolveur d'alias voisin comble la
// seule chose qu'il ne sait pas faire, lire les « paths » du tsconfig.
//
// Usage :
//   node --experimental-strip-types --import ./scripts/ts-alias-loader-register.mjs \
//        scripts/test-brief-structure.mjs

import { validerStructure } from "../src/lib/brief-structure.ts";

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

/** Vérifie qu'un modèle est refusé, et que l'erreur pointe le bon endroit. */
const refuse = (label, structure, cheminAttendu, extraitDuMessage) => {
  const r = validerStructure(structure);
  if (r.ok) {
    ok(`${label} — devait être refusé`, false);
    return;
  }
  const trouvee = r.erreurs.find(
    (e) =>
      e.chemin === cheminAttendu &&
      (!extraitDuMessage || e.message.toLowerCase().includes(extraitDuMessage.toLowerCase())),
  );
  ok(
    `${label}${trouvee ? "" : ` — attendu « ${cheminAttendu} », obtenu ${JSON.stringify(r.erreurs)}`}`,
    Boolean(trouvee),
  );
};

const champ = (o) => ({ id: "c1", label: "Un champ", type: "text", ...o });
const modele = (champs, extra = {}) => ({
  sections: [{ id: "s1", title: "Une section", fields: champs, ...extra }],
});

/* ============================ CE QUI DOIT PASSER ======================== */

console.log("— les modèles valides —");

const complet = {
  sections: [
    {
      id: "identification",
      title: "Identification du client",
      description: "Texte d'aide",
      collapsible: true,
      fields: [
        { id: "raison_sociale", label: "Raison sociale", type: "text", required: true, help: "Kbis" },
        { id: "presentation", label: "Présentation", type: "textarea" },
        { id: "courriel", label: "E-mail", type: "email" },
        { id: "tel", label: "Téléphone", type: "phone" },
        { id: "site", label: "Site actuel", type: "url" },
        { id: "pages", label: "Nombre de pages", type: "number" },
        { id: "budget", label: "Budget", type: "currency" },
        { id: "livraison", label: "Livraison visée", type: "date" },
        { id: "titre_inter", label: "Vos contenus", type: "heading" },
        { id: "encadre", label: "À savoir", type: "info" },
      ],
    },
    {
      id: "perimetre",
      title: "Périmètre",
      fields: [
        {
          id: "formule",
          label: "Formule",
          type: "select",
          options: [
            { value: "vitrine", label: "Vitrine" },
            { value: "boutique", label: "Boutique" },
          ],
        },
        {
          id: "hebergement",
          label: "Hébergement",
          type: "radio",
          options: [{ value: "nous", label: "Par nous" }],
        },
        {
          id: "options_sup",
          label: "Options",
          type: "checkbox_group",
          blocking: true,
          options: [
            { value: "seo", label: "SEO" },
            {
              value: "reportage_photo",
              label: "Reportage photo",
              out_of_scope: true,
              note: "hors devis, à chiffrer",
            },
          ],
        },
        { id: "urgent", label: "Urgent ?", type: "checkbox" },
        {
          id: "priorites",
          label: "Classez vos priorités",
          type: "priority_list",
          options: [
            { value: "delai", label: "Délai" },
            { value: "prix", label: "Prix" },
          ],
        },
        {
          id: "tarifs",
          label: "Grille tarifaire",
          type: "table",
          columns: [
            { key: "prestation", label: "Prestation" },
            { key: "montant", label: "Montant", type: "currency", width: "120px" },
          ],
        },
        {
          id: "etablissements",
          label: "Vos établissements",
          type: "repeater",
          min: 1,
          max: 10,
          item_label: "Établissement",
          fields: [
            { id: "etab_nom", label: "Nom", type: "text" },
            { id: "etab_ville", label: "Ville", type: "text" },
          ],
        },
        {
          id: "detail_photo",
          label: "Détail du reportage",
          type: "textarea",
          visible_if: { field: "options_sup", operator: "includes", value: "reportage_photo" },
        },
      ],
    },
  ],
};

const r = validerStructure(complet);
ok(
  `un modèle utilisant les 17 types est accepté${r.ok ? "" : ` — ${JSON.stringify(r.erreurs)}`}`,
  r.ok,
);

ok(
  "les cinq opérateurs de condition sont acceptés",
  ["equals", "not_equals", "includes", "is_empty", "is_not_empty"].every(
    (operator) =>
      validerStructure(
        modele([
          champ({ id: "a", label: "A" }),
          champ({ id: "b", label: "B", visible_if: { field: "a", operator, value: "x" } }),
        ]),
      ).ok,
  ),
);

ok(
  "une condition peut viser un champ d'une AUTRE section",
  validerStructure({
    sections: [
      { id: "s1", title: "Un", fields: [champ({ id: "a", label: "A" })] },
      {
        id: "s2",
        title: "Deux",
        fields: [champ({ id: "b", label: "B", visible_if: { field: "a", operator: "equals", value: 1 } })],
      },
    ],
  }).ok,
);

ok(
  "une chaîne de conditions non circulaire passe (a ← b ← c)",
  validerStructure(
    modele([
      champ({ id: "a", label: "A" }),
      champ({ id: "b", label: "B", visible_if: { field: "a", operator: "is_not_empty" } }),
      champ({ id: "c", label: "C", visible_if: { field: "b", operator: "is_not_empty" } }),
    ]),
  ).ok,
);

/* ============================ CE QUI DOIT ÊTRE REFUSÉ =================== */

console.log("\n— la forme —");

refuse("un type inconnu", modele([champ({ type: "carrousel" })]), "sections[0].fields[0].type", "type inconnu");
refuse("un libellé vide", modele([champ({ label: "" })]), "sections[0].fields[0].label", "libellé");
refuse(
  "un identifiant avec un espace",
  modele([champ({ id: "raison sociale" })]),
  "sections[0].fields[0].id",
  "lettres",
);
refuse("aucune section", { sections: [] }, "sections", "au moins une section");
refuse("un titre de section vide", modele([champ({})], { title: "" }), "sections[0].title", "titre");

console.log("\n— les règles propres à chaque type —");

refuse(
  "un « select » sans options",
  modele([champ({ type: "select" })]),
  "sections[0].fields[0].options",
  "au moins une option",
);
refuse(
  "un « checkbox_group » avec options vides",
  modele([champ({ type: "checkbox_group", options: [] })]),
  "sections[0].fields[0].options",
  "au moins une option",
);
refuse(
  "un « table » sans colonnes",
  modele([champ({ type: "table" })]),
  "sections[0].fields[0].columns",
  "au moins une colonne",
);
refuse(
  "un « repeater » sans champs",
  modele([champ({ type: "repeater" })]),
  "sections[0].fields[0].fields",
  "au moins un champ",
);
refuse(
  "un « heading » marqué requis",
  modele([champ({ type: "heading", required: true })]),
  "sections[0].fields[0].required",
  "ne se remplit pas",
);
refuse(
  "un min supérieur au max",
  modele([
    champ({ type: "repeater", min: 5, max: 2, fields: [{ id: "x", label: "X", type: "text" }] }),
  ]),
  "sections[0].fields[0].min",
  "dépasse",
);

console.log("\n— les options hors forfait —");

refuse(
  "une option « out_of_scope » sans note",
  modele([champ({ type: "select", options: [{ value: "a", label: "A", out_of_scope: true }] })]),
  "sections[0].fields[0].options[0].note",
  "note",
);

console.log("\n— l'unicité des identifiants —");

refuse(
  "deux champs de même identifiant dans une section",
  modele([champ({ id: "doublon", label: "A" }), champ({ id: "doublon", label: "B" })]),
  "sections[0].fields[1].id",
  "déjà utilisé",
);
refuse(
  "deux champs de même identifiant dans DEUX sections",
  {
    sections: [
      { id: "s1", title: "Un", fields: [champ({ id: "doublon", label: "A" })] },
      { id: "s2", title: "Deux", fields: [champ({ id: "doublon", label: "B" })] },
    ],
  },
  "sections[1].fields[0].id",
  "déjà utilisé",
);
refuse(
  "un doublon niché dans un « repeater »",
  modele([
    champ({ id: "collision", label: "A" }),
    champ({
      id: "bloc",
      type: "repeater",
      fields: [{ id: "collision", label: "B", type: "text" }],
    }),
  ]),
  "sections[0].fields[1].fields[0].id",
  "déjà utilisé",
);
refuse(
  "deux sections de même identifiant",
  {
    sections: [
      { id: "meme", title: "Un", fields: [champ({ id: "a" })] },
      { id: "meme", title: "Deux", fields: [champ({ id: "b" })] },
    ],
  },
  "sections[1].id",
  "déjà utilisé",
);

console.log("\n— les conditions d'affichage —");

refuse(
  "une condition visant un champ inexistant",
  modele([champ({ id: "a", visible_if: { field: "fantome", operator: "equals", value: 1 } })]),
  "sections[0].fields[0].visible_if.field",
  "ne correspond à aucun champ",
);
refuse(
  "un opérateur inconnu",
  modele([
    champ({ id: "a", label: "A" }),
    champ({ id: "b", label: "B", visible_if: { field: "a", operator: "superieur" } }),
  ]),
  "sections[0].fields[1].visible_if.operator",
  "operator",
);
refuse(
  "un champ qui dépend de lui-même",
  modele([champ({ id: "boucle", visible_if: { field: "boucle", operator: "equals", value: 1 } })]),
  "sections[0].fields[0].visible_if.field",
  "lui-même",
);
refuse(
  "deux champs qui se conditionnent mutuellement",
  modele([
    champ({ id: "a", label: "A", visible_if: { field: "b", operator: "is_not_empty" } }),
    champ({ id: "b", label: "B", visible_if: { field: "a", operator: "is_not_empty" } }),
  ]),
  "sections[0].fields[0].visible_if.field",
  "circulaire",
);

const cycleTriple = validerStructure(
  modele([
    champ({ id: "a", label: "A", visible_if: { field: "c", operator: "is_not_empty" } }),
    champ({ id: "b", label: "B", visible_if: { field: "a", operator: "is_not_empty" } }),
    champ({ id: "c", label: "C", visible_if: { field: "b", operator: "is_not_empty" } }),
  ]),
);
ok(
  "un cycle à trois est détecté",
  !cycleTriple.ok && cycleTriple.erreurs.some((e) => e.message.includes("circulaire")),
);
ok(
  "… et le message nomme la boucle complète",
  !cycleTriple.ok &&
    cycleTriple.erreurs.some((e) => /a → c → b → a|a → b → c → a|c → b → a → c/.test(e.message)),
);

console.log("\n— la lisibilité des messages —");

const sale = validerStructure(
  modele([champ({ type: "select" }), champ({ id: "c2", label: "", type: "table" })]),
);
ok("plusieurs erreurs sont rendues d'un coup", !sale.ok && sale.erreurs.length >= 3);
ok(
  "chaque erreur porte un chemin exploitable",
  !sale.ok && sale.erreurs.every((e) => /^sections\[\d+\]/.test(e.chemin)),
);
ok(
  "aucun jargon Zod brut dans les messages",
  !sale.ok && sale.erreurs.every((e) => !/invalid_|zod|union/i.test(e.message)),
);

console.log("\n— les entrées aberrantes —");

for (const [label, entree] of [
  ["null", null],
  ["une chaîne", "bonjour"],
  ["un tableau", []],
  ["un objet sans sections", { titre: "x" }],
  ["sections qui n'est pas un tableau", { sections: "x" }],
]) {
  const res = validerStructure(entree);
  ok(`${label} est refusé sans planter`, !res.ok && res.erreurs.length > 0);
}

/* ================================= bilan ================================ */

console.log(`\n${"─".repeat(58)}`);
console.log(`${verts} vertes, ${rouges.length} rouges`);
if (rouges.length > 0) {
  console.log("\nÉchecs :");
  for (const r of rouges) console.log(`  · ${r}`);
  process.exitCode = 1;
}
console.log();
