import "server-only";

import { eq } from "drizzle-orm";
import { db, integrations } from "@/db";

/*
 * Les clés des services extérieurs (Claude, Abby, Google Drive…), saisies
 * dans Réglages et gardées côté serveur. La variable d'environnement sert de
 * secours. Aucune n'est jamais renvoyée au navigateur.
 */

export type SecretId = "anthropic" | "abby" | "google-drive" | "mcp" | "stock-videos";

const ENV: Record<SecretId, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  abby: "ABBY_API_KEY",
  "google-drive": "GOOGLE_SERVICE_ACCOUNT_JSON",
  mcp: "PILOT_MCP_TOKEN",
  "stock-videos": "STOCK_VIDEOS_KEY",
};

export async function getSecret(id: SecretId): Promise<{ token: string; account: string | null } | null> {
  const [row] = await db.select().from(integrations).where(eq(integrations.id, id)).limit(1);
  const token = row?.token || process.env[ENV[id]] || "";
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
    connected: Boolean(row?.token || process.env[ENV[id]]),
    fromEnv: !row?.token && Boolean(process.env[ENV[id]]),
    account: row?.accountId ?? null,
    lastError: row?.lastError ?? null,
  };
}
