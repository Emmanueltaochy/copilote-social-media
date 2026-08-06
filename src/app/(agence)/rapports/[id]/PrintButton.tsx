"use client";

/**
 * L'export PDF passe par l'impression du navigateur.
 *
 * Aucune bibliothèque de génération n'est embarquée : elles pèsent lourd,
 * réclament du processeur sur un VPS partagé, et rendent un document qui
 * ressemble rarement à la page. Le moteur d'impression du navigateur produit
 * déjà le même rendu que l'écran, et « Enregistrer en PDF » est dans sa boîte
 * de dialogue.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden cursor-pointer rounded-control border border-ink bg-ink px-[11px] py-[7px] text-small font-medium text-paper hover:bg-black"
    >
      Imprimer ou enregistrer en PDF
    </button>
  );
}
