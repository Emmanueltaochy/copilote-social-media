"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { ClientChip, NetworkDot } from "./bits";

export type TopPost = {
  id: string;
  clientName: string;
  network: string;
  text: string | null;
  imageUrl: string | null;
  url: string | null;
  reach: number;
  views: number;
  interactions: number;
  saves: number;
  multiple: number | null;
};

const TABS = [
  { key: "reach", label: "Portée" },
  { key: "views", label: "Vues" },
  { key: "interactions", label: "Interactions" },
] as const;
type Key = (typeof TABS)[number]["key"];

function compact(n: number) {
  if (Math.abs(n) >= 10_000) return `${(n / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k`;
  return Math.round(n).toLocaleString("fr-FR");
}

/** La meilleure publication du mois, classée selon la mesure choisie. */
export function TopPostCard({ posts }: { posts: Record<Key, TopPost | null> }) {
  const [key, setKey] = useState<Key>("reach");
  const top = posts[key];
  const label = key === "reach" ? "portée" : key === "views" ? "vues" : "interactions";
  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex rounded-full bg-mute p-[3px] self-start">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setKey(t.key)}
            className={cn(
              "cursor-pointer rounded-full border-none px-3 py-[5px] text-small font-semibold",
              key === t.key ? "bg-paper text-ink shadow-soft" : "bg-transparent text-ink-3 hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {top ? (
        <a
          href={top.url ?? "#"}
          target="_blank"
          rel="noreferrer"
          className="group relative flex min-h-[300px] flex-1 flex-col justify-end overflow-hidden rounded-[22px] bg-night p-4 text-white no-underline hover:no-underline"
        >
          {top.imageUrl ? (
            // Image hébergée par le réseau social : pas d'optimisation Next possible.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={top.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-90" referrerPolicy="no-referrer" />
          ) : null}
          <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_30%,rgba(0,0,0,.82))]" />
          {top.multiple && top.multiple >= 1.5 ? (
            <span className="absolute top-4 left-4 rounded-full bg-accent px-3 py-[3px] text-small font-semibold text-accent-ink">
              {top.multiple.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}× {label === "portée" ? "la portée" : `les ${label}`} habituelle{label === "portée" ? "" : "s"}
            </span>
          ) : null}
          <span className="relative flex items-center gap-2 text-small">
            <ClientChip name={top.clientName} size={22} /> {top.clientName}
            <span className="ml-auto">
              <NetworkDot network={top.network} size={22} />
            </span>
          </span>
          <p className="relative mt-2 mb-3 line-clamp-2 max-h-[2.9em] overflow-hidden text-base leading-[1.45] font-medium break-words">
            {top.text || "Publication sans texte"}
          </p>
          <span className="relative flex gap-6">
            <Stat value={compact(Math.max(top.reach, top.views))} label="portée" strong={key === "reach"} />
            <Stat value={compact(top.views)} label="vues" strong={key === "views"} />
            <Stat value={compact(top.interactions)} label="interactions" strong={key === "interactions"} />
          </span>
        </a>
      ) : (
        <p className="text-base text-ink-3">Aucune publication relevée ce mois-ci pour ce périmètre.</p>
      )}
    </div>
  );
}

function Stat({ value, label, strong }: { value: string; label: string; strong?: boolean }) {
  return (
    <span className={cn("flex flex-col", !strong && "opacity-70")}>
      <span className="text-[22px] leading-none font-bold tracking-[-0.02em]">{value}</span>
      <span className="text-micro text-white/70">{label}</span>
    </span>
  );
}
