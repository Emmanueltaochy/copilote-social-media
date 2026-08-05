"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shell/Screen";
import { Button, Chip } from "@/components/ui/Button";
import { Eyebrow, Pin } from "@/components/ui/primitives";
import { APPROVALS, CHANGE_REASONS, VERSION_META } from "@/data/approvals";
import { cn } from "@/lib/cn";
import { useApp } from "@/state/app";

type Tab = "Toutes" | "Client" | "Interne";
const TABS: { key: Tab; label: string }[] = [
  { key: "Toutes", label: "Toutes" },
  { key: "Client", label: "Attente client" },
  { key: "Interne", label: "Révision interne" },
];

const VERSIONS = ["V1", "V2", "V3"];

export default function ApprovalsPage() {
  const { inScope } = useApp();
  const [tab, setTab] = useState<Tab>("Toutes");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [version, setVersion] = useState("V3");
  const [compare, setCompare] = useState(false);
  const [activePin, setActivePin] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  const list = APPROVALS.filter(
    (a) => (tab === "Toutes" || a.stage === tab) && inScope(a.client),
  );
  const current = list.find((a) => a.id === selectedId) ?? list[0] ?? APPROVALS[0];

  /** Earlier versions only carry the pins that existed at the time. */
  const pinsFor = (v: string) =>
    v === "V3" ? current.pins : current.pins.filter((p) => Number(p.n) <= (v === "V1" ? 1 : 2));

  const canvases = compare
    ? [
        { label: "V2 · précédente", gold: false, width: "228px", pins: pinsFor("V2"), meta: VERSION_META.V2 },
        { label: "V3 · à valider", gold: true, width: "228px", pins: pinsFor("V3"), meta: VERSION_META.V3 },
      ]
    : [
        {
          label: `${version} · ${version === "V3" ? "à valider" : "archivée"}`,
          gold: version === "V3",
          width: "300px",
          pins: pinsFor(version),
          meta: VERSION_META[version],
        },
      ];

  const reset = () => {
    setActivePin(null);
    setAsking(false);
    setVersion("V3");
    setCompare(false);
  };

  return (
    <>
      <PageHeader
        title="Approbations"
        sub="6 contenus en attente · 2 validations client dépassent 5 jours"
        action="Relancer les retards"
      />

      <div className="flex min-h-0 min-w-[1060px] flex-1 overflow-hidden">
        <div className="flex w-[300px] flex-none flex-col overflow-hidden border-r border-line bg-paper">
          <div className="flex flex-none items-center gap-[6px] border-b border-line px-3 py-[10px]">
            {TABS.map((t) => (
              <Chip
                key={t.key}
                active={tab === t.key}
                onClick={() => {
                  setTab(t.key);
                  setSelectedId(null);
                  reset();
                }}
              >
                {t.label}
              </Chip>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {list.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  setSelectedId(a.id);
                  reset();
                }}
                className={cn(
                  "flex w-full cursor-pointer gap-[10px] border-b border-line border-l-2 px-3 py-[10px] text-left hover:bg-canvas",
                  current.id === a.id ? "border-l-gold bg-gold-wash" : "border-l-transparent bg-paper",
                )}
              >
                <span className="flex h-[42px] w-[34px] flex-none items-center justify-center rounded-control border border-line bg-slot text-micro font-semibold text-ink-3">
                  {a.kind}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                  <span className="clip text-base leading-snug font-medium">{a.title}</span>
                  <span className="clip text-small text-ink-3">{a.client}</span>
                  <span className="flex items-center gap-[6px]">
                    <Eyebrow tone={a.stage === "Client" ? "warn" : "neutral"}>
                      {a.stage === "Client" ? "Attente client" : "Révision interne"}
                    </Eyebrow>
                    <span
                      className={cn(
                        "ml-auto text-small font-medium tabular-nums",
                        a.old ? "text-alert" : "text-ink-3",
                      )}
                    >
                      {a.age}
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-w-[420px] flex-1 flex-col overflow-hidden">
          <div className="flex flex-none items-center justify-between gap-3 border-b border-line bg-paper px-4 py-2">
            <div className="flex items-center gap-[6px]">
              {VERSIONS.map((v) => (
                <Chip
                  key={v}
                  active={!compare && version === v}
                  className="tabular-nums"
                  onClick={() => {
                    setVersion(v);
                    setCompare(false);
                  }}
                >
                  {v}
                </Chip>
              ))}
              <Chip active={compare} className="ml-[6px]" onClick={() => setCompare((c) => !c)}>
                Comparer
              </Chip>
            </div>
            <span className="clip text-small text-ink-3 tabular-nums">
              {current.client} · {current.title} ·{" "}
              {current.stage === "Client"
                ? "en attente du client depuis "
                : "en révision interne depuis "}
              {current.age}
            </span>
          </div>

          {/* The visual is the subject here — everything else is chrome. */}
          <div className="flex min-h-0 flex-1 items-start justify-center gap-4 overflow-auto bg-canvas p-5">
            {canvases.map((c) => (
              <div key={c.label} className="flex flex-col items-center gap-2">
                <Eyebrow tone={c.gold ? "gold" : "muted"}>{c.label}</Eyebrow>
                <div
                  className="relative flex aspect-9/16 items-center justify-center rounded-card border border-line bg-slot"
                  style={{ width: c.width }}
                >
                  <Eyebrow>Visuel 1080 × 1920</Eyebrow>
                  {c.pins.map((p) => (
                    <button
                      key={p.n}
                      type="button"
                      onClick={() => setActivePin(p.n)}
                      className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                      style={{ left: p.x, top: p.y }}
                    >
                      <Pin n={p.n} active={activePin === p.n} />
                    </button>
                  ))}
                </div>
                <span className="text-small text-ink-3 tabular-nums">{c.meta}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-none items-center gap-2 border-t border-line bg-paper px-4 py-[10px]">
            {asking ? (
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <Eyebrow className="whitespace-nowrap">Motif</Eyebrow>
                {CHANGE_REASONS.map((r) => (
                  <Chip key={r} active={reason === r} onClick={() => setReason(r)}>
                    {r}
                  </Chip>
                ))}
                <Button
                  variant="primary"
                  className="ml-auto"
                  onClick={() => {
                    setAsking(false);
                    setReason(null);
                  }}
                >
                  Envoyer la demande
                </Button>
                <Button
                  onClick={() => {
                    setAsking(false);
                    setReason(null);
                  }}
                >
                  Annuler
                </Button>
              </span>
            ) : (
              <span className="flex flex-1 items-center gap-2">
                <Button variant="primary" size="md">
                  {current.stage === "Client"
                    ? "Valider au nom du client"
                    : "Valider et envoyer au client"}
                </Button>
                <Button size="md" onClick={() => setAsking(true)}>
                  Demander une modification
                </Button>
                <span
                  className={cn(
                    "ml-auto text-small",
                    current.old ? "text-warn" : "text-ink-3",
                  )}
                >
                  {current.old
                    ? "Relance automatique envoyée demain 09:00"
                    : `Dernière action il y a ${current.age}`}
                </span>
              </span>
            )}
          </div>
        </div>

        <aside className="flex w-[340px] flex-none flex-col overflow-hidden border-l border-line bg-paper">
          <div className="flex flex-none items-center justify-between border-b border-line px-[14px] py-3">
            <Eyebrow>Commentaires épinglés</Eyebrow>
            <span className="text-small text-ink-3 tabular-nums">
              {current.pins.length} {current.pins.length > 1 ? "pastilles" : "pastille"}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {current.pins.length ? (
              current.pins.map((p) => (
                <button
                  key={p.n}
                  type="button"
                  onClick={() => setActivePin(p.n)}
                  className={cn(
                    "flex w-full cursor-pointer gap-[9px] border-b border-line px-[14px] py-[10px] text-left hover:bg-canvas",
                    activePin === p.n ? "bg-gold-wash" : "bg-paper",
                  )}
                >
                  <Pin n={p.n} active={activePin === p.n} size={20} />
                  <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <span className="flex items-baseline gap-2">
                      <span className="text-small font-semibold">{p.who}</span>
                      <span className="ml-auto text-micro whitespace-nowrap text-ink-3">
                        {p.when}
                      </span>
                    </span>
                    <span className="text-base leading-relaxed">{p.text}</span>
                    <Eyebrow
                      tone={/Traité/.test(p.status) ? "ok" : "warn"}
                      className="tracking-[0.06em]"
                    >
                      {p.status}
                    </Eyebrow>
                  </span>
                </button>
              ))
            ) : (
              <div className="flex gap-[9px] border-b border-line px-[14px] py-[10px]">
                <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full border border-line text-micro font-semibold text-ink-3">
                  —
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <span className="text-small font-semibold">Aucun commentaire</span>
                  <span className="text-base leading-relaxed">
                    Personne n&apos;a encore annoté ce visuel. Cliquer sur l&apos;image pour
                    épingler une remarque.
                  </span>
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-none flex-col gap-2 border-t border-line px-[14px] py-3">
            <Eyebrow>Historique</Eyebrow>
            {current.history.map(([text, when]) => (
              <span key={text} className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 text-small text-ink-2">{text}</span>
                <span className="text-micro whitespace-nowrap text-ink-3 tabular-nums">{when}</span>
              </span>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}
