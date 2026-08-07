import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { listShoots, listTodayQueue } from "@/db/queries";
import { readiness, SHOOT_STATUS, slotLabel } from "@/data/shoot";
import { CONTENT_KIND } from "@/data/content";

export const dynamic = "force-dynamic";

/**
 * Aujourd'hui.
 *
 * L'écran d'arrivée sur le terrain répond à une seule question : qu'est-ce
 * que je fais maintenant. Le tournage du jour d'abord, avec ce qui bloque
 * encore ; puis ce qui doit partir aujourd'hui. Rien d'autre.
 */
export default async function TerrainPage() {
  await requireStaff();
  const now = new Date();
  const debut = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dans7jours = new Date(debut.getTime() + 7 * 86_400_000);

  const [shoots, queue] = await Promise.all([listShoots({ from: debut }), listTodayQueue(now)]);
  const semaine = shoots.filter((s) => s.shoot.startsAt < dans7jours && s.shoot.status !== "annule");

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <span className="eyebrow text-ink-3">
          {now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
        </span>
        <h1 className="text-title font-semibold">Aujourd&apos;hui</h1>
      </div>

      <section className="flex flex-col gap-2">
        <span className="eyebrow text-ink-3">
          Tournages · 7 prochains jours {semaine.length > 0 ? `· ${semaine.length}` : ""}
        </span>

        {semaine.length === 0 ? (
          <p className="rounded-card border border-dashed border-line px-3 py-4 text-base text-ink-2">
            Aucun tournage dans les sept jours.
          </p>
        ) : (
          semaine.map((r) => {
            const state = readiness(r);
            return (
              <Link
                key={r.shoot.id}
                href={`/terrain/${r.shoot.id}`}
                className="flex flex-col gap-1 rounded-card border border-line bg-paper px-3 py-3 no-underline hover:no-underline"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="clip text-micro text-ink-3">{r.clientName}</span>
                  <span className="flex-none text-micro text-ink-3">
                    {SHOOT_STATUS[r.shoot.status].label}
                  </span>
                </span>
                <span className="text-lead leading-tight font-medium text-ink">{r.shoot.title}</span>
                <span className="text-small text-ink-2">
                  {slotLabel(r.shoot.startsAt, r.shoot.endsAt)}
                  {r.shoot.place ? ` · ${r.shoot.place}` : ""}
                </span>
                <span className={`text-small ${state.ready ? "text-ok" : "text-warn"}`}>
                  {state.ready
                    ? `Prêt · ${r.shotsDone}/${r.shots} plans tournés`
                    : state.blocking.join(" · ")}
                </span>
              </Link>
            );
          })
        )}
      </section>

      <section className="flex flex-col gap-2">
        <span className="eyebrow text-ink-3">
          À publier aujourd&apos;hui {queue.length > 0 ? `· ${queue.length}` : ""}
        </span>
        {queue.length === 0 ? (
          <p className="rounded-card border border-dashed border-line px-3 py-4 text-base text-ink-2">
            Rien de programmé aujourd&apos;hui.
          </p>
        ) : (
          queue.map(({ content, clientName }) => (
            <Link
              key={content.id}
              href="/terrain/publier"
              className="flex flex-col gap-[2px] rounded-card border border-line bg-paper px-3 py-[10px] no-underline hover:no-underline"
            >
              <span className="clip text-micro text-ink-3">
                {clientName} · {CONTENT_KIND[content.kind] ?? content.kind}
              </span>
              <span className="clip text-base font-medium text-ink">{content.title}</span>
              <span className="text-small tabular-nums text-ink-2">
                {content.scheduledAt?.toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
