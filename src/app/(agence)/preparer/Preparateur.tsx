"use client";

import Link from "next/link";
import { useState } from "react";
import { useActionState } from "react";
import { Card, CardHead } from "@/components/ui/Card";
import { Dot } from "@/components/ui/primitives";
import { CONTENT_KIND } from "@/data/content";
import { preparerTout, preparerUnClient, type PreparerState } from "./actions";

export type LigneVue = {
  label: string;
  kind: string;
  /** « Instagram · Facebook », déjà mis en forme côté serveur. */
  reseaux: string;
  cible: number;
  existants: number;
  manquants: number;
};

export type PlanVue = {
  clientId: string;
  clientName: string;
  aCreer: number;
  sansDecomposition: boolean;
  lignes: LigneVue[];
};

const champ =
  "rounded-control border border-line bg-paper px-2 py-[6px] text-base outline-none focus:border-gold";

function Message({ state }: { state: PreparerState }) {
  if (!state.ok && !state.error) return null;
  return (
    <p
      className={
        state.ok
          ? "rounded-control border border-ok bg-ok-bg px-3 py-2 text-base text-ok"
          : "rounded-control border border-line bg-canvas px-3 py-2 text-base text-ink-2"
      }
    >
      {state.ok ?? state.error}
    </p>
  );
}

/**
 * La préparation d'un mois, pour un client ou pour tout le portefeuille.
 *
 * Les réglages de répartition — heure de publication, week-ends inclus ou non —
 * vivent ici, en un seul endroit, et sont recopiés dans chaque formulaire. Le
 * mois, lui, passe par l'adresse de la page : c'est lui qui change ce que le
 * serveur calcule, et une vue de septembre doit pouvoir se recharger et se
 * partager telle quelle.
 */
export function Preparateur({
  mois,
  moisPrecedent,
  moisSuivant,
  moisTexte,
  plans,
}: {
  mois: string;
  moisPrecedent: string;
  moisSuivant: string;
  moisTexte: string;
  plans: PlanVue[];
}) {
  const [heure, setHeure] = useState("11");
  const [joursOuvres, setJoursOuvres] = useState(true);

  const [toutState, toutAction, toutPending] = useActionState<PreparerState, FormData>(
    preparerTout,
    {},
  );

  const total = plans.reduce((n, p) => n + p.aCreer, 0);
  const sansPlan = plans.filter((p) => p.sansDecomposition);

  const réglages = (
    <>
      <input type="hidden" name="mois" value={mois} />
      <input type="hidden" name="heure" value={heure} />
      <input type="hidden" name="joursOuvres" value={joursOuvres ? "oui" : "non"} />
    </>
  );

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4">
      <Card className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <Link
              href={`/preparer?mois=${moisPrecedent}`}
              className="rounded-control border border-line bg-paper px-2 py-1 text-small text-ink-2 no-underline hover:border-line-strong hover:text-ink hover:no-underline"
            >
              ←
            </Link>
            <span className="text-lead font-medium capitalize">{moisTexte}</span>
            <Link
              href={`/preparer?mois=${moisSuivant}`}
              className="rounded-control border border-line bg-paper px-2 py-1 text-small text-ink-2 no-underline hover:border-line-strong hover:text-ink hover:no-underline"
            >
              →
            </Link>
          </span>

          <span className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-small text-ink-2">
              Heure
              <select
                value={heure}
                onChange={(e) => setHeure(e.target.value)}
                className={champ}
              >
                {["08", "09", "10", "11", "12", "14", "17", "18", "19"].map((h) => (
                  <option key={h} value={String(Number(h))}>
                    {h} h
                  </option>
                ))}
              </select>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-small text-ink-2">
              <input
                type="checkbox"
                checked={joursOuvres}
                onChange={(e) => setJoursOuvres(e.target.checked)}
                className="h-[15px] w-[15px] accent-ink"
              />
              Jours ouvrés seulement
            </label>
          </span>
        </div>

        <form action={toutAction} className="flex flex-col gap-2">
          {réglages}
          <div>
            <button
              type="submit"
              disabled={toutPending || total === 0}
              className="cursor-pointer rounded-control border border-ink bg-ink px-3 py-2 text-base font-medium text-paper hover:bg-black disabled:cursor-default disabled:opacity-40"
            >
              {toutPending
                ? "Préparation…"
                : total > 0
                  ? `Préparer tout le portefeuille · ${total} contenu${total > 1 ? "s" : ""}`
                  : "Tout est déjà préparé"}
            </button>
          </div>
          <Message state={toutState} />
        </form>

        <p className="text-small text-ink-2">
          Les contenus sont créés au statut <strong>Idée</strong>, sans légende, étalés sur le mois
          à l&apos;heure choisie. Rien n&apos;est publié et rien n&apos;est envoyé au client. Le
          bouton ne crée que ce qui manque : tu peux l&apos;utiliser en milieu de mois, et appuyer
          deux fois sans rien dupliquer.
        </p>
      </Card>

      {sansPlan.length > 0 ? (
        <Card className="border-warn bg-warn-bg p-4">
          <p className="text-base text-warn">
            {sansPlan.length === 1 ? "Un client n'a" : `${sansPlan.length} clients n'ont`} pas de
            décomposition de l&apos;engagement : {sansPlan.map((p) => p.clientName).join(", ")}.
            Rien ne peut être généré pour {sansPlan.length === 1 ? "lui" : "eux"} — ouvre sa fiche
            et ajoute ses lignes (posts feed, stories, reels…).
          </p>
        </Card>
      ) : null}

      {plans.map((plan) => (
        <ClientCard key={plan.clientId} plan={plan} réglages={réglages} />
      ))}

      {plans.length === 0 ? (
        <Card className="p-5">
          <p className="text-base text-ink-2">
            Aucun client actif. La préparation du mois part de l&apos;engagement contractuel :
            crée un client et sa décomposition, puis reviens ici.
          </p>
        </Card>
      ) : null}
    </div>
  );
}

