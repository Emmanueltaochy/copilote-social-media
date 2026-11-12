"use client";

import { useEffect } from "react";

/*
 * Ce que voit l'équipe quand une page plante, au lieu du « This page couldn't
 * load » de Next.
 *
 * Cas le plus fréquent : Pilot vient d'être mis à jour pendant que la page
 * était ouverte. L'ancienne page cherche des fichiers qui n'existent plus ;
 * un rechargement suffit, on le fait donc tout seul (une fois par minute au
 * plus, pour ne jamais boucler).
 */

const MISE_A_JOUR = /ChunkLoadError|Loading (CSS )?chunk|dynamically imported module|Failed to find Server Action|unexpected response was received from the server|Failed to fetch/i;

export function ErreurPage({ error, retry }: { error: Error & { digest?: string }; retry?: () => void }) {
  const miseAJour = MISE_A_JOUR.test(`${error?.name} ${error?.message}`);

  useEffect(() => {
    console.error(error);
    if (!miseAJour) return;
    try {
      const last = Number(sessionStorage.getItem("pilot-reload") || 0);
      if (Date.now() - last > 60_000) {
        sessionStorage.setItem("pilot-reload", String(Date.now()));
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  }, [error, miseAJour]);

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "60vh", padding: 24, fontFamily: "inherit" }}>
      <div style={{ maxWidth: 520, textAlign: "center" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px" }}>
          {miseAJour ? "Pilot vient d'être mis à jour" : "Cette page n'a pas pu s'afficher"}
        </h1>
        <p style={{ margin: "0 0 16px", opacity: 0.75, lineHeight: 1.5 }}>
          {miseAJour
            ? "La page se recharge…"
            : "Rien n'est perdu : une demande faite à Jarvis continue sur le serveur, sa réponse sera dans l'historique. Rechargez la page."}
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ cursor: "pointer", border: "none", borderRadius: 999, padding: "10px 18px", background: "#121212", color: "#fff", fontWeight: 600 }}
          >
            Recharger la page
          </button>
          {retry && !miseAJour ? (
            <button
              type="button"
              onClick={() => retry()}
              style={{ cursor: "pointer", border: "1px solid #ccc", borderRadius: 999, padding: "10px 18px", background: "transparent" }}
            >
              Réessayer
            </button>
          ) : null}
        </div>
        {!miseAJour ? (
          <p style={{ marginTop: 16, fontSize: 12, opacity: 0.55, wordBreak: "break-word" }}>
            Détail pour l&apos;équipe technique : {error?.message || "erreur inconnue"}
            {error?.digest ? ` (réf. ${error.digest})` : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}
