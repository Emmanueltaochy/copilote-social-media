"use client";

import { Button } from "@/components/ui/Button";
import { Card, KpiGrid } from "@/components/ui/Card";
import { PacingBar } from "@/components/ui/PacingBar";
import { Eyebrow } from "@/components/ui/primitives";
import { PORTAL } from "@/data/portal";
import { toneText } from "@/lib/tone";
import { pace } from "@/lib/pacing";
import { useApp } from "@/state/app";

const CAP_MARINE = pace(9, 16);

/**
 * What the client sees. Same numbers as the agency screens, none of the
 * internals: no costs, no assignees, no pipeline stages. The agency previews
 * it from the sidebar so it can never drift from what's actually shipped.
 */
export function ClientPortal() {
  const { portalOpen, setPortalOpen } = useApp();
  if (!portalOpen) return null;

  return (
    <div className="fixed inset-0 z-80 flex flex-col overflow-hidden bg-canvas">
      <div className="flex flex-none items-center justify-between gap-4 bg-night px-6 py-2">
        <span className="flex items-center gap-[10px]">
          <span className="h-2 w-2 rounded-[2px] bg-gold" />
          <Eyebrow className="text-paper">Aperçu du portail · vu par Cap Marine</Eyebrow>
        </span>
        <button
          type="button"
          onClick={() => setPortalOpen(false)}
          className="cursor-pointer rounded-control border border-ink-2 bg-transparent px-[10px] py-[6px] text-small font-medium text-night-ink hover:border-ink-3 hover:text-paper"
        >
          Quitter l&apos;aperçu
        </button>
      </div>

      {/* The client's type scale is one notch larger throughout — this is a
          page they read a few times a month, not a tool they live in. */}
      <div className="flex flex-none items-center justify-between gap-6 border-b border-line bg-paper px-6 py-4">
        <div className="flex flex-col gap-[2px]">
          <Eyebrow>Cap Marine · août 2026</Eyebrow>
          <span className="text-display font-semibold tracking-[-0.01em]">Bonjour Élodie</span>
        </div>
        <div className="flex items-center gap-3">
          <Button size="md" className="px-[18px] py-3 text-lead">
            Faire une demande
          </Button>
          <Button variant="primary" size="md" className="px-[18px] py-3 text-lead">
            Valider les 4 contenus
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-start justify-start overflow-auto p-6">
        <div className="mx-auto flex w-full max-w-[1040px] min-w-[820px] flex-col gap-6">
          <Card>
            <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-5">
              <span className="text-title font-semibold">
                4 contenus attendent votre validation
              </span>
              <span className="text-lead text-warn">Le plus ancien attend depuis 6 jours</span>
            </div>
            {PORTAL.pending.map((p) => (
              <div
                key={p.title}
                className="grid h-16 items-center gap-4 border-b border-line px-6"
                style={{ gridTemplateColumns: "44px minmax(200px,1fr) 160px 230px" }}
              >
                <span className="flex h-12 w-10 items-center justify-center rounded-control border border-line bg-slot text-micro font-semibold text-ink-3">
                  {p.kind}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="clip text-lead font-medium">{p.title}</span>
                  <span className="text-base text-ink-3">{p.when}</span>
                </span>
                <span className={`text-base tabular-nums ${toneText[p.tone]}`}>{p.age}</span>
                <span className="flex justify-end gap-2">
                  <Button size="md" className="px-3 py-[9px]">
                    Commenter
                  </Button>
                  <Button variant="primary" size="md" className="px-3 py-[9px]">
                    Valider
                  </Button>
                </span>
              </div>
            ))}
          </Card>

          <Card className="flex flex-col gap-4 p-6">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-title font-semibold">Votre mois en cours</span>
              <span className="text-base text-ink-3 tabular-nums">
                Au 25 août · mis à jour hier par Léa
              </span>
            </div>
            <PacingBar
              size="lg"
              fillPct={CAP_MARINE.fillPct}
              projPct={CAP_MARINE.projPct}
              markerLeft={CAP_MARINE.markerLeft}
              markerLabel="Rythme prévu à ce jour"
            />
            <span className="text-lead tabular-nums">
              9 contenus publiés sur 16 · 4 de moins que le rythme prévu · 2 attendent votre
              validation
            </span>
            <KpiGrid columns={4}>
              {PORTAL.kpis.map((k) => (
                <div key={k.label} className="flex flex-col gap-1 bg-paper px-5 py-4">
                  <Eyebrow>{k.label}</Eyebrow>
                  <span className="text-display font-semibold tabular-nums">{k.value}</span>
                  <span className={`text-base ${toneText[k.tone]}`}>{k.meta}</span>
                </div>
              ))}
            </KpiGrid>
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-5">
              <span className="text-title font-semibold">Ce qui arrive</span>
              <span className="text-base text-ink-3">7 prochains jours</span>
            </div>
            {PORTAL.upcoming.map((u) => (
              <div
                key={u.title}
                className="grid h-16 items-center gap-4 border-b border-line px-6"
                style={{ gridTemplateColumns: "150px minmax(200px,1fr) 180px" }}
              >
                <span className="text-base font-medium text-ink-2 tabular-nums">{u.when}</span>
                <span className="clip text-lead">{u.title}</span>
                <span className={`text-right text-base ${toneText[u.tone]}`}>{u.state}</span>
              </div>
            ))}
            <div className="px-6 py-5">
              <span className="text-base text-ink-3">
                Une question sur le planning ? Écrivez à Léa, votre cheffe de projet.
              </span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
