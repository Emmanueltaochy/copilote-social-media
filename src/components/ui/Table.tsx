import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Dense tables are grids, not <table>s: every screen needs the header and its
 * rows to share one column template, and rows are often buttons.
 */
export function TableHead({
  cols,
  children,
  sticky = false,
  className,
}: {
  cols: string;
  children: ReactNode;
  sticky?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-3 border-b border-line bg-canvas px-[14px] py-2",
        sticky && "sticky top-0 z-2",
        className,
      )}
      style={{ gridTemplateColumns: cols }}
    >
      {children}
    </div>
  );
}

export function Th({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <span className={cn("eyebrow text-ink-2", align === "right" && "text-right")}>
      {children}
    </span>
  );
}

/** 44px is the standard row; 40px for secondary lists. */
export function TableRow({
  cols,
  children,
  className,
  height = 44,
  onClick,
}: {
  cols: string;
  children: ReactNode;
  className?: string;
  height?: 40 | 44;
  onClick?: () => void;
}) {
  const shared = cn(
    "grid items-center gap-3 border-b border-line px-[14px]",
    height === 44 ? "h-11" : "h-10",
    className,
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(shared, "w-full cursor-pointer border-x-0 border-t-0 text-left hover:bg-canvas")}
        style={{ gridTemplateColumns: cols }}
      >
        {children}
      </button>
    );
  }

  return (
    <div className={shared} style={{ gridTemplateColumns: cols }}>
      {children}
    </div>
  );
}

/** Numeric cell: right-aligned and tabular so digits line up between rows. */
export function Num({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn("text-right text-base tabular-nums", className)}>{children}</span>;
}

/** Label / value line used inside side panels and metadata blocks. */
export function MetaRow({
  label,
  value,
  valueClass,
  height = 40,
}: {
  label: ReactNode;
  value: ReactNode;
  valueClass?: string;
  height?: 40 | 44;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-[10px] border-b border-line px-3",
        height === 44 ? "h-11" : "h-10",
      )}
    >
      <span className="text-small text-ink-3 whitespace-nowrap">{label}</span>
      <span className={cn("clip text-right text-base tabular-nums", valueClass)}>{value}</span>
    </div>
  );
}

/**
 * Enveloppe une table dense pour qu'elle défile dans sa carte, et non avec
 * la page.
 *
 * Une table de six colonnes ne tient pas sur un téléphone. La rétrécir la
 * rendrait illisible ; laisser la page entière glisser sur le côté ferait
 * partir l'en-tête et les autres cartes avec elle, et on se retrouve à
 * chercher où l'on est. Le défilement reste donc là où la largeur manque.
 */
export function TableScroll({
  min = 740,
  children,
}: {
  /** Largeur en deçà de laquelle les colonnes s'écraseraient. */
  min?: number;
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: min }}>{children}</div>
    </div>
  );
}
