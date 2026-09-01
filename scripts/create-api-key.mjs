#!/usr/bin/env node
//
// Crée une clé d'API et affiche son jeton — une seule fois.
//
// L'écran de gestion dans Réglages viendra quand il y aura trois clés à gérer.
// D'ici là, une commande suffit et n'a pas à être maintenue.
//
// Le jeton n'est jamais stocké en clair : seule son empreinte SHA-256 part en
// base. Il n'y a donc aucun moyen de le retrouver ensuite — c'est le but, et
// c'est pourquoi cet écran est le seul endroit où il apparaît.
//
// Usage :
//   node scripts/create-api-key.mjs --name "Agent chef de projet" \
//        --scopes pipeline:read,pipeline:write [--pole social] \
//        [--client <uuid>] [--days 90]
//
// Sur le VPS, dans le conteneur applicatif :
//   docker compose exec app node scripts/create-api-key.mjs --name "…" --scopes pipeline:read

import { createHash, randomBytes } from "node:crypto";
import postgres from "postgres";

const PREFIX = "tpk_";
const SCOPES_CONNUS = ["pipeline:read", "pipeline:write"];
const POLES_CONNUS = ["social", "web"];

/* ------------------------------------------------------------- arguments -- */

function lireArguments(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const cle = a.slice(2);
    const suivant = argv[i + 1];
    // Un drapeau suivi d'un autre drapeau vaut « présent, sans valeur » :
    // « --name --scopes … » doit échouer sur le nom manquant, pas avaler
    // « --scopes » comme nom.
    out[cle] = suivant && !suivant.startsWith("--") ? suivant : true;
    if (out[cle] !== true) i += 1;
  }
  return out;
}

function meurs(message) {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

const args = lireArguments(process.argv.slice(2));

const nom = typeof args.name === "string" ? args.name.trim() : "";
if (nom.length < 3) {
  meurs(
    "Donne un nom à la clé : --name \"Agent chef de projet — social\".\n" +
      "    C'est ce nom qui permettra de savoir laquelle révoquer.",
  );
}

const scopes = String(args.scopes ?? "pipeline:read")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (scopes.length === 0) meurs("Il faut au moins un droit : --scopes pipeline:read");
for (const s of scopes) {
  if (!SCOPES_CONNUS.includes(s)) {
    meurs(`Droit inconnu : « ${s} ». Connus : ${SCOPES_CONNUS.join(", ")}`);
  }
}

const poles = String(args.pole ?? "social")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
for (const p of poles) {
  if (!POLES_CONNUS.includes(p)) {
    meurs(`Pôle inconnu : « ${p} ». Connus : ${POLES_CONNUS.join(", ")}`);
  }
}
// Une clé sans pôle ne verrait rien : `perimetreDeLaCle()` ferme par défaut.
// Autant refuser ici, avec une phrase, plutôt que de livrer une clé muette.
if (poles.length === 0) meurs("Il faut au moins un pôle : --pole social");

const clientId = typeof args.client === "string" ? args.client.trim() : null;
if (clientId && !/^[0-9a-f-]{36}$/i.test(clientId)) {
  meurs("--client attend l'identifiant du client (uuid).");
}

const jours = args.days ? Number(args.days) : null;
if (jours !== null && (!Number.isFinite(jours) || jours <= 0)) {
  meurs("--days attend un nombre de jours positif.");
}

const url = process.env.DATABASE_URL;
if (!url) {
  meurs(
    "DATABASE_URL absent.\n" +
      "    En local :  DATABASE_URL=postgres://… node scripts/create-api-key.mjs …\n" +
      "    Sur le VPS : docker compose exec app node scripts/create-api-key.mjs …",
  );
}

/* ------------------------------------------------------------- exécution -- */

const sql = postgres(url, { max: 1 });

try {
  if (clientId) {
    const [client] = await sql`select id, short_name from clients where id = ${clientId}`;
    if (!client) meurs(`Aucun client avec l'identifiant ${clientId}.`);
    console.log(`\n  Clé restreinte au client : ${client.short_name}`);
  }

  const jeton = PREFIX + randomBytes(32).toString("base64url");
  const empreinte = createHash("sha256").update(jeton).digest("hex");
  // Assez pour distinguer les clés dans une liste, trop peu pour en deviner une.
  const prefixe = jeton.slice(0, 12);
  const expiration = jours ? new Date(Date.now() + jours * 86_400_000) : null;

  const [cle] = await sql`
    insert into api_keys (name, token_hash, prefix, scopes, departments, client_id, expires_at)
    values (
      ${nom}, ${empreinte}, ${prefixe},
      ${sql.json(scopes)}, ${sql.json(poles)},
      ${clientId}, ${expiration}
    )
    returning id, created_at
  `;

  console.log(`
  ┌──────────────────────────────────────────────────────────────────────┐
  │  Clé créée. Le jeton n'apparaîtra plus jamais.                       │
  └──────────────────────────────────────────────────────────────────────┘

  Nom        ${nom}
  Droits     ${scopes.join(", ")}
  Pôles      ${poles.join(", ")}
  Client     ${clientId ?? "tous les clients du pôle"}
  Expire     ${expiration ? expiration.toISOString().slice(0, 10) : "jamais"}
  Identifiant ${cle.id}

  JETON :

      ${jeton}

  Copie-le maintenant. Seule son empreinte est en base : personne, pas même
  toi, ne peut le retrouver ensuite. Si tu le perds, crée-en un autre et
  révoque celui-ci :

      update api_keys set revoked_at = now() where id = '${cle.id}';

  Essai :

      curl -H "Authorization: Bearer ${jeton}" \\
           https://marketing.taochyconsulting.fr/api/agent/contents
`);
} catch (error) {
  console.error("\n[pilot] création de clé impossible :", error.message ?? error, "\n");
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
