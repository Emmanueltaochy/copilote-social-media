"use client";

import { useState } from "react";
import { PageHeader, Toolbar } from "@/components/shell/Screen";
import { Button, Chip } from "@/components/ui/Button";
import { Card, CardHead, Kpi, KpiGrid } from "@/components/ui/Card";
import { PacingBar } from "@/components/ui/PacingBar";
import { Eyebrow, StatusPill } from "@/components/ui/primitives";
import { Num, TableHead, TableRow, Th } from "@/components/ui/Table";
import { findClient } from "@/data/clients";
import { cn } from "@/lib/cn";
import { fr, gapTone, MONTH_DAYS, pct, RATIO, signedPct, TODAY } from "@/lib/pacing";
import { toneText } from "@/lib/tone";

const TABS = ["Cap Marine", "Swap'Îles", "Centrakor", "AC Gym"];

/** Contract mix for the line-by-line breakdown. */
const MIX: [string, number][] = [
  ["Posts feed", 0.38],
  ["Stories", 0.25],
  ["Reels", 0.19],
  ["Carrousels", 0.18],
];

const COLS = "180px minmax(160px,1fr) 84px 84px 84px 120px";
const MARKER = `calc(${(RATIO * 100).toFixed(1)}% - 1.5px)`;

const HISTORY = [
  { month: "Mars", pct: "100%", value: "16 / 16", tone: "ok" as const },
  { month: "Avril", pct: "94%", value: "15 / 16", tone: "neutral" as const },
  { month: "Mai", pct: "100%", value: "16 / 16", tone: "ok" as const },
  { month: "Juin", pct: "81%", value: "13 / 16", tone: "warn" as const },
  { month: "Juillet", pct: "88%", value: "14 / 16", tone: "neutral" as const },
];

