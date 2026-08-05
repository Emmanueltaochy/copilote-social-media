"use client";

import { useState } from "react";
import { PageHeader, Toolbar } from "@/components/shell/Screen";
import { Button, Chip } from "@/components/ui/Button";
import { Card, CardHead } from "@/components/ui/Card";
import { PacingBar } from "@/components/ui/PacingBar";
import { Eyebrow } from "@/components/ui/primitives";
import { Num, TableHead, TableRow, Th } from "@/components/ui/Table";
import { findClient } from "@/data/clients";
import {
  DATA_FRESHNESS,
  NEXT_MONTH,
  POSTS,
  REPORT_ADS,
  REPORT_CLIENTS,
} from "@/data/reports";
import { cn } from "@/lib/cn";
import { RATIO } from "@/lib/pacing";
import { toneText } from "@/lib/tone";

const TABS = ["Rapport mensuel", "Saisie des statistiques"];
const POST_COLS = "minmax(200px,1fr) 90px 100px 100px 100px";
const AD_COLS = "minmax(180px,1fr) 110px 90px 90px 90px";
const STAT_COLS = "minmax(240px,1fr) 90px 110px 110px 110px 110px";
const MARKER = `calc(${(RATIO * 100).toFixed(1)}% - 2px)`;

export default function ReportsPage() {
  const [tab, setTab] = useState(TABS[0]);
  const [clientName, setClientName] = useState("Cap Marine");
  const [focus, setFocus] = useState<string | null>(null);

  const client = findClient(clientName);
  const { pace } = client;
  const isDoc = tab === TABS[0];

  return (
    <>
      <PageHeader
        title="Rapports"
        sub="Rapport mensuel client et saisie des statistiques · août 2026"
        action="Générer le rapport"
      />

      <Toolbar
        minWidth={1020}
        right={
          <span className="flex-none text-small whitespace-nowrap text-ink-3">
            {isDoc
              ? "Août 2026 · prêt à exporter · gabarit Taochy"
              : "Une ligne par contenu · 3 champs vides à compléter"}
          </span>
        }
      >
        {TABS.map((t) => (
          <Chip key={t} active={tab === t} onClick={() => setTab(t)}>
            {t}
          </Chip>
        ))}
        <span className="mx-1 h-[18px] w-px flex-none bg-line" />
        {REPORT_CLIENTS.map((c) => (
          <Chip key={c} active={clientName === c} onClick={() => setClientName(c)}>
            {c}
          </Chip>
        ))}
      </Toolbar>

      {isDoc ? (
        <div className="flex min-h-0 min-w-[1020px] flex-1 items-start justify-start gap-4 overflow-auto bg-canvas p-5">
          {/* A4 width, because this is printed and emailed, not scrolled. */}
          <div className="mx-auto w-[794px] flex-none overflow-hidden rounded-card border border-line bg-paper">
            <div className="flex items-end justify-between gap-6 bg-night px-10 py-7">
              <div className="flex flex-col gap-[6px]">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-[2px] bg-gold" />
                  <Eyebrow className="text-paper">Taochy Consulting</Eyebrow>
                </span>
                <span className="text-display font-semibold text-paper">
                  Rapport mensuel · {client.short}
                </span>
                <span className="text-base text-ink-3">Stratégie. Création. Performance.</span>
              </div>
              <span className="text-base whitespace-nowrap text-night-ink tabular-nums">
                Août 2026
              </span>
            </div>

            <div className="flex flex-col gap-7 px-10 py-8">
              <div className="flex flex-col gap-[10px]">
                <Eyebrow>Chapitre 01 · Engagement du mois</Eyebrow>
                <PacingBar
                  size="lg"
                  fillPct={pace.fillPct}
                  projPct={pace.projPct}
                  markerLeft={MARKER}
                  markerLabel="Rythme prévu"
                />
                <span className="text-base tabular-nums">
                  {client.done} contenus publiés sur {client.target} · {pace.diffLabel} ·
                  projection {pace.projected} sur {client.target} en fin de mois
                </span>
              </div>

              <div className="grid grid-cols-4 gap-px overflow-hidden rounded-card border border-line bg-line">
                {[
                  {
                    label: "Contenus publiés",
                    value: String(client.done),
                    delta: `sur ${client.target} prévus`,
                    tone: "muted" as const,
                  },
                  { label: "Portée cumulée", value: "48 200", delta: "+12 % vs. juillet", tone: "ok" as const },
                  { label: "Interactions", value: "3 140", delta: "+8 % vs. juillet", tone: "ok" as const },
                  { label: "Clics vers le site", value: "612", delta: "−4 % vs. juillet", tone: "warn" as const },
                ].map((k) => (
                  <div key={k.label} className="flex flex-col gap-[3px] bg-paper p-4">
                    <Eyebrow>{k.label}</Eyebrow>
                    <span className="text-display font-semibold tabular-nums">{k.value}</span>
                    <span className={cn("text-small", toneText[k.tone])}>{k.delta}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-[10px]">
                <Eyebrow>Chapitre 02 · Contenus publiés</Eyebrow>
                <div className="overflow-hidden rounded-card border border-line">
                  <TableHead cols={POST_COLS}>
                    <Th>Contenu</Th>
                    <Th align="right">Date</Th>
                    <Th align="right">Portée</Th>
                    <Th align="right">Interactions</Th>
                    <Th align="right">Clics</Th>
                  </TableHead>
                  {POSTS.slice(0, 7).map((p) => (
                    <TableRow key={p.title} cols={POST_COLS} height={40}>
                      <span className="clip text-base">{p.title}</span>
                      <Num className="text-ink-2">{p.date}</Num>
                      <Num>{p.reach}</Num>
                      <Num>{p.engagement}</Num>
                      <Num>{p.clicks}</Num>
                    </TableRow>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-[10px]">
                <Eyebrow>Chapitre 03 · Campagnes</Eyebrow>
                <div className="overflow-hidden rounded-card border border-line">
                  {REPORT_ADS.map((ad) => (
                    <TableRow key={ad.name} cols={AD_COLS}>
                      <span className="clip text-base font-medium">{ad.name}</span>
                      <Num>{ad.spend}</Num>
                      <Num>{ad.leads}</Num>
                      <Num>{ad.cpl}</Num>
                      <Num>{ad.roas}</Num>
                    </TableRow>
                  ))}
                </div>
              </div>

              {/* The chapter that turns a report into a conversation. */}
              <div className="flex flex-col gap-2">
                <Eyebrow>Chapitre 04 · Ce que nous proposons pour septembre</Eyebrow>
                {NEXT_MONTH.map((n) => (
                  <span key={n} className="flex items-baseline gap-[10px]">
                    <span className="h-[5px] w-[5px] flex-none rounded-full bg-gold" />
                    <span className="text-base leading-relaxed text-pretty">{n}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-line px-10 py-5">
              <span className="text-small text-ink-3">
                Taochy Consulting · La Réunion et Métropole · contact@taochy.re
              </span>
              <span className="text-small text-ink-3 tabular-nums">
                Page 1 sur 1 · généré le 25 août 2026
              </span>
            </div>
          </div>

          <aside className="flex w-[280px] flex-none flex-col gap-3">
            <Card className="flex flex-col gap-[10px] p-[14px]">
              <Eyebrow>Export</Eyebrow>
              <Button variant="primary" size="md">
                Exporter en PDF brandé
              </Button>
              <Button size="md">Publier sur le portail client</Button>
            </Card>
            <Card>
              <CardHead title="Fraîcheur des données" />
              {DATA_FRESHNESS.map((f) => (
                <div
                  key={f.label}
                  className="flex h-10 items-center justify-between gap-2 border-b border-line px-[14px]"
                >
                  <span className="clip text-base">{f.label}</span>
                  <span className={cn("text-small whitespace-nowrap", toneText[f.tone])}>
                    {f.age}
                  </span>
                </div>
              ))}
              <div className="px-[14px] py-[10px]">
                <Button variant="link" onClick={() => setTab(TABS[1])}>
                  Compléter les chiffres manquants
                </Button>
              </div>
            </Card>
          </aside>
        </div>
      ) : (
        <div className="flex min-h-0 min-w-[1020px] flex-1 flex-col gap-[14px] overflow-auto px-5 pt-4 pb-6">
          <Card>
            <CardHead title={`Statistiques par contenu · ${client.short} · août`}>
              <div className="flex items-center gap-2">
                <span className="text-small text-ink-3">
                  Tabulation entre les champs · Entrée pour la ligne suivante
                </span>
                <Button className="px-[9px] py-[5px]">Importer un CSV</Button>
              </div>
            </CardHead>

            <div
              className="sticky top-0 z-2 grid border-b border-line bg-canvas"
              style={{ gridTemplateColumns: STAT_COLS }}
            >
              {["Contenu", "Date", "Portée", "Interactions", "Clics", "Enregistrements"].map(
                (h, i) => (
                  <span
                    key={h}
                    className={cn("eyebrow px-3 py-2 text-ink-2", i > 0 && "text-right")}
                  >
                    {h}
                  </span>
                ),
              )}
            </div>

            {POSTS.map((p, i) => {
              const saves =
                p.reach === "—" ? "—" : String(Math.round(Number(p.reach.replace(/\s/g, "")) * 0.004));
              const cells = [p.reach, p.engagement, p.clicks, saves];
              return (
                <div
                  key={p.title}
                  className={cn(
                    "grid items-stretch border-b border-line",
                    p.reach === "—" ? "bg-alert-wash" : "bg-paper",
                  )}
                  style={{ gridTemplateColumns: STAT_COLS }}
                >
                  <span className="flex h-10 min-w-0 items-center gap-2 px-3">
                    <Eyebrow className="flex-none tracking-[0.06em]">{p.kind}</Eyebrow>
                    <span className="clip text-base">{p.title}</span>
                  </span>
                  <span className="flex h-10 items-center justify-end border-l border-line px-3 text-base text-ink-2 tabular-nums">
                    {p.date}
                  </span>
                  {cells.map((v, j) => {
                    const id = `${i}-${j}`;
                    const focused = focus === id;
                    const missing = v === "—";
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setFocus(id)}
                        className={cn(
                          "flex h-10 cursor-text items-center justify-end border-l px-3 text-base tabular-nums",
                          focused
                            ? "border-gold bg-gold-wash shadow-[inset_0_0_0_1px_var(--color-gold)]"
                            : "border-line bg-paper",
                          missing ? "text-alert" : "text-ink",
                        )}
                      >
                        {focused ? "" : v}
                      </button>
                    );
                  })}
                </div>
              );
            })}

            <div className="flex items-center gap-[10px] px-[14px] py-[10px]">
              <Button variant="primary">Enregistrer la saisie</Button>
              <span className={cn("text-small", focus ? "text-ink-2" : "text-warn")}>
                {focus
                  ? "Saisie en cours · Tabulation pour le champ suivant"
                  : "3 champs vides · le reel du 20 août n'a jamais été publié"}
              </span>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
