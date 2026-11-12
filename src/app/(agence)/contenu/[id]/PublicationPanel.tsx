"use client";

import { useActionState } from "react";
import { publicationAction, type ProgState } from "../metricool-actions";
import { NETWORK_LABEL } from "@/data/content";
import { STATE_LABEL, type NetworkState, type PubCheck } from "@/lib/publication";

/*
 * Le bloc « Publication » de la fiche : tout ce qu'il faut pour publier depuis
 * Pilot, au même endroit. Ce qui manque est listé (et pourquoi), puis un seul
 * bouton fait partir la publication chez Metricool, qui publie à l'heure dite.
 */

const NET_STATUS: Record<string, { label: string; cls: string }> = {
  PUBLISHED: { label: "publié", cls: "bg-ok-bg text-ok" },
  PENDING: { label: "programmé", cls: "bg-info-bg text-info" },
  ERROR: { label: "échec", cls: "bg-alert-bg text-alert" },
};

const STATE_CLS: Record<string, string> = {
  programme: "bg-info-bg text-info",
  brouillon: "bg-warn-bg text-warn",
  publie: "bg-ok-bg text-ok",
  partiel: "bg-warn-bg text-warn",
  erreur: "bg-alert-bg text-alert",
  introuvable: "bg-warn-bg text-warn",
};

const btn = "cursor-pointer rounded-full px-4 py-2 text-base font-medium disabled:cursor-not-allowed disabled:opacity-50";
const btnMain = `${btn} border-none bg-night text-white hover:opacity-85`;
const btnSoft = `${btn} border border-line bg-paper text-ink-2 hover:border-line-strong hover:text-ink`;

