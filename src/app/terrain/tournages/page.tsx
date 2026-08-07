import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { listShoots } from "@/db/queries";
import { readiness, SHOOT_STATUS, slotLabel } from "@/data/shoot";

export const dynamic = "force-dynamic";

export default async function TerrainTournagesPage() {
  await requireStaff();
  const now = new Date();
  const debut = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const rows = (await listShoots({ from: debut })).filter((r) => r.shoot.status !== "annule");

  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="text-title font-semibold">Tournages à venir</h1>

      {rows.length === 0 ? (
        <p className="rounded-card border border-dashed border-line px-3 py-4 text-base text-ink-2">
          Aucun tournage planifié. Ils se créent depuis le bureau.
        </p>
      ) : (
        rows.map((r) => {
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
                {state.ready ? "Tout est prêt" : state.blocking.join(" · ")}
              </span>
            </Link>
          );
        })
      )}
    </div>
  );
}
