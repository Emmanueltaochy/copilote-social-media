import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import type { IconName } from "@/components/ui/Icon";
import { CONTENT_STATUS } from "@/data/content";

/* Petites pièces de l'accueil, partagées par ses cartes. */

const CHIP_COLORS = [
  "bg-[#e0453c] text-white",
  "bg-[#2f63d4] text-white",
  "bg-[#f2b33d] text-[#15161a]",
  "bg-[#1d8f57] text-white",
  "bg-[#7c4ddb] text-white",
  "bg-[#0f8a9c] text-white",
  "bg-[#d4559a] text-white",
  "bg-[#15161a] text-white",
];

/** Une couleur stable par client, pour le reconnaître d'un coup d'œil. */
export function clientColor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0;
  return CHIP_COLORS[Math.abs(h) % CHIP_COLORS.length];
}

export function initialsOf(name: string) {
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();
}

export function ClientChip({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <span
      className={cn("flex flex-none items-center justify-center rounded-[9px] text-[10.5px] font-bold", clientColor(name))}
      style={{ width: size, height: size }}
      title={name}
    >
      {initialsOf(name)}
    </span>
  );
}

const NETWORK_STYLE: Record<string, { label: string; short: string; cls: string }> = {
  instagram: { label: "Instagram", short: "IG", cls: "bg-[linear-gradient(135deg,#f9ce34,#ee2a7b,#6228d7)] text-white" },
  facebook: { label: "Facebook", short: "f", cls: "bg-[#1877f2] text-white" },
  linkedin: { label: "LinkedIn", short: "in", cls: "bg-[#0a66c2] text-white" },
  tiktok: { label: "TikTok", short: "TT", cls: "bg-[#111] text-white" },
  google: { label: "Google", short: "G", cls: "bg-white text-[#4285f4] border border-line" },
  youtube: { label: "YouTube", short: "YT", cls: "bg-[#ff0033] text-white" },
};

export function networkLabel(n: string) {
  return NETWORK_STYLE[n]?.label ?? n;
}

export function NetworkDot({ network, size = 22 }: { network: string; size?: number }) {
  const s = NETWORK_STYLE[network] ?? { short: network.slice(0, 2), cls: "bg-mute text-ink-2", label: network };
  return (
    <span
      title={s.label}
      className={cn("flex flex-none items-center justify-center rounded-full text-[9.5px] font-bold ring-2 ring-paper", s.cls)}
      style={{ width: size, height: size }}
    >
      {s.short}
    </span>
  );
}

export function NetworkStack({ networks, size = 22 }: { networks: string[]; size?: number }) {
  return (
    <span className="flex items-center">
      {networks.map((n, i) => (
        <span key={n} style={{ marginLeft: i ? -6 : 0 }}>
          <NetworkDot network={n} size={size} />
        </span>
      ))}
    </span>
  );
}

/** Carte de l'accueil : grand rayon, titre, action ronde en haut à droite. */
export function Panel({
  title,
  action,
  children,
  className,
  right,
}: {
  title: ReactNode;
  action?: { href: string; label: string; icon?: IconName };
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-[26px] border border-line bg-paper p-5 shadow-soft", className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lead font-semibold text-ink">{title}</h2>
        <span className="flex items-center gap-2">
          {right}
          {action ? (
            // Le lien dit où il mène : une flèche seule ne le disait pas, et
            // sa cible de 36 px était trop petite au doigt.
            <Link
              href={action.href}
              className="flex min-h-11 items-center gap-1 rounded-full border border-line px-3 text-small font-medium text-ink no-underline hover:border-line-strong hover:no-underline lg:min-h-9"
            >
              {action.label} <span aria-hidden>→</span>
            </Link>
          ) : null}
        </span>
      </div>
      {children}
    </section>
  );
}

/*
 * Le statut d'un contenu, en pastille. Un seul vocabulaire côté agence : celui
 * de CONTENT_STATUS (production, fiche, calendrier…) — « Validation client »,
 * « Prêt à publier » partout, plus « En validation » ici et « Validation
 * client » là. Côté portail, le client lit les mots de son calendrier
 * (portail/calendrier/statut.ts) : tout ce qui se fabrique encore est « en
 * préparation », sans le jargon du pipeline (brief, dérush, révision).
 */
const STATUS_DOT: Record<string, string> = {
  idee: "bg-ink-3",
  brief: "bg-ink-3",
  tournage: "bg-ink-2",
  derush: "bg-ink-2",
  creation: "bg-ink-2",
  revision: "bg-warn",
  validation: "bg-accent",
  pret: "bg-info",
  publie: "bg-ok",
  manque: "bg-alert",
};

const STATUT_PORTAIL: Record<string, string> = {
  validation: "À valider",
  pret: "Validé",
  publie: "Publié",
  manque: "Non publié",
};

export function StatusTag({ status, className, portail = false }: { status: string; className?: string; portail?: boolean }) {
  const label = portail
    ? (STATUT_PORTAIL[status] ?? "En préparation")
    : (CONTENT_STATUS[status as keyof typeof CONTENT_STATUS]?.label ?? status);
  const dot = portail && !STATUT_PORTAIL[status] ? "bg-ink-3" : (STATUS_DOT[status] ?? "bg-ink-3");
  return (
    <span className={cn("inline-flex items-center gap-[6px] rounded-full bg-mute px-[9px] py-[3px] text-small font-medium whitespace-nowrap text-ink", className)}>
      <span className={cn("h-[7px] w-[7px] rounded-full", dot)} />
      {label}
    </span>
  );
}

/* ---------------------------------------------------------- dates -------- */

const JOURS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

export function hhmm(d: Date) {
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/** « Aujourd'hui · 14:00 », « Demain · 09:30 », « jeu. 12 nov. · 10:00 ». */
export function whenLabel(d: Date, now: Date) {
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((day - today) / 86_400_000);
  const label =
    diff === 0
      ? "Aujourd'hui"
      : diff === 1
        ? "Demain"
        : diff === -1
          ? "Hier"
          : `${JOURS[d.getDay()]} ${d.getDate()} ${d.toLocaleDateString("fr-FR", { month: "short" })}`;
  return `${label} · ${hhmm(d)}`;
}

/** « dans 14 h 35 min », « dans 3 jours ». */
export function countdown(d: Date, now: Date) {
  const min = Math.max(0, Math.round((d.getTime() - now.getTime()) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ${String(min % 60).padStart(2, "0")} min`;
  return `${Math.round(h / 24)} jours`;
}

export function ago(d: Date, now: Date) {
  const min = Math.round((now.getTime() - d.getTime()) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const days = Math.round(h / 24);
  return days === 1 ? "hier" : `il y a ${days} jours`;
}
