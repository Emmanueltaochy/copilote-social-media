import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { toneText, type Tone } from "@/lib/tone";

/** White panel on the canvas. The only container shape in the product. */
export function Card({
  children,
  className,
  padded = false,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={cn(
        "flex-none overflow-hidden rounded-[26px] border border-line bg-paper shadow-soft",
        padded && "p-5",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Card header: eyebrow on the left, quiet meta on the right. */
export function CardHead({
  title,
  meta,
  children,
  className,
}: {
  title: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-5 pt-5 pb-3",
        className,
      )}
    >
      {typeof title === "string" ? <h2 className="text-lead font-semibold text-ink">{title}</h2> : title}
      {meta ? <span className="text-small text-ink-3 tabular-nums">{meta}</span> : null}
      {children}
    </div>
  );
}

/**
 * KPI strip. The 1px gap over a line-coloured background gives hairline
 * dividers without nested borders.
 */
export function KpiGrid({
  columns,
  children,
  className,
}: {
  columns: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    // Sur téléphone, deux colonnes au plus : quatre chiffres côte à côte sur
    // 390 px se coupent mot par mot.
    <div
      className={cn(
        "grid gap-3",
        columns > 1 ? "grid-cols-2 lg:grid-cols-[repeat(var(--kpi-cols),minmax(0,1fr))]" : "grid-cols-1",
        className,
      )}
      style={{ "--kpi-cols": columns } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

export function Kpi({
  label,
  value,
  meta,
  valueTone = "ink",
  metaTone = "muted",
  size = "md",
}: {
  label: string;
  value: ReactNode;
  meta?: ReactNode;
  valueTone?: Tone;
  metaTone?: Tone;
  size?: "md" | "lg";
}) {
  return (
    <div className="flex flex-col gap-1 rounded-[22px] border border-line bg-paper px-5 py-4 shadow-soft">
      <span className="text-small text-ink-3">{label}</span>
      <span
        className={cn(
          "leading-tight font-bold tracking-[-0.02em] tabular-nums",
          size === "lg" ? "text-[34px]" : "text-[26px]",
          toneText[valueTone],
        )}
      >
        {value}
      </span>
      {meta ? <span className={cn("text-small", toneText[metaTone])}>{meta}</span> : null}
    </div>
  );
}
