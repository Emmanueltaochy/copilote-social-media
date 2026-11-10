"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { ClientChip, NetworkDot, networkLabel } from "@/components/home/bits";
import type { ContentFormState } from "@/app/(agence)/contenu/actions";

/*
 * L'écran « Créer », façon Murmura : on écrit à gauche, on voit le post
 * au milieu, on choisit le moment à droite. Les champs envoyés sont
 * exactement ceux de l'ancien formulaire (clientId, title, kind, networks,
 * scheduledAt, caption, instructions) : l'action serveur n'a pas changé.
 */

type Option = { id: string; name: string };
export type Slot = { dow: number; hour: number; posts: number; reach: number };
export type Scheduled = { clientId: string; title: string; at: string };

const KINDS: [string, string][] = [
  ["feed", "Post"],
  ["carrousel", "Carrousel"],
  ["reel", "Reel"],
  ["story", "Story"],
  ["autre", "Autre"],
];

const NETWORKS = ["instagram", "facebook", "linkedin", "tiktok", "google"] as const;

/** Longueur maximale d'une légende, réseau par réseau. */
const LIMITS: Record<string, number> = {
  instagram: 2200,
  facebook: 63206,
  linkedin: 3000,
  tiktok: 2200,
  google: 1500,
};

const DAYS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
const field =
  "w-full rounded-[14px] border border-line bg-paper px-3 py-[9px] text-base text-ink outline-none focus:border-gold";

const pad = (n: number) => String(n).padStart(2, "0");
const compact = (n: number) =>
  n >= 10_000 ? `${(n / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k` : Math.round(n).toLocaleString("fr-FR");

/** « 2026-11-13 » + 12 h → Date (heure murale, lue comme UTC pour rester indépendante du navigateur). */
function wall(date: string, time: string) {
  return new Date(`${date}T${time || "12:00"}:00Z`);
}
function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}
function dayLabel(date: string) {
  const d = wall(date, "12:00");
  const l = `${DAYS[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()} ${d.toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" })}`;
  return l.charAt(0).toUpperCase() + l.slice(1);
}

/** La prochaine occurrence d'un créneau (jour ISO, heure) après « maintenant ». */
function nextOccurrence(nowWall: string, s: { dow: number; hour: number }) {
  const base = new Date(`${nowWall}:00Z`);
  const baseDow = ((base.getUTCDay() + 6) % 7) + 1;
  let ahead = (s.dow - baseDow + 7) % 7;
  if (ahead === 0 && s.hour <= base.getUTCHours()) ahead = 7;
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + ahead, s.hour));
  return { date: isoDay(d), time: `${pad(s.hour)}:00` };
}

