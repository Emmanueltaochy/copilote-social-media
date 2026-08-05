"use client";

import { useState } from "react";
import { PageHeader, Toolbar } from "@/components/shell/Screen";
import { Chip } from "@/components/ui/Button";
import { Card, CardHead } from "@/components/ui/Card";
import { PacingBar } from "@/components/ui/PacingBar";
import { Dot, Eyebrow, StatusPill } from "@/components/ui/primitives";
import { Num, TableHead, TableRow, Th } from "@/components/ui/Table";
import { BRANDS, margin } from "@/data/brands";
import { WORKLOAD, ARBITRATIONS } from "@/data/workload";
import { cn } from "@/lib/cn";
import { pct } from "@/lib/pacing";
import { toneText, type Tone } from "@/lib/tone";

const COLS = "190px minmax(140px,1fr) 100px 116px 104px 92px 128px";
const SORTS = ["Marge", "Dépassement", "Forfait"] as const;
type Sort = (typeof SORTS)[number];

type Row = {
  name: string;
  fee: number;
  cost: number;
  hours: number;
  sold: number;
  margin: number | null;
  state: string;
  tone: Tone;
};

/**
 * A retainer is healthy when the hours consumed stay under the hours sold and
 * the margin holds. Both can fail independently, so the state names which.
 */
function classify(r: Omit<Row, "state" | "tone">): { state: string; tone: Tone } {
  if (r.margin === null) return { state: "Compte interne", tone: "muted" };
  if (r.margin < 15) return { state: "Marge critique", tone: "alert" };
  if (r.hours > r.sold) return { state: "Forfait dépassé", tone: "warn" };
  if (r.margin < 35) return { state: "Marge correcte", tone: "neutral" };
  return { state: "Bonne marge", tone: "ok" };
}

const ROWS: Row[] = Object.entries(BRANDS).map(([name, b]) => {
  const base = {
    name,
    fee: b.feeAmount,
    cost: b.cost,
    hours: b.hours,
    sold: b.sold,
    margin: margin(b),
  };
  return { ...base, ...classify(base) };
});

const TOTAL_FEE = ROWS.reduce((n, r) => n + r.fee, 0);
const TOTAL_COST = ROWS.reduce((n, r) => n + r.cost, 0);
const TOTAL_HOURS = ROWS.reduce((n, r) => n + r.hours, 0);
const TOTAL_SOLD = ROWS.reduce((n, r) => n + r.sold, 0);
const OVER_COUNT = ROWS.filter((r) => r.hours > r.sold).length;

