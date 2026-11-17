import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { secretInterne } from "@/lib/secrets";

/*
 * Liens signés vers un média, pour qu'un service extérieur (Metricool) puisse
 * récupérer le visuel d'une publication sans session. Le lien ne vaut que pour
 * ce média et expire : une adresse devinée ou recopiée ne donne accès à rien
 * d'autre, ni pour longtemps.
 *
 * La clé de signature est créée par Pilot au premier usage et gardée chiffrée
 * dans `integrations` (voir src/lib/secrets.ts).
 */

let cached: string | null = null;

async function secret(): Promise<string> {
  cached ??= await secretInterne("media-signing", () => randomBytes(32).toString("hex"));
  return cached;
}

function mac(key: string, id: string, exp: number) {
  return createHmac("sha256", key).update(`${id}.${exp}`).digest("base64url");
}

export async function signedMediaUrl(assetId: string, days = 7): Promise<string> {
  const domain = process.env.APP_DOMAIN?.trim();
  if (!domain) throw new Error("APP_DOMAIN manquant : impossible de donner une adresse publique au média.");
  const exp = Math.floor(Date.now() / 1000) + days * 86_400;
  const sig = mac(await secret(), assetId, exp);
  return `https://${domain}/api/media-public/${assetId}?exp=${exp}&sig=${sig}`;
}

export async function verifyMediaSignature(assetId: string, exp: string | null, sig: string | null): Promise<boolean> {
  const e = Number(exp);
  if (!sig || !Number.isFinite(e) || e < Date.now() / 1000) return false;
  const expected = Buffer.from(mac(await secret(), assetId, e));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