export function Composer({
  action,
  clients,
  bestByClient,
  agencySlots,
  scheduled,
  nowWall,
  initialClientId,
  initialDate,
}: {
  action: (prev: ContentFormState, data: FormData) => Promise<ContentFormState>;
  clients: Option[];
  bestByClient: Record<string, Slot[]>;
  agencySlots: Slot[];
  scheduled: Scheduled[];
  /** Heure murale de La Réunion, « 2026-11-10T21:04 ». */
  nowWall: string;
  initialClientId?: string;
  initialDate?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [clientId, setClientId] = useState(initialClientId ?? "");
  const [networks, setNetworks] = useState<string[]>(["instagram"]);
  const [kind, setKind] = useState("feed");
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [date, setDate] = useState(initialDate ?? "");
  const [time, setTime] = useState("12:00");
  const [tab, setTab] = useState<string>("instagram");

  const client = clients.find((c) => c.id === clientId);
  const name = client?.name ?? "Votre client";
  const preview = networks.includes(tab) ? tab : (networks[0] ?? "instagram");
  const scheduledAt = date ? `${date}T${time || "12:00"}` : "";

  const ownSlots = clientId ? (bestByClient[clientId] ?? []) : [];
  const slots = ownSlots.length ? ownSlots : agencySlots;
  const slotsAreAgency = !ownSlots.length && agencySlots.length > 0;

  const clientDays = new Set(scheduled.filter((s) => s.clientId === clientId).map((s) => s.at.slice(0, 10)));

  const freeSlot = (() => {
    if (!clientId) return null;
    if (slots.length) {
      const occ = slots.map((s) => nextOccurrence(nowWall, s)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      // On cherche d'abord un bon créneau un jour sans autre publication, sur
      // les quatre prochaines semaines.
      for (let week = 0; week < 4; week++) {
        for (const o of occ) {
          const d = isoDay(new Date(new Date(`${o.date}T12:00:00Z`).getTime() + week * 7 * 86_400_000));
          if (!clientDays.has(d)) return { date: d, time: o.time };
        }
      }
    }
    const base = new Date(`${nowWall}:00Z`);
    for (let i = 1; i <= 30; i++) {
      const d = isoDay(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + i)));
      if (!clientDays.has(d)) return { date: d, time: null };
    }
    return null;
  })();

  const sameDay = date ? scheduled.filter((s) => s.clientId === clientId && s.at.slice(0, 10) === date) : [];
  const goesOut = (() => {
    if (!date) return null;
    const diff = (wall(date, time).getTime() - new Date(`${nowWall}:00Z`).getTime()) / 60000;
    if (diff < 0) return "Date passée";
    if (diff < 60) return `Part dans ${Math.round(diff)} min`;
    if (diff < 48 * 60) return `Part dans ${Math.floor(diff / 60)} h`;
    return `Part dans ${Math.round(diff / 1440)} j`;
  })();

  const issues = [
    !clientId && "Choisir un client",
    !title.trim() && "Donner un titre",
    ...networks.filter((n) => caption.length > (LIMITS[n] ?? Infinity)).map((n) => `Légende trop longue pour ${networkLabel(n)}`),
  ].filter(Boolean) as string[];
  const blocking = !clientId || !title.trim();

  const toggleNet = (n: string) =>
    setNetworks((cur) => {
      const next = cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n];
      return next.length ? next : cur;
    });

  return (
    <form action={formAction} className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(300px,0.85fr)]">
      <input type="hidden" name="scheduledAt" value={scheduledAt} />

      {/* ------------------------------------------------ écrire ---------- */}
      <section className="flex min-w-0 flex-col gap-4 rounded-[26px] border border-line bg-paper p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lead font-semibold">Nouveau contenu</h2>
          <label className="flex items-center gap-2 rounded-full border border-line py-1 pr-2 pl-1">
            {client ? <ClientChip name={client.name} size={30} /> : <span className="h-[30px] w-[30px] rounded-[9px] bg-slot" />}
            <span className="flex flex-col">
              <span className="text-micro text-ink-3">Client</span>
              <select
                name="clientId"
                required
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="max-w-[180px] cursor-pointer border-none bg-transparent p-0 text-base font-semibold text-ink outline-none"
              >
                <option value="" disabled>
                  Choisir…
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </span>
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-small text-ink-3">
            Publier sur · {networks.length} réseau{networks.length > 1 ? "x" : ""}
          </span>
          <div className="flex flex-wrap gap-2">
            {NETWORKS.map((n) => {
              const on = networks.includes(n);
              return (
                <label
                  key={n}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-full border py-[5px] pr-3 pl-[5px] text-base font-medium select-none",
                    on ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink-2 hover:border-line-strong",
                  )}
                >
                  <input type="checkbox" name="networks" value={n} checked={on} onChange={() => toggleNet(n)} className="sr-only" />
                  <NetworkDot network={n} size={24} />
                  {networkLabel(n)}
                  {on ? (
                    <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-accent text-accent-ink">
                      <Icon name="check" size={12} strokeWidth={3} />
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="flex flex-col gap-[6px]">
            <span className="text-small text-ink-3">Titre (interne)</span>
            <input name="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. : Coulisses de l'atelier" className={field} />
          </label>
          <div className="flex flex-col gap-[6px]">
            <span className="text-small text-ink-3">Format</span>
            <input type="hidden" name="kind" value={kind} />
            <span className="flex flex-wrap rounded-full bg-mute p-[3px]">
              {KINDS.map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setKind(v)}
                  className={cn(
                    "cursor-pointer rounded-full border-none px-3 py-[6px] text-small font-semibold",
                    kind === v ? "bg-paper text-ink shadow-soft" : "bg-transparent text-ink-3 hover:text-ink",
                  )}
                >
                  {l}
                </button>
              ))}
            </span>
          </div>
        </div>

        <div className="flex flex-col overflow-hidden rounded-[20px] border border-line focus-within:border-gold">
          <textarea
            name="caption"
            rows={8}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder={`La légende ${client ? `de ${client.name} ` : ""}: écrite une fois, vérifiée pour chaque réseau.`}
            className="min-h-[180px] resize-y border-none bg-paper px-4 py-3 text-lead leading-relaxed text-ink outline-none"
          />
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line bg-paper px-4 py-[10px]">
            {networks.map((n) => {
              const left = (LIMITS[n] ?? 0) - caption.length;
              return (
                <span key={n} title={`${networkLabel(n)} : ${LIMITS[n]?.toLocaleString("fr-FR")} caractères au plus`} className="flex items-center gap-[6px]">
                  <NetworkDot network={n} size={20} />
                  <span className={cn("text-small tabular-nums", left < 0 ? "font-semibold text-alert" : "text-ink-2")}>
                    {left.toLocaleString("fr-FR")}
                  </span>
                </span>
              );
            })}
          </div>
        </div>

        <details className="group rounded-[16px] border border-line">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-base">
            <Icon name="layers" size={16} className="text-ink-3" />
            <span className="font-medium">Plus d&apos;options</span>
            <span className="text-small text-ink-3">Consignes de production</span>
            <Icon name="chevronDown" size={16} className="ml-auto text-ink-3 transition-transform group-open:rotate-180" />
          </summary>
          <div className="flex flex-col gap-[6px] px-4 pb-4">
            <textarea
              name="instructions"
              rows={4}
              placeholder="Plan large au coucher du soleil, logo en bas à droite, ambiance chaude."
              className={field}
            />
            <span className="text-small text-ink-3">Pour celui qui fabrique le post. Reste interne : le client ne le voit pas.</span>
          </div>
        </details>
      </section>

      {/* ------------------------------------------------ aperçu ---------- */}
      <section className="flex min-w-0 flex-col gap-3 rounded-[26px] border border-line bg-paper p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lead font-semibold">Aperçu</h2>
            <p className="text-small text-ink-3">
              {networkLabel(preview)} · {name}
            </p>
          </div>
          <span className="flex rounded-full bg-mute p-[3px]">
            {networks.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setTab(n)}
                title={networkLabel(n)}
                className={cn("cursor-pointer rounded-full border-none p-[4px]", preview === n ? "bg-paper shadow-soft" : "bg-transparent opacity-70 hover:opacity-100")}
              >
                <NetworkDot network={n} size={22} />
              </button>
            ))}
          </span>
        </div>
        <div className="rounded-[22px] bg-mute p-3 sm:p-5">
          <PostPreview network={preview} name={name} caption={caption} kind={kind} when={date ? `${dayLabel(date)} · ${time}` : "Sans date"} />
        </div>
        <p className="flex items-start gap-2 text-small text-ink-3">
          <Icon name="sparkles" size={14} className="mt-[2px] flex-none" />
          {preview === "instagram"
            ? "Les 125 premiers caractères s'affichent avant « plus » : la première phrase doit accrocher."
            : preview === "tiktok"
              ? "Sur TikTok, la légende passe par-dessus la vidéo : courte et lisible."
              : "La suite de la légende est repliée : la première phrase doit accrocher."}
        </p>
      </section>

      {/* ------------------------------------------------ quand ----------- */}
      <div className="flex min-w-0 flex-col gap-5 lg:col-span-2 lg:grid lg:grid-cols-2 lg:items-start xl:col-span-1 xl:flex">
        <section className="flex flex-col gap-4 rounded-[26px] border border-line bg-paper p-5 shadow-soft">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lead font-semibold">Quand</h2>
            <span className="rounded-full bg-mute px-3 py-[3px] text-small text-ink-2">La Réunion</span>
          </div>
          <div>
            <p className="text-[26px] leading-tight font-bold tracking-[-0.02em]">
              {date ? (
                <>
                  {dayLabel(date)} <span className="text-ink-3">{time}</span>
                </>
              ) : (
                <span className="text-ink-3">Pas encore de date</span>
              )}
            </p>
            <p className="text-small text-ink-3">{goesOut ?? "Facultatif pour une idée : on la datera plus tard."}</p>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)] gap-2">
            <label className="flex flex-col gap-[6px]">
              <span className="text-small text-ink-3">Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
            </label>
            <label className="flex flex-col gap-[6px]">
              <span className="text-small text-ink-3">Heure</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} />
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-small text-ink-3">
              Meilleurs créneaux {slotsAreAgency ? "(tous comptes confondus)" : client ? `pour ${client.name}` : ""}
            </span>
            {slots.length ? (
              <div className="flex flex-wrap gap-2">
                {slots.map((s) => {
                  const o = nextOccurrence(nowWall, s);
                  const on = date === o.date && time === o.time;
                  return (
                    <button
                      key={`${s.dow}-${s.hour}`}
                      type="button"
                      onClick={() => {
                        setDate(o.date);
                        setTime(o.time);
                      }}
                      title={`Portée moyenne ${compact(s.reach)} sur ${s.posts} publications (90 derniers jours)`}
                      className={cn(
                        "flex cursor-pointer items-center gap-[6px] rounded-full border px-3 py-[6px] text-small font-medium",
                        on ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink hover:border-line-strong",
                      )}
                    >
                      <Icon name="activity" size={13} className={on ? "text-paper" : "text-ok"} />
                      {DAYS[s.dow - 1].charAt(0).toUpperCase() + DAYS[s.dow - 1].slice(1)} {s.hour} h
                    </button>
                  );
                })}
                {freeSlot ? (
                  <FreeSlotButton slot={freeSlot} onPick={(d, t) => (setDate(d), t && setTime(t))} />
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-small text-ink-2">
                  Pas encore assez de publications relevées pour en déduire les meilleurs moments.
                </p>
                {freeSlot ? <FreeSlotButton slot={freeSlot} onPick={(d, t) => (setDate(d), t && setTime(t))} /> : null}
              </div>
            )}
          </div>

          {date && client ? (
            <p className="border-t border-line pt-3 text-small text-ink-3">
              {sameDay.length
                ? `${sameDay.length} autre${sameDay.length > 1 ? "s" : ""} publication${sameDay.length > 1 ? "s" : ""} de ${client.name} ce jour-là : ${sameDay
                    .map((s) => `« ${s.title} » à ${s.at.slice(11, 16)}`)
                    .join(", ")}.`
                : `Aucune autre publication de ${client.name} ce jour-là.`}
            </p>
          ) : null}
        </section>

        <section className="flex flex-col gap-4 rounded-[26px] bg-night p-5 text-white shadow-soft">
          <span className="flex items-center gap-2 text-small text-white/70">
            <Icon name="sparkles" size={14} /> Le contenu démarre à l&apos;étape « Idée »
          </span>
          <p className="text-title font-semibold">
            {networks.length} réseau{networks.length > 1 ? "x" : ""} · {date ? `${dayLabel(date)} ${time}` : "sans date"}
          </p>
          {state.error ? <p className="rounded-[12px] bg-alert px-3 py-2 text-small text-white">{state.error}</p> : null}
          <button
            type="submit"
            disabled={pending || blocking}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-full border-none bg-accent px-5 py-3 text-base font-semibold text-accent-ink hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name="plus" size={16} strokeWidth={2.4} />
            {pending ? "Création…" : "Créer le contenu"}
          </button>
          <p className="text-small text-white/70">
            {issues.length
              ? `${issues.length} point${issues.length > 1 ? "s" : ""} à régler : ${issues.join(" · ")}`
              : "Tout est prêt. Les visuels s'ajoutent ensuite depuis la fiche du contenu."}
          </p>
        </section>
      </div>
    </form>
  );
}

