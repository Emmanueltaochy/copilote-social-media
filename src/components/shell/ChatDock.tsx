"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Avatar } from "@/components/ui/primitives";

type Peer = { id: string; name: string; initials: string; avatarPath: string | null };

type Thread = {
  conversationId: string;
  kind: "equipe" | "direct";
  peer: Peer | null;
  title: string;
  unread: number;
  lastAt: string | null;
  lastPreview: string | null;
  lastAuthor: string | null;
};

type Message = {
  id: string;
  body: string;
  createdAt: string;
  authorId: string | null;
  authorName: string;
  authorInitials: string;
  authorAvatar: string | null;
};

type State = {
  me: string;
  threads: Thread[];
  open: { conversationId: string; messages: Message[] } | null;
};

/** Toutes les 8 s : assez pour qu'une réponse arrive sans qu'on recharge. */
const POLL_MS = 8000;

function heure(iso: string): string {
  const d = new Date(iso);
  const jours = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  const h = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (jours < 1) return h;
  if (jours < 2) return `hier ${h}`;
  return `${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} ${h}`;
}

const avatarUrl = (p: { id: string; avatarPath: string | null } | null) =>
  p?.avatarPath ? `/api/avatar/${p.id}` : null;

/**
 * La messagerie interne, en bas à droite de chaque écran.
 *
 * Une bulle plutôt qu'un onglet : on écrit à quelqu'un *pendant* qu'on regarde
 * une fiche client ou un calendrier, et changer de page pour poser une question
 * fait perdre ce qu'on avait sous les yeux — au point qu'on renonce à demander.
 *
 * Elle interroge le serveur toutes les huit secondes. C'est rustique, mais une
 * connexion permanente demanderait un serveur qui la tienne ouverte, là où
 * l'agence compte quelques personnes et où huit secondes de délai ne se voient
 * pas dans une conversation.
 */
