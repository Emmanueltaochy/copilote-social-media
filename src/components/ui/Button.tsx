import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "link";
type Size = "sm" | "md";

const VARIANT: Record<Variant, string> = {
  primary: "bg-night border-night text-white hover:opacity-85",
  secondary: "bg-paper border-line text-ink hover:border-line-strong",
  link: "border-transparent bg-transparent text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink p-0",
};

const SIZE: Record<Size, string> = {
  sm: "px-5 py-[7px] text-small",
  md: "px-[18px] py-[10px] text-base",
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
        "cursor-pointer rounded-full border font-semibold whitespace-nowrap",
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
        "flex-none cursor-pointer rounded-full border px-[12px] py-[6px] text-small font-medium whitespace-nowrap",
        active
          ? "bg-night border-night text-white"
          : "bg-paper border-line text-ink-2 hover:border-line-strong hover:text-ink",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