function FreeSlotButton({ slot, onPick }: { slot: { date: string; time: string | null }; onPick: (d: string, t: string | null) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(slot.date, slot.time)}
      title="Le premier bon créneau sans autre publication de ce client ce jour-là"
      className="flex w-fit cursor-pointer items-center gap-[6px] rounded-full border border-dashed border-gold bg-transparent px-3 py-[6px] text-small font-medium text-ink hover:bg-gold-wash"
    >
      <Icon name="sparkles" size={13} className="text-gold" />
      {`Prochain créneau libre · ${dayLabel(slot.date)}${slot.time ? ` ${Number(slot.time.slice(0, 2))} h` : ""}`}
    </button>
  );
}

/* ---------------------------------------------------- maquettes ---------- */

function Visual({ kind, label, className }: { kind: string; label: string; className?: string }) {
  const tall = kind === "reel" || kind === "story";
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 bg-[repeating-linear-gradient(135deg,var(--c-slot)_0_10px,var(--c-mute)_10px_20px)] text-center text-small text-ink-3",
        tall ? "aspect-[9/14]" : "aspect-[4/5]",
        className,
      )}
    >
      <Icon name="image" size={22} />
      <span className="max-w-[220px] px-4">{label}</span>
      {kind === "carrousel" ? (
        <span className="flex gap-1">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={cn("h-[6px] w-[6px] rounded-full", i === 0 ? "bg-info" : "bg-line-strong")} />
          ))}
        </span>
      ) : null}
    </div>
  );
}

