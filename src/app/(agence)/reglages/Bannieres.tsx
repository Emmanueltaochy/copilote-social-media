"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusPill } from "@/components/ui/primitives";
import type { PromoState } from "./actions";

type Banniere = {
  id: string;
  title: string;
  body: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  imagePath: string | null;
  audience: string;
  active: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
};

const champ =
  "rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold";

const AUDIENCE: Record<string, string> = {
  tous: "Tous les clients",
  social: "Clients réseaux sociaux",
  web: "Clients web",
};

const jour = (d: Date | null) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : null;

/** Le visuel d'une bannière, envoyé à part une fois la bannière créée. */
function Visuel({ id, present }: { id: string; present: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  async function envoyer() {
    const file = inputRef.current?.files?.[0];
    if (!file) return setErreur("Choisis une image.");
    setErreur(null);
    setBusy(true);
    const r = await fetch(`/api/promo?id=${encodeURIComponent(id)}`, {
      method: "POST",
      headers: {
        "content-type": file.type || "application/octet-stream",
        "x-filename": encodeURIComponent(file.name),
        "x-filesize": String(file.size),
      },
      body: file,
    });
    setBusy(false);
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      return setErreur(body.error ?? "Envoi refusé.");
    }
    if (inputRef.current) inputRef.current.value = "";
    setVersion((v) => v + 1);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      {present ? (
        /* eslint-disable-next-line @next/next/no-img-element -- servi par
           une route maison, hors du pipeline d'images. */
        <img
          src={`/api/promo/${id}?v=${version}`}
          alt=""
          className="max-h-[110px] w-full rounded-control border border-line object-contain"
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          disabled={busy}
          onChange={() => setErreur(null)}
          className="min-w-0 flex-1 rounded-control border border-line bg-paper px-2 py-[5px] text-small file:mr-2 file:cursor-pointer file:rounded-control file:border file:border-line file:bg-canvas file:px-2 file:py-[2px] file:text-micro disabled:opacity-60"
        />
        <button
          type="button"
          onClick={envoyer}
          disabled={busy}
          className="flex-none cursor-pointer rounded-control border border-line bg-paper px-[10px] py-[6px] text-small font-medium text-ink-2 hover:border-line-strong hover:text-ink disabled:opacity-60"
        >
          {busy ? "Envoi…" : present ? "Remplacer le visuel" : "Ajouter un visuel"}
        </button>
      </div>
      {erreur ? <p className="text-small text-alert">{erreur}</p> : null}
    </div>
  );
}

/**
 * Les bannières du portail client.
 *
 * L'agence vend aussi à ses propres clients, et le portail est le seul endroit
 * où ils viennent d'eux-mêmes plusieurs fois par mois. Une bannière y annonce
 * une offre — la création d'un site, une remise de saison — à l'audience qui
 * peut l'acheter.
 */
export function Bannieres({
  bannieres,
  creer,
  basculer,
  supprimer,
}: {
  bannieres: Banniere[];
  creer: (prev: PromoState, data: FormData) => Promise<PromoState>;
  basculer: (data: FormData) => Promise<void>;
  supprimer: (data: FormData) => Promise<void>;
}) {
  const [state, formAction, pending] = useActionState(creer, {});
  const [avecBouton, setAvecBouton] = useState(false);

  return (
    <div className="flex flex-col gap-4 p-[14px]">
      {bannieres.length === 0 ? (
        <p className="text-base text-ink-2">
          Aucune bannière. Le portail est le seul endroit où vos clients reviennent d&apos;
          eux-mêmes : une offre y est vue par les bonnes personnes, sans rien envoyer.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {bannieres.map((b) => {
            const finie = b.endsAt ? new Date(b.endsAt) < new Date() : false;
            return (
              <div
                key={b.id}
                data-banniere={b.id}
                className="flex flex-col gap-2 rounded-card border border-line bg-canvas p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="flex min-w-0 flex-col">
                    <span className="text-base font-medium text-ink">{b.title}</span>
                    {b.body ? <span className="text-small text-ink-2">{b.body}</span> : null}
                    <span className="text-micro text-ink-3">
                      {AUDIENCE[b.audience] ?? b.audience}
                      {jour(b.startsAt) ? ` · du ${jour(b.startsAt)}` : ""}
                      {jour(b.endsAt) ? ` · jusqu'au ${jour(b.endsAt)}` : " · sans date de fin"}
                      {b.ctaLabel ? ` · bouton « ${b.ctaLabel} »` : ""}
                    </span>
                  </span>
                  <span className="flex flex-none items-center gap-2">
                    {finie ? (
                      <StatusPill tone="muted">Terminée</StatusPill>
                    ) : b.active ? (
                      <StatusPill tone="ok">Affichée</StatusPill>
                    ) : (
                      <StatusPill tone="neutral">En pause</StatusPill>
                    )}
                    <form action={basculer}>
                      <input type="hidden" name="id" value={b.id} />
                      <input type="hidden" name="active" value={b.active ? "false" : "true"} />
                      <button
                        type="submit"
                        className="cursor-pointer rounded-control border border-line bg-paper px-2 py-[3px] text-micro text-ink-2 hover:border-line-strong hover:text-ink"
                      >
                        {b.active ? "Mettre en pause" : "Afficher"}
                      </button>
                    </form>
                    <form action={supprimer}>
                      <input type="hidden" name="id" value={b.id} />
                      <button
                        type="submit"
                        title="Supprimer"
                        className="cursor-pointer rounded-control border border-line bg-paper px-[6px] py-[3px] text-micro text-ink-3 hover:border-alert hover:text-alert"
                      >
                        ✕
                      </button>
                    </form>
                  </span>
                </div>
                <Visuel id={b.id} present={Boolean(b.imagePath)} />
              </div>
            );
          })}
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-3 border-t border-line pt-4">
        <span className="eyebrow text-ink-3">Nouvelle bannière</span>

        <label className="flex flex-col gap-[6px]">
          <span className="eyebrow text-ink-3">Titre</span>
          <input
            name="title"
            required
            placeholder="−20 % sur la création de votre site"
            className={champ}
          />
        </label>

        <label className="flex flex-col gap-[6px]">
          <span className="eyebrow text-ink-3">Texte</span>
          <textarea
            name="body"
            rows={2}
            placeholder="Offre valable jusqu'à la fin du mois pour nos clients."
            className={`${champ} resize-y`}
          />
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-[6px]">
            <span className="eyebrow text-ink-3">Qui la voit</span>
            <select name="audience" defaultValue="tous" className={champ}>
              <option value="tous">Tous les clients</option>
              <option value="social">Clients réseaux sociaux</option>
              <option value="web">Clients web</option>
            </select>
          </label>
          <label className="flex flex-col gap-[6px]">
            <span className="eyebrow text-ink-3">Début (facultatif)</span>
            <input name="startsAt" type="date" className={champ} />
          </label>
          <label className="flex flex-col gap-[6px]">
            <span className="eyebrow text-ink-3">Fin (facultatif)</span>
            <input name="endsAt" type="date" className={champ} />
          </label>
        </div>

        <label className="flex cursor-pointer items-center gap-[6px] text-base text-ink-2">
          <input
            type="checkbox"
            checked={avecBouton}
            onChange={(e) => setAvecBouton(e.target.checked)}
            className="h-[15px] w-[15px] accent-ink"
          />
          Ajouter un bouton
        </label>

        {avecBouton ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-[6px]">
              <span className="eyebrow text-ink-3">Intitulé du bouton</span>
              <input name="ctaLabel" placeholder="J'en profite" className={champ} />
            </label>
            <label className="flex flex-col gap-[6px]">
              <span className="eyebrow text-ink-3">Adresse</span>
              <input
                name="ctaUrl"
                type="url"
                placeholder="https://taochyagency.com/offre"
                className={champ}
              />
            </label>
          </div>
        ) : null}

        {state.error ? (
          <p className="rounded-control border border-alert-line bg-alert-bg px-3 py-2 text-base text-alert">
            {state.error}
          </p>
        ) : null}
        {state.ok ? <p className="text-base text-ok">{state.ok}</p> : null}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="cursor-pointer rounded-control border border-ink bg-ink px-3 py-2 text-base font-medium text-paper hover:bg-black disabled:opacity-60"
          >
            {pending ? "Création…" : "Créer la bannière"}
          </button>
          <span className="text-small text-ink-3">
            Le visuel s&apos;ajoute ensuite, sur la bannière créée.
          </span>
        </div>
      </form>
    </div>
  );
}
