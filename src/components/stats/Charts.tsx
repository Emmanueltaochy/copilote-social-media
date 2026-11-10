/*
 * Graphiques des statistiques, dessinés en SVG côté serveur : pas de
 * bibliothèque, et les couleurs suivent le thème par les variables CSS.
 */

export function fmt(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1_000_000)
    return `${(n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: digits })} M`;
  if (a >= 10_000)
    return `${(n / 1000).toLocaleString("fr-FR", { maximumFractionDigits: digits })} k`;
  return Math.round(n).toLocaleString("fr-FR");
}

export function pct(n: number | null | undefined, signed = true): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${signed && n >= 0 ? "+" : ""}${n.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
}

function niceMax(v: number) {
  if (v <= 5) return 5;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** Courbe de la période, et la période précédente en pointillés. */
export function LineChart({
  axis,
  values,
  previous,
  color = "var(--c-ok)",
  height = 220,
}: {
  axis: string[];
  values: number[];
  previous?: number[];
  color?: string;
  height?: number;
}) {
  const W = 640;
  const H = height;
  const P = { l: 40, r: 10, t: 10, b: 24 };
  const all = [...values, ...(previous ?? [])];
  const max = niceMax(Math.max(1, ...all));
  const min = Math.min(0, ...all);
  const span = max - min || 1;
  const x = (i: number) =>
    P.l + (axis.length <= 1 ? 0 : (i / (axis.length - 1)) * (W - P.l - P.r));
  const y = (v: number) => P.t + (1 - (v - min) / span) * (H - P.t - P.b);
  const path = (vs: number[]) =>
    vs
      .map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join(" ");
  const line = path(values);
  const area = values.length
    ? `${line} L${x(values.length - 1)},${y(min)} L${x(0)},${y(min)} Z`
    : "";
  const ticks = [
    0,
    Math.round((axis.length - 1) / 3),
    Math.round(((axis.length - 1) * 2) / 3),
    axis.length - 1,
  ];
  const label = (d: string) =>
    new Date(d + "T12:00:00").toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
    });
  const gid = `g${Math.abs(values.reduce((h, v, i) => (h * 31 + v + i) | 0, 7))}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[...(min < -max * 0.15 ? [min] : []), 0, max / 2, max].map((v) => (
        <g key={v}>
          <line
            x1={P.l}
            x2={W - P.r}
            y1={y(v)}
            y2={y(v)}
            stroke="var(--c-line)"
            strokeDasharray={v === 0 ? "" : "3 4"}
          />
          <text
            x={P.l - 6}
            y={y(v) + 4}
            textAnchor="end"
            fontSize="10.5"
            fill="var(--c-ink-3)"
          >
            {fmt(v, 0)}
          </text>
        </g>
      ))}
      {area ? <path d={area} fill={`url(#${gid})`} /> : null}
      {previous?.length ? (
        <path
          d={path(previous)}
          fill="none"
          stroke="var(--c-ink-3)"
          strokeWidth="1.6"
          strokeDasharray="5 5"
        />
      ) : null}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="2.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {ticks.map((i) =>
        axis[i] ? (
          <text
            key={i}
            x={x(i)}
            y={H - 6}
            textAnchor={
              i === 0 ? "start" : i === axis.length - 1 ? "end" : "middle"
            }
            fontSize="10.5"
            fill="var(--c-ink-3)"
          >
            {label(axis[i])}
          </text>
        ) : null,
      )}
    </svg>
  );
}

export function Sparkline({
  values,
  width = 90,
  height = 26,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values
    .map(
      (v, i) =>
        `${i ? "L" : "M"}${((i / (values.length - 1)) * (width - 2) + 1).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`,
    )
    .join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <path
        d={d}
        fill="none"
        stroke={up ? "var(--c-ok)" : "var(--c-alert)"}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/** Portée moyenne par jour et par heure de publication (heure de La Réunion). */
export function Heatmap({
  cells,
}: {
  cells: { dow: number; hour: number; posts: number; reach: number }[];
}) {
  const map = new Map(cells.map((c) => [`${c.dow}-${c.hour}`, c]));
  const max = Math.max(1, ...cells.map((c) => c.reach));
  const best = [...cells]
    .filter((c) => c.posts >= 2)
    .sort((a, b) => b.reach - a.reach)
    .slice(0, 3);
  const isBest = new Set(best.map((c) => `${c.dow}-${c.hour}`));
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <div className="grid min-w-[560px] grid-cols-[34px_repeat(24,minmax(0,1fr))] gap-[3px]">
          {DAYS.map((d, di) => (
            <div key={d} className="contents">
              <span className="self-center text-micro text-ink-3">{d}</span>
              {Array.from({ length: 24 }, (_, h) => {
                const c = map.get(`${di + 1}-${h}`);
                const a = c ? 0.15 + 0.85 * (c.reach / max) : 0;
                return (
                  <span
                    key={h}
                    title={
                      c
                        ? `${d} ${h} h : ${c.posts} publication${c.posts > 1 ? "s" : ""}, portée moyenne ${fmt(c.reach)}`
                        : `${d} ${h} h : aucune publication`
                    }
                    className={`h-[18px] rounded-[5px] ${isBest.has(`${di + 1}-${h}`) ? "ring-2 ring-ink" : ""}`}
                    style={{
                      background: c
                        ? `color-mix(in srgb, var(--c-info) ${Math.round(a * 100)}%, transparent)`
                        : "var(--c-slot)",
                    }}
                  />
                );
              })}
            </div>
          ))}
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="text-center text-[9.5px] text-ink-3">
              {h % 3 === 0 ? `${h}h` : ""}
            </span>
          ))}
        </div>
      </div>
      {best.length ? (
        <div className="flex flex-wrap gap-2">
          {best.map((c, i) => (
            <span
              key={i}
              className="rounded-full border border-line px-3 py-[5px] text-small"
            >
              <b className="font-semibold">{i + 1}.</b> {DAYS[c.dow - 1]}{" "}
              {c.hour} h · portée moy. {fmt(c.reach)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