export function ChatDock({ initialUnread, me }: { initialUnread: number; me: string }) {
  const params = useSearchParams();
  const demandée = params.get("chat");

  const [open, setOpen] = useState(Boolean(demandée));
  const [state, setState] = useState<State>({ me, threads: [], open: null });
  const [current, setCurrent] = useState<{ conversation?: string; peer?: string } | null>(
    demandée ? { conversation: demandée } : null,
  );
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Le compte rendu par le serveur au chargement de la page tient jusqu'au
  // premier battement : sans lui, la pastille apparaîtrait une seconde après
  // l'écran, ce qui se lit comme un message qui vient d'arriver.
  const unread = state.threads.reduce((n, t) => n + t.unread, 0);
  const affiché = state.threads.length > 0 ? unread : initialUnread;

  const load = useCallback(
    async (cible: { conversation?: string; peer?: string } | null, marquerLu = true) => {
      const q = new URLSearchParams();
      if (cible?.conversation) q.set("conversation", cible.conversation);
      if (cible?.peer) q.set("peer", cible.peer);
      if (!marquerLu) q.set("read", "0");
      try {
        const res = await fetch(`/api/chat?${q}`, { cache: "no-store" });
        if (!res.ok) return;
        setState(await res.json());
      } catch {
        // Réseau coupé : on garde l'affichage précédent et on retentera au
        // prochain battement. Une erreur rouge à chaque coupure de wifi
        // apprendrait seulement à ne plus lire les messages d'erreur.
      }
    },
    [],
  );

  // Une notification de la cloche mène ici : « /?chat=<id> » ouvre le panneau
  // sur la bonne conversation, sinon le lien ne ferait que changer de page.
  //
  // L'ajustement se fait pendant le rendu et non dans un effet : réagir à un
  // paramètre d'URL dans un effet ferait afficher le panneau fermé pendant une
  // image, puis ouvert — un clignotement à chaque notification ouverte.
  const [vue, setVue] = useState<string | null>(demandée);
  if (demandée && demandée !== vue) {
    setVue(demandée);
    setOpen(true);
    setCurrent({ conversation: demandée });
  }

  // Battement régulier. Quand le panneau est fermé, on ne demande que les
  // compteurs — et sans marquer quoi que ce soit comme lu.
  useEffect(() => {
    const tick = () => load(open ? current : null, open && current !== null);
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => clearInterval(timer);
  }, [open, current, load]);

  // Descendre sur le dernier message : une conversation s'ouvre sur ce qui
  // vient d'être dit, pas sur son début.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [state.open?.conversationId, state.open?.messages.length]);

  async function envoyer() {
    const texte = draft.trim();
    if (!texte || !current || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...current, body: texte }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Envoi impossible.");
      } else {
        setState(data);
        setDraft("");
        // La conversation vient peut-être de naître : on la désigne désormais
        // par son identifiant, sinon le message suivant en créerait une autre.
        if (data.open?.conversationId) setCurrent({ conversation: data.open.conversationId });
      }
    } catch {
      setError("Envoi impossible : vérifie ta connexion.");
    } finally {
      setSending(false);
    }
  }

  const fil = current
    ? state.threads.find(
        (t) =>
          (current.conversation && t.conversationId === current.conversation) ||
          (current.peer && t.peer?.id === current.peer),
      )
    : undefined;

  return (
    <>
      {open ? (
        <div className="fixed right-5 bottom-[84px] z-50 flex h-[520px] max-h-[calc(100vh-120px)] w-[360px] max-w-[calc(100vw-40px)] flex-col overflow-hidden rounded-card border border-line bg-paper shadow-[0_12px_32px_rgba(18,18,18,0.18)]">
          <div className="flex flex-none items-center gap-2 border-b border-line px-3 py-[10px]">
            {current ? (
              <button
                type="button"
                onClick={() => setCurrent(null)}
                aria-label="Revenir aux conversations"
                className="cursor-pointer rounded-control border border-line bg-paper px-[6px] py-[2px] text-small text-ink-2 hover:border-line-strong hover:text-ink"
              >
                ←
              </button>
            ) : null}
            <span className="clip flex-1 text-base font-medium">
              {current ? (fil?.title ?? "Conversation") : "Messagerie"}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fermer la messagerie"
              className="cursor-pointer rounded-control border border-transparent bg-transparent px-[6px] py-[2px] text-small text-ink-3 hover:border-line hover:text-ink"
            >
              ✕
            </button>
          </div>

          {!current ? (
            <div className="min-h-0 flex-1 overflow-auto">
              {state.threads.map((t) => (
                <button
                  key={t.conversationId || `peer-${t.peer?.id}`}
                  type="button"
                  // Désigne la conversation sans passer par son libellé : un
                  // aperçu de message contient volontiers le nom de quelqu'un
                  // d'autre, et deux lignes deviennent alors impossibles à
                  // distinguer autrement qu'à l'œil.
                  data-thread={t.conversationId || `peer:${t.peer?.id}`}
                  onClick={() =>
                    setCurrent(
                      t.conversationId
                        ? { conversation: t.conversationId }
                        : { peer: t.peer?.id },
                    )
                  }
                  className="flex w-full cursor-pointer items-center gap-[10px] border-b border-line bg-paper px-3 py-[10px] text-left hover:bg-canvas"
                >
                  {t.kind === "equipe" ? (
                    <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full border border-gold bg-gold-wash text-micro font-semibold text-gold">
                      ÉQ
                    </span>
                  ) : (
                    <Avatar
                      initials={t.peer?.initials ?? "?"}
                      src={avatarUrl(t.peer)}
                      size={28}
                    />
                  )}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="clip text-base font-medium">{t.title}</span>
                    <span className="clip text-small text-ink-3">
                      {t.lastPreview
                        ? `${t.kind === "equipe" && t.lastAuthor ? `${t.lastAuthor} : ` : ""}${t.lastPreview}`
                        : "Aucun message"}
                    </span>
                  </span>
                  {t.unread > 0 ? (
                    <span className="flex h-[18px] min-w-[18px] flex-none items-center justify-center rounded-full bg-gold px-[5px] text-[10px] font-semibold text-night tabular-nums">
                      {t.unread > 9 ? "9+" : t.unread}
                    </span>
                  ) : t.lastAt ? (
                    <span className="flex-none text-micro text-ink-3">{heure(t.lastAt)}</span>
                  ) : null}
                </button>
              ))}

              {state.threads.length <= 1 ? (
                <p className="px-3 py-4 text-small text-ink-2">
                  Vous êtes seul pour l&apos;instant. Ajoutez des collaborateurs depuis
                  l&apos;écran Équipe : ils apparaîtront ici dès qu&apos;ils auront ouvert leur
                  accès.
                </p>
              ) : null}
            </div>
          ) : (
            <>
              <div
                ref={listRef}
                className="flex min-h-0 flex-1 flex-col overflow-auto px-3 py-3"
              >
                {/* Les messages se collent au bas du panneau : une conversation
                    courte affichée en haut d'un grand vide se lit comme un fil
                    dont la suite serait ailleurs. */}
                <div className="mt-auto">
                {(state.open?.messages ?? []).length === 0 ? (
                  <p className="text-small text-ink-2">
                    {fil?.kind === "equipe"
                      ? "Rien n'a encore été dit ici. Ce fil est lu par toute l'équipe."
                      : `Aucun message avec ${fil?.title ?? "cette personne"}. Écrivez le premier.`}
                  </p>
                ) : (
                  (state.open?.messages ?? []).map((m, i, tous) => {
                    const moi = m.authorId === state.me;
                    const enchaîné = i > 0 && tous[i - 1].authorId === m.authorId;
                    return (
                      <div
                        key={m.id}
                        className={`flex gap-2 ${enchaîné ? "mt-[3px]" : "mt-3"} ${
                          moi ? "flex-row-reverse" : ""
                        }`}
                      >
                        <span className="w-6 flex-none">
                          {enchaîné ? null : (
                            <Avatar
                              initials={m.authorInitials}
                              src={m.authorId && m.authorAvatar ? `/api/avatar/${m.authorId}` : null}
                              size={24}
                            />
                          )}
                        </span>
                        <span
                          className={`flex min-w-0 max-w-[74%] flex-col gap-[2px] ${
                            moi ? "items-end" : "items-start"
                          }`}
                        >
                          {enchaîné ? null : (
                            <span className="text-micro text-ink-3">
                              {moi ? "Vous" : m.authorName} · {heure(m.createdAt)}
                            </span>
                          )}
                          <span
                            className={`rounded-card px-[10px] py-[6px] text-base whitespace-pre-wrap ${
                              moi ? "bg-ink text-paper" : "border border-line bg-canvas text-ink"
                            }`}
                          >
                            {m.body}
                          </span>
                        </span>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
                </div>
              </div>

              <div className="flex flex-none flex-col gap-1 border-t border-line px-3 py-[10px]">
                {error ? <p className="text-small text-alert">{error}</p> : null}
                <div className="flex items-end gap-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      // Entrée envoie, Maj+Entrée passe à la ligne : c'est le
                      // geste attendu partout ailleurs.
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void envoyer();
                      }
                    }}
                    rows={1}
                    placeholder="Écrire un message…"
                    className="max-h-[96px] min-h-[34px] min-w-0 flex-1 resize-y rounded-control border border-line bg-paper px-2 py-[7px] text-base outline-none focus:border-gold"
                  />
                  <button
                    type="button"
                    onClick={() => void envoyer()}
                    disabled={sending || draft.trim() === ""}
                    className="flex-none cursor-pointer rounded-control border border-ink bg-ink px-3 py-[7px] text-base font-medium text-paper hover:bg-black disabled:opacity-50"
                  >
                    {sending ? "…" : "Envoyer"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={
          affiché > 0 ? `Messagerie, ${affiché} messages non lus` : "Ouvrir la messagerie"
        }
        className="fixed right-5 bottom-5 z-50 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-night bg-night text-paper shadow-[0_6px_18px_rgba(18,18,18,0.28)] hover:bg-black"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M3.5 5.5A1.5 1.5 0 0 1 5 4h10a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 15 14H8l-3.5 2.5V14H5a1.5 1.5 0 0 1-1.5-1.5v-7Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
        {affiché > 0 ? (
          <span className="absolute -top-[2px] -right-[2px] flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-canvas bg-gold px-[4px] text-[10px] font-semibold text-night tabular-nums">
            {affiché > 9 ? "9+" : affiché}
          </span>
        ) : null}
      </button>
    </>
  );
}
