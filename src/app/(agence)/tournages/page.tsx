import Link from "next/link";
import { PageHeader } from "@/components/shell/Screen";
import { Card, CardHead } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dot, Eyebrow, StatusPill } from "@/components/ui/primitives";
import { requireStaff } from "@/lib/auth";
import { listClientOptions, listShoots } from "@/db/queries";
import { monthLabel } from "@/lib/pacing";
import { readiness, SHOOT_STATUS, slotLabel } from "@/data/shoot";
import { ShootForm } from "./ShootForm";

export const dynamic = "force-dynamic";

/**
 * Le planning terrain.
 *
 * Un tournage se lit par ce qui manque avant le départ, pas par sa fiche :
 * une équipe se déplace une fois, et un matériel non réservé ou une
 * autorisation non signée coûte la journée entière. La liste dit donc d'abord
 * ce qui bloque, et seulement ensuite ce qui est prévu.
 */
export default async function TournagesPage() {
  await requireStaff();
  const [clients, rows] = await Promise.all([listClientOptions(), listShoots()]);

  if (clients.length === 0) {
    return (
      <>
        <PageHeader title="Planning tournages" sub={monthLabel()} />
        <EmptyState title="Aucun client" actionLabel="Ajouter un client" actionHref="/clients">
          Un tournage se rattache à un client : c&apos;est ce qui permet de le compter dans son
          engagement et de retrouver les médias qui en sortent.
        </EmptyState>
      </>
    );
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const upcoming = rows.filter((r) => r.shoot.startsAt >= today && r.shoot.status !== "annule");
  const past = rows.filter((r) => r.shoot.startsAt < today || r.shoot.status === "annule");

  const blocked = upcoming.filter(
    (r) => !readiness({ ...r, gearTotal: r.gearTotal, gearReserved: r.gearReserved }).ready,
  ).length;

  // Regroupé par jour : c'est l'unité de travail d'une équipe qui se déplace.
  const days = new Map<string, typeof upcoming>();
  for (const r of upcoming) {
    const key = r.shoot.startsAt.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    days.set(key, [...(days.get(key) ?? []), r]);
  }

  return (
    <>
      <PageHeader
        title="Planning tournages"
        sub={
          upcoming.length === 0
            ? `${monthLabel()} · aucun tournage à venir`
            : `${upcoming.length} tournage${upcoming.length > 1 ? "s" : ""} à venir · ${
                blocked === 0
                  ? "tout est prêt"
                  : `${blocked} demande${blocked > 1 ? "nt" : ""} une action avant le départ`
              }`
        }
      />

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-4 pb-6 lg:px-5">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4">
          <Card className="flex flex-col gap-4 p-4">
            <Eyebrow>Planifier un tournage</Eyebrow>
            <ShootForm clients={clients} />
          </Card>

          {upcoming.length === 0 ? (
            <Card className="p-5">
              <p className="text-base text-ink-2">
                Aucun tournage à venir. Une fiche rassemble le lieu, le créneau, l&apos;équipe, le
                matériel, la shotlist cochable sur le terrain et les autorisations de droit à
                l&apos;image.
              </p>
            </Card>
          ) : (
            [...days].map(([day, items]) => (
              <Card key={day}>
                <CardHead title={day} meta={`${items.length}`} />
                {items.map((r) => {
                  const state = readiness(r);
                  const status = SHOOT_STATUS[r.shoot.status];
                  return (
                    <Link
                      key={r.shoot.id}
                      href={`/tournages/${r.shoot.id}`}
                      className="flex items-center gap-4 border-b border-line px-[14px] py-3 no-underline hover:bg-canvas hover:no-underline"
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                        <span className="clip text-micro text-ink-3">{r.clientName}</span>
                        <span className="clip text-lead font-medium text-ink">{r.shoot.title}</span>
                        <span className="clip text-small text-ink-2">
                          {slotLabel(r.shoot.startsAt, r.shoot.endsAt)}
                          {r.shoot.place ? ` · ${r.shoot.place}` : ""}
                        </span>
                      </span>

                      <span className="flex w-[150px] flex-none flex-col gap-[2px] text-small tabular-nums text-ink-2">
                        <span>
                          {r.shotsDone}/{r.shots} plan{r.shots > 1 ? "s" : ""}
                        </span>
                        <span>
                          {r.crew} personne{r.crew > 1 ? "s" : ""} · {r.gearReserved}/{r.gearTotal}{" "}
                          matériel
                        </span>
                      </span>

                      <span className="flex w-[260px] flex-none items-center gap-[6px]">
                        <Dot tone={state.ready ? "ok" : "warn"} solid size={5} />
                        <span
                          className={`clip text-small ${state.ready ? "text-ok" : "text-warn"}`}
                        >
                          {state.ready ? "Tout est prêt" : state.blocking.join(" · ")}
                        </span>
                      </span>

                      <StatusPill tone={status.tone}>{status.label}</StatusPill>
                    </Link>
                  );
                })}
              </Card>
            ))
          )}

          {past.length > 0 ? (
            <Card>
              <CardHead title="Passés et annulés" meta={`${past.length}`} />
              {past.slice(0, 20).map((r) => (
                <Link
                  key={r.shoot.id}
                  href={`/tournages/${r.shoot.id}`}
                  className="flex items-center gap-4 border-b border-line px-[14px] py-[10px] no-underline hover:bg-canvas hover:no-underline"
                >
                  <span className="w-[170px] flex-none text-small tabular-nums text-ink-3">
                    {slotLabel(r.shoot.startsAt, r.shoot.endsAt)}
                  </span>
                  <span className="clip flex-1 text-base text-ink-2">{r.shoot.title}</span>
                  <span className="clip w-[120px] flex-none text-small text-ink-3">
                    {r.clientName}
                  </span>
                  <StatusPill tone={SHOOT_STATUS[r.shoot.status].tone}>
                    {SHOOT_STATUS[r.shoot.status].label}
                  </StatusPill>
                </Link>
              ))}
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
