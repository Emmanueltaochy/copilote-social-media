import type { ActionClient } from "@/db/web-queries";

/**
 * « À faire de votre côté » : le premier bloc de l'accueil du portail.
 *
 * Tout ce qui attend une action du client, numéroté, avec un bouton par
 * ligne. Avant, ces points vivaient dans un encart en bas de colonne : le
 * cahier des charges s'y perdait, et le projet attendait sans que le client
 * le sache.
 */
export function AFaire({ actions, accent }: { actions: ActionClient[]; accent: string }) {
  if (!actions.length) return null;
  return (
    <section
      aria-label="À faire de votre côté"
      className="flex flex-col gap-3 rounded-card border-2 bg-paper p-4 shadow-soft sm:p-5"
      style={{ borderColor: accent }}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[22px] font-bold tracking-[-0.02em]">À faire de votre côté</h2>
        <span className="text-small text-ink-3">
          {actions.length} étape{actions.length > 1 ? "s" : ""} · votre projet avance dès que c&apos;est fait
        </span>
      </div>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {actions.map((a, i) => {
          const pct = a.progression && a.progression.total > 0 ? Math.round((a.progression.fait / a.progression.total) * 100) : null;
          return (
            <li key={a.id}>
              <a
                href={a.href}
                className="flex flex-col gap-3 rounded-[18px] border border-line px-4 py-3 text-ink no-underline hover:border-line-strong hover:no-underline sm:flex-row sm:items-center"
              >
                <span className="flex min-w-0 flex-1 items-start gap-3">
                  <span
                    className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-base font-bold text-white"
                    style={{ background: i === 0 ? accent : "#9aa3ad" }}
                  >
                    {i + 1}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-lead font-semibold">{a.titre}</span>
                    <span className="text-small text-ink-3">{a.detail}</span>
                    {pct !== null ? (
                      <span className="mt-1 flex items-center gap-2">
                        <span className="h-2 w-full max-w-[260px] overflow-hidden rounded-full bg-mute">
                          <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: accent }} />
                        </span>
                        <span className="text-micro text-ink-3 tabular-nums">
                          {a.progression!.fait}/{a.progression!.total}
                        </span>
                      </span>
                    ) : null}
                  </span>
                </span>
                <span
                  className="w-full flex-none rounded-full px-5 py-[10px] text-center text-base font-semibold text-white sm:w-auto"
                  style={{ background: i === 0 ? accent : "#1d1d1b" }}
                >
                  {a.bouton ?? "Ouvrir"} →
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
