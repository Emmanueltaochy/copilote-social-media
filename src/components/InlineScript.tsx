"use client";

/**
 * Script en ligne exécuté pendant la lecture du HTML (avant le premier
 * affichage). Composant client : rendu côté serveur il porte
 * « text/javascript », rendu dans le navigateur « text/plain » — React ne le
 * signale donc plus comme un script qui ne s'exécutera pas
 * (guide Next « preventing-flash-before-hydration »).
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
