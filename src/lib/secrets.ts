import "server-only";

import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db, integrations } from "@/db";
import { chiffrer, dechiffrer, estChiffre, etatCle } from "@/lib/chiffrement";

/*
 * Les clés des services extérieurs (Claude, Abby, Google Drive, Metricool,
 * Gmail, Trello, GoCardless, Google Agenda…), saisies dans Réglages et gardées
 * côté serveur. La variable d'environnement sert de secours. Aucune n'est
 * jamais renvoyée au navigateur.
 *
 * TOUTES sont chiffrées en base (AES-256-GCM, clé hors de la base : voir
 * chiffrement.ts) :
 *   - l'écriture chiffre toujours ;
 *   - la lecture accepte les deux formes : chiffrée (« v1:… ») et claire
 *     (ancienne forme, d'avant le chiffrement) ;
 *   - au démarrage, convertirSecretsEnClair() chiffre sur place ce qui est
 *     encore en clair (voir plus bas ses garde-fous).
 *
 * Les clés d'API de Pilot (table api_keys) ne sont pas ici : ce sont des
 * empreintes SHA-256, rien à déchiffrer. Les marqueurs techniques de la table
 * `integrations` (« portal-video-bundle »…) ne sont pas des secrets et
 * restent tels quels : seule la liste SECRETS ci-dessous est concernée.
 */

export type SecretId =
  | "anthropic"
  | "abby"
  | "google-drive"
  | "mcp"
  | "stock-videos"
  | "gmail"
  | "metricool"
  | "media-signing"
  | "trello"
  | "gocardless"
  | "agenda";

/** Les lignes de `integrations` qui portent un secret, et seulement elles. */
export const SECRETS: readonly SecretId[] = [
  "anthropic",
  "abby",
  "google-drive",
  "mcp",
  "stock-videos",
  "gmail",
  "metricool",
  "media-signing",
  "trello",
  "gocardless",
  "agenda",
];

/**
 * La variable d'environnement de secours. Gmail, Trello, GoCardless et
 * l'agenda n'en ont pas : Emmanuel les colle lui-même dans Réglages, ils ne
 * passent par aucun fichier. Metricool a la sienne dans metricool.ts.
 */
const ENV: Record<SecretId, string | null> = {
  anthropic: "ANTHROPIC_API_KEY",
  abby: "ABBY_API_KEY",
  "google-drive": "GOOGLE_SERVICE_ACCOUNT_JSON",
  mcp: "PILOT_MCP_TOKEN",
  "stock-videos": "STOCK_VIDEOS_KEY",
  gmail: null,
  metricool: null,
  "media-signing": null,
  trello: null,
  gocardless: null,
  agenda: null,
};

const depuisEnv = (id: SecretId) => (ENV[id] ? process.env[ENV[id]] || "" : "");

/** Un avertissement par secret illisible et par processus : le journal ne se remplit pas. */
const dejaSignale = new Set<string>();

/**
 * La valeur enregistrée, en clair : déchiffrée si elle est chiffrée, telle
 * quelle si c'est une ancienne valeur claire. `illisible` : chiffrée, mais la
 * clé actuelle ne l'ouvre pas (clé changée ou perdue).
 */
export async function valeurClaire(id: string, stockee: string | null | undefined): Promise<string | "illisible" | null> {
  if (!stockee) return null;
  if (!estChiffre(stockee)) return stockee;
  const clair = await dechiffrer(stockee);
  if (clair !== null) return clair;
  if (!dejaSignale.has(id)) {
    dejaSignale.add(id);
    console.warn(`[pilot] secret « ${id} » chiffré mais illisible avec la clé actuelle : à recoller dans Réglages.`);
  }
  return "illisible";
}

async function ligne(id: SecretId) {
  const [row] = await db.select().from(integrations).where(eq(integrations.id, id)).limit(1);
  return row;
}

