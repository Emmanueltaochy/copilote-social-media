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
]);

export default eslintConfig;
