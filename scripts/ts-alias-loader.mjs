// Résout l'alias « @/ » pour que Node exécute les modules TypeScript du projet
// tels quels, sans étape de compilation ni dépendance ajoutée.
//
// Node sait retirer les types depuis la 22 ; il ne sait pas lire les « paths »
// du tsconfig. Ces quelques lignes comblent l'écart, et servent uniquement aux
// tests — rien de tout ceci n'entre dans l'application.
import { existsSync } from "node:fs";
import { dirname, resolve as joindre } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = joindre(dirname(fileURLToPath(import.meta.url)), "..", "src");

export async function resolve(specifier, context, next) {
  if (!specifier.startsWith("@/")) return next(specifier, context);
  const base = joindre(SRC, specifier.slice(2));
  // L'import ne porte pas l'extension : on essaie celles du projet.
  for (const candidat of [base, `${base}.ts`, `${base}.tsx`, joindre(base, "index.ts")]) {
    if (existsSync(candidat)) return next(pathToFileURL(candidat).href, context);
  }
  return next(specifier, context);
}
