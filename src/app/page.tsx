"use client";

import Link from "next/link";
import { useState } from "react";
import { EngagementPanel } from "@/components/EngagementPanel";
import { PageHeader } from "@/components/shell/Screen";
import { Button, Chip } from "@/components/ui/Button";
import { Card, CardHead } from "@/components/ui/Card";
import { PacingBar } from "@/components/ui/PacingBar";
import { Dot, Eyebrow, StatusPill } from "@/components/ui/primitives";
import { Num, TableHead, TableRow, Th } from "@/components/ui/Table";
import {
  ADS_ALERTS,
  ALERTS,
  APPROVALS_SUMMARY,
  QUEUE,
  SHOOTS_SUMMARY,
  STALE_DATA,
} from "@/data/cockpit";
import { byUrgency, MY_ACCOUNTS, PACED_CLIENTS, type PacedClient } from "@/data/clients";
import { RATIO } from "@/lib/pacing";
import { cn } from "@/lib/cn";
import { toneText } from "@/lib/tone";
import { useApp } from "@/state/app";

const COLS = "190px minmax(80px,1fr) 132px 96px 136px";

type Filter = "all" | "late" | "mine";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "late", label: "À traiter" },
  { key: "mine", label: "Mes comptes" },
];

export default function CockpitPage() {
  const { inScope } = useApp();
  const [filter, setFilter] = useState<Filter>("all");
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<PacedClient | null>(null);

  let rows = byUrgency(PACED_CLIENTS).filter((c) => inScope(c.short));
  if (filter === "late") rows = rows.filter((c) => c.pace.key === "late" || c.pace.key === "risk");
  if (filter === "mine") rows = rows.filter((c) => MY_ACCOUNTS.includes(c.name));
  const visible = showAll ? rows : rows.slice(0, 9);

  return (
    <>
      <PageHeader
        title="Cockpit agence"
        sub="Mardi 25 août 2026 · jour 25 sur 31 · 13 clients actifs"
        action="Nouveau contenu"
      />

      {/* Counts first: what needs a decision today, before any table. */}
      <div className="flex flex-none items-stretch overflow-x-auto border-b border-line bg-paper px-5">
        {ALERTS.map((a) => {
          const body = (
            <>
              <span
                className={cn(
                  "text-title leading-tight font-semibold tabular-nums",
                  toneText[a.tone],
                )}
              >
                {a.n}
              </span>
              <span className="max-w-[150px] text-small leading-tight text-ink-2">{a.label}</span>
            </>
          );
          const shared =
            "mr-[18px] flex flex-none cursor-pointer items-center gap-[10px] border-r border-line py-[10px] pr-[18px] text-left hover:opacity-70";
          return a.filter ? (
            <button key={a.label} type="button" onClick={() => setFilter("late")} className={shared}>
              {body}
            </button>
          ) : (
            <Link key={a.label} href={a.href} className={cn(shared, "no-underline hover:no-underline")}>
              {body}
            </Link>
          );
        })}
        <div className="ml-auto flex flex-none items-center gap-2 pl-[18px]">
          <Eyebrow>Vue</Eyebrow>
          {FILTERS.map((f) => (
            <Chip key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
            </Chip>
          ))}
        </div>
      </div>

      <div
        className="grid min-h-0 flex-1 items-start gap-4 overflow-auto px-5 pt-4 pb-7"
        style={{ gridTemplateColumns: "minmax(740px,1fr) 372px" }}
      >
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="min-w-[740px]">
            <CardHead
              title="Pilotage des engagements · trié par urgence"
              meta="Le repère or marque le rythme attendu au 25 août"
            />
            <TableHead cols={COLS} sticky>
              <Th>Client</Th>
              <Th>Avancement du mois</Th>
              <Th>Réalisé / attendu</Th>
              <Th align="right">Écart</Th>
              <Th align="right">État</Th>
            </TableHead>
            {visible.map((c) => (
              <TableRow
                key={c.name}
                cols={COLS}
                onClick={() => setSelected(c)}
                className={selected?.name === c.name ? "bg-gold-wash" : "bg-paper"}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Dot tone={c.pace.tone} />
                  <span className="clip text-base font-medium">{c.name}</span>
                </span>
                <PacingBar
                  className="min-w-[60px]"
                  fillPct={c.pace.fillPct}
                  projPct={c.pace.projPct}
                  markerLeft={c.pace.markerLeft}
                />
                <span className="text-base text-ink-2 tabular-nums">{c.pace.doneLabel}</span>
                <Num className={cn("font-medium", toneText[c.pace.tone])}>
                  {c.pace.deltaLabel}
                </Num>
                <span className="flex justify-end">
                  <StatusPill tone={c.pace.tone}>{c.pace.label}</StatusPill>
                </span>
              </TableRow>
            ))}
            <div className="flex items-center justify-between px-[14px] py-[10px]">
              <Button variant="link" onClick={() => setShowAll((s) => !s)}>
                {showAll ? "Réduire à 9 clients" : `Voir les ${rows.length} clients`}
              </Button>
              <span className="text-small text-ink-3 tabular-nums">
                Barre grise claire = projection au rythme actuel en fin de mois
              </span>
            </div>
          </Card>

          <Card>
            <CardHead title="À publier aujourd'hui">
              <div className="flex items-center gap-[10px]">
                <span className="text-small text-ink-2 tabular-nums">
                  1 publié · 1 en retard · 3 à venir
                </span>
                <Button className="px-[9px] py-[5px]">Ouvrir la file</Button>
              </div>
            </CardHead>
            {QUEUE.map((q) => (
              <TableRow
                key={q.time + q.title}
                cols="52px 30px 1fr 150px 140px"
                className={q.status === "overdue" ? "bg-alert-wash" : "bg-paper"}
              >
                <span
                  className={cn(
                    "text-base font-medium tabular-nums",
                    q.status === "overdue"
                      ? "text-alert"
                      : q.status === "published"
                        ? "text-ink-3"
                        : "text-ink",
                  )}
                >
                  {q.time}
                </span>
                <span className="flex h-[30px] w-[30px] items-center justify-center rounded-control border border-line bg-slot text-micro font-semibold text-ink-3">
                  {q.kind}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="clip text-base font-medium">{q.title}</span>
                  <span className="clip text-small text-ink-3">{q.meta}</span>
                </span>
                <span
                  className={cn(
                    "text-small font-medium tabular-nums",
                    q.status === "overdue"
                      ? "text-alert"
                      : q.status === "published"
                        ? "text-ok"
                        : "text-ink-2",
                  )}
                >
                  {q.state}
                </span>
                <span className="flex justify-end gap-[6px]">
                  <Button className="px-2 py-[5px]">Copier</Button>
                  <Button
                    variant={q.status === "overdue" ? "primary" : "secondary"}
                    className="px-2 py-[5px]"
                  >
                    {q.action}
                  </Button>
                </span>
              </TableRow>
            ))}
            <div className="flex items-center gap-2 px-[14px] py-[10px]">
              <span className="text-small text-ink-3">
                Un contenu non publié à H+2 bascule en alerte et remonte ici.
              </span>
            </div>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHead title="Approbations en attente" meta="6" />
            {APPROVALS_SUMMARY.map((a) => (
              <Link
                key={a.title}
                href="/approbations"
                className="flex items-center gap-[10px] border-b border-line px-[14px] py-[10px] no-underline hover:bg-canvas hover:no-underline"
              >
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-control border border-line bg-slot text-micro font-semibold text-ink-3">
                  {a.kind}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="clip text-base font-medium text-ink">{a.title}</span>
                  <span className="clip text-small text-ink-3">{a.meta}</span>
                </span>
                <span
                  className={cn(
                    "flex-none text-small font-medium tabular-nums",
                    a.old ? "text-alert" : "text-ink-3",
                  )}
                >
                  {a.age}
                </span>
              </Link>
            ))}
            <div className="px-[14px] py-[10px]">
              <span className="text-small text-ink-2">
                2 validations client dépassent 5 jours. <a href="#relance">Relancer les deux clients</a>
              </span>
            </div>
          </Card>

          <Card>
            <CardHead title="Tournages · 7 prochains jours" meta="4" />
            {SHOOTS_SUMMARY.map((s) => (
              <div
                key={s.client}
                className="flex flex-col gap-[2px] border-b border-line px-[14px] py-[10px]"
              >
                <span className="flex items-baseline justify-between gap-[10px]">
                  <span className="text-base font-medium">{s.client}</span>
                  <span className="text-small whitespace-nowrap text-ink-2 tabular-nums">
                    {s.when}
                  </span>
                </span>
                <span className="text-small text-ink-3">{s.place}</span>
                <span className={cn("text-small font-medium", toneText[s.tone])}>{s.note}</span>
              </div>
            ))}
          </Card>

          <Card>
            <CardHead title="Alertes ads" meta="3" />
            {ADS_ALERTS.map((d) => (
              <div
                key={d.title}
                className="flex flex-col gap-[6px] border-b border-line px-[14px] py-[10px]"
              >
                <span className="flex items-baseline justify-between gap-[10px]">
                  <span className="clip text-base font-medium">{d.title}</span>
                  <span
                    className={cn(
                      "text-small font-medium whitespace-nowrap tabular-nums",
                      toneText[d.tone],
                    )}
                  >
                    {d.value}
                  </span>
                </span>
                {/* Budget uses the same marker as content pacing — one mental model. */}
                <PacingBar
                  size="sm"
                  fillPct={d.spentPct}
                  markerLeft={`${(RATIO * 100).toFixed(1)}%`}
                />
                <span className="text-small text-ink-3 tabular-nums">{d.meta}</span>
              </div>
            ))}
          </Card>

          <Card>
            <CardHead title="Données à rafraîchir">
              <Button className="px-[9px] py-[5px]">Saisir les chiffres</Button>
            </CardHead>
            {STALE_DATA.map((s) => (
              <div
                key={s.label}
                className="flex h-10 items-center justify-between gap-[10px] border-b border-line px-[14px]"
              >
                <span className="clip text-base">{s.label}</span>
                <span
                  className={cn("text-small whitespace-nowrap tabular-nums", toneText[s.tone])}
                >
                  {s.age}
                </span>
              </div>
            ))}
          </Card>
        </div>
      </div>

      {selected ? (
        <EngagementPanel client={selected} onClose={() => setSelected(null)} />
      ) : null}
    </>
  );
}
