"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { NAV } from "@/data/nav";
import { byName, PACED_CLIENTS } from "@/data/clients";
import { ALL_CLIENTS, useApp } from "@/state/app";
import { Dot } from "@/components/ui/primitives";

export function Sidebar() {
  const pathname = usePathname();
  const { scope, setScope, setPortalOpen } = useApp();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  return (
    <aside className="flex w-[232px] flex-none flex-col gap-3 overflow-hidden bg-night p-[10px] pt-3">
      <div className="flex items-center justify-between px-[6px] py-1">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-[2px] bg-gold" />
          <span className="eyebrow text-small text-paper">Taochy Pilot</span>
        </div>
        <span className="text-micro text-ink-2">1.0</span>
      </div>

      {/* Client scope — the single filter that follows you across every screen. */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setSwitcherOpen((o) => !o)}
          className="flex w-full cursor-pointer flex-col gap-[2px] rounded-control border border-night-border bg-night-2 px-[10px] py-2 text-left hover:border-ink-2"
        >
          <span className="eyebrow text-ink-3">Client</span>
          <span className="flex items-center justify-between gap-2">
            <span className="clip text-base font-medium text-paper">{scope}</span>
            <span className="text-micro text-ink-3">⌘K</span>
          </span>
        </button>

        {switcherOpen ? (
          <div className="absolute top-[calc(100%+6px)] right-[-56px] left-0 z-40 max-h-[340px] overflow-auto rounded-card border border-line-strong bg-paper p-[6px] shadow-[0_8px_24px_rgba(18,18,18,0.12)]">
            <button
              type="button"
              onClick={() => {
                setScope(ALL_CLIENTS);
                setSwitcherOpen(false);
              }}
              className="w-full cursor-pointer rounded-control bg-gold-wash px-[10px] py-2 text-left text-base font-medium text-ink"
            >
              {ALL_CLIENTS}
            </button>
            <div className="mx-1 my-[6px] h-px bg-line" />
            {byName(PACED_CLIENTS).map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => {
                  setScope(c.name);
                  setSwitcherOpen(false);
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-control px-[10px] py-[7px] text-left text-base text-ink hover:bg-canvas"
              >
                <Dot tone={c.pace.tone} />
                <span className="clip flex-1">{c.name}</span>
                <span className="text-small text-ink-3 tabular-nums">
                  {c.done}/{c.target}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <nav className="flex flex-col gap-px overflow-auto">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center justify-between gap-2 rounded-control px-[10px] py-2 no-underline hover:bg-night-2 hover:no-underline",
                active ? "bg-night-2" : "bg-transparent",
              )}
            >
              <span
                className={cn(
                  "absolute top-2 bottom-2 left-0 w-[2px] rounded-full",
                  active ? "bg-gold" : "bg-transparent",
                )}
              />
              <span
                className={cn(
                  "text-base",
                  active ? "font-medium text-paper" : "text-night-ink",
                )}
              >
                {item.label}
              </span>
              <span className="flex items-center gap-[6px]">
                {item.late ? <span className="h-[5px] w-[5px] rounded-full bg-alert" /> : null}
                <span className="text-small text-ink-3 tabular-nums">{item.count ?? ""}</span>
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-px border-t border-night-line pt-2">
        <button
          type="button"
          onClick={() => setPortalOpen(true)}
          className="flex w-full cursor-pointer items-center justify-between rounded-control px-[10px] py-2 text-left hover:bg-night-2"
        >
          <span className="text-base text-night-ink">Portail client</span>
          <span className="eyebrow text-ink-2">Aperçu</span>
        </button>
        <button
          type="button"
          className="flex w-full cursor-pointer items-center justify-between rounded-control px-[10px] py-2 text-left hover:bg-night-2"
        >
          <span className="text-base text-night-ink">Copilote</span>
          <span className="text-micro text-ink-2">⌘J</span>
        </button>
        <div className="flex items-center justify-between px-[10px] py-2">
          <span className="text-base text-night-ink">Emmanuel</span>
          <span className="eyebrow text-ink-3">Direction</span>
        </div>
      </div>
    </aside>
  );
}
