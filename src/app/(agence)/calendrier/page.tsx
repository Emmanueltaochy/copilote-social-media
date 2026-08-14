import Link from "next/link";
import { PageHeader } from "@/components/shell/Screen";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dot, Eyebrow } from "@/components/ui/primitives";
import { requireDepartment } from "@/lib/auth";
import { listClientsWithPace, listContentsForMonth, coversFor } from "@/db/queries";
import { monthLabel, monthPosition } from "@/lib/pacing";
import { cn } from "@/lib/cn";
import { Cover } from "@/components/ui/Cover";
import { CONTENT_KIND, CONTENT_STATUS } from "@/data/content";

const WEEK_DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

export default async function CalendrierPage() {
  await requireDepartment("social");
  const [clients, rows] = await Promise.all([listClientsWithPace(new Date(), "social"), listContentsForMonth()]);
  const covers = await coversFor(rows.map((r) => r.content.id));

  if (clients.length === 0) {
    return (
      <>
        <PageHeader title="Calendrier éditorial" sub={monthLabel()} />
        <EmptyState title="Rien à planifier" actionLabel="Ajouter un client" actionHref="/clients">
          Le calendrier affiche les contenus programmés du mois, un par créneau. Il faut
          d&apos;abord un client.
        </EmptyState>
      </>
    );
  }

  const now = new Date();
  const { day: today, daysInMonth } = monthPosition(now);
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  // getDay() : 0 = dimanche. La grille commence le lundi, d'où le décalage.
  const leading = (first.getDay() + 6) % 7;

  const cells = Array.from({ length: 42 }, (_, i) => {
    const dayNum = i - leading + 1;
    const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
    return {
      key: i,
      dayNum,
      inMonth,
      isToday: inMonth && dayNum === today,
      items: inMonth ? rows.filter((r) => r.content.scheduledAt?.getDate() === dayNum) : [],
    };
  });

  return (
    <>
      <PageHeader
        title="Calendrier éditorial"
        sub={`${monthLabel()} · ${rows.length} ${rows.length > 1 ? "contenus programmés" : "contenu programmé"}`}
      />

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-4 pb-5 lg:px-5">
        <div className="flex flex-col gap-px overflow-hidden rounded-card border border-line bg-line">
          <div className="flex gap-px">
            {WEEK_DAYS.map((d) => (
              <div key={d} className="min-w-0 flex-1 bg-canvas px-1 py-2 lg:px-[10px]">
                {/* Sur téléphone, sept colonnes ne laissent pas la place
                    d'écrire « mercredi » : le nom est coupé au milieu et se
                    lit moins bien que son abrégé. */}
                <Eyebrow tone="neutral" className="lg:hidden">
                  {d.slice(0, 3)}
                </Eyebrow>
                <Eyebrow tone="neutral" className="hidden lg:inline">
                  {d}
                </Eyebrow>
              </div>
            ))}
          </div>
          {[0, 1, 2, 3, 4, 5].map((w) => (
            <div key={w} className="flex items-stretch gap-px">
              {cells.slice(w * 7, w * 7 + 7).map((cell) => (
                <div
                  key={cell.key}
                  className={cn(
                    "flex min-h-[70px] min-w-0 flex-1 flex-col gap-1 px-1 py-[6px] lg:min-h-[120px] lg:px-[7px]",
                    !cell.inMonth ? "bg-canvas" : cell.isToday ? "bg-gold-wash" : "bg-paper",
                  )}
                >
                  {cell.inMonth ? (
                    <span className="flex items-center justify-between">
                      <span
                        className={cn(
                          "text-small tabular-nums",
                          cell.isToday ? "font-semibold text-gold" : "font-medium text-ink",
                        )}
                      >
                        {cell.dayNum}
                      </span>
                      {cell.isToday ? (
                        <Eyebrow tone="gold" className="hidden sm:inline">
                          Aujourd&apos;hui
                        </Eyebrow>
                      ) : null}
                    </span>
                  ) : null}

                  {cell.items.map(({ content, clientName }) => {
                    const st = CONTENT_STATUS[content.status];
                    return (
                      <Link
                        key={content.id}
                        href={`/contenu/${content.id}`}
                        className="flex w-full gap-[6px] rounded-control border border-line bg-paper px-[6px] py-[5px] no-underline hover:border-line-strong hover:no-underline"
                      >
                        {/* Une vignette carrée de 28 px : assez pour reconnaître
                            un visuel qu'on a déjà vu, assez petite pour qu'une
                            journée chargée tienne encore dans sa case. */}
                        <Cover asset={covers.get(content.id)} ratio="1/1" className="w-7 flex-none" />
                        <span className="flex min-w-0 flex-1 flex-col gap-px">
                          <span className="flex min-w-0 items-center gap-[5px]">
                            <Dot tone={st.tone} solid={st.solidDot} size={5} />
                            <span className="ml-auto text-micro text-ink-3 tabular-nums">
                              {content.scheduledAt?.toLocaleTimeString("fr-FR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </span>
                          <span className="clip text-small leading-tight font-medium text-ink">
                            {content.title}
                          </span>
                          <span className="clip text-micro text-ink-3">
                            {clientName} · {CONTENT_KIND[content.kind] ?? content.kind}
                          </span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>

        {rows.length === 0 ? (
          <p className="pt-4 text-base text-ink-2">
            Aucun contenu programmé ce mois-ci. Les contenus créés depuis le pipeline apparaîtront
            ici à leur date de publication.
          </p>
        ) : null}
      </div>
    </>
  );
}
