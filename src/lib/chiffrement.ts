import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/*
 * Chiffrement des secrets enregistrés dans Pilot (clés d'API, jetons, mot de
 * passe d'application Gmail, adresse iCal), en AES-256-GCM.
 *
 * La clé ne vit pas dans la base : une copie de la base (sauvegarde, export)
 * ne suffit donc pas à lire un secret. Elle vient de la variable
 * d'environnement PILOT_SECRETS_KEY (32 octets, en hexadécimal ou en base64)
 * si elle est posée ; sinon d'un fichier créé au premier usage dans le volume
 * des médias (MEDIA_ROOT/.secrets/pilot-secrets.key, lisible par le seul
 * processus), qui survit aux mises à jour comme les photos des clients.
 * Aucune route ne sert ce dossier (voir src/lib/chemin-media.ts).
 *
 * Forme enregistrée : « v1:<iv base64>:<étiquette base64>:<texte chiffré base64> ».
 * Le préfixe de version permet de reconnaître une valeur chiffrée d'une
 * ancienne valeur en clair, et de changer de format un jour sans rien casser.
 *
 * Si la clé disparaît, les secrets deviennent illisibles : Pilot le dit, et il
 * suffit de recoller chaque clé dans Réglages. Rien d'autre n'est perdu.
 */

const PREFIXE = "v1:";
/**
 * La forme exacte d'une valeur chiffrée : IV de 12 octets (16 caractères
 * base64), étiquette GCM de 16 octets (24 caractères), puis le texte. Une clé
 * d'API en clair qui commencerait par « v1: » n'a aucune chance d'avoir cette
 * forme : elle reste reconnue comme claire.
 */
const FORME = /^v1:[A-Za-z0-9+/]{16}:[A-Za-z0-9+/]{22}==:[A-Za-z0-9+/]*={0,2}$/;
/** Même racine que src/lib/storage.ts (sans importer sharp pour autant). */
const MEDIA_ROOT = process.env.MEDIA_ROOT ?? "/data/assets";
let cle: Buffer | null = null;

const fichierCle = () => path.join(MEDIA_ROOT, ".secrets", "pilot-secrets.key");

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
  const dossier = path.dirname(fichierCle());
  const fichier = fichierCle();
  try {
    const lu = Buffer.from((await readFile(fichier, "utf8")).trim(), "hex");
    if (lu.length === 32) return (cle = lu);
  } catch {
    // Pas encore de clé : on la crée ci-dessous.
  }
  await mkdir(dossier, { recursive: true, mode: 0o700 });
  const neuve = randomBytes(32);
  // « wx » : si un autre processus l'a créée entre-temps (ou si un fichier
  // abîmé est là), on relit celui qui existe au lieu de l'écraser.
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

export type EtatCle = { ok: true; source: "variable" | "fichier" } | { ok: false; raison: "absente" | "illisible"; detail: string };

/**
 * La clé est-elle là et lisible, SANS jamais la créer ? Sert à la conversion
 * du démarrage : elle ne chiffre rien tant qu'il n'existe pas déjà une clé
 * qu'on sait relire (variable, ou fichier présent dans le volume).
 *
 * Le détail ne contient jamais la clé, seulement ce qui ne va pas.
 */
export async function etatCle(): Promise<EtatCle> {
  if (process.env.PILOT_SECRETS_KEY?.trim()) {
    try {
      const env = depuisEnv()!;
      if (cle && !cle.equals(env)) return { ok: false, raison: "illisible", detail: "la clé en mémoire ne correspond plus à PILOT_SECRETS_KEY" };
      cle ??= env;
      return { ok: true, source: "variable" };
    } catch {
      return { ok: false, raison: "illisible", detail: "PILOT_SECRETS_KEY ne fait pas 32 octets (64 caractères hexadécimaux, ou base64)" };
    }
  }
  let brut: string;
  try {
    brut = await readFile(fichierCle(), "utf8");
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    return code === "ENOENT"
      ? { ok: false, raison: "absente", detail: "ni PILOT_SECRETS_KEY ni fichier de clé dans le volume des médias" }
      : { ok: false, raison: "illisible", detail: `fichier de clé illisible (${code ?? "erreur"})` };
  }
  const lu = Buffer.from(brut.trim(), "hex");
  if (lu.length !== 32 || !/^[0-9a-f]{64}$/i.test(brut.trim())) return { ok: false, raison: "illisible", detail: "fichier de clé abîmé (64 caractères hexadécimaux attendus)" };
  if (cle && !cle.equals(lu)) return { ok: false, raison: "illisible", detail: "le fichier de clé a changé depuis le démarrage" };
  cle ??= lu;
  return { ok: true, source: "fichier" };
}

/** Une valeur au format chiffré (« v1:… ») ; sinon c'est une ancienne valeur en clair. */
export const estChiffre = (valeur: string | null | undefined) => typeof valeur === "string" && FORME.test(valeur);

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
  if (!iv || !tag || corps === undefined) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", await obtenirCle(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(corps, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
