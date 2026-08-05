"use client";

import { useState } from "react";
import { PageHeader, Toolbar } from "@/components/shell/Screen";
import { Button, Chip } from "@/components/ui/Button";
import { Dot, Eyebrow, MediaSlot } from "@/components/ui/primitives";
import { MetaRow } from "@/components/ui/Table";
import { ASSETS, RIGHTS, type RightsKey } from "@/data/assets";
import { cn } from "@/lib/cn";
import { toneText } from "@/lib/tone";
import { useApp } from "@/state/app";

type Filters = { type: string; rights: string; used: string };

const DEFAULT_FILTERS: Filters = { type: "Tous", rights: "Tous", used: "Tous" };

const FILTER_GROUPS: { group: string; key: keyof Filters; options: [string, string][] }[] = [
  { group: "Type", key: "type", options: [["Tous", "Tous"], ["Photo", "Photo"], ["Vidéo", "Vidéo"]] },
  {
    group: "Droits",
    key: "rights",
    options: [
      ["Tous", "Tous"],
      ["illimites", "Illimités"],
      ["renouveler", "À renouveler"],
      ["expire", "Expirés"],
    ],
  },
  {
    group: "Usage",
    key: "used",
    options: [["Tous", "Tous"], ["Publié", "Déjà publié"], ["Jamais utilisé", "Jamais utilisé"]],
  },
];

export default function AssetsPage() {
  const { inScope } = useApp();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const rows = ASSETS.filter((asset) => {
    if (!inScope(asset.client)) return false;
    if (filters.type !== "Tous" && asset.kind !== filters.type) return false;
    if (filters.rights !== "Tous" && asset.rights !== filters.rights) return false;
    if (filters.used !== "Tous" && (filters.used === "Publié") !== asset.used) return false;
    return true;
  });

  const asset = rows.find((r) => r.name === selectedName) ?? rows[0] ?? ASSETS[0];
  const watchCount = rows.filter((r) => r.rights !== "illimites").length;

  return (
    <>
      <PageHeader
        title="Bibliothèque d'assets"
        sub="18 médias · 4 avec des droits à surveiller"
        action="Importer des médias"
      />

      <Toolbar
        minWidth={1020}
        right={
          <span className="flex-none text-small whitespace-nowrap text-ink-3 tabular-nums">
            {rows.length} médias · {watchCount} avec des droits à surveiller
          </span>
        }
      >
        {FILTER_GROUPS.map((g) => (
          <span key={g.group} className="flex flex-none items-center gap-[6px]">
            <Eyebrow className="whitespace-nowrap">{g.group}</Eyebrow>
            {g.options.map(([value, label]) => (
              <Chip
                key={value}
                active={filters[g.key] === value}
                onClick={() => {
                  setFilters((f) => ({ ...f, [g.key]: value }));
                  setSelectedName(null);
                }}
              >
                {label}
              </Chip>
            ))}
          </span>
        ))}
      </Toolbar>

      <div className="flex min-h-0 min-w-[1020px] flex-1 overflow-hidden">
        <div className="min-w-[600px] flex-1 overflow-auto px-5 pt-4 pb-6">
          {rows.length === 0 ? (
            <div className="flex flex-col items-start gap-2 rounded-card border border-line bg-paper p-5">
              <span className="text-lead font-medium">Aucun média ne correspond à ces filtres.</span>
              <Button
                variant="link"
                onClick={() => {
                  setFilters(DEFAULT_FILTERS);
                  setSelectedName(null);
                }}
              >
                Réinitialiser les filtres
              </Button>
            </div>
          ) : null}

          {/* items-start: tiles keep their own aspect ratio instead of being
              stretched to the tallest card in the row. */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] items-start gap-3">
            {rows.map((r) => {
              const rights = RIGHTS[r.rights as RightsKey];
              return (
                <button
                  key={r.name}
                  type="button"
                  onClick={() => setSelectedName(r.name)}
                  className={cn(
                    "flex cursor-pointer flex-col overflow-hidden rounded-card border bg-paper p-0 text-left hover:border-line-strong",
                    asset.name === r.name ? "border-gold" : "border-line",
                  )}
                >
                  <span
                    className="relative block border-b border-line bg-slot"
                    style={{ aspectRatio: r.ratio }}
                  >
                    <span className="eyebrow absolute top-2 left-2 tracking-[0.06em] text-ink-3">
                      {r.kind}
                    </span>
                    {r.used ? (
                      <span className="eyebrow absolute top-2 right-2 rounded-full border border-line bg-paper px-[7px] py-[2px] tracking-[0.06em] text-ink-2">
                        Publié
                      </span>
                    ) : null}
                    <span className="absolute right-2 bottom-2 text-micro text-ink-3 tabular-nums">
                      {r.dimensions}
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-col gap-[3px] px-[10px] py-2">
                    <span className="clip text-small font-medium">{r.name}</span>
                    <span className="clip text-micro text-ink-3">{r.client}</span>
                    <span className="flex items-center gap-[5px]">
                      <Dot tone={rights.tone} solid size={5} />
                      <span className={cn("clip text-micro", toneText[rights.tone])}>
                        {rights.label}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="flex w-[340px] flex-none flex-col overflow-auto border-l border-line bg-paper">
          <div className="flex flex-none items-center justify-between border-b border-line px-[14px] py-3">
            <Eyebrow>Aperçu</Eyebrow>
            <span className="text-small text-ink-3 tabular-nums">{asset.dimensions}</span>
          </div>
          <div className="flex flex-col gap-[14px] p-[14px]">
            <MediaSlot label={asset.kind} ratio={asset.ratio} className="rounded-card border" />
            <div className="flex flex-col gap-[2px]">
              <span className="text-lead font-medium">{asset.name}</span>
              <span className="text-small text-ink-3">
                {asset.client} · {asset.shoot}
              </span>
            </div>
            <div className="overflow-hidden rounded-card border border-line">
              <MetaRow
                label="Format"
                value={asset.kind === "Vidéo" ? "MP4 · H.264" : "JPEG · sRGB"}
              />
              <MetaRow label="Dimensions" value={asset.dimensions} />
              <MetaRow label="Auteur" value={asset.author} />
              <MetaRow label="Tournage" value={asset.shoot} />
              <MetaRow
                label="Droits"
                value={RIGHTS[asset.rights].label}
                valueClass={toneText[RIGHTS[asset.rights].tone]}
              />
              <MetaRow
                label="Statut"
                value={asset.used ? "Déjà publié" : "Jamais utilisé"}
                valueClass={asset.used ? "text-ink-2" : "text-ink-3"}
              />
            </div>
            <div className="flex flex-col gap-[6px]">
              <Eyebrow>Réutilisations</Eyebrow>
              {(asset.used
                ? [
                    { label: "Post feed du 14 août", when: "Instagram" },
                    { label: "Story du 18 août", when: "Instagram" },
                  ]
                : [{ label: "Aucune réutilisation", when: "—" }]
              ).map((u) => (
                <span key={u.label} className="flex items-baseline gap-2">
                  <span className="clip flex-1 text-base">{u.label}</span>
                  <span className="text-small whitespace-nowrap text-ink-3">{u.when}</span>
                </span>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <Button variant="primary" size="md">
                Utiliser dans un contenu
              </Button>
              <Button size="md">Télécharger l&apos;original</Button>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
