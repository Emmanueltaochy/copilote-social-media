import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { toneDot, toneDotSolid, tonePill, toneText, type Tone } from "@/lib/tone";

/** Section label. Always 11px / 600 / uppercase; the only label style. */
export function Eyebrow({
  children,
  className,
  tone = "muted",
  style,
}: {
  children: ReactNode;
  className?: string;
  tone?: Tone;
  style?: React.CSSProperties;
}) {
  return (
    <span className={cn("eyebrow", toneText[tone], className)} style={style}>
      {children}
    </span>
  );
}

/**
 * Status dot. Filled means "something is happening"; hollow means "nothing to
 * report" — so a healthy account reads as an outline, not a green light.
 */
export function Dot({
  tone,
  size = 6,
  solid = false,
  className,
}: {
  tone: Tone;
  size?: number;
  /** Force a filled dot where the tone would otherwise read as hollow. */
  solid?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "box-border flex-none rounded-full border",
        solid ? toneDotSolid[tone] : toneDot[tone],
        className,
      )}
      style={{ width: size, height: size }}
    />
  );
}

/** Pill badge for a state: "En retard", "Confirmé", "Publié". */
export function StatusPill({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "eyebrow inline-block rounded-full px-2 py-[3px] whitespace-nowrap",
        tonePill[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Stand-in for a visual we don't have. Real media replaces this later; the
 * grey slot with its dimension label is deliberate, not a missing image.
 */
export function MediaSlot({
  label,
  ratio,
  className,
  children,
}: {
  label?: string;
  ratio?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center bg-slot border-line",
        className,
      )}
      style={ratio ? { aspectRatio: ratio } : undefined}
    >
      {label ? <Eyebrow>{label}</Eyebrow> : null}
      {children}
    </div>
  );
}

/** 14px checkbox used by the shotlist and the pre-flight checklist. */
export function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "flex h-[14px] w-[14px] flex-none items-center justify-center rounded-[4px] border text-[10px] leading-none font-semibold text-paper",
        checked ? "bg-ink border-ink" : "bg-paper border-line-strong",
      )}
    >
      {checked ? "✓" : ""}
    </span>
  );
}

/**
 * Round avatar: the person's photo when there is one, their initials otherwise.
 *
 * Initials stay the fallback rather than a generic silhouette — in a small
 * team, "LC" identifies someone; a grey bust identifies nobody.
 */
export function Avatar({
  initials,
  src,
  tone = "neutral",
  size = 24,
}: {
  initials: string;
  /** Photo URL. Falls back to initials when absent. */
  src?: string | null;
  tone?: "neutral" | "gold";
  size?: number;
}) {
  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        // Déjà réduite à 256 px et servie par une route authentifiée :
        // l'optimiseur de Next n'a rien à y gagner et ne peut pas la lire.
        unoptimized
        className="flex-none rounded-full border border-line bg-slot object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className={cn(
        "flex flex-none items-center justify-center rounded-full border text-micro font-semibold",
        tone === "gold"
          ? "bg-gold-wash border-gold text-gold"
          : "bg-slot border-line text-ink-2",
      )}
      style={{ width: size, height: size }}
    >
      {initials}
    </span>
  );
}

/** Numbered pin — links a comment to a point on a visual. */
export function Pin({
  n,
  active,
  size = 22,
  className,
  style,
}: {
  n: string;
  active?: boolean;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={cn(
        "flex flex-none items-center justify-center rounded-full border border-gold text-micro font-semibold",
        active ? "bg-gold text-paper" : "bg-paper text-gold",
        className,
      )}
      style={{ width: size, height: size, ...style }}
    >
      {n}
    </span>
  );
}