export default function ProfitabilityPage() {
  const [sort, setSort] = useState<Sort>("Marge");

  const rows = [...ROWS].sort((a, b) => {
    if (sort === "Marge") return (a.margin ?? 999) - (b.margin ?? 999);
    if (sort === "Dépassement") return b.hours - b.sold - (a.hours - a.sold);
    return b.fee - a.fee;
  });

  return (
    <>
      <PageHeader
        title="Rentabilité"
        sub="Heures consommées contre forfait vendu · août 2026"
        action="Exporter le tableau"
      />

      <Toolbar
        minWidth={1060}
        right={
          <span className="flex-none text-small whitespace-nowrap text-ink-3 tabular-nums">
            Heures relevées jusqu&apos;au 25 août · saisie hebdomadaire
          </span>
        }
      >
        <Eyebrow className="whitespace-nowrap">Trier par</Eyebrow>
        {SORTS.map((s) => (
          <Chip key={s} active={sort === s} onClick={() => setSort(s)}>
            {s}
          </Chip>
        ))}
      </Toolbar>

      <div className="flex min-h-0 min-w-[1060px] flex-1 flex-col gap-4 overflow-auto px-5 pt-4 pb-6">
        <Card>
          <div className="grid grid-cols-5 gap-px bg-line">
            {[
              {
                label: "Facturé ce mois",
                value: `${TOTAL_FEE.toLocaleString("fr-FR")} €`,
                meta: "12 comptes facturés sur 13",
                tone: "ink" as Tone,
              },
              {
                label: "Coût interne",
                value: `${TOTAL_COST.toLocaleString("fr-FR")} €`,
                meta: `${TOTAL_HOURS} h à 60 € en moyenne`,
                tone: "ink" as Tone,
              },
              {
                label: "Marge brute",
                value: `${Math.round(((TOTAL_FEE - TOTAL_COST) / TOTAL_FEE) * 100)} %`,
                meta: `${(TOTAL_FEE - TOTAL_COST).toLocaleString("fr-FR")} € de marge`,
                tone: "ok" as Tone,
              },
              {
                label: "Heures vendues",
                value: `${TOTAL_SOLD} h`,
                meta: `${TOTAL_HOURS} h consommées à ce jour`,
                tone: TOTAL_HOURS > TOTAL_SOLD ? ("warn" as Tone) : ("ink" as Tone),
              },
              {
                label: "Comptes en dépassement",
                value: String(OVER_COUNT),
                meta: OVER_COUNT > 0 ? "à arbitrer avant septembre" : "aucun dépassement",
                tone: OVER_COUNT > 0 ? ("alert" as Tone) : ("ok" as Tone),
              },
            ].map((k) => (
              <div key={k.label} className="flex flex-col gap-[3px] bg-paper px-4 py-[14px]">
                <Eyebrow>{k.label}</Eyebrow>
                <span className={cn("text-display font-semibold tabular-nums", toneText[k.tone])}>
                  {k.value}
                </span>
                <span className="text-small text-ink-3">{k.meta}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHead
            title="Rentabilité par client"
            meta="Le repère or marque les heures vendues · le remplissage, les heures consommées"
          />
          <TableHead cols={COLS} sticky>
            <Th>Client</Th>
            <Th>Heures / forfait</Th>
            <Th align="right">Consommé</Th>
            <Th align="right">Forfait</Th>
            <Th align="right">Coût</Th>
            <Th align="right">Marge</Th>
            <Th align="right">État</Th>
          </TableHead>
          {rows.map((r) => {
            const max = Math.max(r.hours, r.sold, 1);
            return (
              <TableRow key={r.name} cols={COLS}>
                <span className="flex min-w-0 items-center gap-2">
                  <Dot tone={r.tone} solid={r.tone !== "neutral" && r.tone !== "muted"} />
                  <span className="clip text-base font-medium">{r.name}</span>
                </span>
                <PacingBar
                  fillPct={pct(r.hours / max)}
                  fillClass={r.hours > r.sold ? "bg-warn" : "bg-ink-2"}
                  markerLeft={`calc(${((r.sold / max) * 100).toFixed(1)}% - 1.5px)`}
                />
                <Num>{r.hours} h</Num>
                <Num>{r.fee > 0 ? `${r.fee.toLocaleString("fr-FR")} €` : "Interne"}</Num>
                <Num>{r.cost.toLocaleString("fr-FR")} €</Num>
                <Num
                  className={cn(
                    r.margin === null
                      ? "text-ink-3"
                      : r.margin < 15
                        ? "text-alert"
                        : r.margin < 30
                          ? "text-warn"
                          : "text-ink",
                  )}
                >
                  {r.margin === null ? "—" : `${r.margin} %`}
                </Num>
                <span className="flex justify-end">
                  <StatusPill tone={r.tone}>{r.state}</StatusPill>
                </span>
              </TableRow>
            );
          })}
          <div className="px-[14px] py-[10px]">
            <span className={cn("text-small", OVER_COUNT > 0 ? "text-warn" : "text-ok")}>
              {OVER_COUNT > 0
                ? `${OVER_COUNT} comptes dépassent leurs heures vendues. Swap'Îles pèse 17 h de trop pour le plus petit forfait du portefeuille.`
                : "Aucun compte ne dépasse ses heures vendues ce mois."}
            </span>
          </div>
        </Card>

        <div className="grid grid-cols-2 items-start gap-4">
          <Card>
            <CardHead title="Charge de l'équipe" />
            {WORKLOAD.map((w) => (
              <div
                key={w.name}
                className="grid h-11 items-center gap-3 border-b border-line px-[14px]"
                style={{ gridTemplateColumns: "24px 90px minmax(80px,1fr) 110px" }}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-line bg-slot text-micro font-semibold text-ink-2">
                  {w.initial}
                </span>
                <span className="text-base font-medium">{w.name}</span>
                <PacingBar
                  size="sm"
                  fillPct={w.pct}
                  fillClass={w.tone === "warn" ? "bg-warn" : "bg-ink-2"}
                  markerLeft="calc(100% - 1px)"
                />
                <Num className={toneText[w.tone]}>{w.label}</Num>
              </div>
            ))}
            <div className="px-[14px] py-[10px]">
              <span className="text-small text-ink-3">
                Le repère marque la charge attendue au 25 août sur un mois plein.
              </span>
            </div>
          </Card>

          {/* Numbers are only useful if they end in a decision. */}
          <Card>
            <CardHead title="Arbitrages proposés" />
            {ARBITRATIONS.map((a) => (
              <div
                key={a.subject}
                className="flex flex-col gap-[3px] border-b border-line px-[14px] py-[10px]"
              >
                <span className="flex items-baseline justify-between gap-[10px]">
                  <span className="text-base font-medium">{a.subject}</span>
                  <span
                    className={cn(
                      "text-small font-medium whitespace-nowrap",
                      toneText[a.tone],
                    )}
                  >
                    {a.impact}
                  </span>
                </span>
                <span className="text-base leading-relaxed text-ink-2 text-pretty">{a.text}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </>
  );
}
