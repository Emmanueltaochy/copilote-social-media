"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/Screen";
import { Button, Chip } from "@/components/ui/Button";
import { Dot, Eyebrow, MediaSlot, StatusPill } from "@/components/ui/primitives";
import { CALENDAR, CELL_COUNT, LEADING_BLANKS, WEEK_DAYS, type CalendarEntry } from "@/data/calendar";
import { CONTENT_STATUS, NETWORK_NAME } from "@/data/content";
import { cn } from "@/lib/cn";
import { MONTH_DAYS, TODAY } from "@/lib/pacing";
import { useApp } from "@/state/app";

const VIEWS = ["Mois", "Semaine", "Liste"];

/** Only the states worth explaining sit in the legend. */
const LEGEND = ["done", "ready", "client", "prod", "missed"] as const;

export default function CalendarPage() {
  const { inScope, scopedShort } = useApp();
  const [view, setView] = useState("Mois");
  const [selected, setSelected] = useState<CalendarEntry | null>(null);

  const entries = CALENDAR.filter((c) => inScope(c.client));

  const cells = Array.from({ length: CELL_COUNT }, (_, i) => {
    const day = i - LEADING_BLANKS + 1;
    const inMonth = day >= 1 && day <= MONTH_DAYS;
    const items = inMonth ? entries.filter((e) => e.day === day) : [];
    return {
      key: i,
      // Neighbouring months keep their real numbers so the grid stays readable.
      num: inMonth ? day : day < 1 ? 31 + day : day - MONTH_DAYS,
      inMonth,
      isToday: day === TODAY,
      items,
    };
  });

  return (
    <>
      <PageHeader
        title="Calendrier éditorial"
        sub={`Août 2026 · ${entries.length} contenus · ${scopedShort ?? "tous les clients"}`}
        action="Nouveau contenu"
      />

      <div className="flex flex-none items-center justify-between gap-4 border-b border-line bg-paper px-5 py-2">
        <div className="flex items-center gap-[10px]">
          <div className="flex items-center overflow-hidden rounded-control border border-line">
            <button
              type="button"
              className="cursor-pointer border-r border-line bg-paper px-[10px] py-[6px] text-base text-ink-2 hover:bg-canvas hover:text-ink"
            >
              ‹
            </button>
            <span className="px-3 py-[6px] text-base font-medium">Août 2026</span>
            <button
              type="button"
              className="cursor-pointer border-l border-line bg-paper px-[10px] py-[6px] text-base text-ink-2 hover:bg-canvas hover:text-ink"
            >
              ›
            </button>
          </div>
          <Button>Aujourd&apos;hui</Button>
          <div className="ml-[6px] flex items-center gap-1">
            {VIEWS.map((v) => (
              <Chip key={v} active={view === v} onClick={() => setView(v)}>
                {v}
              </Chip>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-[14px]">
          <div className="flex flex-wrap items-center gap-3">
            {LEGEND.map((k) => (
              <span key={k} className="flex items-center gap-[6px]">
                <Dot tone={CONTENT_STATUS[k].tone} solid={CONTENT_STATUS[k].solidDot} />
                <span className="text-small text-ink-2">{CONTENT_STATUS[k].label}</span>
              </span>
            ))}
          </div>
          <span className="text-small text-ink-3 tabular-nums">
            {entries.length} contenus ce mois
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col overflow-auto px-5 pt-4 pb-5">
          {/* Hairlines come from the 1px gaps over a line-coloured background. */}
          <div className="flex flex-col gap-px overflow-hidden rounded-card border border-line bg-line">
            <div className="flex gap-px">
              {WEEK_DAYS.map((d) => (
                <div key={d} className="min-w-0 flex-1 bg-canvas px-[10px] py-2">
                  <Eyebrow tone="neutral">{d}</Eyebrow>
                </div>
              ))}
            </div>
            {[0, 1, 2, 3, 4, 5].map((w) => (
              <div key={w} className="flex items-stretch gap-px">
                {cells.slice(w * 7, w * 7 + 7).map((cell) => (
                  <div
                    key={cell.key}
                    className={cn(
                      "flex min-h-[132px] min-w-0 flex-1 flex-col gap-1 px-[7px] py-[6px]",
                      !cell.inMonth ? "bg-canvas" : cell.isToday ? "bg-gold-wash" : "bg-paper",
                    )}
                  >
                    <span className="flex items-center justify-between">
                      <span
                        className={cn(
                          "text-small tabular-nums",
                          cell.isToday
                            ? "font-semibold text-gold"
                            : cell.inMonth
                              ? "font-medium text-ink"
                              : "text-ink-3",
                        )}
                      >
                        {cell.num}
                      </span>
                      {cell.isToday ? <Eyebrow tone="gold">Aujourd&apos;hui</Eyebrow> : null}
                    </span>

                    {cell.items.slice(0, 2).map((item) => {
                      const st = CONTENT_STATUS[item.status];
                      return (
                        <button
                          key={item.title + item.time}
                          type="button"
                          onClick={() => setSelected(item)}
                          className={cn(
                            "flex w-full cursor-grab flex-col gap-px rounded-control border px-[6px] py-[5px] text-left hover:border-line-strong",
                            item.status === "missed"
                              ? "border-alert-line bg-alert-bg"
                              : "border-line bg-paper",
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-[5px]">
                            <Dot tone={st.tone} solid={st.solidDot} size={5} />
                            <span className="eyebrow tracking-[0.06em] text-ink-3">
                              {item.network}
                            </span>
                            <span className="ml-auto text-micro text-ink-3 tabular-nums">
                              {item.time}
                            </span>
                          </span>
                          <span
                            className={cn(
                              "clip text-small leading-tight font-medium",
                              item.status === "missed" ? "text-alert" : "text-ink",
                            )}
                          >
                            {item.title}
                          </span>
                          <span className="clip text-micro text-ink-3">{item.client}</span>
                        </button>
                      );
                    })}
                    {cell.items.length > 2 ? (
                      <span className="text-micro text-ink-3">
                        +{cell.items.length - 2} autres
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <span className="pt-[10px] text-small text-ink-3">
            Glisser-déposer une carte pour la reprogrammer. La date et l&apos;heure sont mises à
            jour et le client en est informé.
          </span>
        </div>

        {selected ? (
          <aside className="flex w-[344px] flex-none flex-col overflow-auto border-l border-line bg-paper">
            <div className="flex items-start justify-between gap-[10px] border-b border-line p-[14px]">
              <div className="flex min-w-0 flex-col gap-[2px]">
                <Eyebrow>{selected.client}</Eyebrow>
                <span className="text-lead font-medium">{selected.title}</span>
                <span className="text-small text-ink-3 tabular-nums">
                  {selected.day} août 2026 · {selected.time} · {NETWORK_NAME[selected.network]}
                </span>
              </div>
              <Button className="flex-none px-2 py-[5px]" onClick={() => setSelected(null)}>
                Fermer
              </Button>
            </div>
            <div className="flex flex-col gap-[14px] p-[14px]">
              <MediaSlot
                label={`Aperçu ${selected.format}`}
                ratio="4/5"
                className="rounded-card border"
              />
              <div className="flex flex-col gap-[6px]">
                <Eyebrow>Statut</Eyebrow>
                <span className="flex items-center gap-2">
                  <StatusPill tone={CONTENT_STATUS[selected.status].tone}>
                    {CONTENT_STATUS[selected.status].label}
                  </StatusPill>
                  <span className="text-small text-ink-3">
                    {selected.status === "client" ? "En attente du client" : "Kevin · graphiste"}
                  </span>
                </span>
              </div>
              <div className="flex flex-col gap-[6px]">
                <Eyebrow>Légende</Eyebrow>
                <p className="text-base text-pretty">
                  {selected.title.replace(/[«»]/g, "").trim()} — on met en avant l&apos;essentiel,
                  sans détour. Réservation et infos en bio.
                </p>
                <span className="text-small text-ink-3 tabular-nums">
                  218 / 2 200 caractères · 6 hashtags · Mis à jour il y a 2 jours par Léa
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <Link href="/contenu" className="no-underline hover:no-underline">
                  <Button variant="primary" size="md" className="w-full">
                    Ouvrir le contenu
                  </Button>
                </Link>
                <Button size="md">Reprogrammer</Button>
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </>
  );
}
