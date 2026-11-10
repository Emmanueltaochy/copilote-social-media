import Link from "next/link";
import type { ReactNode } from "react";
import { Eyebrow } from "./primitives";

/**
 * Un écran vide doit dire quoi faire, pas seulement qu'il est vide.
 * Chaque état vide porte donc l'action qui le remplit.
 */
export function EmptyState({
  eyebrow,
  title,
  children,
  actionLabel,
  actionHref,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto px-5 pt-16 pb-6">
      <div className="flex w-full max-w-[560px] flex-col items-start gap-3 rounded-[26px] border border-line bg-paper p-7 shadow-soft">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h2 className="text-[24px] leading-tight font-bold tracking-[-0.02em]">{title}</h2>
        {children ? (
          <div className="text-base leading-relaxed text-pretty text-ink-2">{children}</div>
        ) : null}
        {actionLabel && actionHref ? (
          <Link
            href={actionHref}
            className="mt-1 rounded-full bg-night px-5 py-[10px] text-base font-semibold text-white no-underline hover:opacity-85 hover:no-underline"
          >
            {actionLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
