"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHeader, Toolbar } from "@/components/shell/Screen";
import { Button, Chip } from "@/components/ui/Button";
import { Avatar, Dot, Eyebrow, StatusPill } from "@/components/ui/primitives";
import { isLateBadge, PIPELINE, type PipelineCard } from "@/data/pipeline";
import { NETWORK_TONE } from "@/data/content";
import { cn } from "@/lib/cn";
import { useApp } from "@/state/app";

type Filter = "all" | "late" | "mine" | "video";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "late", label: "En retard" },
  { key: "mine", label: "Assignés à Léa" },
  { key: "video", label: "Vidéo" },
];

const matches = (c: PipelineCard, f: Filter) => {
  if (f === "late") return !!c.badge;
  if (f === "mine") return c.owner === "Léa";
  if (f === "video") return /Reel|Rushes|Série|Visite/.test(c.title);
  return true;
};

/** Waiting times get a warning colour before they become a breach. */
function dueTone(card: PipelineCard) {
  if (/Retard|dépassé|Non publié/.test(card.due + (card.badge ?? ""))) return "text-alert";
  if (/6 j|5 j/.test(card.due)) return "text-warn";
  return "text-ink-2";
}

export default function PipelinePage() {
  const { inScope, scopedShort } = useApp();
  const [filter, setFilter] = useState<Filter>("all");

  const columns = PIPELINE.map((stage) => {
    const cards = stage.cards.filter((c) => inScope(c.client) && matches(c, filter));
    return {
      ...stage,
      cards,
      late: cards.filter((c) => isLateBadge(c.badge)).length,
    };
  });
  const total = columns.reduce((n, c) => n + c.cards.length, 0);
  // "En cours" excludes the Publié column — a published content is done, not
  // work in progress. This is the number the sidebar badge carries.
  const inProgress = columns
    .filter((c) => c.label !== "Publié")
    .reduce((n, c) => n + c.cards.length, 0);

  return (
    <>
      <PageHeader
        title="Pipeline de production"
        sub={`Août 2026 · ${inProgress} contenus en cours · 9 étapes`}
        action="Nouveau contenu"
      />

      <Toolbar
        right={<span className="text-small text-ink-3 tabular-nums">{total} contenus affichés</span>}
      >
        <Eyebrow>Filtres</Eyebrow>
        {FILTERS.map((f) => (
          <Chip key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
          </Chip>
        ))}
        <span className="pl-[6px] text-small whitespace-nowrap text-ink-3">
          Filtres conservés d&apos;une session à l&apos;autre
        </span>
      </Toolbar>

      <div className="min-h-0 flex-1 overflow-auto px-5 pt-4 pb-5">
        <div className="flex h-full min-w-max items-start gap-3">
          {columns.map((col) => (
            <div
              key={col.label}
              className="flex max-h-full w-[264px] flex-none flex-col rounded-card border border-line bg-paper"
            >
              <div className="flex flex-none items-center justify-between gap-2 border-b border-line px-3 py-[10px]">
                <Eyebrow tone="ink">{col.label}</Eyebrow>
                <span className="flex items-center gap-[6px]">
                  {col.late > 0 ? (
                    <span className="text-micro font-semibold text-alert tabular-nums">
                      {col.late}
                    </span>
                  ) : null}
                  <span className="text-small text-ink-3 tabular-nums">{col.cards.length}</span>
                </span>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-2">
                {col.cards.map((c) => (
                  <Link
                    key={c.client + c.title}
                    href="/contenu"
                    className={cn(
                      "flex w-full cursor-grab flex-col gap-[7px] rounded-card border bg-paper p-[10px] text-left no-underline hover:border-line-strong hover:no-underline",
                      isLateBadge(c.badge) ? "border-alert-line" : "border-line",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-[6px]">
                      <Dot tone={NETWORK_TONE[c.network]} solid size={5} />
                      <span className="eyebrow tracking-[0.06em] text-ink-3">{c.network}</span>
                      <span className="clip ml-auto text-micro text-ink-3">{c.client}</span>
                    </span>
                    <span className="text-base leading-tight font-medium text-ink">{c.title}</span>
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-[6px]">
                        <Avatar initials={c.initial} size={20} />
                        <span className="text-small text-ink-2">{c.owner}</span>
                      </span>
                      <span
                        className={cn("text-small font-medium tabular-nums", dueTone(c))}
                      >
                        {c.due}
                      </span>
                    </span>
                    {c.badge ? (
                      <StatusPill
                        tone={isLateBadge(c.badge) ? "alert" : "warn"}
                        className="self-start"
                      >
                        {c.badge}
                      </StatusPill>
                    ) : null}
                  </Link>
                ))}

                {col.cards.length === 0 ? (
                  <div className="flex flex-col gap-[6px] rounded-card border border-dashed border-line p-3">
                    <span className="text-small leading-snug text-ink-3">
                      Aucun contenu à cette étape pour{" "}
                      {scopedShort ?? "ce filtre"}.
                    </span>
                    <Button variant="link" className="text-left">
                      Créer le premier contenu
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
