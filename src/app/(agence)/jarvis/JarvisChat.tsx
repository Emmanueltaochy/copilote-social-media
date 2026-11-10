"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { Orb, type OrbMode } from "@/components/jarvis/Orb";

type Turn = { role: "user" | "assistant"; text: string };
type Log = { at: string; agent: string; text: string; href?: string };
type Thread = { id: string; title: string; updatedAt: string };

/* Reconnaissance vocale du navigateur (Chrome, Edge, Safari). */
type SR = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult:
    | ((e: {
        results: ArrayLike<
          ArrayLike<{ transcript: string }> & { isFinal: boolean }
        >;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
type FullThread = Thread & { turns: Turn[]; log: Log[] };

/** Attend (jusqu'à 5 min) que la réponse à `text` apparaisse dans l'historique. */
async function recover(threadId: string | null, sentAt: number, text: string): Promise<FullThread | null> {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      let id = threadId;
      if (!id) {
        const list = (await (await fetch("/api/jarvis")).json()) as Thread[];
        id = list.find((t) => new Date(t.updatedAt).getTime() >= sentAt - 5000)?.id ?? null;
        if (!id) continue;
      }
      const [t] = (await (await fetch(`/api/jarvis?id=${id}`)).json()) as FullThread[];
      const turns = t?.turns ?? [];
      const last = turns.at(-1);
      const asked = turns.findLastIndex((x) => x.role === "user" && x.text.includes(text.slice(0, 40)));
      if (t && last?.role === "assistant" && asked >= 0 && asked < turns.length - 1) return { ...t, id };
    } catch {}
  }
  return null;
}

function makeRecognition(): SR | null {
  if (typeof window === "undefined") return null;
  const W = window as unknown as {
    SpeechRecognition?: new () => SR;
    webkitSpeechRecognition?: new () => SR;
  };
  const C = W.SpeechRecognition ?? W.webkitSpeechRecognition;
  return C ? new C() : null;
}

const EXEMPLES = [
  "Fais-moi le point de la semaine : qui est en retard ?",
  "Kréol Fit doit publier 3 reels par semaine en décembre, mardi, jeudi et samedi à 18h. Prépare le planning.",
  "Les rushs de Sud Auto sont arrivés sur le Drive : range-les et prépare les publications.",
  "Récupère le dernier devis signé sur Abby, crée le projet et invite le client.",
];

export function JarvisChat({
  firstName,
  ready,
}: {
  firstName: string;
  ready: boolean;
}) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [log, setLog] = useState<Log[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voice, setVoice] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const recRef = useRef<SR | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    const r = await fetch("/api/jarvis");
    if (r.ok) setThreads(await r.json());
  }, []);

  useEffect(() => {
    // Liste des conversations au chargement.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadThreads();
  }, [loadThreads]);

  useEffect(
    () => endRef.current?.scrollIntoView({ behavior: "smooth" }),
    [turns, busy],
  );

  useEffect(() => {
    // Préférence de lecture à voix haute, relue après l'hydratation.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem("jarvis-voice") === "1") setVoice(true);
    } catch {}
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (
        !voice ||
        typeof window === "undefined" ||
        !("speechSynthesis" in window)
      )
        return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[*_#`]/g, ""));
      u.lang = "fr-FR";
      const fr = window.speechSynthesis
        .getVoices()
        .find((v) => v.lang.startsWith("fr"));
      if (fr) u.voice = fr;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(u);
    },
    [voice],
  );

  const open = async (id: string) => {
    setThreadId(id);
    const r = await fetch(`/api/jarvis?id=${id}`);
    if (!r.ok) return;
    const [t] = (await r.json()) as (Thread & { turns: Turn[]; log: Log[] })[];
    setTurns(t?.turns ?? []);
    setLog(t?.log ?? []);
  };

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setDraft("");
    setTurns((x) => [...x, { role: "user", text: t }]);
    setBusy(true);
    const sentAt = Date.now();
    try {
      const r = await fetch("/api/jarvis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, text: t }),
      });
      const j = (await r.json().catch(() => null)) as {
        threadId?: string;
        reply?: string;
        log?: Log[];
        error?: string;
      } | null;
      if (!j) throw new Error(`HTTP ${r.status}`);
      if (j.threadId) setThreadId(j.threadId);
      const reply = j.error ? `⚠️ ${j.error}` : (j.reply ?? "");
      setTurns((x) => [...x, { role: "assistant", text: reply }]);
      if (j.log?.length) setLog((l) => [...l, ...j.log!]);
      if (!j.error) speak(reply);
      void loadThreads();
    } catch {
      // La connexion a pu couper pendant un long travail (passerelle, réseau
      // mobile) alors que Jarvis continue côté serveur : on attend sa réponse
      // dans l'historique au lieu d'annoncer un échec.
      const recovered = await recover(threadId, sentAt, t);
      if (recovered) {
        setThreadId(recovered.id);
        setTurns(recovered.turns);
        setLog(recovered.log);
        speak(recovered.turns.at(-1)?.text ?? "");
        void loadThreads();
      } else {
        setTurns((x) => [
          ...x,
          { role: "assistant", text: "⚠️ Pas de réponse de Jarvis. Rechargez la page dans un instant : s'il a terminé, sa réponse sera dans l'historique." },
        ]);
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleMic = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = makeRecognition();
    if (!rec) {
      setTurns((x) => [
        ...x,
        {
          role: "assistant",
          text: "Ce navigateur ne permet pas la dictée. Utilisez Chrome, Edge ou Safari, ou écrivez votre demande.",
        },
      ]);
      return;
    }
    rec.lang = "fr-FR";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setDraft((finalText + interim).trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => {
      setListening(false);
      if (finalText.trim()) void send(finalText);
    };
    recRef.current = rec;
    window.speechSynthesis?.cancel();
    setListening(true);
    rec.start();
  };

  const orbMode: OrbMode = listening
    ? "listening"
    : busy
      ? "thinking"
      : speaking
        ? "speaking"
        : "idle";

  const newThread = () => {
    setThreadId(null);
    setTurns([]);
    setLog([]);
  };

  return (
    <div className="grid min-h-0 flex-1 gap-4 px-4 pt-1 pb-4 lg:grid-cols-[240px_minmax(0,1fr)_300px] lg:px-7">
      {/* Conversations */}
      <aside className="hidden min-h-0 flex-col gap-2 overflow-auto lg:flex">
        <button
          type="button"
          onClick={newThread}
          className="flex cursor-pointer items-center gap-2 rounded-full border-none bg-night px-4 py-2 text-base font-medium text-white hover:opacity-85"
        >
          <Icon name="plus" size={16} /> Nouvelle conversation
        </button>
        <span className="eyebrow mt-3 text-ink-3">Conversations</span>
        {threads.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => open(t.id)}
            className={cn(
              "cursor-pointer rounded-[14px] border-none px-3 py-2 text-left text-small",
              threadId === t.id
                ? "bg-paper text-ink shadow-soft"
                : "bg-transparent text-ink-2 hover:bg-mute",
            )}
          >
            <span className="clip block font-medium">{t.title}</span>
            <span className="text-micro text-ink-3">
              {new Date(t.updatedAt).toLocaleString("fr-FR", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </span>
          </button>
        ))}
      </aside>

      {/* Échange : la scène noir et or de Jarvis */}
      <section className="relative flex min-h-[78vh] min-w-0 flex-col overflow-hidden rounded-[26px] bg-[#070706] text-white shadow-soft lg:min-h-0">
        {/* L'orbe : grand au repos, plus discret pendant la conversation. Toucher l'orbe = parler. */}
        <div
          className={cn(
            "relative flex-none transition-[height] duration-700",
            turns.length === 0
              ? "h-[52vh] lg:h-[58%]"
              : "h-[200px] lg:h-[230px]",
          )}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_55%,rgba(206,173,111,.16),transparent_60%)]" />
          <Orb
            mode={orbMode}
            onClick={ready && !busy ? toggleMic : undefined}
          />
          <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-small tracking-[0.18em] text-[#cead6f]/80 uppercase">
            {orbMode === "listening"
              ? "Je vous écoute…"
              : orbMode === "thinking"
                ? "Jarvis et son équipe travaillent…"
                : orbMode === "speaking"
                  ? "Jarvis parle"
                  : ready
                    ? "Touchez l'orbe pour parler"
                    : "Jarvis"}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 pb-4">
          {turns.length === 0 ? (
            <div className="mx-auto flex max-w-[620px] flex-col items-center text-center">
              <h1 className="text-[28px] leading-tight font-bold tracking-[-0.03em] text-white">
                Bonjour {firstName}, que fait-on ?
              </h1>
              <p className="mt-2 text-base text-white/60">
                Je suis Jarvis, votre directeur marketing. Je pilote un
                community manager et un chef de projet web IA, qui agissent
                directement dans Pilot.
              </p>
              {!ready ? (
                <Link
                  href="/reglages"
                  className="mt-5 rounded-full bg-[#cead6f] px-4 py-2 text-base font-semibold text-[#0d0c0a] no-underline hover:no-underline"
                >
                  Raccorder l&apos;assistant (Réglages → Assistant IA)
                </Link>
              ) : (
                <div className="mt-5 grid w-full gap-2 sm:grid-cols-2">
                  {EXEMPLES.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => send(e)}
                      className="cursor-pointer rounded-[16px] border border-white/10 bg-white/[.04] px-4 py-3 text-left text-small text-white/85 hover:border-[#cead6f]/60 hover:bg-white/[.07]"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="mx-auto flex max-w-[760px] flex-col gap-4">
              {turns.map((t, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex max-w-[85%] flex-col gap-1",
                    t.role === "user" ? "items-end self-end" : "self-start",
                  )}
                >
                  <span className="text-micro text-white/40">
                    {t.role === "user" ? "Vous" : "Jarvis"}
                  </span>
                  <span
                    className={cn(
                      "rounded-[20px] px-4 py-3 text-base whitespace-pre-wrap",
                      t.role === "user"
                        ? "rounded-br-[6px] bg-[#cead6f] text-[#0d0c0a]"
                        : "rounded-bl-[6px] border border-white/10 bg-white/[.06] text-white",
                    )}
                  >
                    {t.text}
                  </span>
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
          className="flex items-end gap-2 border-t border-white/10 p-3"
        >
          <button
            type="button"
            onClick={toggleMic}
            disabled={!ready || busy}
            title={listening ? "Arrêter" : "Parler à Jarvis"}
            className={cn(
              "flex h-12 w-12 flex-none cursor-pointer items-center justify-center rounded-full border-none disabled:opacity-40",
              listening
                ? "animate-pulse bg-alert text-white"
                : "bg-[#cead6f] text-[#0d0c0a] hover:brightness-110",
            )}
          >
            <Icon name="mic" size={20} />
          </button>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
            rows={1}
            disabled={!ready}
            placeholder={
              listening ? "Je vous écoute…" : "Écrivez ou touchez l'orbe…"
            }
            className="max-h-40 min-h-12 flex-1 resize-none rounded-[18px] border border-white/10 bg-white/[.05] px-4 py-3 text-base text-white outline-none placeholder:text-white/35 focus:border-[#cead6f]/70"
          />
          <button
            type="submit"
            disabled={!ready || busy || !draft.trim()}
            className="h-12 flex-none cursor-pointer rounded-full border border-white/15 bg-transparent px-5 text-base font-medium text-white hover:border-[#cead6f] disabled:opacity-30"
          >
            Envoyer
          </button>
        </form>
        <label className="flex items-center gap-2 px-4 pb-3 text-small text-white/45">
          <input
            type="checkbox"
            checked={voice}
            onChange={(e) => {
              setVoice(e.target.checked);
              try {
                localStorage.setItem(
                  "jarvis-voice",
                  e.target.checked ? "1" : "0",
                );
              } catch {}
            }}
          />
          Jarvis répond à voix haute
        </label>
      </section>

      {/* Ce qui a été fait */}
      <aside className="flex min-h-0 flex-col overflow-hidden rounded-[26px] border border-line bg-paper shadow-soft">
        <h2 className="border-b border-line px-5 py-4 text-lead font-semibold">
          Ce que l&apos;équipe a fait
        </h2>
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {log.length === 0 ? (
            <p className="p-2 text-small text-ink-3">
              Les actions de Jarvis et de ses agents s&apos;afficheront ici,
              avec un lien vers chaque élément.
            </p>
          ) : null}
          {[...log].reverse().map((l, i) => (
            <div
              key={i}
              className="flex flex-col gap-[2px] border-b border-line px-2 py-3 last:border-none"
            >
              <span className="text-micro font-semibold text-ink-3 uppercase">
                {l.agent}
              </span>
              {l.href ? (
                <Link href={l.href} className="text-small text-ink">
                  {l.text}
                </Link>
              ) : (
                <span className="text-small text-ink">{l.text}</span>
              )}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
