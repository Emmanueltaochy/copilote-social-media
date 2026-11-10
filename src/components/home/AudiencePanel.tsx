"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import type { AudienceData } from "@/db/home-queries";
import { NetworkDot, networkLabel } from "./bits";

/*
 * Croissance de l'audience : nouveaux abonnés par jour, sur 30 ou 90 jours,
 * tous réseaux ou un seul. Les chiffres viennent des relevés Metricool.
 */

const W = 640;
const H = 210;
const PAD = { l: 34, r: 8, t: 10, b: 24 };

function fmt(n: number) {
  const a = Math.abs(n);
  if (a >= 10_000) return `${(n / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k`;
  return n.toLocaleString("fr-FR");
}

function niceMax(v: number) {
  if (v <= 5) return 5;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

const METRICS = [
  { key: "gained", label: "Nouveaux abonnés", sum: true },
  { key: "followers", label: "Abonnés", sum: false },
  { key: "views", label: "Vues", sum: true },
  { key: "reach", label: "Portée", sum: true },
  { key: "interactions", label: "Interactions", sum: true },
] as const;
type MetricKey = (typeof METRICS)[number]["key"];

export function AudiencePanel({ data }: { data: AudienceData }) {
  const [range, setRange] = useState<30 | 90>(30);
  const [net, setNet] = useState<string | null>(null);
  const [metric, setMetric] = useState<MetricKey>("gained");
  const [hover, setHover] = useState<number | null>(null);
  const meta = METRICS.find((m) => m.key === metric)!;

  const series = useMemo(() => {
    // Fenêtre comptée depuis le dernier relevé, pas depuis l'horloge du navigateur.
    const last = data.points.at(-1)?.day;
    const start = last ? new Date(new Date(last + "T12:00:00Z").getTime() - (range - 1) * 86_400_000).toISOString().slice(0, 10) : "";
    return data.points
      .filter((p) => p.day >= start)
      .map((p) => ({ day: p.day, v: net ? (p.mByNetwork?.[net]?.[metric] ?? 0) : (p.m?.[metric] ?? 0) }))
      // Les abonnés au total n'ont pas de sens avant le premier relevé.
      .filter((p) => metric !== "followers" || p.v > 0);
  }, [data.points, range, net, metric]);

  const sum = series.reduce((s, p) => s + p.v, 0);
  const first = series[0]?.v ?? 0;
  const lastV = series.at(-1)?.v ?? 0;
  // Le grand chiffre : la somme de la période, ou la valeur actuelle pour les abonnés.
  const headline = meta.sum ? sum : lastV;
  const evolution = metric === "followers" ? (first > 0 ? ((lastV - first) / first) * 100 : null) : null;
  const gainedBase = net ? (data.networks.find((n) => n.network === net)?.current ?? 0) - sum : data.current - sum;
  const pct = metric === "gained" ? (gainedBase > 0 ? (sum / gainedBase) * 100 : null) : evolution;
  const caption =
    metric === "gained"
      ? `nouveaux abonnés en ${range} jours`
      : metric === "followers"
        ? `abonnés aujourd'hui`
        : `${meta.label.toLowerCase()} des publications parues en ${range} jours`;

  // Les abonnés au total bougent peu : on cadre sur leur plage pour voir la pente.
  const vals = series.map((p) => p.v);
  const lo = vals.length ? Math.min(...vals) : 0;
  const hi = vals.length ? Math.max(...vals) : 1;
  const max = metric === "followers" ? Math.ceil(hi + Math.max(1, (hi - lo) * 0.15)) : niceMax(Math.max(1, hi));
  const min = metric === "followers" ? Math.max(0, Math.floor(lo - Math.max(1, (hi - lo) * 0.15))) : Math.min(0, lo);
  const span = max - min || 1;
  const x = (i: number) => PAD.l + (series.length <= 1 ? 0 : (i / (series.length - 1)) * (W - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + (1 - (v - min) / span) * (H - PAD.t - PAD.b);
  const line = series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = series.length ? `${line} L${x(series.length - 1).toFixed(1)},${y(min)} L${x(0).toFixed(1)},${y(min)} Z` : "";
  const ticks = series.length ? [0, Math.round((series.length - 1) / 3), Math.round(((series.length - 1) * 2) / 3), series.length - 1] : [];
  const dayLabel = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const h = hover != null ? series[hover] : null;

  return (
    <div className="flex flex-col">
      <div className="mb-1 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="text-[40px] leading-none font-bold tracking-[-0.03em] tabular-nums">
            {metric === "gained" && headline >= 0 ? "+" : ""}
            {fmt(Math.round(headline))}
          </span>
          <span className="text-small text-ink-3">
            {caption}
            {pct != null ? ` · ${pct >= 0 ? "+" : ""}${pct.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : ""}
          </span>
        </div>
        <div className="flex rounded-full bg-mute p-[3px]">
          {([30, 90] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={cn(
                "cursor-pointer rounded-full border-none px-3 py-[5px] text-small font-semibold",
                range === r ? "bg-paper text-ink shadow-soft" : "bg-transparent text-ink-3 hover:text-ink",
              )}
            >
              {r} j
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMetric(m.key)}
            className={cn(
              "cursor-pointer rounded-full border-none px-3 py-[5px] text-small font-semibold",
              metric === m.key ? "bg-night text-white" : "bg-transparent text-ink-3 hover:bg-mute hover:text-ink",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="mt-2 mb-1 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setNet(null)}
          className={cn(
            "flex cursor-pointer items-center gap-[6px] rounded-full border px-[10px] py-[3px] text-small",
            net === null ? "border-ink bg-ink text-paper" : "border-line bg-transparent text-ink-2 hover:border-line-strong",
          )}
        >
          <span className="h-2 w-2 rounded-full bg-info" /> Tous les réseaux
        </button>
        {data.networks.map((n) => (
          <button
            key={n.network}
            type="button"
            onClick={() => setNet(net === n.network ? null : n.network)}
            title={`${networkLabel(n.network)} : ${n.current.toLocaleString("fr-FR")} abonnés`}
            className={cn(
              "flex cursor-pointer items-center rounded-full border p-[2px]",
              net === n.network ? "border-ink" : "border-transparent bg-transparent opacity-80 hover:opacity-100",
            )}
          >
            <NetworkDot network={n.network} size={22} />
          </button>
        ))}
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label={`${meta.label} par jour sur ${range} jours`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (series.length - 1));
            setHover(i >= 0 && i < series.length ? i : null);
          }}
        >
          <defs>
            <linearGradient id="aud-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--c-info)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--c-info)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {(metric === "followers" ? [min, Math.round((min + max) / 2), max] : [...(min < -max * 0.15 ? [min] : []), 0, max / 2, max]).map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--c-line)" strokeDasharray={v === (metric === "followers" ? min : 0) ? "" : "3 4"} />
              <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize="10.5" fill="var(--c-ink-3)">
                {fmt(Math.round(v))}
              </text>
            </g>
          ))}
          {area ? <path d={area} fill="url(#aud-fill)" /> : null}
          {line ? <path d={line} fill="none" stroke="var(--c-info)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /> : null}
          {ticks.map((i) =>
            series[i] ? (
              <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === series.length - 1 ? "end" : "middle"} fontSize="10.5" fill="var(--c-ink-3)">
                {dayLabel(series[i].day)}
              </text>
            ) : null,
          )}
          {h && hover != null ? (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="var(--c-line-strong)" />
              <circle cx={x(hover)} cy={y(h.v)} r="4" fill="var(--c-paper)" stroke="var(--c-info)" strokeWidth="2" />
            </g>
          ) : null}
        </svg>
        {h && hover != null ? (
          <div
            className="pointer-events-none absolute top-0 rounded-[10px] bg-night px-[10px] py-[6px] text-small text-white shadow-soft"
            style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${hover > series.length / 2 ? "-105%" : "5%"})` }}
          >
            <b>{h.v >= 0 ? "+" : ""}{h.v.toLocaleString("fr-FR")}</b> · {dayLabel(h.day)}
          </div>
        ) : null}
      </div>
    </div>
  );
}
