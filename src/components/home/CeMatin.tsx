"use client";

import Link from "next/link";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import { marquerTraite, retablir } from "@/app/(agence)/ce-matin-actions";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { euroFromCents } from "@/lib/pacing";
import type { CeMatin as Donnees, LigneMatin, Partage } from "@/lib/ce-matin";
import { ClientChip } from "./bits";

/**
 * « Ce matin » : à qui répondre, l'argent qui dort, et quoi faire pour qui.
 *
 * Chaque ligne mène à la fiche. Une source qui n'est pas encore lue (Gmail,
 * Trello) ou pas raccordée (Abby) est nommée, plutôt que de laisser un zéro
 * faire croire que tout va bien.
 *
 * « Traité » archive une ligne pour toute l'équipe : elle disparaît tout de
 * suite (mise à jour optimiste), un message « Archivé · Annuler » reste
 * quelques secondes, et l'archive est enregistrée en base. La ligne revient
 * d'elle-même si quelque chose de nouveau arrive (règle dans lib/ce-matin.ts).
 */

type Op = { type: "archiver" | "retablir"; keys: string[]; le: string };
type Message = { id: number; texte: string; keys?: string[]; erreur?: boolean };

const DUREE_MESSAGE = 6000;

export function CeMatin({ matin }: { matin: Donnees }) {
  // Les gestes en cours, appliqués par-dessus ce que le serveur a rendu.
  // Quand la réponse du serveur arrive (avec la page rafraîchie), ils
  // s'effacent d'eux-mêmes : les nouvelles données disent la même chose.
  const [ops, ajouterOp] = useOptimistic<Op[], Op>([], (s, op) => [...s, op]);
  const [, startTransition] = useTransition();
  const [message, setMessage] = useState<Message | null>(null);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), message.erreur ? DUREE_MESSAGE + 2000 : DUREE_MESSAGE);
    return () => clearTimeout(t);
  }, [message]);

  const dernierGeste = new Map<string, Op>();
  for (const op of ops) for (const k of op.keys) dernierGeste.set(k, op);

  const vue = (p: Partage): Partage => {
    const geste = (k: string) => dernierGeste.get(k)?.type;
    return {
      lignes: [...p.lignes.filter((l) => geste(l.key) !== "archiver"), ...p.archivees.filter((l) => geste(l.key) === "retablir")],
      archivees: [
        ...p.lignes
          .filter((l) => geste(l.key) === "archiver")
          .map((l) => ({ ...l, retour: undefined, archive: { par: "vous", le: dernierGeste.get(l.key)!.le } })),
        ...p.archivees.filter((l) => geste(l.key) !== "retablir"),
      ],
    };
  };

  const lancer = (type: Op["type"], keys: string[]) => {
    startTransition(async () => {
      ajouterOp({ type, keys, le: new Date().toISOString() });
      try {
        const r = type === "archiver" ? await marquerTraite(keys) : await retablir(keys);
        if (!r.ok) setMessage({ id: Date.now(), texte: r.erreur, erreur: true });
      } catch {
        setMessage({ id: Date.now(), texte: "Pas de connexion : rien n'a été enregistré.", erreur: true });
      }
    });
  };

  const traiter = (keys: string[]) => {
    if (keys.length === 0) return;
    lancer("archiver", keys);
    setMessage({ id: Date.now(), texte: keys.length > 1 ? `${keys.length} lignes archivées` : "Archivé", keys });
  };
  const annuler = (keys: string[]) => {
    lancer("retablir", keys);
    setMessage(null);
  };
  const rétablirLigne = (key: string) => {
    lancer("retablir", [key]);
    setMessage({ id: Date.now(), texte: "Rétabli" });
  };

  const repondre = vue(matin.repondre);
  const actions = vue(matin.actions);
  const argent = matin.argent ? { ...matin.argent, ...vue(matin.argent) } : null;
  const urgents = repondre.lignes.filter((l) => l.urgence === "urgent").length;
  const outils = { traiter, retablir: rétablirLigne };

  return (
    <section className="mb-5 rounded-[26px] border border-line bg-paper p-5 shadow-soft">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lead font-semibold text-ink">Ce matin</h2>
        <Link href="/contacts" className="text-small font-medium text-ink-2">
          Tous les contacts →
        </Link>
      </div>
      <div className={cn("grid gap-5", argent ? "xl:grid-cols-3" : "xl:grid-cols-2")}>
        <Colonne
          titre="À répondre"
          compteur={urgents ? `${urgents} urgent${urgents > 1 ? "s" : ""}` : repondre.lignes.length ? `${repondre.lignes.length}` : null}
          compteurTon={urgents ? "alert" : "neutral"}
          partage={repondre}
          outils={outils}
          pied="Les e-mails ne sont pas encore lus par Pilot (étape 2) : ne figurent ici que les réponses connues de l'agent ventes, les commentaires du portail et les demandes de devis."
        >
          {repondre.lignes.length === 0 ? (
            <Vide texte="Personne n'attend de réponse parmi ce que Pilot sait lire." />
          ) : (
            <Liste lignes={repondre.lignes} max={6} rendu={(l) => <LigneRepondre l={l} traiter={traiter} />} />
          )}
        </Colonne>

        {argent ? <ColonneArgent argent={argent} outils={outils} /> : null}

        <Colonne
          titre="Actions"
          compteur={actions.lignes.length ? `${actions.lignes.length}` : null}
          compteurTon="neutral"
          partage={actions}
          outils={outils}
          pied="Déduites des prochaines étapes des fiches, des validations, des retours clients et des projets web. Trello viendra à l'étape 3."
        >
          {actions.lignes.length === 0 ? (
            <Vide texte="Aucune action datée pour aujourd'hui." />
          ) : (
            <ActionsParClient lignes={actions.lignes} max={8} traiter={traiter} />
          )}
        </Colonne>
      </div>

      {message ? (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "fixed bottom-5 left-4 right-[84px] z-[70] flex min-h-[52px] items-center justify-between gap-3 rounded-[16px] py-1 pr-1 pl-4 text-base shadow-[0_10px_30px_rgba(18,18,18,0.25)]",
            "sm:right-auto sm:left-1/2 sm:w-auto sm:min-w-[300px] sm:-translate-x-1/2",
            message.erreur ? "bg-alert text-white" : "bg-night text-white",
          )}
        >
          <span className="flex items-center gap-2 font-medium">
            {message.erreur ? <Icon name="alert" size={16} /> : <Icon name="check" size={16} />}
            {message.texte}
          </span>
          {message.keys ? (
            <button
              type="button"
              onClick={() => annuler(message.keys!)}
              className="min-h-[44px] cursor-pointer rounded-[12px] px-4 font-semibold text-white underline-offset-4 hover:bg-white/10 hover:underline"
            >
              Annuler
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setMessage(null)}
              aria-label="Fermer le message"
              className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-[12px] text-white hover:bg-white/10"
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}

type Outils = { traiter: (keys: string[]) => void; retablir: (key: string) => void };

function Colonne({
  titre,
  compteur,
  compteurTon,
  pied,
  partage,
  outils,
  argent = false,
  children,
}: {
  titre: string;
  compteur: string | null;
  compteurTon: "alert" | "neutral";
  pied?: string;
  partage: Partage;
  outils: Outils;
  argent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="eyebrow text-ink-3">{titre}</span>
        {compteur ? (
          <span
            className={cn(
              "rounded-full px-2 py-[1px] text-micro font-bold",
              compteurTon === "alert" ? "bg-alert text-white" : "bg-mute text-ink-2",
            )}
          >
            {compteur}
          </span>
        ) : null}
      </div>
      {children}
      <PiedDeColonne titre={titre} partage={partage} outils={outils} argent={argent} />
      {pied ? <p className="mt-auto text-small text-ink-3">{pied}</p> : null}
    </div>
  );
}

/** « Voir les archivés (N) » et « Tout marquer traité », en bas de chaque colonne. */
function PiedDeColonne({ titre, partage, outils, argent }: { titre: string; partage: Partage; outils: Outils; argent: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const [confirmer, setConfirmer] = useState(false);
  const n = partage.archivees.length;
  const restantes = partage.lignes.length;
  const idListe = `archives-${titre.replace(/\W+/g, "-").toLowerCase()}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="-my-2 flex flex-wrap items-center justify-between gap-x-3">
        <button
          type="button"
          aria-expanded={ouvert}
          aria-controls={idListe}
          onClick={() => setOuvert((o) => !o)}
          className="flex min-h-[44px] cursor-pointer items-center gap-1 text-small font-medium text-ink-2 hover:text-ink"
        >
          {ouvert ? "Masquer les archivés" : `Voir les archivés (${n})`}
          <Icon name="chevronDown" size={14} className={cn("transition-transform", ouvert && "rotate-180")} />
        </button>
        {restantes > 1 && !confirmer ? (
          <button
            type="button"
            onClick={() => setConfirmer(true)}
            className="flex min-h-[44px] cursor-pointer items-center text-small text-ink-3 hover:text-ink"
          >
            Tout marquer traité
          </button>
        ) : null}
      </div>

      {confirmer && restantes > 0 ? (
        <div className="flex flex-col gap-2 rounded-[16px] border border-line-strong bg-mute/40 p-3 text-small text-ink-2">
          <span>
            Archiver les {restantes} ligne{restantes > 1 ? "s" : ""} de « {titre} » pour toute l&apos;équipe ? Elles reviendront
            d&apos;elles-mêmes si quelque chose de nouveau arrive.
          </span>
          <span className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                outils.traiter(partage.lignes.map((l) => l.key));
                setConfirmer(false);
              }}
              className="min-h-[44px] cursor-pointer rounded-full bg-night px-4 font-semibold text-white hover:brightness-125"
            >
              Oui, tout archiver
            </button>
            <button
              type="button"
              onClick={() => setConfirmer(false)}
              className="min-h-[44px] cursor-pointer rounded-full border border-line px-4 font-semibold text-ink hover:border-line-strong"
            >
              Non
            </button>
          </span>
        </div>
      ) : null}

      {ouvert ? (
        <div id={idListe} className="flex flex-col gap-2">
          {n === 0 ? (
            <span className="text-small text-ink-3">Rien d&apos;archivé dans cette colonne.</span>
          ) : (
            partage.archivees.map((l) => (
              <div key={l.key} className="flex min-w-0 items-center gap-2 rounded-[16px] border border-dashed border-line-strong py-1 pr-1 pl-3">
                <Link href={l.href} className="flex min-w-0 flex-1 flex-col py-1 text-ink no-underline hover:no-underline">
                  <span className="clip text-small font-semibold">{l.qui}</span>
                  <span className="line-clamp-2 text-small text-ink-2">{l.titre}</span>
                  <span className="text-micro text-ink-3">
                    Archivé par {l.archive?.par ?? "un compte supprimé"} · {quand(l.archive?.le)}
                  </span>
                </Link>
                {argent ? <span className="flex-none text-small font-semibold text-ink-3 tabular-nums">{euroFromCents(l.montantCents ?? 0)}</span> : null}
                <button
                  type="button"
                  onClick={() => outils.retablir(l.key)}
                  className="min-h-[44px] flex-none cursor-pointer rounded-[12px] px-3 text-small font-semibold text-ink-2 hover:bg-mute hover:text-ink"
                >
                  Rétablir
                </button>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Le bouton « Traité » : discret, toujours visible, cible de 44 px. */
function BoutonTraite({ l, traiter, className }: { l: LigneMatin; traiter: (keys: string[]) => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => traiter([l.key])}
      aria-label={`Marquer traité : ${l.qui}, ${l.titre}`}
      title="Archiver pour toute l'équipe. La ligne revient si quelque chose de nouveau arrive."
      className={cn(
        "group/traite flex min-h-[44px] min-w-[44px] flex-none cursor-pointer items-center justify-center rounded-[12px] px-1 text-ink-3 hover:text-ink",
        className,
      )}
    >
      <span className="flex items-center gap-1 rounded-full border border-line bg-paper px-[9px] py-[4px] text-micro font-semibold group-hover/traite:border-line-strong">
        <Icon name="check" size={12} strokeWidth={2.4} />
        Traité
      </span>
    </button>
  );
}

function Retour({ l }: { l: LigneMatin }) {
  if (!l.retour) return null;
  return <span className="text-micro font-semibold text-info">Du nouveau depuis l&apos;archivage du {quand(l.retour.le)}</span>;
}

function Liste({ lignes, max, rendu }: { lignes: LigneMatin[]; max: number; rendu: (l: LigneMatin) => React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      {lignes.slice(0, max).map((l) => (
        <div key={l.key}>{rendu(l)}</div>
      ))}
      {lignes.length > max ? <span className="text-small text-ink-3">et {lignes.length - max} autre{lignes.length - max > 1 ? "s" : ""}</span> : null}
    </div>
  );
}

function LigneRepondre({ l, traiter }: { l: LigneMatin; traiter: (keys: string[]) => void }) {
  return (
    <div className="flex min-w-0 items-start rounded-[16px] border border-line hover:border-line-strong">
      <Link href={l.href} className="flex min-w-0 flex-1 items-start gap-3 py-3 pl-3 text-ink no-underline hover:no-underline">
        <ClientChip name={l.qui} size={32} />
        <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <span className="flex min-w-0 items-center gap-2">
            <span className="clip text-base font-semibold">{l.qui}</span>
            <span
              className={cn(
                "flex-none rounded-full px-2 py-[1px] text-micro font-semibold",
                l.urgence === "urgent" ? "bg-alert-bg text-alert" : "bg-mute text-ink-2",
              )}
            >
              {l.urgence === "urgent" ? "Urgent" : "Peut attendre"}
            </span>
          </span>
          <span className="text-small text-ink-2">{l.titre}</span>
          {l.meta ? <span className="clip text-small text-ink-3">{l.meta}</span> : null}
          {l.raison ? <span className="text-micro text-ink-3">{l.raison}</span> : null}
          <Retour l={l} />
        </span>
      </Link>
      <BoutonTraite l={l} traiter={traiter} className="m-1" />
    </div>
  );
}

type ArgentVu = NonNullable<Donnees["argent"]>;

function ColonneArgent({ argent, outils }: { argent: ArgentVu; outils: Outils }) {
  const abbyAbsent = argent.abby !== "raccorde";
  const somme = (lignes: LigneMatin[], ton?: LigneMatin["ton"]) =>
    lignes.filter((l) => !ton || l.ton === ton).reduce((t, l) => t + (l.montantCents ?? 0), 0);
  // Le total ne compte que ce qui reste à traiter ; ce qui est archivé est
  // annoncé à côté, pour que rien ne soit caché sans trace.
  const retardCents = somme(argent.lignes, "alert");
  const impayesCents = somme(argent.lignes, "warn");
  const devisCents = somme(argent.lignes, "info");
  const totalCents = retardCents + impayesCents + devisCents;
  const archivesCents = somme(argent.archivees);
  const rien = argent.lignes.length === 0;

  return (
    <Colonne
      titre="Argent qui dort"
      compteur={argent.lignes.length ? `${argent.lignes.length}` : null}
      compteurTon={retardCents > 0 ? "alert" : "neutral"}
      partage={argent}
      outils={outils}
      argent
    >
      {abbyAbsent && rien && argent.archivees.length === 0 ? (
        <div className="flex flex-col gap-2 rounded-[16px] border border-dashed border-line-strong p-4 text-base text-ink-3">
          {argent.abby === "erreur" ? (
            <span>Abby n&apos;a pas répondu ({argent.erreurAbby}). Les montants ne peuvent pas être calculés pour l&apos;instant.</span>
          ) : (
            <span>
              Abby n&apos;est pas raccordé : les factures et les devis signés ne peuvent pas être lus. Aucune facture impayée n&apos;est
              déposée dans Pilot.
            </span>
          )}
          <Link href="/reglages" className="w-fit rounded-full border border-line px-4 py-[6px] text-small font-semibold text-ink no-underline hover:no-underline">
            Raccorder Abby
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[34px] leading-none font-bold tracking-[-0.03em] tabular-nums" data-total-argent>
                {euroFromCents(totalCents)}
              </span>
              {archivesCents > 0 ? (
                <span className="text-small font-medium text-ink-3 tabular-nums" data-archives-argent>
                  + {euroFromCents(archivesCents)} archivés
                </span>
              ) : null}
            </span>
            <span className="text-small text-ink-3">
              {[
                retardCents ? `${euroFromCents(retardCents)} en retard` : null,
                impayesCents ? `${euroFromCents(impayesCents)} à encaisser` : null,
                devisCents ? `${euroFromCents(devisCents)} signés, pas facturés` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Rien en attente"}
            </span>
            {abbyAbsent ? (
              <span className="text-small text-warn">
                {argent.abby === "erreur" ? `Abby n'a pas répondu (${argent.erreurAbby}) : ` : "Abby n'est pas raccordé : "}
                seules les factures déposées dans Pilot sont comptées.{" "}
                <Link href="/reglages" className="text-warn">
                  Réglages
                </Link>
              </span>
            ) : null}
          </div>
          {rien ? (
            <Vide texte={argent.archivees.length ? "Tout est marqué traité." : "Aucune facture impayée ni devis signé en attente de facture."} />
          ) : (
            <Liste
              lignes={argent.lignes}
              max={6}
              rendu={(l) => (
                <div className="flex min-w-0 items-center rounded-[16px] border border-line hover:border-line-strong">
                  <Link href={l.href} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-3 text-ink no-underline hover:no-underline">
                    <span
                      className={cn(
                        "h-2 w-2 flex-none rounded-full",
                        l.ton === "alert" ? "bg-alert" : l.ton === "warn" ? "bg-warn" : "bg-info",
                      )}
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="clip text-base font-semibold">{l.qui}</span>
                      <span className="clip text-small text-ink-2">{l.titre}</span>
                      <span className={cn("clip text-small", l.ton === "alert" ? "text-alert" : "text-ink-3")}>{l.meta}</span>
                      <Retour l={l} />
                    </span>
                    <span className="flex-none text-base font-semibold tabular-nums">{euroFromCents(l.montantCents ?? 0)}</span>
                  </Link>
                  <BoutonTraite l={l} traiter={outils.traiter} className="m-1" />
                </div>
              )}
            />
          )}
        </>
      )}
    </Colonne>
  );
}

