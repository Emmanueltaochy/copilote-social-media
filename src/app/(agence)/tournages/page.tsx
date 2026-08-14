import Link from "next/link";
import { PageHeader } from "@/components/shell/Screen";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dot, Eyebrow } from "@/components/ui/primitives";
import { requireDepartment } from "@/lib/auth";
import { listClientOptions, listShoots } from "@/db/queries";
import { monthLabel } from "@/lib/pacing";
import { readiness, SHOOT_STATUS, SHOOT_STATUSES, slotLabel, type ShootStatus } from "@/data/shoot";
import { updateShoot } from "./actions";
import { ShootForm } from "./ShootForm";

export const dynamic = "force-dynamic";

/**
 * Le planning terrain, en tableau d'étapes.
 *
 * Un tournage ne se lit pas par sa date mais par son état d'avancement : ce
 * qu'on veut voir en arrivant, c'est la pile de ce qui n'est pas encore
 * sécurisé, pas un agenda où le travail restant se devine ligne par ligne. Le
 * pipeline de production est lu comme ça tous les jours ; les tournages
 * répondent maintenant à la même lecture.
 *
 * Chaque carte porte ce qui bloque le départ, parce qu'une équipe se déplace
 * une fois : un matériel non réservé ou une autorisation non signée coûte la
 * journée entière.
 */
export default async function TournagesPage() {
  await requireDepartment("social");
  const [clients, rows] = await Promise.all([listClientOptions("social"), listShoots()]);

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

  const actifs = rows.filter((r) => r.shoot.status !== "annule" && r.shoot.status !== "realise");
  const bloqués = actifs.filter((r) => !readiness(r).ready).length;

  return (
    <>
      <PageHeader
        title="Planning tournages"
        sub={
          actifs.length === 0
            ? `${monthLabel()} · aucun tournage en cours`
            : `${actifs.length} tournage${actifs.length > 1 ? "s" : ""} en cours · ${
                bloqués === 0
                  ? "tout est prêt"
                  : `${bloqués} demande${bloqués > 1 ? "nt" : ""} une action avant le départ`
              }`
        }
      />

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-4 pb-5 lg:px-5">
        <Card className="mb-4 flex flex-col gap-4 p-4">
          <Eyebrow>Planifier un tournage</Eyebrow>
          <ShootForm clients={clients} />
        </Card>

        {rows.length === 0 ? (
          <Card className="p-5">
            <p className="text-base text-ink-2">
              Aucun tournage. Une fiche rassemble le lieu, le créneau, l&apos;équipe, le matériel,
              la shotlist cochable sur le terrain et les autorisations de droit à l&apos;image.
            </p>
          </Card>
        ) : (
          <div className="flex min-w-max items-start gap-3">
            {SHOOT_STATUSES.map((étape) => {
              const cartes = rows.filter((r) => r.shoot.status === étape);
              const suivante = étapeSuivante(étape);

              return (
                <div
                  key={étape}
                  className="flex w-[280px] flex-none flex-col rounded-card border border-line bg-paper"
                >
                  <div className="flex flex-none items-center justify-between gap-2 border-b border-line px-3 py-[10px]">
                    <Eyebrow tone="ink">{SHOOT_STATUS[étape].label}</Eyebrow>
                    <span className="text-small text-ink-3 tabular-nums">{cartes.length}</span>
                  </div>

                  <div className="flex flex-col gap-2 p-2">
                    {cartes.map((r) => {
                      const état = readiness(r);
                      const passé = r.shoot.startsAt < today;
                      return (
                        <div
                          key={r.shoot.id}
                          className="flex flex-col gap-[7px] rounded-card border border-line bg-paper p-[10px]"
                        >
                          <Link
                            href={`/tournages/${r.shoot.id}`}
                            className="flex flex-col gap-[2px] no-underline hover:no-underline"
                          >
                            <span className="clip text-micro text-ink-3">{r.clientName}</span>
                            <span className="clip text-base font-medium text-ink">
                              {r.shoot.title}
                            </span>
                            <span
                              className={`clip text-small tabular-nums ${
                                passé && étape !== "realise" ? "text-alert" : "text-ink-2"
                              }`}
                            >
                              {slotLabel(r.shoot.startsAt, r.shoot.endsAt)}
                            </span>
                            {r.shoot.place ? (
                              <span className="clip text-small text-ink-3">{r.shoot.place}</span>
                            ) : null}
                          </Link>

                          <span className="flex items-start gap-[6px]">
                            <Dot
                              tone={état.ready ? "ok" : "warn"}
                              solid
                              size={5}
                              className="mt-[5px]"
                            />
                            <span
                              className={`text-small leading-snug ${
                                état.ready ? "text-ok" : "text-warn"
                              }`}
                            >
                              {état.ready ? "Tout est prêt" : état.blocking.join(" · ")}
                            </span>
                          </span>

                          <span className="text-micro text-ink-3 tabular-nums">
                            {r.shotsDone}/{r.shots} plan{r.shots > 1 ? "s" : ""} ·{" "}
                            {r.crew} personne{r.crew > 1 ? "s" : ""} · {r.gearReserved}/
                            {r.gearTotal} matériel
                          </span>

                          {suivante ? (
                            <form action={updateShoot}>
                              <input type="hidden" name="id" value={r.shoot.id} />
                              <input type="hidden" name="status" value={suivante} />
                              {/* Le lieu et la note sont réécrits par l'action :
                                  sans eux dans le formulaire, avancer d'une
                                  étape depuis le tableau les effacerait. */}
                              <input type="hidden" name="place" value={r.shoot.place ?? ""} />
                              <input type="hidden" name="note" value={r.shoot.note ?? ""} />
                              <button
                                type="submit"
                                className="w-full cursor-pointer rounded-control border border-line bg-paper px-2 py-1 text-small font-medium text-ink-2 hover:border-line-strong hover:text-ink"
                              >
                                → {SHOOT_STATUS[suivante].label}
                              </button>
                            </form>
                          ) : null}
                        </div>
                      );
                    })}

                    {cartes.length === 0 ? (
                      <p className="rounded-card border border-dashed border-line p-3 text-small leading-snug text-ink-3">
                        {étape === "annule"
                          ? "Aucun tournage annulé."
                          : "Aucun tournage à cette étape."}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * L'étape d'après, dans l'ordre naturel.
 *
 * « Annulé » n'a pas de suite et ne suit rien : une annulation se décide depuis
 * la fiche, pas en avançant d'un cran par mégarde depuis le tableau.
 */
function étapeSuivante(étape: ShootStatus): ShootStatus | null {
  const ordre: ShootStatus[] = ["preparation", "a_securiser", "confirme", "realise"];
  const i = ordre.indexOf(étape);
  if (i === -1 || i === ordre.length - 1) return null;
  return ordre[i + 1];
}
