"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shell/Screen";
import { Button } from "@/components/ui/Button";
import { Card, CardHead } from "@/components/ui/Card";
import { PacingBar } from "@/components/ui/PacingBar";
import { Dot, Eyebrow, StatusPill } from "@/components/ui/primitives";
import { Num, TableHead, TableRow, Th } from "@/components/ui/Table";
import { ACCESS_TONE, BRANDS, margin } from "@/data/brands";
import { byName, findClient, PACED_CLIENTS } from "@/data/clients";
import { cn } from "@/lib/cn";
import { fr, pct, RATIO } from "@/lib/pacing";
import { toneText, type Tone } from "@/lib/tone";

const TABS = ["Contrat", "Marque", "Contacts", "Historique", "Rentabilité"] as const;
type Tab = (typeof TABS)[number];

const COST_COLS = "minmax(180px,1fr) 120px 120px 120px";
const MARKER = `calc(${(RATIO * 100).toFixed(1)}% - 1.5px)`;

export default function ClientsPage() {
  const [name, setName] = useState("Cap Marine");
  const [tab, setTab] = useState<Tab>("Contrat");

  const client = findClient(name);
  const brand = BRANDS[name];
  const billed = brand.feeAmount > 0;
  const marginPct = margin(brand);

  const maxHours = Math.max(brand.hours, brand.sold);
  const marginTone: Tone =
    marginPct === null ? "muted" : marginPct < 15 ? "alert" : marginPct < 30 ? "warn" : "ok";

  return (
    <>
      <PageHeader
        title="Fiche client"
        sub="13 comptes actifs · contrat, marque, contacts, historique, rentabilité"
        action="Nouveau client"
      />

      <div className="flex min-h-0 min-w-[1060px] flex-1 overflow-hidden">
        <div className="flex w-[280px] flex-none flex-col overflow-hidden border-r border-line bg-paper">
          <div className="flex flex-none items-center justify-between border-b border-line px-3 py-[10px]">
            <Eyebrow>Portefeuille</Eyebrow>
            <span className="text-small text-ink-3 tabular-nums">13</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {byName(PACED_CLIENTS).map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => {
                  setName(c.short);
                  setTab("Contrat");
                }}
                className={cn(
                  "flex h-11 w-full cursor-pointer items-center gap-[9px] border-b border-line border-l-2 px-3 text-left hover:bg-canvas",
                  c.short === name ? "border-l-gold bg-gold-wash" : "border-l-transparent bg-paper",
                )}
              >
                <Dot tone={c.pace.tone} />
                <span className="clip flex-1 text-base font-medium">{c.short}</span>
                <span className="text-small whitespace-nowrap text-ink-3 tabular-nums">
                  {c.done}/{c.target}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-w-[660px] flex-1 flex-col overflow-hidden">
          <div className="flex flex-none flex-col gap-[10px] border-b border-line bg-paper px-5 pt-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-[2px]">
                <Eyebrow>{brand.sector}</Eyebrow>
                <span className="text-title font-semibold">{name}</span>
                <span className="text-small text-ink-3">{brand.since}</span>
              </div>
              <div className="flex flex-none items-center gap-2">
                <StatusPill tone={client.pace.tone}>{client.pace.label}</StatusPill>
                <Button>Ouvrir le portail</Button>
              </div>
            </div>
            <div className="flex items-center gap-[2px]">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    "cursor-pointer border-b-2 bg-transparent px-3 py-2 text-base hover:text-ink",
                    tab === t
                      ? "border-b-gold font-medium text-ink"
                      : "border-b-transparent text-ink-2",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-5 pt-4 pb-6">
            {tab === "Contrat" ? (
              <>
                <Card className="flex flex-col gap-[14px] p-4">
                  <Eyebrow>Avancement du mois</Eyebrow>
                  <PacingBar
                    fillPct={client.pace.fillPct}
                    projPct={client.pace.projPct}
                    markerLeft={MARKER}
                  />
                  <span className="text-base text-ink-2 tabular-nums">
                    {client.done} / {client.target} contenus · attendu{" "}
                    {fr(client.pace.expected, 1)} · {client.pace.deltaLabel} · projection{" "}
                    {client.pace.projected} en fin de mois
                  </span>
                </Card>

                <Card>
                  <CardHead title="Contrat" />
                  {[
                    { label: "Forfait mensuel", value: brand.fee, tone: "ink" as Tone },
                    {
                      label: "Engagement contenus",
                      value: `${client.target} contenus par mois`,
                      tone: "ink" as Tone,
                    },
                    {
                      label: "Décomposition",
                      value: "Posts feed, stories, reels, carrousels",
                      tone: "neutral" as Tone,
                    },
                    {
                      label: "Shootings inclus",
                      value: client.target >= 16 ? "2 par mois" : "1 par mois",
                      tone: "ink" as Tone,
                    },
                    {
                      label: "Budget ads géré",
                      value: brand.adsBudget,
                      tone: brand.adsBudget === "Aucun budget ads" ? ("muted" as Tone) : ("ink" as Tone),
                    },
                    {
                      label: "Reconduction",
                      value: billed ? "Tacite · préavis 2 mois" : "Sans objet · compte interne",
                      tone: "neutral" as Tone,
                    },
                    {
                      label: "Prochaine échéance",
                      value: billed ? "Facturation le 31 août 2026" : "Aucune facturation",
                      tone: billed ? ("ink" as Tone) : ("muted" as Tone),
                    },
                  ].map((r) => (
                    <div
                      key={r.label}
                      className="grid h-11 items-center gap-4 border-b border-line px-[14px]"
                      style={{ gridTemplateColumns: "220px minmax(0,1fr)" }}
                    >
                      <span className="text-base text-ink-3">{r.label}</span>
                      <span className={cn("text-base tabular-nums", toneText[r.tone])}>
                        {r.value}
                      </span>
                    </div>
                  ))}
                </Card>
              </>
            ) : null}

            {tab === "Marque" ? (
              <div
                className="grid items-start gap-4"
                style={{ gridTemplateColumns: "minmax(320px,1fr) minmax(280px,360px)" }}
              >
                <div className="flex min-w-0 flex-col gap-4">
                  <Card className="flex flex-col gap-[14px] p-4">
                    <Eyebrow>Identité visuelle</Eyebrow>
                    <div className="flex items-center gap-4">
                      <div className="flex h-20 w-20 flex-none items-center justify-center rounded-card border border-line bg-slot">
                        <Eyebrow className="tracking-[0.06em]">Logo</Eyebrow>
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <Eyebrow>Palette</Eyebrow>
                        <div className="flex gap-2">
                          {brand.palette.map((hex) => (
                            <span key={hex} className="flex flex-col gap-1">
                              <span
                                className="h-8 w-11 rounded-control border border-line"
                                style={{ background: hex }}
                              />
                              <span className="text-micro text-ink-3 tabular-nums">{hex}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-[3px]">
                        <Eyebrow>Typographies</Eyebrow>
                        <span className="text-base">{brand.fonts}</span>
                      </div>
                      <div className="flex flex-col gap-[3px]">
                        <Eyebrow>Ton</Eyebrow>
                        <span className="text-base">{brand.voice}</span>
                      </div>
                    </div>
                  </Card>

                  <Card className="flex flex-col gap-[10px] p-4">
                    <Eyebrow>Hashtags de référence</Eyebrow>
                    <div className="flex flex-wrap gap-[6px]">
                      {brand.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-line bg-canvas px-2 py-[3px] text-small text-ink-2"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </Card>
                </div>

                {/* Banned words carry their reason: the "why" is what stops the
                    same mistake from coming back with a new writer. */}
                <Card>
                  <CardHead title="Mots interdits" meta={`${brand.banned.length} mots`} />
                  {brand.banned.map(([word, why]) => (
                    <div
                      key={word}
                      className="flex flex-col gap-[2px] border-b border-line px-[14px] py-[10px]"
                    >
                      <span className="text-base font-medium text-alert">{word}</span>
                      <span className="text-small text-ink-2">{why}</span>
                    </div>
                  ))}
                </Card>
              </div>
            ) : null}

            {tab === "Contacts" ? (
              <Card>
                <CardHead title="Contacts" meta={`${brand.contacts.length}`} />
                {brand.contacts.map((c) => (
                  <div
                    key={c.name}
                    className="grid h-11 items-center gap-4 border-b border-line px-[14px]"
                    style={{ gridTemplateColumns: "minmax(160px,1fr) minmax(160px,1fr) 200px 140px" }}
                  >
                    <span className="clip text-base font-medium">{c.name}</span>
                    <span className="clip text-base text-ink-2">{c.role}</span>
                    <span className="clip text-base text-ink-2 tabular-nums">{c.reach}</span>
                    <span
                      className={cn(
                        "text-right text-small font-medium",
                        toneText[ACCESS_TONE[c.access]],
                      )}
                    >
                      {c.access}
                    </span>
                  </div>
                ))}
              </Card>
            ) : null}

            {tab === "Historique" ? (
              <Card>
                <CardHead title="Historique du compte" meta="Août 2026" />
                {[
                  { date: "25 août", text: "Relance automatique sur la validation du reel du 20 août", who: "Système", tone: "muted" as Tone },
                  { date: "24 août", text: "V3 du reel « Sortie coucher de soleil » envoyée au client", who: "Kevin", tone: "neutral" as Tone },
                  { date: "23 août", text: "V2 refusée · horaire de départ manquant sur le visuel", who: name, tone: "warn" as Tone },
                  { date: "20 août", text: "Contenu du 20 août non publié à l'heure prévue", who: "Système", tone: "alert" as Tone },
                  { date: "18 août", text: "Statistiques du mois saisies pour la dernière fois", who: "Léa", tone: "neutral" as Tone },
                  { date: "12 août", text: "Shooting réalisé au port de Saint-Gilles · 3 assets livrés", who: "Noa", tone: "neutral" as Tone },
                  { date: "3 août", text: "Planning éditorial d'août validé par le client", who: name, tone: "ok" as Tone },
                  { date: "1er août", text: `Ouverture du mois · engagement ${client.target} contenus`, who: "Système", tone: "muted" as Tone },
                ].map((h) => (
                  <div
                    key={h.date + h.text}
                    className="grid h-11 items-center gap-4 border-b border-line px-[14px]"
                    style={{ gridTemplateColumns: "90px minmax(0,1fr) 120px" }}
                  >
                    <span className="text-base text-ink-3 tabular-nums">{h.date}</span>
                    <span className={cn("clip text-base", toneText[h.tone])}>{h.text}</span>
                    <span className="text-right text-small text-ink-3">{h.who}</span>
                  </div>
                ))}
              </Card>
            ) : null}

            {tab === "Rentabilité" ? (
              <>
                <Card className="flex flex-col gap-3 p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <Eyebrow>Heures consommées contre forfait vendu</Eyebrow>
                    <span className={cn("text-small font-medium", toneText[marginTone])}>
                      {billed ? `Marge ${marginPct} %` : "Compte interne · non facturé"}
                    </span>
                  </div>
                  {/* Here the gold marker means hours *sold*, not the calendar. */}
                  <PacingBar
                    size="md"
                    fillPct={pct(brand.hours / maxHours)}
                    fillClass={brand.hours > brand.sold ? "bg-warn" : "bg-ink-2"}
                    markerLeft={`calc(${((brand.sold / maxHours) * 100).toFixed(1)}% - 2px)`}
                  />
                  <span className="text-base text-ink-2 tabular-nums">
                    {brand.hours} h consommées sur {brand.sold} h vendues · coût interne{" "}
                    {brand.cost.toLocaleString("fr-FR")} €
                  </span>
                </Card>

                <Card>
                  <TableHead cols={COST_COLS}>
                    <Th>Poste</Th>
                    <Th align="right">Heures</Th>
                    <Th align="right">Coût</Th>
                    <Th align="right">Part</Th>
                  </TableHead>
                  {brand.costs.map((c) => (
                    <TableRow key={c.label} cols={COST_COLS}>
                      <span className="text-base">{c.label}</span>
                      <Num>{c.hours}</Num>
                      <Num>{c.cost}</Num>
                      <Num className="text-ink-2">{c.share}</Num>
                    </TableRow>
                  ))}
                  <div className="px-[14px] py-[10px]">
                    <span
                      className={cn(
                        "text-small",
                        !billed ? "text-ink-3" : brand.hours > brand.sold ? "text-alert" : "text-ok",
                      )}
                    >
                      {!billed
                        ? "Compte interne : les heures sont suivies pour arbitrer la charge, pas pour calculer une marge."
                        : brand.hours > brand.sold
                          ? `Dépassement de ${brand.hours - brand.sold} h sur le forfait. À renégocier ou à réduire en septembre.`
                          : `Consommation sous le forfait vendu : ${brand.sold - brand.hours} h de marge restantes ce mois.`}
                    </span>
                  </div>
                </Card>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
