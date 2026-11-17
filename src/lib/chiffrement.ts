import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/*
 * Chiffrement des secrets les plus sensibles (le mot de passe d'application
 * Gmail), en AES-256-GCM.
 *
 * La clé ne vit pas dans la base : une copie de la base (sauvegarde, export)
 * ne suffit donc pas à lire le secret. Elle vient de la variable
 * d'environnement PILOT_SECRETS_KEY (32 octets, en hexadécimal ou en base64)
 * si elle est posée ; sinon d'un fichier créé au premier usage dans le volume
 * des médias (MEDIA_ROOT/.secrets/pilot-secrets.key, lisible par le seul
 * processus), qui survit aux mises à jour comme les photos des clients.
 *
 * Si la clé disparaît, le secret devient illisible : Pilot le dit, et il
 * suffit de recoller le mot de passe dans Réglages. Rien d'autre n'est perdu.
 */

const PREFIXE = "v1:";
/** Même racine que src/lib/storage.ts (sans importer sharp pour autant). */
const MEDIA_ROOT = process.env.MEDIA_ROOT ?? "/data/assets";
let cle: Buffer | null = null;

function depuisEnv(): Buffer | null {
  const brut = process.env.PILOT_SECRETS_KEY?.trim();
  if (!brut) return null;
  const hex = /^[0-9a-f]{64}$/i.test(brut) ? Buffer.from(brut, "hex") : null;
  const b64 = hex ?? Buffer.from(brut, "base64");
  if (b64.length !== 32) throw new Error("PILOT_SECRETS_KEY doit faire 32 octets (64 caractères hexadécimaux, ou base64).");
  return b64;
}

async function obtenirCle(): Promise<Buffer> {
  if (cle) return cle;
  const env = depuisEnv();
  if (env) return (cle = env);
  const dossier = path.join(MEDIA_ROOT, ".secrets");
  const fichier = path.join(dossier, "pilot-secrets.key");
  try {
    const lu = Buffer.from((await readFile(fichier, "utf8")).trim(), "hex");
    if (lu.length === 32) return (cle = lu);
  } catch {
    // Pas encore de clé : on la crée ci-dessous.
  }
  await mkdir(dossier, { recursive: true, mode: 0o700 });
  const neuve = randomBytes(32);
  // « wx » : si un autre processus l'a créée entre-temps, on relit la sienne.
  try {
    await writeFile(fichier, neuve.toString("hex"), { mode: 0o600, flag: "wx" });
    await chmod(fichier, 0o600).catch(() => undefined);
    return (cle = neuve);
  } catch {
    const lu = Buffer.from((await readFile(fichier, "utf8")).trim(), "hex");
    if (lu.length !== 32) throw new Error("Clé de chiffrement illisible.");
    return (cle = lu);
  }
}

export const estChiffre = (valeur: string | null | undefined) => Boolean(valeur?.startsWith(PREFIXE));

export async function chiffrer(clair: string): Promise<string> {
  const k = await obtenirCle();
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const corps = Buffer.concat([c.update(clair, "utf8"), c.final()]);
  return `${PREFIXE}${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${corps.toString("base64")}`;
}

/** Le texte clair, ou null si la valeur ne peut pas être déchiffrée (clé changée ou perdue). */
export async function dechiffrer(valeur: string): Promise<string | null> {
  if (!estChiffre(valeur)) return null;
  const [iv, tag, corps] = valeur.slice(PREFIXE.length).split(":");
  if (!iv || !tag || !corps) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", await obtenirCle(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(corps, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
