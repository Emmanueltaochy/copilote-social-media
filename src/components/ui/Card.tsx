import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { toneText, type Tone } from "@/lib/tone";
import { Eyebrow } from "./primitives";

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
        "flex-none overflow-hidden rounded-card border border-line bg-paper",
        padded && "p-4",
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
        "flex items-center justify-between gap-3 border-b border-line px-[14px] py-3",
        className,
      )}
    >
      {typeof title === "string" ? <Eyebrow>{title}</Eyebrow> : title}
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
    <div
      className={cn(
        "grid gap-px overflow-hidden rounded-card border border-line bg-line",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
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
    <div className="flex flex-col gap-[3px] bg-paper px-[14px] py-3">
      <Eyebrow>{label}</Eyebrow>
      <span
        className={cn(
          "font-semibold tabular-nums",
          size === "lg" ? "text-display" : "text-title",
          toneText[valueTone],
        )}
      >
        {value}
      </span>
      {meta ? <span className={cn("text-small", toneText[metaTone])}>{meta}</span> : null}
    </div>
  );
}