/**
 * Le secret en clair (base, sinon variable de secours). Un secret chiffré
 * illisible compte comme absent : la variable de secours prend le relais si
 * elle existe.
 */
export async function getSecret(id: SecretId): Promise<{ token: string; account: string | null } | null> {
  const row = await ligne(id);
  const lu = await valeurClaire(id, row?.token);
  const token = (lu === "illisible" ? null : lu) || depuisEnv(id);
  return token ? { token, account: row?.accountId ?? null } : null;
}

/** Enregistre un secret : toujours chiffré. `token: null` ne touche qu'au compte. */
export async function setSecret(id: SecretId, token: string | null, account?: string | null) {
  const values = {
    id,
    updatedAt: new Date(),
    lastError: null,
    ...(token !== null ? { token: await chiffrer(token) } : {}),
    ...(account !== undefined ? { accountId: account } : {}),
  };
  await db.insert(integrations).values(values).onConflictDoUpdate({ target: integrations.id, set: values });
}

export async function forgetSecret(id: SecretId) {
  await db.delete(integrations).where(eq(integrations.id, id));
}

export async function secretStatus(id: SecretId) {
  const row = await ligne(id);
  return {
    connected: Boolean(row?.token || depuisEnv(id)),
    fromEnv: !row?.token && Boolean(depuisEnv(id)),
    account: row?.accountId ?? null,
    lastError: row?.lastError ?? null,
  };
}

/** Même chose que setSecret (tout est chiffré désormais) ; gardé pour Gmail et les services de l'étape 3. */
export const setSecretChiffre = (id: SecretId, clair: string, account?: string | null) => setSecret(id, clair, account);

/** Le secret en clair, ou `illisible` si la clé de chiffrement a changé depuis. Sans variable de secours. */
export async function getSecretChiffre(id: SecretId): Promise<{ token: string; account: string | null } | "illisible" | null> {
  const row = await ligne(id);
  const lu = await valeurClaire(id, row?.token);
  if (lu === null) return null;
  return lu === "illisible" ? "illisible" : { token: lu, account: row?.accountId ?? null };
}

/**
 * Un secret interne que Pilot fabrique lui-même (clé de signature des liens
 * de médias) : lu s'il existe, sinon créé, chiffré, enregistré. Deux processus
 * qui le créent en même temps finissent avec le même (le premier gagne).
 *
 * S'il est illisible (clé de chiffrement perdue), il est remplacé : ce secret
 * ne protège que des liens qui expirent en quelques jours, et sans lui plus
 * aucun média ne pourrait partir chez Metricool.
 */
export async function secretInterne(id: SecretId, fabriquer: () => string): Promise<string> {
  const lu = await valeurClaire(id, (await ligne(id))?.token);
  if (lu && lu !== "illisible") return lu;
  const neuf = fabriquer();
  const chiffre = await chiffrer(neuf);
  if (lu === "illisible") {
    await db.update(integrations).set({ token: chiffre, updatedAt: new Date() }).where(eq(integrations.id, id));
  } else {
    await db.insert(integrations).values({ id, token: chiffre }).onConflictDoNothing();
  }
  const relu = await valeurClaire(id, (await ligne(id))?.token);
  return relu && relu !== "illisible" ? relu : neuf;
}

/** Le dernier échec d'une intégration (texte sans secret), ou null pour l'effacer. */
export async function noterErreur(id: SecretId, erreur: string | null, syncAt?: Date) {
  await db
    .update(integrations)
    .set({ lastError: erreur, ...(syncAt ? { lastSyncAt: syncAt } : {}) })
    .where(eq(integrations.id, id));
}

/* ------------------------------------------- conversion au démarrage -- */

export type BilanConversion =
  | { etat: "fait"; chiffres: number; dejaChiffres: number; ignores: number }
  | { etat: "cle_indisponible"; raison: string }
  | { etat: "suspendue"; raison: string };

