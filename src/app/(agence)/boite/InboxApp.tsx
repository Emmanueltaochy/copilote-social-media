"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { ClientChip, NetworkDot } from "@/components/home/bits";
import type { InboxThread } from "@/lib/metricool-inbox";
import { Reply } from "./Reply";

type ClientRef = { id: string; name: string };
type State = "loading" | "ok" | "error";

const FILTERS = [
  { key: "", label: "Tout" },
  { key: "repondre", label: "À répondre" },
  { key: "messages", label: "Messages" },
  { key: "commentaires", label: "Commentaires" },
] as const;

/** Le dernier mot n'est pas le nôtre : quelqu'un attend une réponse. */
const waiting = (t: InboxThread) => !(t.messages.at(-1)?.mine ?? false);

function ago(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} j` : new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function InboxApp({ clients, initialClient, draftOnly }: { clients: ClientRef[]; initialClient: string | null; draftOnly: boolean }) {
  const [byClient, setByClient] = useState<Record<string, { state: State; threads: InboxThread[]; errors: string[] }>>({});
  const [only, setOnly] = useState<string | null>(initialClient);
  const [filter, setFilter] = useState<string>("");
  const [selected, setSelected] = useState<string | null>(null);
  const started = useRef(false);

  const load = useCallback(async (c: ClientRef, fresh = false) => {
    setByClient((s) => ({ ...s, [c.id]: { state: "loading", threads: s[c.id]?.threads ?? [], errors: [] } }));
    try {
      const r = await fetch(`/api/boite?client=${c.id}${fresh ? "&fresh=1" : ""}`);
      const j = (await r.json()) as { threads: InboxThread[]; errors: string[] };
      setByClient((s) => ({ ...s, [c.id]: { state: j.errors.length && !j.threads.length ? "error" : "ok", threads: j.threads, errors: j.errors } }));
    } catch {
      setByClient((s) => ({ ...s, [c.id]: { state: "error", threads: [], errors: [`${c.name} : pas de réponse.`] } }));
    }
  }, []);

  const loadAll = useCallback(
    async (fresh = false) => {
      // Cinq comptes à la fois : rapide, sans se faire limiter par Metricool.
      const queue = [...clients];
      const worker = async () => {
        for (let c = queue.shift(); c; c = queue.shift()) await load(c, fresh);
      };
      await Promise.all(Array.from({ length: Math.min(5, queue.length) }, worker));
    },
    [clients, load],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void loadAll();
  }, [loadAll]);

  const all = useMemo(
    () =>
      Object.entries(byClient)
        .filter(([id]) => !only || id === only)
        .flatMap(([, v]) => v.threads)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [byClient, only],
  );
  const shown = all.filter((t) =>
    filter === "repondre" ? waiting(t) : filter === "messages" ? t.kind === "message" : filter === "commentaires" ? t.kind === "commentaire" : true,
  );
  const current = shown.find((t) => t.key === selected) ?? shown[0] ?? null;
  const counts: Record<string, number> = {
    "": all.length,
    repondre: all.filter(waiting).length,
    messages: all.filter((t) => t.kind === "message").length,
    commentaires: all.filter((t) => t.kind === "commentaire").length,
  };
  const loading = Object.values(byClient).filter((v) => v.state === "loading").length + Math.max(0, clients.length - Object.keys(byClient).length);
  const errors = Object.values(byClient).flatMap((v) => v.errors);

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pt-1 pb-4 lg:px-7">
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <h1 className="text-[34px] leading-[1.05] font-bold tracking-[-0.03em] lg:text-[40px]">Réception</h1>
        <span className="text-base text-ink-3">
          {counts.repondre} à répondre · {all.length} conversations
          {loading > 0 ? ` · chargement de ${loading} compte${loading > 1 ? "s" : ""}…` : ""}
        </span>
        <button
          type="button"
          onClick={() => void loadAll(true)}
          className="ml-auto flex cursor-pointer items-center gap-2 rounded-full border border-line bg-paper px-4 py-2 text-base text-ink hover:border-line-strong"
        >
          <Icon name="activity" size={15} /> Actualiser
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {FILTERS.map((x) => (
          <button
            key={x.key}
            type="button"
            onClick={() => setFilter(x.key)}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-full border px-3 py-[6px] text-small font-medium",
              filter === x.key ? "border-night bg-night text-white" : "border-line bg-paper text-ink hover:border-line-strong",
            )}
          >
            {x.label} <span className={filter === x.key ? "text-white/70" : "text-ink-3"}>{counts[x.key]}</span>
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-line" />
        {clients.map((c) => {
          const st = byClient[c.id]?.state ?? "loading";
          return (
            <button
              key={c.id}
              type="button"
              title={`${c.name}${st === "loading" ? " (chargement…)" : st === "error" ? " (erreur)" : ""}`}
              onClick={() => setOnly(only === c.id ? null : c.id)}
              className={cn(
                "relative cursor-pointer rounded-full border-none bg-transparent p-[2px]",
                only === c.id ? "ring-2 ring-ink" : "opacity-80 hover:opacity-100",
                st === "loading" && "animate-pulse",
              )}
            >
              <ClientChip name={c.name} size={26} />
              {st === "error" ? <span className="absolute -top-[2px] -right-[2px] h-[9px] w-[9px] rounded-full bg-alert ring-2 ring-canvas" /> : null}
            </button>
          );
        })}
      </div>

      {errors.length ? (
        <p className="mb-2 text-small text-warn">Certains comptes n&apos;ont pas répondu : {errors.slice(0, 3).join(" · ")}</p>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
        <div className="flex min-h-[300px] flex-col overflow-hidden rounded-[26px] border border-line bg-paper shadow-soft">
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {shown.length === 0 ? (
              <p className="p-4 text-base text-ink-3">{loading ? "Chargement des conversations…" : "Rien ici. Belle boîte vide."}</p>
            ) : null}
            {shown.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setSelected(t.key)}
                className={cn(
                  "flex w-full cursor-pointer gap-3 rounded-[16px] border-none p-3 text-left text-ink hover:bg-mute",
                  current?.key === t.key ? "bg-mute" : "bg-transparent",
                )}
              >
                <span className="relative flex-none">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slot text-small font-bold text-ink-2 uppercase">{t.who.slice(0, 2)}</span>
                  <span className="absolute -right-1 -bottom-1">
                    <NetworkDot network={t.network} size={18} />
                  </span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-2">
                    <span className="clip text-base font-semibold">{t.who}</span>
                    {waiting(t) ? <span className="h-2 w-2 flex-none rounded-full bg-alert" title="À répondre" /> : null}
                    <span className="ml-auto flex-none text-micro text-ink-3">{ago(t.updatedAt)}</span>
                  </span>
                  <span className="clip text-small text-ink-2">{t.messages.at(-1)?.text ?? ""}</span>
                  <span className="mt-1 flex items-center gap-2 text-micro text-ink-3">
                    <ClientChip name={t.clientName} size={16} /> {t.clientName} · {t.kind === "message" ? "Message privé" : "Commentaire"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-h-[400px] flex-col overflow-hidden rounded-[26px] border border-line bg-paper shadow-soft">
          {current ? (
            <>
              <div className="flex items-center gap-3 border-b border-line p-4">
                <NetworkDot network={current.network} size={30} />
                <span className="flex min-w-0 flex-col">
                  <span className="text-lead font-semibold">{current.who}</span>
                  <span className="text-small text-ink-3">
                    {current.clientName} · {current.kind === "message" ? "Message privé" : "Commentaire"}
                  </span>
                </span>
                {current.link ? (
                  <a
                    href={current.link}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto flex items-center gap-1 rounded-full border border-line px-3 py-[6px] text-small text-ink no-underline hover:no-underline"
                  >
                    Voir la publication <Icon name="arrowUpRight" size={14} />
                  </a>
                ) : null}
              </div>
              {current.postText ? (
                <p className="m-4 mb-0 rounded-[14px] bg-mute px-3 py-2 text-small text-ink-2">
                  <span className="line-clamp-2">Sous : « {current.postText} »</span>
                </p>
              ) : null}
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
                {current.messages.map((m) => (
                  <div key={m.id} className={cn("flex max-w-[80%] flex-col gap-1", m.mine ? "items-end self-end" : "self-start")}>
                    <span className={cn("rounded-[18px] px-4 py-2 text-base whitespace-pre-wrap", m.mine ? "rounded-br-[6px] bg-night text-white" : "rounded-bl-[6px] bg-mute text-ink")}>
                      {m.text}
                    </span>
                    <span className="text-micro text-ink-3">
                      {m.author} · {new Date(m.at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Indian/Reunion" })}
                    </span>
                  </div>
                ))}
              </div>
              <Reply
                key={current.key}
                disabled={draftOnly}
                onSent={() => {
                  const c = clients.find((x) => x.id === current.clientId);
                  if (c) void load(c, true);
                }}
                hidden={{
                  kind: current.kind,
                  provider: current.provider,
                  brandId: current.brandId,
                  id: current.id,
                  recipient: current.recipient ?? "",
                  objectId: current.objectId ?? "",
                }}
              />
            </>
          ) : (
            <p className="p-6 text-base text-ink-3">{loading ? "Chargement…" : "Choisissez une conversation."}</p>
          )}
        </div>
      </div>
    </div>
  );
}
