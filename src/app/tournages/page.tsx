"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shell/Screen";
import { Button } from "@/components/ui/Button";
import { Card, CardHead, KpiGrid } from "@/components/ui/Card";
import { Avatar, CheckBox, Dot, Eyebrow, StatusPill } from "@/components/ui/primitives";
import { MOODBOARD, SHOOTS } from "@/data/shoots";
import { cn } from "@/lib/cn";
import { toneText } from "@/lib/tone";
import { useApp } from "@/state/app";

const GROUPS = ["Cette semaine", "Semaine prochaine"] as const;

export default function ShootsPage() {
  const { inScope } = useApp();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Checked shots, per shoot. Ticked from a phone during the shoot. */
  const [checked, setChecked] = useState<Record<string, number[]>>({});

  const list = SHOOTS.filter((s) => inScope(s.client));
  const shoot = list.find((s) => s.id === selectedId) ?? list[0] ?? SHOOTS[0];
  const shots = checked[shoot.id] ?? [0, 1, 2];

  const toggleShot = (i: number) =>
    setChecked((c) => ({
      ...c,
      [shoot.id]: shots.includes(i) ? shots.filter((x) => x !== i) : [...shots, i],
    }));

  const gearIncomplete = shoot.gear.some((g) => g.tone === "alert");
  const rightsSigned = shoot.rights.filter((r) => r.tone === "ok").length;
  const rightsTone = shoot.rights.some((r) => r.tone === "alert")
    ? "alert"
    : shoot.rights.some((r) => r.tone === "warn")
      ? "warn"
      : "ok";

  return (
    <>
      <PageHeader
        title="Planning tournages"
        sub="4 tournages sur 7 jours · 2 demandent une action avant le départ"
        action="Planifier un tournage"
      />

      <div className="flex min-h-0 min-w-[1060px] flex-1 overflow-hidden">
        <div className="flex w-[312px] flex-none flex-col overflow-hidden border-r border-line bg-paper">
          <div className="flex flex-none items-center justify-between gap-2 border-b border-line px-3 py-[10px]">
            <Eyebrow>Planning terrain</Eyebrow>
            <span className="text-small text-ink-3 tabular-nums">{list.length} tournages</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {GROUPS.map((g) => {
              const items = list.filter((s) => s.group === g);
              if (!items.length) return null;
              return (
                <div key={g} className="flex flex-col">
                  <div className="flex items-center justify-between border-b border-line bg-canvas px-3 py-2">
                    <Eyebrow tone="neutral">{g}</Eyebrow>
                    <span className="text-small text-ink-3 tabular-nums">{items.length}</span>
                  </div>
                  {items.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedId(s.id)}
                      className={cn(
                        "flex w-full cursor-pointer flex-col gap-[3px] border-b border-line border-l-2 px-3 py-[10px] text-left hover:bg-canvas",
                        shoot.id === s.id
                          ? "border-l-gold bg-gold-wash"
                          : "border-l-transparent bg-paper",
                      )}
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="clip text-base font-medium">{s.client}</span>
                        <span className="text-small whitespace-nowrap text-ink-2 tabular-nums">
                          {s.slot.split(" · ")[0]}
                        </span>
                      </span>
                      <span className="clip text-small text-ink-3">{s.place}</span>
                      <span className="flex items-center gap-[6px]">
                        <Dot tone={s.noteTone} solid />
                        <span className={cn("clip text-small", toneText[s.noteTone])}>
                          {s.note}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex min-w-[600px] flex-1 flex-col gap-4 overflow-auto px-5 pt-4 pb-6">
          <Card className="flex flex-col gap-[14px] p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-[2px]">
                <Eyebrow>Fiche tournage</Eyebrow>
                <span className="text-title font-semibold">{shoot.title}</span>
                <span className="text-base text-ink-2">
                  {shoot.client} · {shoot.slot}
                </span>
              </div>
              <div className="flex flex-none items-center gap-2">
                <StatusPill tone={shoot.statusTone}>{shoot.status}</StatusPill>
                <Button>Envoyer la feuille de route</Button>
              </div>
            </div>
            <KpiGrid columns={4}>
              {shoot.facts.map((f) => (
                <div key={f.label} className="flex flex-col gap-[2px] bg-paper px-3 py-[10px]">
                  <Eyebrow>{f.label}</Eyebrow>
                  <span className="text-base font-medium tabular-nums">{f.value}</span>
                  <span className="text-small text-ink-3">{f.meta}</span>
                </div>
              ))}
            </KpiGrid>
          </Card>

          <div
            className="grid items-start gap-4"
            style={{ gridTemplateColumns: "minmax(320px,1fr) minmax(280px,340px)" }}
          >
            <div className="flex min-w-0 flex-col gap-4">
              <Card>
                <CardHead
                  title="Shotlist"
                  meta={`${shots.length} sur ${shoot.shots.length} plans`}
                />
                {shoot.shots.map((s, i) => {
                  const on = shots.includes(i);
                  return (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => toggleShot(i)}
                      className="flex h-10 w-full cursor-pointer items-center gap-[10px] border-b border-line bg-transparent px-[14px] text-left hover:bg-canvas"
                    >
                      <CheckBox checked={on} />
                      <span className={cn("clip text-base", on ? "text-ink-2" : "text-ink")}>
                        {s.label}
                      </span>
                      <Eyebrow className="ml-auto tracking-[0.06em] whitespace-nowrap">
                        {s.kind}
                      </Eyebrow>
                    </button>
                  );
                })}
                <div className="flex items-center justify-between gap-[10px] px-[14px] py-[10px]">
                  <span className="text-small text-ink-3">
                    Cochable depuis le mobile pendant le tournage.
                  </span>
                  <Button variant="link">Ajouter un plan</Button>
                </div>
              </Card>

              <Card>
                <CardHead title="Moodboard" meta="Validé par le client le 22 août" />
                <div className="grid grid-cols-4 gap-[10px] px-[14px] py-3">
                  {MOODBOARD.map((m) => (
                    <div key={m} className="flex flex-col gap-[6px]">
                      <div className="aspect-square rounded-control border border-line bg-slot" />
                      <span className="clip text-micro text-ink-3">{m}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <CardHead title="Livrables attendus" />
                {shoot.deliverables.map((d) => (
                  <div
                    key={d.label}
                    className="flex h-10 items-center justify-between gap-[10px] border-b border-line px-[14px]"
                  >
                    <span className="clip text-base">{d.label}</span>
                    <span
                      className={cn(
                        "text-small whitespace-nowrap tabular-nums",
                        toneText[d.tone],
                      )}
                    >
                      {d.value}
                    </span>
                  </div>
                ))}
              </Card>
            </div>

            <div className="flex min-w-0 flex-col gap-4">
              <Card>
                <CardHead title="Équipe" />
                {shoot.crew.map((c) => (
                  <div
                    key={c.name}
                    className="flex h-11 items-center gap-[10px] border-b border-line px-[14px]"
                  >
                    <Avatar initials={c.initial} />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-base font-medium">{c.name}</span>
                      <span className="text-small text-ink-3">{c.role}</span>
                    </span>
                    <span
                      className={cn("ml-auto text-small whitespace-nowrap", toneText[c.tone])}
                    >
                      {c.state}
                    </span>
                  </div>
                ))}
              </Card>

              <Card>
                <CardHead title="Matériel">
                  <span
                    className={cn(
                      "text-small",
                      gearIncomplete ? "text-alert" : "text-ok",
                    )}
                  >
                    {gearIncomplete ? "Réservation incomplète" : "Tout est réservé"}
                  </span>
                </CardHead>
                {shoot.gear.map((g) => (
                  <div
                    key={g.label}
                    className="flex h-10 items-center justify-between gap-[10px] border-b border-line px-[14px]"
                  >
                    <span className="clip text-base">{g.label}</span>
                    <span className={cn("text-small whitespace-nowrap", toneText[g.tone])}>
                      {g.state}
                    </span>
                  </div>
                ))}
              </Card>

              {/* Image rights sit on the shoot sheet, not in a folder — this is
                  where the agency can still do something about them. */}
              <Card>
                <CardHead title="Droit à l'image">
                  <span className={cn("text-small tabular-nums", toneText[rightsTone])}>
                    {rightsSigned} sur {shoot.rights.length} signées
                  </span>
                </CardHead>
                {shoot.rights.map((r) => (
                  <div
                    key={r.name}
                    className="flex h-10 items-center justify-between gap-[10px] border-b border-line px-[14px]"
                  >
                    <span className="clip text-base">{r.name}</span>
                    <span className={cn("text-small whitespace-nowrap", toneText[r.tone])}>
                      {r.state}
                    </span>
                  </div>
                ))}
                <div className="px-[14px] py-[10px]">
                  <Button className="w-full">Envoyer les autorisations manquantes</Button>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
