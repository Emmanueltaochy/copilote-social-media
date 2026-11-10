import { cn } from "@/lib/cn";
import { Eyebrow } from "./primitives";

type Size = "sm" | "md" | "lg";

const TRACK: Record<Size, string> = { sm: "h-1", md: "h-2", lg: "h-[14px]" };
const MARKER: Record<Size, string> = {
  sm: "-top-[3px] -bottom-[3px] w-[2px]",
  md: "-top-[5px] -bottom-[5px] w-[3px]",
  lg: "-top-[6px] -bottom-[6px] w-1",
};

/**
 * The signature component of the product.
 *
 * Three things sit on one track:
 *   · the light bar  — where this month is projected to land
 *   · the dark bar   — what has actually been delivered
 *   · the gold mark  — where we should be *today*
 *
 * That third element is the whole point: progress alone doesn't tell you
 * whether you're behind. Nothing else in the interface may use gold.
 */
export function PacingBar({
  fillPct,
  projPct,
  markerLeft,
  size = "md",
  markerLabel,
  fillClass = "bg-ink-2",
  className,
}: {
  /** Delivered, as a CSS width. */
  fillPct: string;
  /** End-of-month projection, as a CSS width. Omit to hide. */
  projPct?: string;
  /** Offset of the expected-rhythm marker. Omit to hide. */
  markerLeft?: string;
  size?: Size;
  /** Caption pinned above the marker, e.g. "Attendu aujourd'hui · 12,9". */
  markerLabel?: string;
  fillClass?: string;
  className?: string;
}) {
  const track = (
    <span className={cn("relative block rounded-full bg-slot", TRACK[size], className)}>
      {projPct ? (
        <span
          className="absolute top-0 bottom-0 left-0 rounded-full bg-line-strong"
          style={{ width: projPct }}
        />
      ) : null}
      <span
        className={cn("absolute top-0 bottom-0 left-0 rounded-full", fillClass)}
        style={{ width: fillPct }}
      />
      {markerLeft ? (
        <span
          className={cn("absolute rounded-full bg-gold", MARKER[size])}
          style={{ left: markerLeft }}
        />
      ) : null}
    </span>
  );

  if (!markerLabel) return track;

  // The label hangs to the left of the marker so it never covers the bar —
  // unless the marker sits in the first half, where it would spill out of the
  // card on a phone: it then hangs to the right.
  // « calc(33.3% - 1.5px) » ou « 33.3% » : on lit le pourcentage.
  const pos = parseFloat(/(-?[\d.]+)%/.exec(markerLeft ?? "")?.[1] ?? "");
  const right = Number.isFinite(pos) && pos < 50;

  return (
    <div className="relative pt-5">
      <Eyebrow
        tone="gold"
        className={cn("absolute top-0 whitespace-nowrap", !right && "-translate-x-full")}
        style={{ left: markerLeft, marginLeft: right ? 8 : -8 }}
      >
        {markerLabel}
      </Eyebrow>
      {track}
    </div>
  );
}