export default function ProgressPage() {
  const [name, setName] = useState("Cap Marine");
  const client = findClient(name);
  const { pace } = client;

  const lines = MIX.map(([label, weight]) => {
    const target = Math.max(1, Math.round(client.target * weight));
    const done = Math.min(target, Math.round(client.done * weight));
    const expected = target * RATIO;
    const gapPct = Math.round(((done - expected) / expected) * 100);
    const projected = Math.min(target, Math.round((done / TODAY) * MONTH_DAYS));
    return {
      label,
      done: String(done),
      expected: fr(expected, 1),
      delta: signedPct(gapPct),
      tone: gapTone(gapPct),
      fillPct: pct(done / target),
      projPct: pct(projected / target),
      projection: `${projected} / ${target}`,
      projTone:
        projected >= target ? ("ok" as const) : projected >= target - 1 ? ("neutral" as const) : ("warn" as const),
    };
  });

  lines.push({
    label: "Shootings",
    done: "1",
    expected: fr(2 * RATIO, 1),
    delta: "−38 %",
    tone: "alert",
    fillPct: "50.0%",
    projPct: "50.0%",
    projection: "1 / 2",
    projTone: "warn",
  });
  lines.push({
    label: "Campagnes ads",
    done: "1",
    expected: "0,8",
    delta: "+24 %",
    tone: "neutral",
    fillPct: "100.0%",
    projPct: "100.0%",
    projection: "1 / 1",
    projTone: "ok",
  });

  const onTrack = pace.projected >= client.target;

  return (
    <>
      <PageHeader
        title="Suivi d'avancement"
        sub="Le mois détaillé, ligne par ligne · projection de fin de mois"
        action="Planifier un rattrapage"
      />

      <Toolbar
        right={
          <span className="flex-none text-small whitespace-nowrap text-ink-3 tabular-nums">
            Août 2026 · jour 25 sur 31 · 81 % du mois écoulé
          </span>
        }
      >
        <Eyebrow className="whitespace-nowrap">Client</Eyebrow>
        {TABS.map((t) => (
          <Chip key={t} active={name === t} onClick={() => setName(t)}>
            {t}
          </Chip>
        ))}
      </Toolbar>

      <div className="flex min-h-0 flex-1 items-start justify-start overflow-auto px-5 pt-4 pb-6">
        <div className="mx-auto flex w-full max-w-[1100px] min-w-[820px] flex-col gap-4">
          <Card className="flex flex-col gap-4 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-[2px]">
                <Eyebrow>Engagement contractuel du mois</Eyebrow>
                <span className="text-display font-semibold tracking-[-0.01em]">
                  {client.short}
                </span>
                <span className="text-base text-ink-2">
                  Forfait {client.target} contenus par mois · cheffe de projet Léa · contrat
                  renouvelé en janvier 2026
                </span>
              </div>
              <StatusPill tone={pace.tone} className="px-[10px] py-1">
                {pace.label}
              </StatusPill>
            </div>

            <PacingBar
              size="lg"
              fillPct={pace.fillPct}
              projPct={pace.projPct}
              markerLeft={pace.markerLeft}
              markerLabel={`Attendu aujourd'hui · ${fr(pace.expected, 1)}`}
            />

            <KpiGrid columns={4}>
              <Kpi
                label="Réalisé"
                value={`${client.done} / ${client.target}`}
                meta="contenus publiés ce mois"
              />
              <Kpi
                label="Attendu à date"
                value={fr(pace.expected, 1)}
                meta="au rythme contractuel"
              />
              <Kpi
                label="Écart"
                value={pace.deltaLabel}
                valueTone={pace.tone}
                meta={pace.diffLabel}
              />
              <Kpi
                label="Projection fin de mois"
                value={`${pace.projected} / ${client.target}`}
                valueTone={onTrack ? "ok" : "warn"}
                meta={onTrack ? "engagement tenu" : "engagement non tenu au rythme actuel"}
              />
            </KpiGrid>
          </Card>

          <Card>
            <CardHead
              title="Engagement ligne par ligne"
              meta="Le repère or marque le rythme attendu au 25 août"
            />
            <TableHead cols={COLS} sticky>
              <Th>Ligne du contrat</Th>
              <Th>Avancement</Th>
              <Th align="right">Réalisé</Th>
              <Th align="right">Attendu</Th>
              <Th align="right">Écart</Th>
              <Th align="right">Fin de mois</Th>
            </TableHead>
            {lines.map((l) => (
              <TableRow key={l.label} cols={COLS}>
                <span className="clip text-base font-medium">{l.label}</span>
                <PacingBar fillPct={l.fillPct} projPct={l.projPct} markerLeft={MARKER} />
                <Num className="font-medium">{l.done}</Num>
                <Num className="text-ink-2">{l.expected}</Num>
                <Num className={cn("font-medium", toneText[l.tone])}>{l.delta}</Num>
                <Num className={toneText[l.projTone]}>{l.projection}</Num>
              </TableRow>
            ))}
            <div className="flex items-center justify-between gap-3 px-[14px] py-[10px]">
              <span className="text-small text-ink-2">
                {onTrack
                  ? "Au rythme actuel, l'engagement du mois est tenu."
                  : `Au rythme actuel, ${client.short} termine à ${pace.projected} contenus sur ${client.target}. Il faut publier ${Math.max(
                      1,
                      Math.ceil((client.target - client.done) / 6),
                    )} contenus par jour sur les 6 jours restants.`}
              </span>
              <Button>Planifier un rattrapage</Button>
            </div>
          </Card>

          <div className="grid grid-cols-2 items-start gap-4">
            <Card>
              <CardHead title="Ce qui bloque le rattrapage" />
              {client.blockers.map((b) => (
                <div
                  key={b.label}
                  className="flex h-11 items-center justify-between gap-[10px] border-b border-line px-[14px]"
                >
                  <span className="clip text-base">{b.label}</span>
                  <span
                    className={cn(
                      "text-small font-medium whitespace-nowrap",
                      toneText[b.tone],
                    )}
                  >
                    {b.value}
                  </span>
                </div>
              ))}
            </Card>

            <Card>
              <CardHead title="Historique des six derniers mois" />
              {[
                ...HISTORY,
                {
                  month: "Août",
                  pct: pace.fillPct,
                  value: `${client.done} / ${client.target}`,
                  tone: pace.tone,
                },
              ].map((m) => (
                <div
                  key={m.month}
                  className="grid h-10 items-center gap-3 border-b border-line px-[14px]"
                  style={{ gridTemplateColumns: "80px minmax(80px,1fr) 96px" }}
                >
                  <span className="text-base text-ink-2">{m.month}</span>
                  {/* Past months are measured against the full month, so the
                      marker sits at 100% rather than at today's rhythm. */}
                  <PacingBar size="sm" fillPct={m.pct} markerLeft="calc(100% - 1px)" />
                  <Num className={toneText[m.tone]}>{m.value}</Num>
                </div>
              ))}
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
