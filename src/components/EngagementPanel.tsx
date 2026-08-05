"use client";

import { Button } from "@/components/ui/Button";
import { PacingBar } from "@/components/ui/PacingBar";
import { Eyebrow, StatusPill } from "@/components/ui/primitives";
import { Num, TableHead, TableRow, Th } from "@/components/ui/Table";
import type { PacedClient } from "@/data/clients";
import { fr, gapTone, RATIO } from "@/lib/pacing";
import { toneText } from "@/lib/tone";

/** Typical shape of a monthly engagement, used to split the total into lines. */
const MIX: [string, number][] = [
  ["Posts feed", 0.42],
  ["Stories", 0.29],
  ["Reels", 0.17],
  ["Carrousels", 0.12],
];

const COLS = "1fr 56px 62px 56px";

/**
 * Slide-over on the cockpit: one click from "this account is behind" to
 * *which* line is behind and what is blocking it, without leaving the table.
 */
export function EngagementPanel({
  client,
  onClose,
}: {
  client: PacedClient;
  onClose: () => void;
}) {
  const lines = MIX.map(([label, weight]) => {
    const target = Math.max(1, Math.round(client.target * weight));
    const done = Math.min(target, Math.round(client.done * weight));
    const expected = target * RATIO;
    const gapPct = Math.round(((done - expected) / expected) * 100);
    return {
      label,
      done: `${done} / ${target}`,
      expected: fr(expected, 1),
      delta: `${gapPct >= 0 ? "+" : "−"}${Math.abs(gapPct)} %`,
      tone: gapTone(gapPct),
    };
  });

  const twoShoots = client.target >= 16;
  lines.push({
    label: "Shootings",
    done: twoShoots ? "1 / 2" : "1 / 1",
    expected: fr(RATIO * (twoShoots ? 2 : 1), 1),
    delta: twoShoots ? "−38 %" : "+24 %",
    tone: twoShoots ? "alert" : "neutral",
  });
  lines.push({
    label: "Campagnes ads",
    done: "1 / 1",
    expected: "0,8",
    delta: "+24 %",
    tone: "neutral",
  });

  return (
    <div className="fixed inset-0 z-60 flex justify-end">
      <button
        type="button"
        aria-label="Fermer le panneau"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-[rgba(18,18,18,0.16)]"
      />
      <aside className="relative flex h-full w-[480px] max-w-[92vw] flex-col overflow-hidden border-l border-line-strong bg-paper shadow-[-8px_0_24px_rgba(18,18,18,0.10)]">
        <div className="flex flex-none items-start justify-between gap-3 border-b border-line px-[18px] py-[14px]">
          <div className="flex min-w-0 flex-col gap-[2px]">
            <Eyebrow>Suivi d&apos;avancement · août</Eyebrow>
            <span className="text-title font-semibold">{client.name}</span>
            <span className="text-small text-ink-3">
              Forfait {client.target} contenus · jour 25 sur 31 · cheffe de projet Léa
            </span>
          </div>
          <Button onClick={onClose} className="flex-none px-[9px]">
            Fermer
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-auto p-[18px]">
          <div className="flex flex-col gap-3">
            <PacingBar
              size="lg"
              fillPct={client.pace.fillPct}
              projPct={client.pace.projPct}
              markerLeft={client.pace.markerLeft}
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-base text-ink-2 tabular-nums">
                {client.done} / {client.target} publiés · {client.pace.diffLabel} · attendu{" "}
                {fr(client.pace.expected, 1)}
              </span>
              <StatusPill tone={client.pace.tone}>{client.pace.label}</StatusPill>
            </div>
          </div>

          <div className="flex flex-col gap-[10px]">
            <Eyebrow>Engagement ligne par ligne</Eyebrow>
            <div className="overflow-hidden rounded-card border border-line">
              <TableHead cols={COLS} className="gap-2 px-3">
                <Th>Ligne</Th>
                <Th align="right">Fait</Th>
                <Th align="right">Attendu</Th>
                <Th align="right">Écart</Th>
              </TableHead>
              {lines.map((l) => (
                <TableRow key={l.label} cols={COLS} height={40} className="gap-2 px-3">
                  <span className="text-base">{l.label}</span>
                  <Num className="font-medium">{l.done}</Num>
                  <Num className="text-ink-2">{l.expected}</Num>
                  <Num className={`font-medium ${toneText[l.tone]}`}>{l.delta}</Num>
                </TableRow>
              ))}
            </div>
            <span className="text-small text-ink-3">
              Projection au rythme actuel : {client.pace.projected} contenus sur {client.target} en
              fin de mois.
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <Eyebrow>Ce qui bloque</Eyebrow>
            {client.blockers.map((b) => (
              <div
                key={b.label}
                className="flex items-center justify-between gap-[10px] rounded-card border border-line px-3 py-[10px]"
              >
                <span className="min-w-0 text-base">{b.label}</span>
                <span className={`text-small font-medium whitespace-nowrap ${toneText[b.tone]}`}>
                  {b.value}
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <Eyebrow>Fraîcheur des données</Eyebrow>
            <span className="text-small text-ink-2">{client.freshness}</span>
          </div>
        </div>

        <div className="flex flex-none items-center gap-2 border-t border-line px-[18px] py-3">
          <Button variant="primary" size="md">
            Ouvrir la fiche client
          </Button>
          <Button size="md">Planifier un rattrapage</Button>
          <Button size="md" className="ml-auto">
            Écrire au client
          </Button>
        </div>
      </aside>
    </div>
  );
}
