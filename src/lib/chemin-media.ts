import path from "node:path";

/*
 * Le seul passage entre un chemin enregistré en base et un fichier du volume
 * des médias. Module sans dépendance (testé directement par
 * scripts/test-secrets.mjs).
 *
 * Toutes les routes qui servent un fichier (/api/media, /api/media-public,
 * /api/avatar, /api/branding, /api/invoice, /api/client-files,
 * /api/portail-video, /api/promo) construisent le chemin depuis la base
 * uniquement, puis passent par ici (absolutePath dans storage.ts). La
 * vignette de veille, elle, ne lit qu'un nom calculé (empreinte SHA-1) dans
 * « veille-vignettes ».
 *
 * Deux refus, quel que soit l'appelant :
 *   - un chemin qui sort de la racine des médias (« ../ », chemin absolu) ;
 *   - un chemin qui contient « .secrets », sous quelque forme que ce soit
 *     (majuscules, « ./.secrets », « a/../.secrets ») : c'est là que vit la
 *     clé de chiffrement des secrets (src/lib/chiffrement.ts), qui ne doit
 *     jamais sortir du serveur.
 */

export class CheminRefuse extends Error {}

export function cheminDansMedias(racine: string, relatif: string): string {
  if (typeof relatif !== "string" || relatif.length === 0 || relatif.includes("\0")) throw new CheminRefuse("Chemin de fichier invalide.");
  if (/\.secrets/i.test(relatif)) throw new CheminRefuse("Chemin de fichier refusé.");
  const base = path.resolve(racine);
  const resolu = path.resolve(base, relatif);
  if (!resolu.startsWith(base + path.sep)) throw new CheminRefuse("Chemin de fichier invalide.");
  // Vérifié aussi après résolution, segment par segment.
  if (path.relative(base, resolu).split(path.sep).some((s) => s.toLowerCase() === ".secrets")) throw new CheminRefuse("Chemin de fichier refusé.");
  return resolu;
}
