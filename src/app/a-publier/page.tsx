"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shell/Screen";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Eyebrow } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

type Row = {
  id: string;
  time: string;
  slotLabel: string;
  kind: string;
  title: string;
  client: string;
  network: string;
  /** Published before this session started. */
  alreadyDone?: boolean;
  /** Past its scheduled time and still unpublished. */
  overdue?: boolean;
};

const ROWS: Row[] = [
  {
    id: "r0",
    time: "09:00",
    slotLabel: "Passé",
    kind: "STO",
    title: "Story « Braderie de rentrée »",
    client: "Centre Commercial Casabona",
    network: "Instagram",
    alreadyDone: true,
  },
  {
    id: "r1",
    time: "11:00",
    slotLabel: "En retard",
    kind: "FEED",
    title: "Post feed « Sortie catamaran »",
    client: "Cap Marine",
    network: "Instagram",
    overdue: true,
  },
  {
    id: "r2",
    time: "12:30",
    slotLabel: "Dans 1 h",
    kind: "REEL",
    title: "Reel « Bowl du jour »",
    client: "Pitaya",
    network: "TikTok",
  },
  {
    id: "r3",
    time: "17:00",
    slotLabel: "Ce soir",
    kind: "FEED",
    title: "Post feed « Défi d'août »",
    client: "AC Gym",
    network: "Facebook",
  },
  {
    id: "r4",
    time: "18:30",
    slotLabel: "Ce soir",
    kind: "STO",
    title: "Story « Panier du soir »",
    client: "Vite Frais Bien Frais",
    network: "Instagram",
  },
];

const COLS = "44px minmax(180px,1fr) 108px 210px 280px";

/**
 * v1 posts by hand. This screen exists so that "did we actually publish it?"
 * has an answer: marking a content as published asks for the post link and
 * timestamps who did it.
 */
export default function PublishPage() {
  const [published, setPublished] = useState<string[]>([]);
  const [asking, setAsking] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const isDone = (r: Row) => r.alreadyDone || published.includes(r.id);
  const isOverdue = (r: Row) => !!r.overdue && !isDone(r);

  const doneCount = ROWS.filter(isDone).length;
  const lateCount = ROWS.filter(isOverdue).length;
  const upcoming = ROWS.filter((r) => !isDone(r) && !isOverdue(r)).length;

  // Rows sharing a slot are grouped so the day reads as a schedule.
  const groups = ROWS.reduce<{ time: string; label: string; rows: Row[] }[]>((acc, r) => {
    const existing = acc.find((g) => g.time === r.time);
    if (existing) existing.rows.push(r);
    else acc.push({ time: r.time, label: r.slotLabel, rows: [r] });
    return acc;
  }, []);

  return (
    <>
      <PageHeader
        title="À publier"
        sub="Mardi 25 août 2026 · 5 contenus validés · publication manuelle"
        action="Saisir un post publié"
      />

      <div className="flex flex-none items-center justify-between gap-4 border-b border-line bg-paper px-5 py-2">
        <div className="flex items-center gap-[10px]">
          <Eyebrow>Jour</Eyebrow>
          <span className="text-base font-medium">Mardi 25 août</span>
          <span className="pl-[6px] text-small text-ink-3 tabular-nums">
            {doneCount} {doneCount > 1 ? "publiés" : "publié"} · {lateCount} en retard ·{" "}
            {upcoming} à venir
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button>Tout télécharger</Button>
          <span className="text-small text-ink-3">
            Aucune connexion automatique aux réseaux en v1
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-start justify-start overflow-auto px-5 pt-4 pb-6">
        <div className="mx-auto flex w-full max-w-[1060px] flex-col gap-[14px]">
          {groups.map((g) => {
            const groupOverdue = g.rows.some(isOverdue);
            const groupDone = g.rows.every(isDone);
            return (
              <Card key={g.time} className="min-w-[900px]">
                <div className="flex items-center justify-between border-b border-line bg-canvas px-[14px] py-[10px]">
                  <span className="flex items-center gap-[10px]">
                    <span
                      className={cn(
                        "text-base font-semibold tabular-nums",
                        groupOverdue ? "text-alert" : groupDone ? "text-ink-3" : "text-ink-2",
                      )}
                    >
                      {g.time}
                    </span>
                    <Eyebrow tone={groupOverdue ? "alert" : groupDone ? "muted" : "neutral"}>
                      {g.label}
                    </Eyebrow>
                  </span>
                  <span className="text-small text-ink-3 tabular-nums">
                    {g.rows.length} {g.rows.length > 1 ? "contenus" : "contenu"}
                  </span>
                </div>

                {g.rows.map((r) => {
                  const done = isDone(r);
                  const overdue = isOverdue(r);
                  return (
                    <div
                      key={r.id}
                      className={cn(
                        "grid min-h-11 items-center gap-3 border-b border-line px-[14px] py-[6px]",
                        overdue ? "bg-alert-wash" : "bg-paper",
                      )}
                      style={{ gridTemplateColumns: COLS }}
                    >
                      <span className="flex h-11 w-9 items-center justify-center rounded-control border border-line bg-slot text-micro font-semibold text-ink-3">
                        {r.kind}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="clip text-base font-medium">{r.title}</span>
                        <span className="clip text-small text-ink-3">
                          {r.client} · {r.network}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "text-small font-medium tabular-nums",
                          done ? "text-ok" : overdue ? "text-alert" : "text-ink-2",
                        )}
                      >
                        {done ? "Publié" : overdue ? "En retard de 3 h 50" : "Prêt"}
                      </span>
                      <span className="flex gap-[6px]">
                        <Button
                          onClick={() => setCopied(r.id)}
                          className={cn(
                            "px-[9px]",
                            copied === r.id && "border-ok text-ok",
                          )}
                        >
                          {copied === r.id ? "Légende copiée" : "Copier la légende"}
                        </Button>
                        <Button className="px-[9px]">Télécharger</Button>
                      </span>

                      <span className="flex items-center justify-end gap-2">
                        {done ? (
                          <span className="flex items-center gap-2">
                            <span className="text-small font-medium whitespace-nowrap text-ok">
                              {r.alreadyDone
                                ? "Publié à 09:03 par Léa"
                                : "Publié à l'instant par Emmanuel"}
                            </span>
                            <button
                              type="button"
                              className="cursor-pointer border-none bg-transparent p-0 text-small text-ink-2 underline hover:text-ink"
                            >
                              Voir le post
                            </button>
                          </span>
                        ) : asking === r.id ? (
                          <span className="flex w-full items-center gap-[6px]">
                            {/* The link is the proof — nothing is marked done without it. */}
                            <span className="clip flex-1 rounded-control border border-gold px-2 py-[6px] text-small text-ink-3">
                              Coller le lien du post publié…
                            </span>
                            <Button
                              variant="primary"
                              className="px-[9px]"
                              onClick={() => {
                                setPublished((p) => [...p, r.id]);
                                setAsking(null);
                              }}
                            >
                              Publié
                            </Button>
                          </span>
                        ) : (
                          <Button
                            variant={overdue ? "primary" : "secondary"}
                            onClick={() => setAsking(r.id)}
                          >
                            Marquer comme publié
                          </Button>
                        )}
                      </span>
                    </div>
                  );
                })}
              </Card>
            );
          })}

          <span className="text-small text-ink-3">
            Marquer comme publié demande le lien du post et horodate l&apos;action. Un contenu non
            publié à H+2 bascule en alerte et remonte au cockpit.
          </span>
        </div>
      </div>
    </>
  );
}
