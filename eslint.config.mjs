import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Le prototype de design est conservé comme référence, pas comme source :
    // c'est du code généré par un autre outil, que personne ne maintient ici.
    "design/**",
    // Même statut pour la suite end-to-end : elle est commitée telle qu'elle a
    // été écrite dans un bac à sable qui n'existe plus, sans portage. La linter
    // n'a rien à dire d'un code que rien n'exécute — voir tests/e2e/README.md.
    "tests/e2e/**",
  ]),

  // L'API des agents n'atteint la base que par `src/lib/agent-data.ts`.
  //
  // Sans cette barrière, appliquer le périmètre d'une clé resterait une
  // discipline : il suffirait d'un `select()` écrit vite dans une route pour
  // rendre les contenus de toute la clientèle, et rien ne le signalerait avant
  // qu'un agent ne les lise. Une règle qui casse la CI est une structure ; un
  // commentaire qui demande d'y penser n'en est pas une.
  //
  // Les motifs couvrent les chemins d'accès, pas une chaîne particulière : un
  // détour par `@/db/schema` ou par un chemin relatif tombe aussi. `drizzle-orm`
  // est banni pour la même raison — sans table ni connexion, ses opérateurs ne
  // servent qu'à fabriquer du SQL qui n'a rien à faire dans une route.
  {
    files: ["src/app/api/agent/**/*.ts", "src/app/api/agent/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/db",
                "@/db/*",
                "**/db",
                "**/db/*",
                "drizzle-orm",
                "drizzle-orm/*",
                "postgres",
              ],
              message:
                "Une route d'agent n'accede pas a la base directement : passe par @/lib/agent-data, qui applique le perimetre de la cle. Voir le registre des ressources dans ce fichier.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