function PostPreview({ network, name, caption, kind, when }: { network: string; name: string; caption: string; kind: string; when: string }) {
  const text = caption.trim();
  const visualLabel = "Le visuel s'ajoute après la création, depuis la fiche du contenu.";

  if (network === "tiktok") {
    return (
      <div className="relative mx-auto flex aspect-[9/14] w-full max-w-[290px] flex-col justify-end overflow-hidden rounded-[18px] bg-night p-4 text-white">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-small text-white/50">
          <Icon name="camera" size={24} />
          <span className="max-w-[200px] text-center">{visualLabel}</span>
        </div>
        <span className="relative text-base font-semibold">@{name}</span>
        <p className="relative mt-1 line-clamp-2 text-small text-white/90">{text || "Votre légende…"}</p>
        <span className="relative mt-2 text-micro text-white/60">{when}</span>
      </div>
    );
  }

  const header = (sub: string) => (
    <div className="flex items-center gap-[10px] px-3 py-[10px]">
      <ClientChip name={name} size={32} />
      <span className="flex min-w-0 flex-col">
        <span className="clip text-base font-semibold text-ink">{name}</span>
        <span className="text-micro text-ink-3">{sub}</span>
      </span>
      <span className="ml-auto text-ink-3">•••</span>
    </div>
  );

  if (network === "instagram") {
    const short = text.length > 125 ? text.slice(0, 125).trimEnd() : text;
    return (
      <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-[18px] border border-line bg-paper">
        {header(kind === "reel" ? "Reel" : kind === "story" ? "Story" : "")}
        <Visual kind={kind} label={visualLabel} />
        <div className="flex items-center gap-4 px-3 pt-3 text-ink">
          <Icon name="heart" size={20} />
          <Icon name="message" size={20} />
          <Icon name="send" size={20} />
        </div>
        <p className="px-3 pt-2 pb-1 text-small text-ink">
          <b className="font-semibold">{name}</b> {short || <span className="text-ink-3">Votre légende…</span>}
          {text.length > 125 ? <span className="text-ink-3">… plus</span> : null}
        </p>
        <p className="px-3 pb-3 text-micro tracking-wide text-ink-3 uppercase">{when}</p>
      </div>
    );
  }

  if (network === "facebook" || network === "linkedin") {
    return (
      <div className="mx-auto w-full max-w-[380px] overflow-hidden rounded-[18px] border border-line bg-paper">
        {header(`${when} · Public`)}
        <p className={cn("px-3 pb-2 text-small whitespace-pre-line text-ink", network === "linkedin" ? "line-clamp-3" : "line-clamp-5")}>
          {text || <span className="text-ink-3">Votre légende…</span>}
        </p>
        {text.split("\n").length > 3 || text.length > 240 ? (
          <p className="-mt-1 px-3 pb-2 text-small font-semibold text-ink-3">{network === "linkedin" ? "…voir plus" : "Voir plus"}</p>
        ) : null}
        <Visual kind={kind} label={visualLabel} className={network === "linkedin" ? "aspect-[1.91/1]" : undefined} />
        <div className="flex justify-around border-t border-line px-3 py-[9px] text-small text-ink-2">
          {(network === "linkedin" ? ["J'aime", "Commenter", "Republier", "Envoyer"] : ["J'aime", "Commenter", "Partager"]).map((a) => (
            <span key={a}>{a}</span>
          ))}
        </div>
      </div>
    );
  }

  // Fiche Google : une actualité courte.
  return (
    <div className="mx-auto w-full max-w-[380px] overflow-hidden rounded-[18px] border border-line bg-paper">
      {header(`Actualité · ${when}`)}
      <Visual kind="feed" label={visualLabel} className="aspect-video" />
      <p className="line-clamp-4 px-3 py-3 text-small text-ink">{text || <span className="text-ink-3">Votre légende…</span>}</p>
    </div>
  );
}

export function IdeasList({ ideas }: { ideas: { id: string; title: string; clientName: string }[] }) {
  return (
    <section className="flex flex-col gap-3 rounded-[26px] border border-line bg-paper p-5 shadow-soft">
      <h2 className="text-lead font-semibold">Idées sans date</h2>
      {ideas.length ? (
        <div className="flex flex-col gap-2">
          {ideas.map((i) => (
            <Link
              key={i.id}
              href={`/contenu/${i.id}`}
              className="flex items-center gap-3 rounded-[14px] border border-line p-2 pr-3 text-ink no-underline hover:border-line-strong hover:no-underline"
            >
              <ClientChip name={i.clientName} size={30} />
              <span className="flex min-w-0 flex-col">
                <span className="clip text-base font-medium">{i.title}</span>
                <span className="text-micro text-ink-3">{i.clientName}</span>
              </span>
              <Icon name="arrowUpRight" size={15} className="ml-auto text-ink-3" />
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-small text-ink-3">Aucune idée en attente. Une idée enregistrée sans date attend ici son créneau.</p>
      )}
    </section>
  );
}