function ClientCard({ plan, réglages }: { plan: PlanVue; réglages: React.ReactNode }) {
  const [state, action, pending] = useActionState<PreparerState, FormData>(preparerUnClient, {});

  return (
    <Card>
      <CardHead
        title={plan.clientName}
        meta={
          plan.sansDecomposition
            ? "aucune décomposition"
            : plan.aCreer > 0
              ? `${plan.aCreer} à créer`
              : "à jour"
        }
      />

      {plan.sansDecomposition ? (
        <p className="px-[14px] py-4 text-base text-ink-2">
          Sans lignes d&apos;engagement, il n&apos;y a rien à répéter. Ajoute-les sur{" "}
          <Link href={`/clients/${plan.clientId}`}>sa fiche</Link>.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <div style={{ minWidth: 520 }}>
              {plan.lignes.map((l) => (
                <div
                  key={l.label + l.kind}
                  className="flex items-center gap-3 border-b border-line px-[14px] py-2"
                >
                  <Dot tone={l.manquants > 0 ? "warn" : "ok"} solid={l.manquants > 0} />
                  <span className="clip min-w-0 flex-1 text-base">{l.label}</span>
                  <span className="flex-none text-small text-ink-3">
                    {CONTENT_KIND[l.kind] ?? l.kind} · {l.reseaux}
                  </span>
                  <span className="w-[110px] flex-none text-right text-base tabular-nums text-ink-2">
                    {l.existants} / {l.cible}
                  </span>
                  <span
                    className={`w-[92px] flex-none text-right text-base tabular-nums ${
                      l.manquants > 0 ? "font-medium text-warn" : "text-ink-3"
                    }`}
                  >
                    {l.manquants > 0 ? `${l.manquants} à créer` : "complet"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <form
            action={action}
            className="flex flex-wrap items-center justify-between gap-3 px-[14px] py-3"
          >
            {réglages}
            <input type="hidden" name="clientId" value={plan.clientId} />
            <span className="min-w-0 flex-1 text-small text-ink-3">
              {state.ok ?? state.error ?? "Le décompte porte sur la date de publication prévue."}
            </span>
            <button
              type="submit"
              disabled={pending || plan.aCreer === 0}
              className="flex-none cursor-pointer rounded-control border border-line bg-paper px-[10px] py-[6px] text-small font-medium text-ink-2 hover:border-line-strong hover:text-ink disabled:cursor-default disabled:opacity-40"
            >
              {pending
                ? "Création…"
                : plan.aCreer > 0
                  ? `Créer les ${plan.aCreer} manquants`
                  : "Rien à créer"}
            </button>
          </form>
        </>
      )}
    </Card>
  );
}
