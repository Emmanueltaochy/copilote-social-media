"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { clients, db } from "@/db";
import { requireDirection } from "@/lib/auth";
import { forgetSecret, setSecret, type SecretId } from "@/lib/secrets";
import { verifyStockKey } from "@/lib/stock-videos";

export type IntegState = { ok?: string; error?: string };

async function verify(id: SecretId, token: string): Promise<string | null> {
  if (id === "anthropic") {
    try {
      await new Anthropic({ apiKey: token, maxRetries: 0, timeout: 20_000 }).models.list({ limit: 1 });
      return null;
    } catch (e) {
      return e instanceof Anthropic.AuthenticationError ? "Clé refusée par Anthropic." : `Vérification impossible : ${(e as Error).message}`;
    }
  }
  if (id === "abby") {
    const r = await fetch("https://api.app-abby.com/contacts?page=1&limit=1", { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
    if (!r) return "Abby ne répond pas.";
    return r.ok ? null : r.status === 401 ? "Clé refusée par Abby (401)." : `Abby répond ${r.status}.`;
  }
  if (id === "google-drive") {
    try {
      const j = JSON.parse(token) as { client_email?: string; private_key?: string };
      return j.client_email && j.private_key ? null : "Ce JSON n'est pas une clé de compte de service (client_email et private_key manquants).";
    } catch {
      return "Collez le fichier JSON complet du compte de service.";
    }
  }
  if (id === "stock-videos") {
    try {
      await verifyStockKey(token);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }
  return null;
}

/** Enregistre une clé après l'avoir essayée : une clé fausse ne s'enregistre pas. */
export async function enregistrerCle(_prev: IntegState, formData: FormData): Promise<IntegState> {
  await requireDirection();
  const id = String(formData.get("id")) as SecretId;
  const token = String(formData.get("token") ?? "").trim();
  if (!["anthropic", "abby", "google-drive", "stock-videos"].includes(id)) return { error: "Intégration inconnue." };
  if (token.length < 10) return { error: "Collez la clé." };
  const err = await verify(id, token);
  if (err) return { error: err };
  await setSecret(id, token);
  revalidatePath("/reglages");
  return { ok: "Clé vérifiée et enregistrée." };
}

export async function oublierCle(formData: FormData): Promise<void> {
  await requireDirection();
  const id = String(formData.get("id")) as SecretId;
  if (["anthropic", "abby", "google-drive", "mcp", "stock-videos"].includes(id)) await forgetSecret(id);
  revalidatePath("/reglages");
}

/** Crée (ou remplace) l'adresse secrète qui relie Claude.ai à Pilot. */
export async function genererMcp(): Promise<void> {
  const user = await requireDirection();
  // Les gestes faits depuis Claude.ai sont rattachés à la personne qui a créé l'adresse.
  await setSecret("mcp", randomBytes(24).toString("base64url"), user.id);
  revalidatePath("/reglages");
}

/** Mode de publication et dossier Drive d'un client. */
export async function majClientPublication(formData: FormData): Promise<void> {
  await requireDirection();
  const id = String(formData.get("clientId") ?? "");
  const mode = String(formData.get("publishMode") ?? "validation");
  const drive = String(formData.get("drive") ?? "").trim();
  // On accepte le lien complet du dossier comme son seul identifiant.
  const folder = drive.match(/folders\/([A-Za-z0-9_-]{10,})/)?.[1] ?? (/^[A-Za-z0-9_-]{10,}$/.test(drive) ? drive : null);
  if (!id) return;
  await db
    .update(clients)
    .set({ publishMode: mode === "confiance" ? "confiance" : "validation", driveFolderId: folder })
    .where(eq(clients.id, id));
  revalidatePath("/reglages");
}
