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
      <div className="flex w-full max-w-[520px] flex-col items-start gap-3 rounded-card border border-line bg-paper p-6">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h2 className="text-title font-semibold">{title}</h2>
        {children ? (
          <div className="text-base leading-relaxed text-pretty text-ink-2">{children}</div>
        ) : null}
        {actionLabel && actionHref ? (
          <Link
            href={actionHref}
            className="mt-1 rounded-control border border-ink bg-ink px-3 py-2 text-base font-medium text-paper no-underline hover:bg-black hover:no-underline"
          >
            {actionLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
