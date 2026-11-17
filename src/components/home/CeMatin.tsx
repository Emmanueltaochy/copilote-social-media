import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { euroFromCents } from "@/lib/pacing";
import type { ArgentQuiDort, LigneMatin } from "@/lib/ce-matin";
import { ClientChip } from "./bits";

/**
 * « Ce matin » : à qui répondre, l'argent qui dort, et quoi faire pour qui.
 *
 * Chaque ligne mène à la fiche. Une source qui n'est pas encore lue (Gmail,
 * Trello) ou pas raccordée (Abby) est nommée, plutôt que de laisser un zéro
 * faire croire que tout va bien.
 */
export function CeMatin({
  repondre,
  argent,
  actions,
}: {
  repondre: LigneMatin[];
  argent: ArgentQuiDort | null;
  actions: LigneMatin[];
}) {
  const urgents = repondre.filter((l) => l.urgence === "urgent").length;
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
          compteur={urgents ? `${urgents} urgent${urgents > 1 ? "s" : ""}` : repondre.length ? `${repondre.length}` : null}
          compteurTon={urgents ? "alert" : "neutral"}
          pied="Les e-mails ne sont pas encore lus par Pilot (étape 2) : ne figurent ici que les réponses connues de l'agent ventes, les commentaires du portail et les demandes de devis."
        >
          {repondre.length === 0 ? (
            <Vide texte="Personne n'attend de réponse parmi ce que Pilot sait lire." />
          ) : (
            <Liste lignes={repondre} max={6} rendu={(l) => <LigneRepondre l={l} />} />
          )}
        </Colonne>

        {argent ? <ColonneArgent argent={argent} /> : null}

        <Colonne
          titre="Actions"
          compteur={actions.length ? `${actions.length}` : null}
          compteurTon="neutral"
          pied="Déduites des prochaines étapes des fiches, des validations, des retours clients et des projets web. Trello viendra à l'étape 3."
        >
          {actions.length === 0 ? (
            <Vide texte="Aucune action datée pour aujourd'hui." />
          ) : (
            <ActionsParClient lignes={actions} max={8} />
          )}
        </Colonne>
      </div>
    </section>
  );
}

function Colonne({
  titre,
  compteur,
  compteurTon,
  pied,
  children,
}: {
  titre: string;
  compteur: string | null;
  compteurTon: "alert" | "neutral";
  pied?: string;
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
      {pied ? <p className="mt-auto text-small text-ink-3">{pied}</p> : null}
    </div>
  );
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

function LigneRepondre({ l }: { l: LigneMatin }) {
  return (
    <Link
      href={l.href}
      className="flex min-w-0 items-start gap-3 rounded-[16px] border border-line p-3 text-ink no-underline hover:border-line-strong hover:no-underline"
    >
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
      </span>
    </Link>
  );
}

function ColonneArgent({ argent }: { argent: ArgentQuiDort }) {
  const abbyAbsent = argent.abby !== "raccorde";
  const rien = argent.lignes.length === 0;
  return (
    <Colonne
      titre="Argent qui dort"
      compteur={argent.lignes.length ? `${argent.lignes.length}` : null}
      compteurTon={argent.retardCents > 0 ? "alert" : "neutral"}
    >
      {abbyAbsent && rien ? (
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
            <span className="text-[34px] leading-none font-bold tracking-[-0.03em] tabular-nums">{euroFromCents(argent.totalCents)}</span>
            <span className="text-small text-ink-3">
              {[
                argent.retardCents ? `${euroFromCents(argent.retardCents)} en retard` : null,
                argent.impayesCents ? `${euroFromCents(argent.impayesCents)} à encaisser` : null,
                argent.devisCents ? `${euroFromCents(argent.devisCents)} signés, pas facturés` : null,
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
            <Vide texte="Aucune facture impayée ni devis signé en attente de facture." />
          ) : (
            <Liste
              lignes={argent.lignes}
              max={6}
              rendu={(l) => (
                <Link
                  href={l.href}
                  className="flex min-w-0 items-center gap-3 rounded-[16px] border border-line p-3 text-ink no-underline hover:border-line-strong hover:no-underline"
                >
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
                  </span>
                  <span className="flex-none text-base font-semibold tabular-nums">{euroFromCents(l.montantCents ?? 0)}</span>
                </Link>
              )}
            />
          )}
        </>
      )}
    </Colonne>
  );
}

/** Les actions regroupées sous le nom du client ou du prospect concerné. */
function ActionsParClient({ lignes, max }: { lignes: LigneMatin[]; max: number }) {
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
        <div key={g.cle} className="flex min-w-0 flex-col gap-1 rounded-[16px] border border-line p-3">
          <Link href={g.href} className="flex min-w-0 items-center gap-2 text-ink no-underline hover:no-underline">
            <ClientChip name={g.qui} size={24} />
            <span className="clip text-base font-semibold">{g.qui}</span>
          </Link>
          {g.lignes.map((l) => (
            <Link key={l.key} href={l.href} className="flex min-w-0 items-start gap-2 pl-8 text-ink no-underline hover:no-underline">
              <Icon
                name={l.ton === "alert" ? "alert" : "check"}
                size={14}
                className={cn("mt-[3px] flex-none", l.ton === "alert" ? "text-alert" : l.ton === "warn" ? "text-warn" : "text-ink-3")}
              />
              <span className="flex min-w-0 flex-col">
                <span className="line-clamp-2 text-small text-ink">{l.titre}</span>
                {l.meta ? <span className="clip text-micro text-ink-3">{l.meta}</span> : null}
              </span>
            </Link>
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