/**
 * Chiffre sur place les secrets encore en clair. Appelée à chaque démarrage
 * (src/instrumentation.ts) ; idempotente : une seconde exécution ne change
 * rien, puisqu'il n'y a plus rien en clair.
 *
 * Garde-fous — la production ne doit jamais perdre une clé qui marche :
 *   1. Pas de clé déjà présente et lisible (variable PILOT_SECRETS_KEY, ou
 *      fichier dans le volume) : on ne convertit RIEN, on ne crée pas de clé,
 *      on journalise un avertissement. Les secrets restent lisibles en clair.
 *   2. Un secret déjà chiffré ne s'ouvre pas avec la clé actuelle : la clé a
 *      probablement changé. On ne convertit rien de plus (chiffrer avec une
 *      mauvaise clé aggraverait la perte) et on le signale.
 *   3. Ligne par ligne, dans une transaction : la ligne est verrouillée
 *      (SELECT … FOR UPDATE), la valeur chiffrée est déchiffrée et comparée à
 *      l'originale AVANT d'écrire, et l'écriture n'a lieu que si la valeur en
 *      base est toujours exactement la même claire (personne ne l'a changée
 *      entre-temps). Au moindre doute, la ligne reste en clair.
 *
 * Le journal ne contient jamais un secret : seulement des nombres et des
 * noms de services.
 */
export async function convertirSecretsEnClair(): Promise<BilanConversion> {
  const cle = await etatCle();
  if (!cle.ok) {
    const raison = `clé de chiffrement ${cle.raison} (${cle.detail})`;
    console.warn(`[pilot] secrets : aucune conversion, ${raison}. Les secrets restent lisibles tels quels.`);
    return { etat: "cle_indisponible", raison };
  }

  const lignes = await db
    .select({ id: integrations.id, token: integrations.token })
    .from(integrations)
    .where(and(inArray(integrations.id, [...SECRETS]), isNotNull(integrations.token)));

  const chiffrees = lignes.filter((l) => estChiffre(l.token));
  const illisibles: string[] = [];
  for (const l of chiffrees) if ((await dechiffrer(l.token!)) === null) illisibles.push(l.id);
  if (illisibles.length) {
    const raison = `${illisibles.length} secret(s) déjà chiffré(s) ne s'ouvrent pas avec la clé actuelle (${illisibles.join(", ")}) : la clé a peut-être changé`;
    console.warn(`[pilot] secrets : conversion suspendue, ${raison}. Rien n'a été modifié.`);
    return { etat: "suspendue", raison };
  }

  let chiffres = 0;
  let ignores = 0;
  for (const l of lignes.filter((x) => !estChiffre(x.token))) {
    const original = l.token!;
    const fait = await db.transaction(async (tx) => {
      const [actuelle] = await tx.select({ token: integrations.token }).from(integrations).where(eq(integrations.id, l.id)).for("update");
      // Changée entre-temps (enregistrée de nouveau, effacée) : on n'y touche pas.
      if (!actuelle || actuelle.token !== original || estChiffre(actuelle.token)) return false;
      const chiffre = await chiffrer(original);
      // Vérification avant d'écrire : la valeur chiffrée se rouvre à l'identique.
      if (!estChiffre(chiffre) || (await dechiffrer(chiffre)) !== original) return false;
      const ecrites = await tx
        .update(integrations)
        .set({ token: chiffre })
        .where(and(eq(integrations.id, l.id), eq(integrations.token, original)))
        .returning({ id: integrations.id });
      return ecrites.length === 1;
    });
    if (fait) chiffres += 1;
    else ignores += 1;
  }

  if (chiffres || ignores) {
    console.log(`[pilot] secrets : ${chiffres} chiffré(s) sur place, ${chiffrees.length} déjà chiffré(s)${ignores ? `, ${ignores} laissé(s) tel(s) quel(s) par prudence` : ""}.`);
  }
  return { etat: "fait", chiffres, dejaChiffres: chiffrees.length, ignores };
}
