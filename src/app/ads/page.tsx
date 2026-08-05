"use client";

import { useState } from "react";
import { PageHeader, Toolbar } from "@/components/shell/Screen";
import { Button, Chip } from "@/components/ui/Button";
import { Card, CardHead, KpiGrid } from "@/components/ui/Card";
import { PacingBar } from "@/components/ui/PacingBar";
import { Dot, Eyebrow, StatusPill } from "@/components/ui/primitives";
import { Num, TableHead, TableRow, Th } from "@/components/ui/Table";
import { CAMPAIGNS } from "@/data/campaigns";
import { cn } from "@/lib/cn";
import { euro, MONTH_DAYS, pct, RATIO, TODAY } from "@/lib/pacing";
import { toneText } from "@/lib/tone";
import { useApp } from "@/state/app";

const SET_COLS =
  "minmax(220px,1fr) 110px 130px 110px 100px 110px 120px";
const METRIC_COLS = "minmax(200px,1fr) repeat(5,110px)";
const MARKER = `calc(${(RATIO * 100).toFixed(1)}% - 2px)`;

export default function AdsPage() {
  const { inScope } = useApp();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [entering, setEntering] = useState(false);

  const list = CAMPAIGNS.filter((c) => inScope(c.client));
  const ad = list.find((c) => c.id === selectedId) ?? list[0] ?? CAMPAIGNS[0];

  // Budget is paced exactly like content volume: expected-to-date vs. actual.
  const expectedSpend = ad.budget * RATIO;
  const projectedSpend = Math.min(ad.budget * 1.2, (ad.spent / TODAY) * MONTH_DAYS);
  const spendGap = (ad.spent - expectedSpend) / expectedSpend;

  const pacingTone = spendGap > 0.1 ? "warn" : spendGap < -0.25 ? "alert" : "neutral";
  const pacingVerdict =
    spendGap > 0.1
      ? "Le budget part plus vite que le mois : épuisé vers le 27 août si le rythme continue."
      : spendGap < -0.25
        ? `Sous-consommation de ${euro(expectedSpend - ad.spent)} : au rythme actuel, ${euro(
            ad.budget - projectedSpend,
          )} ne seront pas dépensés.`
        : "Consommation conforme au rythme attendu.";

  return (
    <>
      <PageHeader
        title="Campagnes ads"
        sub="7 campagnes actives · 3 alertes · budget total 8 900 € ce mois"
        action="Nouvelle campagne"
      />

      <Toolbar
        minWidth={1020}
        right={
          <span
            className={cn(
              "flex-none text-small whitespace-nowrap tabular-nums",
              toneText[ad.freshnessTone],
            )}
          >
            {ad.freshness}
          </span>
        }
      >
        <Eyebrow className="whitespace-nowrap">Campagne</Eyebrow>
        {list.map((c) => (
          <Chip
            key={c.id}
            active={ad.id === c.id}
            onClick={() => setSelectedId(c.id)}
            className="flex items-center gap-[6px]"
          >
            <Dot tone={c.dotTone} solid size={5} />
            <span>
              {c.client} · {c.name}
            </span>
          </Chip>
        ))}
      </Toolbar>

      <div className="flex min-h-0 min-w-[1020px] flex-1 flex-col gap-4 overflow-auto px-5 pt-4 pb-6">
        <Card className="flex flex-col gap-[14px] p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-[2px]">
              <Eyebrow>
                {ad.platform} · {ad.client}
              </Eyebrow>
              <span className="text-title font-semibold">{ad.name}</span>
              <span className="text-base text-ink-2">{ad.period}</span>
            </div>
            <div className="flex flex-none items-center gap-2">
              <StatusPill tone={ad.statusTone}>{ad.status}</StatusPill>
              <Chip active={entering} onClick={() => setEntering((e) => !e)}>
                Saisir les chiffres
              </Chip>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <Eyebrow>Pacing budget</Eyebrow>
              <span className="text-base text-ink-2 tabular-nums">
                {euro(ad.spent)} dépensés sur {euro(ad.budget)} · 6 jours restants
              </span>
            </div>
            <PacingBar
              size="lg"
              fillPct={pct(ad.spent / ad.budget)}
              projPct={pct(projectedSpend / ad.budget)}
              markerLeft={MARKER}
              markerLabel={`Dépense attendue · ${euro(expectedSpend)}`}
            />
            <span className={cn("text-base tabular-nums", toneText[pacingTone])}>
              {pacingVerdict}
            </span>
          </div>

          <KpiGrid columns={5}>
            {ad.kpis.map((k) => (
              <div key={k.label} className="flex flex-col gap-[3px] bg-paper px-[14px] py-3">
                <Eyebrow>{k.label}</Eyebrow>
                <span className="text-title font-semibold tabular-nums">{k.value}</span>
                <span className={cn("text-small tabular-nums", toneText[k.tone])}>{k.delta}</span>
              </div>
            ))}
          </KpiGrid>
        </Card>

        {/* v1 has no API connections: numbers are typed in weekly, so the
            input surface has to be as fast as a spreadsheet. */}
        {entering ? (
          <Card className="border-gold">
            <div className="flex items-center justify-between border-b border-line bg-gold-wash px-[14px] py-3">
              <Eyebrow tone="ink">Saisie manuelle · semaine du 18 au 24 août</Eyebrow>
              <span className="text-small text-ink-2">
                Tabulation entre les champs · Entrée pour valider la ligne
              </span>
            </div>
            <div
              className="grid border-b border-line bg-canvas"
              style={{ gridTemplateColumns: METRIC_COLS }}
            >
              {["Ensemble", "Dépense", "Impressions", "Clics", "Leads", "Conversions"].map(
                (label, i) => (
                  <span
                    key={label}
                    className={cn(
                      "eyebrow px-3 py-2 text-ink-2",
                      i > 0 && "text-right",
                    )}
                  >
                    {label}
                  </span>
                ),
              )}
            </div>
            {ad.sets.map((s, i) => {
              const impressions = Number(s.impressions.replace(/\s/g, ""));
              const cells = [
                s.spend.replace(" €", ""),
                s.impressions,
                String(Math.round(impressions * 0.012)),
                s.leads,
                String(Math.round(Number(s.leads) * 0.34)),
              ];
              return (
                <div
                  key={s.name}
                  className="grid items-stretch border-b border-line"
                  style={{ gridTemplateColumns: METRIC_COLS }}
                >
                  <span className="clip flex h-10 items-center px-3 text-base">{s.name}</span>
                  {cells.map((v, j) => (
                    <span
                      key={j}
                      className={cn(
                        "flex h-10 items-center justify-end border-l border-line px-3 text-base tabular-nums focus-within:border-gold",
                        i === 0 && j === 0 ? "bg-gold-wash text-ink" : "bg-paper text-ink-2",
                      )}
                    >
                      {v}
                    </span>
                  ))}
                </div>
              );
            })}
            <div className="flex items-center gap-2 px-[14px] py-[10px]">
              <Button variant="primary" onClick={() => setEntering(false)}>
                Enregistrer la semaine
              </Button>
              <Button>Importer un CSV</Button>
              <span className="ml-auto text-small text-ink-3">
                Dernière saisie le 18 août par Samir
              </span>
            </div>
          </Card>
        ) : null}

        <Card>
          <CardHead
            title="Ensembles de publicités"
            meta={`${ad.sets.length} ensembles · ${
              ad.sets.filter((s) => s.state === "Active").length
            } actifs`}
          />
          <TableHead cols={SET_COLS}>
            <Th>Ensemble</Th>
            <Th align="right">Dépense</Th>
            <Th align="right">Impressions</Th>
            <Th align="right">Leads</Th>
            <Th align="right">CPL</Th>
            <Th align="right">ROAS</Th>
            <Th align="right">État</Th>
          </TableHead>
          {ad.sets.map((s) => (
            <TableRow key={s.name} cols={SET_COLS}>
              <span className="clip text-base font-medium">{s.name}</span>
              <Num>{s.spend}</Num>
              <Num className="text-ink-2">{s.impressions}</Num>
              <Num>{s.leads}</Num>
              <Num
                className={cn(
                  "font-medium",
                  s.tone === "alert" || s.tone === "warn" ? toneText[s.tone] : "text-ink",
                )}
              >
                {s.cpl}
              </Num>
              <Num className="text-ink-2">{s.roas}</Num>
              <span className="flex justify-end">
                <StatusPill tone={s.tone}>{s.state}</StatusPill>
              </span>
            </TableRow>
          ))}
        </Card>

        <Card>
          <CardHead title="Créas rattachées" meta="Performances par créa · période en cours" />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 px-[14px] py-3">
            {ad.creatives.map((c) => (
              <div
                key={c.name}
                className={cn(
                  "flex flex-col overflow-hidden rounded-card border",
                  c.best ? "border-gold" : "border-line",
                )}
              >
                <div className="relative flex aspect-4/5 items-center justify-center border-b border-line bg-slot">
                  <Eyebrow>{c.kind}</Eyebrow>
                  <StatusPill
                    tone={c.tagTone}
                    className="absolute top-2 left-2 tracking-[0.06em]"
                  >
                    {c.tag}
                  </StatusPill>
                </div>
                <div className="flex flex-col gap-[6px] p-[10px]">
                  <span className="clip text-base font-medium">{c.name}</span>
                  <span className="flex items-baseline justify-between gap-2 tabular-nums">
                    <span className="text-small text-ink-3">CPL</span>
                    <span className={cn("text-base font-medium", toneText[c.tagTone])}>
                      {c.cpl}
                    </span>
                  </span>
                  <span className="flex items-baseline justify-between gap-2 tabular-nums">
                    <span className="text-small text-ink-3">Dépense</span>
                    <span className="text-base">{c.spend}</span>
                  </span>
                  <span className="text-small text-ink-3">{c.note}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