export function PublicationPanel(p: {
  id: string;
  state: string | null;
  networks: NetworkState[];
  checks: PubCheck[];
  checksNow: PubCheck[];
  scheduledLabel: string | null;
  sentAt: string | null;
  checkedAt: string | null;
  stale: boolean;
  blocker: string | null;
  draftOnly: boolean;
}) {
  const [state, action, pending] = useActionState<ProgState, FormData>(publicationAction, {});
  const programmed = p.state === "programme" || p.state === "brouillon";
  const ready = p.checks.every((c) => c.ok);
  const readyNow = p.checksNow.every((c) => c.ok);
  const fmt = (iso: string) => new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={p.id} />

      {p.state ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-[10px] py-[3px] text-small font-semibold ${STATE_CLS[p.state] ?? "bg-line text-ink-2"}`}>
            {STATE_LABEL[p.state] ?? p.state}
          </span>
          {p.networks.map((n) => {
            const s = NET_STATUS[n.status] ?? NET_STATUS.PENDING;
            const label = `${NETWORK_LABEL[n.network] ?? n.network} · ${s.label}`;
            return n.url ? (
              <a key={n.network} href={n.url} target="_blank" rel="noreferrer" className={`rounded-full px-[10px] py-[3px] text-small ${s.cls}`}>
                {label} ↗
              </a>
            ) : (
              <span key={n.network} className={`rounded-full px-[10px] py-[3px] text-small ${s.cls}`} title={n.detail ?? undefined}>
                {label}
              </span>
            );
          })}
        </div>
      ) : null}

      {programmed ? (
        <p className="text-base text-ink-2">
          {p.state === "brouillon"
            ? "Envoyé en brouillon chez Metricool : rien ne sera publié tant qu'il reste brouillon."
            : `Part tout seul ${p.scheduledLabel ? `le ${p.scheduledLabel}` : "à l'heure prévue"}. Pilot vérifie ensuite chez Metricool et passe le contenu en « publié » avec le lien du post.`}
        </p>
      ) : null}

      {p.networks.some((n) => n.status === "ERROR" && n.detail) ? (
        <ul className="m-0 list-none rounded-control border border-alert-line bg-alert-wash p-3 text-small text-alert">
          {p.networks
            .filter((n) => n.status === "ERROR")
            .map((n) => (
              <li key={n.network}>
                {NETWORK_LABEL[n.network] ?? n.network} : {n.detail ?? "échec sans détail"}
              </li>
            ))}
        </ul>
      ) : null}

      {p.state === "introuvable" ? (
        <p className="rounded-control border border-warn bg-warn-bg p-3 text-small text-warn">
          Cette publication n&apos;est plus dans Metricool (supprimée là-bas ?). Reprogrammez-la, ou indiquez le lien si elle a été publiée à la main.
        </p>
      ) : null}

      {p.stale && programmed ? (
        <p className="rounded-control border border-warn bg-warn-bg p-3 text-small text-warn">
          Le contenu a changé depuis l&apos;envoi (médias, légende ou date) : mettez à jour pour que Metricool publie la bonne version.
        </p>
      ) : null}

      {p.blocker && !programmed ? (
        <p className="rounded-control border border-alert-line bg-alert-wash p-3 text-small text-alert">
          Validé, mais la publication n&apos;a pas pu partir toute seule : {p.blocker}
        </p>
      ) : null}

      {!programmed && p.state !== "publie" ? (
        <ul className="m-0 flex list-none flex-col gap-[6px] p-0">
          {p.checks.map((c) => (
            <li key={c.key} className="flex items-start gap-2 text-base">
              <span aria-hidden className={`mt-[1px] w-4 flex-none text-center font-bold ${c.ok ? "text-ok" : "text-alert"}`}>
                {c.ok ? "✓" : "✕"}
              </span>
              <span className="min-w-0">
                <span className={c.ok ? "text-ink-2" : "font-medium text-ink"}>{c.label}</span>
                {!c.ok && c.hint ? <span className="block text-small text-ink-3">{c.hint}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {p.state !== "publie" && p.state !== "partiel" ? (
        <div className="flex flex-wrap items-center gap-2">
          {programmed ? (
            <>
              <button type="submit" name="op" value="programmer" disabled={pending || !ready} className={p.stale ? btnMain : btnSoft}>
                Mettre à jour
              </button>
              <button
                type="submit"
                name="op"
                value="maintenant"
                disabled={pending || !readyNow}
                className={btnSoft}
                onClick={(e) => {
                  if (!confirm("Publier maintenant, sans attendre la date prévue ?")) e.preventDefault();
                }}
              >
                Publier maintenant
              </button>
              <button type="submit" name="op" value="verifier" disabled={pending} className={btnSoft}>
                Vérifier
              </button>
              <button
                type="submit"
                name="op"
                value="annuler"
                disabled={pending}
                className={`${btnSoft} text-alert hover:border-alert hover:text-alert`}
                onClick={(e) => {
                  if (!confirm("Retirer cette publication de Metricool ?")) e.preventDefault();
                }}
              >
                Annuler la programmation
              </button>
            </>
          ) : (
            <>
              <button type="submit" name="op" value="programmer" disabled={pending || !ready} className={btnMain}>
                {pending ? "Envoi à Metricool…" : p.scheduledLabel ? `Programmer le ${p.scheduledLabel}` : "Programmer"}
              </button>
              <button
                type="submit"
                name="op"
                value="maintenant"
                disabled={pending || !readyNow}
                className={btnSoft}
                onClick={(e) => {
                  if (!confirm("Publier maintenant sur les réseaux du client ?")) e.preventDefault();
                }}
              >
                Publier maintenant
              </button>
              {p.state === "erreur" || p.state === "introuvable" ? (
                <button type="submit" name="op" value="verifier" disabled={pending} className={btnSoft}>
                  Vérifier
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <button type="submit" name="op" value="verifier" disabled={pending} className={`${btnSoft} self-start`}>
          Vérifier chez Metricool
        </button>
      )}

      <p className="m-0 text-small text-ink-3">
        {p.sentAt ? `Envoyé à Metricool le ${fmt(p.sentAt)}` : "Rien n'est encore envoyé à Metricool."}
        {p.checkedAt ? ` · vérifié le ${fmt(p.checkedAt)}` : ""}
      </p>
      {p.draftOnly ? <p className="m-0 text-small text-warn">Préversion : l&apos;envoi crée un brouillon, rien n&apos;est publié.</p> : null}
      {pending ? <p className="m-0 text-small text-ink-3">Un instant, Metricool récupère les médias…</p> : null}
      {state.error ? <p className="m-0 text-small text-alert">{state.error}</p> : null}
      {state.ok ? <p className="m-0 text-small text-ok">{state.ok}</p> : null}
    </form>
  );
}
