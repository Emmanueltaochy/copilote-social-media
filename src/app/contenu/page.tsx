"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/shell/Screen";
import { Button, Chip } from "@/components/ui/Button";
import { Card, CardHead } from "@/components/ui/Card";
import { Avatar, CheckBox, Eyebrow, MediaSlot, StatusPill } from "@/components/ui/primitives";
import {
  ATTACHED_ASSETS,
  CHECKLIST,
  HASHTAGS,
  PREVIEWS,
  THREAD,
  VERSIONS,
  type PreviewKey,
} from "@/data/content-detail";
import { cn } from "@/lib/cn";
import { toneText } from "@/lib/tone";

const TABS = Object.keys(PREVIEWS) as PreviewKey[];

export default function ContentPage() {
  const [tab, setTab] = useState<PreviewKey>("Feed");
  const [checked, setChecked] = useState<number[]>([0, 1, 2]);
  const preview = PREVIEWS[tab];

  const toggle = (i: number) =>
    setChecked((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]));

  return (
    <>
      <PageHeader
        title="Reel « Sortie coucher de soleil »"
        sub="Cap Marine · Instagram · prévu le 20 août 18:00 · V3"
        action="Dupliquer"
      />

      <div className="flex flex-none items-center justify-between gap-4 border-b border-line bg-paper px-5 py-2">
        <div className="flex min-w-0 items-center gap-[10px]">
          <Link href="/production" className="flex-none no-underline hover:no-underline">
            <Button className="px-[9px] py-[5px]">‹ Production</Button>
          </Link>
          <StatusPill tone="warn">Validation client</StatusPill>
          <span className="clip text-small text-ink-3 tabular-nums">
            En attente depuis 6 jours · relance automatique demain 09:00
          </span>
        </div>
        <div className="flex flex-none items-center gap-2">
          <Button>Relancer le client</Button>
          <Button>Valider à sa place</Button>
          <Button variant="primary">Programmer la publication</Button>
        </div>
      </div>

      <div
        className="grid min-h-0 flex-1 items-start gap-4 overflow-auto px-5 pt-4 pb-6"
        style={{ gridTemplateColumns: "392px minmax(360px,1fr) 336px" }}
      >
        {/* One content, five networks: the preview is per-network because the
            crop and the caption rules differ on each. */}
        <Card>
          <div className="flex items-center gap-1 overflow-x-auto border-b border-line px-[10px] py-2">
            {TABS.map((t) => (
              <Chip key={t} active={tab === t} onClick={() => setTab(t)}>
                {t}
              </Chip>
            ))}
          </div>
          <div className="flex flex-col items-center gap-3 bg-canvas p-4">
            <div
              className="overflow-hidden rounded-card border border-line bg-paper"
              style={{ width: preview.width }}
            >
              <div className="flex items-center gap-2 border-b border-line px-[10px] py-2">
                <span className="h-6 w-6 rounded-full border border-line bg-slot" />
                <span className="flex flex-col">
                  <span className="text-small font-semibold">capmarine.re</span>
                  <span className="text-micro text-ink-3">Saint-Gilles-les-Bains</span>
                </span>
              </div>
              <MediaSlot label={preview.slot} ratio={preview.ratio}>
                <span className="eyebrow absolute bottom-[10px] left-[10px] rounded-full border border-line bg-paper px-2 py-[3px] text-ink-3">
                  V3 · 24 août
                </span>
              </MediaSlot>
              <div className="flex flex-col gap-[6px] p-[10px]">
                <span className="text-small leading-relaxed">{preview.excerpt}</span>
                <span className="text-micro text-ink-3">{preview.note}</span>
              </div>
            </div>
            <span className="text-center text-small text-ink-3">{preview.hint}</span>
          </div>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card className="flex flex-col gap-[10px] p-[14px]">
            <div className="flex items-center justify-between gap-[10px]">
              <Eyebrow>Légende</Eyebrow>
              <span className="text-small text-ink-3 tabular-nums">
                318 / 2 200 caractères · 6 hashtags
              </span>
            </div>
            <p className="text-base leading-relaxed text-pretty">
              Le soleil descend sur le lagon, le catamaran sort du port. Deux heures de navigation,
              l&apos;apéro à bord, retour au coucher du soleil. Départs tous les mercredis et
              samedis à 16h30, 12 places par sortie.
            </p>
            <p className="text-base leading-relaxed text-ink-2">
              Réservation sur capmarine.re ou par téléphone au 0262 24 18 90.
            </p>
            <div className="flex flex-wrap gap-[6px]">
              {HASHTAGS.map((h) => (
                <span
                  key={h}
                  className="rounded-full border border-line bg-canvas px-2 py-[3px] text-small text-ink-2"
                >
                  {h}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button>Copier la légende</Button>
              <Button>Proposer une variante</Button>
              <span className="ml-auto text-small text-ink-3">Modifiée il y a 2 jours par Léa</span>
            </div>
          </Card>

          <Card>
            <CardHead title="Assets attachés" meta="3 fichiers · shooting du 12 août" />
            <div className="grid grid-cols-3 gap-[10px] px-[14px] py-3">
              {ATTACHED_ASSETS.map((a) => (
                <div key={a.name} className="flex flex-col gap-[6px]">
                  <div className="flex aspect-4/5 items-end rounded-control border border-line bg-slot p-[6px]">
                    <span className="eyebrow tracking-[0.06em] text-ink-3">{a.kind}</span>
                  </div>
                  <span className="clip text-small font-medium">{a.name}</span>
                  <span className={cn("text-micro", toneText[a.tone])}>{a.rights}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHead title="Checklist avant publication" meta={`${checked.length} sur 5`} />
            {CHECKLIST.map((c, i) => {
              const on = checked.includes(i);
              return (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => toggle(i)}
                  className="flex h-10 w-full cursor-pointer items-center gap-[10px] border-b border-line bg-transparent px-[14px] text-left hover:bg-canvas"
                >
                  <CheckBox checked={on} />
                  <span className={cn("text-base", on ? "text-ink-2" : "text-ink")}>{c.label}</span>
                  <span className="ml-auto text-small text-ink-3">{c.by}</span>
                </button>
              );
            })}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHead title="Fil de commentaires" meta="5" />
            {THREAD.map((m) => (
              <div key={m.when + m.who} className="flex gap-[9px] border-b border-line px-[14px] py-[10px]">
                <Avatar initials={m.initial} size={22} tone={m.isClient ? "gold" : "neutral"} />
                <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <span className="flex items-baseline gap-2">
                    <span className="text-small font-semibold">{m.who}</span>
                    <span className="ml-auto text-micro whitespace-nowrap text-ink-3">
                      {m.when}
                    </span>
                  </span>
                  <span className="text-base leading-relaxed">{m.text}</span>
                  {m.pin ? (
                    <span className="eyebrow tracking-[0.06em] text-gold">
                      Épinglé sur le visuel · pastille {m.pin}
                    </span>
                  ) : null}
                </span>
              </div>
            ))}
            <div className="flex flex-col gap-2 px-[14px] py-[10px]">
              <div className="rounded-control border border-line px-[10px] py-2 text-base text-ink-3 focus-within:border-gold">
                Répondre à Cap Marine…
              </div>
              <div className="flex items-center gap-2">
                <Button variant="primary">Envoyer</Button>
                <Button>Épingler sur le visuel</Button>
              </div>
            </div>
          </Card>

          <Card>
            <CardHead title="Historique de versions">
              <Button className="px-[9px] py-[5px]">Comparer</Button>
            </CardHead>
            {VERSIONS.map((v) => (
              <div
                key={v.tag}
                className={cn(
                  "flex items-center gap-[10px] border-b border-line px-[14px] py-[10px]",
                  v.current ? "bg-gold-wash" : "bg-paper",
                )}
              >
                <span
                  className={cn(
                    "w-6 text-small font-semibold tabular-nums",
                    v.current ? "text-gold" : "text-ink-2",
                  )}
                >
                  {v.tag}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="clip text-base">{v.label}</span>
                  <span className="text-micro text-ink-3">{v.meta}</span>
                </span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </>
  );
}
