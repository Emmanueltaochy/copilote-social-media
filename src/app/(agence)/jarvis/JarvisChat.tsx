"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

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
    try {
      const r = await fetch("/api/jarvis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, text: t }),
      });
      const j = (await r.json()) as {
        threadId?: string;
        reply?: string;
        log?: Log[];
        error?: string;
      };
      if (j.threadId) setThreadId(j.threadId);
      const reply = j.error ? `⚠️ ${j.error}` : (j.reply ?? "");
      setTurns((x) => [...x, { role: "assistant", text: reply }]);
      if (j.log?.length) setLog((l) => [...l, ...j.log!]);
      if (!j.error) speak(reply);
      void loadThreads();
    } catch {
      setTurns((x) => [
        ...x,
        { role: "assistant", text: "⚠️ Connexion interrompue. Réessayez." },
      ]);
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

      {/* Échange */}
      <section className="flex min-h-[70vh] min-w-0 flex-col overflow-hidden rounded-[26px] border border-line bg-paper shadow-soft lg:min-h-0">
        <div className="min-h-0 flex-1 overflow-auto p-5">
          {turns.length === 0 ? (
            <div className="mx-auto flex max-w-[560px] flex-col items-center pt-8 text-center">
              <Orb active={busy || listening} />
              <h1 className="mt-5 text-[30px] leading-tight font-bold tracking-[-0.03em]">
                Bonjour {firstName}, que fait-on ?
              </h1>
              <p className="mt-2 text-base text-ink-2">
                Je suis Jarvis, votre directeur marketing. Je pilote un
                community manager et un chef de projet web IA, qui agissent
                directement dans Pilot.
              </p>
              {!ready ? (
                <Link
                  href="/reglages"
                  className="mt-5 rounded-full bg-night px-4 py-2 text-base font-medium text-white no-underline hover:no-underline"
                >
                  Raccorder l&apos;assistant (Réglages → Assistant IA)
                </Link>
              ) : (
                <div className="mt-6 flex flex-col gap-2">
                  {EXEMPLES.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => send(e)}
                      className="cursor-pointer rounded-[16px] border border-line bg-canvas px-4 py-3 text-left text-base text-ink hover:border-line-strong"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {turns.map((t, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex max-w-[85%] flex-col gap-1",
                    t.role === "user" ? "items-end self-end" : "self-start",
                  )}
                >
                  <span className="text-micro text-ink-3">
                    {t.role === "user" ? "Vous" : "Jarvis"}
                  </span>
                  <span
                    className={cn(
                      "rounded-[20px] px-4 py-3 text-base whitespace-pre-wrap",
                      t.role === "user"
                        ? "rounded-br-[6px] bg-night text-white"
                        : "rounded-bl-[6px] bg-mute text-ink",
                    )}
                  >
                    {t.text}
                  </span>
                </div>
              ))}
              {busy ? (
                <div className="flex items-center gap-3 self-start rounded-[20px] bg-mute px-4 py-3 text-base text-ink-2">
                  <Orb active small /> Jarvis et son équipe travaillent…
                </div>
              ) : null}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
          className="flex items-end gap-2 border-t border-line p-3"
        >
          {
            <button
              type="button"
              onClick={toggleMic}
              disabled={!ready || busy}
              title={listening ? "Arrêter" : "Parler à Jarvis"}
              className={cn(
                "flex h-12 w-12 flex-none cursor-pointer items-center justify-center rounded-full border-none disabled:opacity-50",
                listening
                  ? "animate-pulse bg-alert text-white"
                  : "bg-accent text-accent-ink hover:brightness-105",
              )}
            >
              <Icon name="mic" size={20} />
            </button>
          }
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
              listening ? "Je vous écoute…" : "Écrivez ou appuyez sur le micro…"
            }
            className="max-h-40 min-h-12 flex-1 resize-none rounded-[18px] border border-line bg-canvas px-4 py-3 text-base text-ink outline-none focus:border-gold"
          />
          <button
            type="submit"
            disabled={!ready || busy || !draft.trim()}
            className="h-12 flex-none cursor-pointer rounded-full border-none bg-night px-5 text-base font-medium text-white hover:opacity-85 disabled:opacity-40"
          >
            Envoyer
          </button>
        </form>
        <label className="flex items-center gap-2 px-4 pb-3 text-small text-ink-3">
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
          Lire les réponses à voix haute
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

function Orb({ active, small }: { active?: boolean; small?: boolean }) {
  const s = small ? 22 : 96;
  return (
    <span
      className={cn(
        "relative block flex-none rounded-full",
        active && "animate-pulse",
      )}
      style={{
        width: s,
        height: s,
        background:
          "radial-gradient(circle at 35% 30%, #fff6d8, var(--c-accent) 45%, #8a6a22 100%)",
        boxShadow: active
          ? "0 0 0 8px color-mix(in srgb, var(--c-accent) 25%, transparent), 0 0 40px var(--c-accent)"
          : "0 10px 30px color-mix(in srgb, var(--c-accent) 35%, transparent)",
      }}
    />
  );
}
