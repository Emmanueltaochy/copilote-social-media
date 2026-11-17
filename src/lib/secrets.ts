import "server-only";

import { eq } from "drizzle-orm";
import { db, integrations } from "@/db";
import { chiffrer, dechiffrer } from "@/lib/chiffrement";

/*
 * Les clés des services extérieurs (Claude, Abby, Google Drive…), saisies
 * dans Réglages et gardées côté serveur. La variable d'environnement sert de
 * secours. Aucune n'est jamais renvoyée au navigateur.
 */

export type SecretId = "anthropic" | "abby" | "google-drive" | "mcp" | "stock-videos" | "gmail";

/**
 * La variable d'environnement de secours. Le mot de passe Gmail n'en a pas :
 * Emmanuel le colle lui-même dans Réglages, il ne passe par aucun fichier.
 */
const ENV: Record<SecretId, string | null> = {
  anthropic: "ANTHROPIC_API_KEY",
  abby: "ABBY_API_KEY",
  "google-drive": "GOOGLE_SERVICE_ACCOUNT_JSON",
  mcp: "PILOT_MCP_TOKEN",
  "stock-videos": "STOCK_VIDEOS_KEY",
  gmail: null,
};

const depuisEnv = (id: SecretId) => (ENV[id] ? process.env[ENV[id]] || "" : "");

export async function getSecret(id: SecretId): Promise<{ token: string; account: string | null } | null> {
  const [row] = await db.select().from(integrations).where(eq(integrations.id, id)).limit(1);
  const token = row?.token || depuisEnv(id);
  return token ? { token, account: row?.accountId ?? null } : null;
}

export async function setSecret(id: SecretId, token: string | null, account?: string | null) {
  const values = {
    id,
    updatedAt: new Date(),
    lastError: null,
    ...(token !== null ? { token } : {}),
    ...(account !== undefined ? { accountId: account } : {}),
  };
  await db.insert(integrations).values(values).onConflictDoUpdate({ target: integrations.id, set: values });
}

export async function forgetSecret(id: SecretId) {
  await db.delete(integrations).where(eq(integrations.id, id));
}

export async function secretStatus(id: SecretId) {
  const [row] = await db.select().from(integrations).where(eq(integrations.id, id)).limit(1);
  return {
    connected: Boolean(row?.token || depuisEnv(id)),
    fromEnv: !row?.token && Boolean(depuisEnv(id)),
    account: row?.accountId ?? null,
    lastError: row?.lastError ?? null,
  };
}

/**
 * Un secret chiffré (AES-256-GCM, clé hors de la base : voir chiffrement.ts).
 * Utilisé pour le mot de passe d'application Gmail : il ouvre une boîte
 * personnelle, il ne doit pas se lire dans une copie de la base.
 */
export async function setSecretChiffre(id: SecretId, clair: string, account?: string | null) {
  await setSecret(id, await chiffrer(clair), account);
}

/** Le secret en clair, ou `illisible` si la clé de chiffrement a changé depuis. */
export async function getSecretChiffre(id: SecretId): Promise<{ token: string; account: string | null } | "illisible" | null> {
  const [row] = await db.select().from(integrations).where(eq(integrations.id, id)).limit(1);
  if (!row?.token) return null;
  const clair = await dechiffrer(row.token);
  return clair === null ? "illisible" : { token: clair, account: row.accountId ?? null };
}

/** Le dernier échec d'une intégration (texte sans secret), ou null pour l'effacer. */
export async function noterErreur(id: SecretId, erreur: string | null, syncAt?: Date) {
  await db
    .update(integrations)
    .set({ lastError: erreur, ...(syncAt ? { lastSyncAt: syncAt } : {}) })
    .where(eq(integrations.id, id));
}
