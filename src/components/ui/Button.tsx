import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "link";
type Size = "sm" | "md";

const VARIANT: Record<Variant, string> = {
  primary: "bg-ink border-ink text-paper hover:bg-black",
  secondary: "bg-paper border-line text-ink-2 hover:border-line-strong hover:text-ink",
  link: "border-transparent bg-transparent text-gold hover:text-ink p-0",
};

const SIZE: Record<Size, string> = {
  sm: "px-[10px] py-[6px] text-small",
  md: "px-3 py-2 text-base",
};

export function Button({
  variant = "secondary",
  size = "sm",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(
        "cursor-pointer rounded-control border font-medium whitespace-nowrap",
        VARIANT[variant],
        variant === "link" ? "text-small" : SIZE[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * Filter / segmented chip. Selected state is the gold wash — the same accent
 * as the pacing marker, so "what I'm looking at" and "the reference point"
 * share one colour.
 */
export function Chip({
  active,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      className={cn(
        "flex-none cursor-pointer rounded-control border px-[9px] py-[5px] text-small font-medium whitespace-nowrap",
        active
          ? "bg-gold-wash border-gold text-ink"
          : "bg-paper border-line text-ink-2 hover:border-line-strong hover:text-ink",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