/** Les actions regroupées sous le nom du client ou du prospect concerné. */
function ActionsParClient({ lignes, max, traiter }: { lignes: LigneMatin[]; max: number; traiter: (keys: string[]) => void }) {
  const groupes: { cle: string; qui: string; href: string; lignes: LigneMatin[] }[] = [];
  for (const l of lignes.slice(0, max)) {
    const cle = l.clientId ?? l.qui;
    const g = groupes.find((x) => x.cle === cle);
    if (g) g.lignes.push(l);
    // L'en-tête mène à la fiche, même quand la ligne mène à un projet web.
    else groupes.push({ cle, qui: l.qui, href: l.clientId ? `/contacts/${l.clientId}` : l.href, lignes: [l] });
  }
  return (
    <div className="flex flex-col gap-2">
      {groupes.map((g) => (
        <div key={g.cle} className="flex min-w-0 flex-col rounded-[16px] border border-line py-2 pr-1 pl-3">
          <Link href={g.href} className="flex min-w-0 items-center gap-2 py-1 text-ink no-underline hover:no-underline">
            <ClientChip name={g.qui} size={24} />
            <span className="clip text-base font-semibold">{g.qui}</span>
          </Link>
          {g.lignes.map((l) => (
            <div key={l.key} className="flex min-w-0 items-center">
              <Link href={l.href} className="flex min-w-0 flex-1 items-start gap-2 py-1 pl-8 text-ink no-underline hover:no-underline">
                <Icon
                  name={l.ton === "alert" ? "alert" : "check"}
                  size={14}
                  className={cn("mt-[3px] flex-none", l.ton === "alert" ? "text-alert" : l.ton === "warn" ? "text-warn" : "text-ink-3")}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="line-clamp-2 text-small text-ink">{l.titre}</span>
                  {l.meta ? <span className="clip text-micro text-ink-3">{l.meta}</span> : null}
                  <Retour l={l} />
                </span>
              </Link>
              <BoutonTraite l={l} traiter={traiter} />
            </div>
          ))}
        </div>
      ))}
      {lignes.length > max ? (
        <Link href="/contacts?filtre=a_faire" className="text-small text-ink-2">
          et {lignes.length - max} autre{lignes.length - max > 1 ? "s" : ""} →
        </Link>
      ) : null}
    </div>
  );
}

function Vide({ texte }: { texte: string }) {
  return <div className="rounded-[16px] border border-dashed border-line-strong p-4 text-base text-ink-3">{texte}</div>;
}

/** « 17 nov. à 09:12 », à l'heure de La Réunion (le même texte côté serveur et navigateur). */
function quand(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const jour = d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Indian/Reunion" });
  const heure = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Indian/Reunion" });
  return `${jour} à ${heure}`;
}
