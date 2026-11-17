import Link from "next/link";
import { PageHeader } from "@/components/shell/Screen";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/primitives";
import { ClientChip } from "@/components/home/bits";
import { requireStaff } from "@/lib/auth";
import { correspond, listerAnnuaire, type LigneAnnuaire } from "@/db/annuaire-queries";
import { KINDS, SOURCES, STATUTS, isSource, isStatut, jourRelatif } from "@/lib/annuaire";
import { aujourdhuiReunion } from "@/lib/ce-matin";
import { cn } from "@/lib/cn";
import { FicheForm } from "./FicheForm";
import { creerFiche } from "./actions";

export const dynamic = "force-dynamic";

/**
 * L'annuaire : clients de l'agence, prospects de l'agent ventes, entreprises
 * sans site trouvées sur Google Maps, contacts Swap'Îles. Une ligne par
 * contact, triée par dernière activité.
 *
 * Swap'Îles a son propre filtre et n'apparaît pas dans la vue « Agence » :
 * les deux activités ne se mélangent pas.
 */

type Filtre = "agence" | "clients" | "prospects" | "repondu" | "a_faire" | "anciens" | "partenaires" | "swapiles";

const FILTRES: { cle: Filtre; label: string; garde: (l: LigneAnnuaire, today: string) => boolean }[] = [
  { cle: "agence", label: "Agence", garde: (l) => l.activity === "agence" },
  { cle: "clients", label: "Clients", garde: (l) => l.activity === "agence" && l.kind === "client" },
  { cle: "prospects", label: "Prospects", garde: (l) => l.activity === "agence" && l.kind === "prospect" },
  { cle: "repondu", label: "Ont répondu", garde: (l) => l.status === "repondu" },
  {
    cle: "a_faire",
    label: "Action due",
    garde: (l, today) => Boolean(l.nextActionOn && l.nextActionOn <= today && l.status !== "perdu"),
  },
  { cle: "anciens", label: "Anciens clients", garde: (l) => l.activity === "agence" && l.kind === "ancien_client" },
  { cle: "partenaires", label: "Partenaires", garde: (l) => l.kind === "partenaire" },
  { cle: "swapiles", label: "Swap'Îles", garde: (l) => l.activity === "swapiles" },
];

const PAR_PAGE = 100;

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filtre?: string; source?: string; n?: string; nouveau?: string }>;
}) {
  const user = await requireStaff();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const filtre = (FILTRES.find((f) => f.cle === sp.filtre)?.cle ?? "agence") as Filtre;
  const source = isSource(sp.source) ? sp.source : null;
  const limite = Math.min(2000, Math.max(PAR_PAGE, Number(sp.n) || PAR_PAGE));
  const today = aujourdhuiReunion();

  const tout = await listerAnnuaire(user);
  const garde = FILTRES.find((f) => f.cle === filtre)!.garde;
  const filtrees = tout.filter((l) => garde(l, today) && (!source || l.source === source) && correspond(l, q));
  const visibles = filtrees.slice(0, limite);

  const compte = (f: (typeof FILTRES)[number]) => tout.filter((l) => f.garde(l, today)).length;
  const sourcesPresentes = Object.entries(SOURCES).filter(([k]) => tout.some((l) => l.source === k && garde(l, today)));
  const lien = (p: Record<string, string | null>) => {
    const u = new URLSearchParams();
    const merged = { filtre, q: q || null, source, ...p };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "filtre" && v === "agence")) u.set(k, v);
    const s = u.toString();
    return `/contacts${s ? `?${s}` : ""}`;
  };

  const nbClients = tout.filter((l) => l.kind === "client").length;
  const nbProspects = tout.filter((l) => l.kind === "prospect").length;

  return (
    <>
      <PageHeader
        title="Contacts"
        sub={`${nbClients} client${nbClients > 1 ? "s" : ""} · ${nbProspects} prospect${nbProspects > 1 ? "s" : ""} · ${tout.length} fiches en tout`}
      >
        <Link
          href={sp.nouveau ? lien({ nouveau: null }) : lien({ nouveau: "1" }) + "#nouvelle-fiche"}
          className="rounded-full bg-night px-5 py-[9px] text-base font-semibold text-white no-underline hover:no-underline hover:opacity-85"
        >
          {sp.nouveau ? "Fermer" : "Nouvelle fiche"}
        </Link>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-1 pb-10 lg:px-7">
        <div className="flex w-full max-w-[1200px] flex-col gap-4">
          {sp.nouveau ? (
            <Card padded className="scroll-mt-4" >
              <div id="nouvelle-fiche" className="mb-3 flex flex-col gap-1">
                <h2 className="text-title font-semibold">Nouvelle fiche</h2>
                <p className="text-small text-ink-3">
                  Un prospect rencontré, un contact Swap&apos;Îles, un partenaire. Les clients de l&apos;agence se créent dans{" "}
                  <Link href="/clients">Clients</Link> (contrat et portail) et apparaissent ici d&apos;eux-mêmes. Les prospects de
                  l&apos;agent ventes arrivent par l&apos;import.
                </p>
              </div>
              <FicheForm action={creerFiche} bouton="Créer la fiche" valeurs={{ source: filtre === "swapiles" ? "swapiles" : "agence", activity: filtre === "swapiles" ? "swapiles" : "agence" }} />
            </Card>
          ) : null}

          {/* Filtres rapides : défilent sur téléphone plutôt que de déborder. */}
          <nav aria-label="Filtres" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
            {FILTRES.map((f) => (
              <Link
                key={f.cle}
                href={lien({ filtre: f.cle, source: null })}
                aria-current={f.cle === filtre ? "page" : undefined}
                className={cn(
                  "flex flex-none items-center gap-2 rounded-full border px-[14px] py-[7px] text-small font-medium whitespace-nowrap no-underline hover:no-underline",
                  f.cle === filtre ? "border-night bg-night text-white" : "border-line bg-paper text-ink-2 hover:border-line-strong hover:text-ink",
                )}
              >
                {f.label}
                <span className={cn("tabular-nums", f.cle === filtre ? "text-white/70" : "text-ink-3")}>{compte(f)}</span>
              </Link>
            ))}
          </nav>

          <form method="get" action="/contacts" className="flex flex-wrap items-center gap-2">
            {filtre !== "agence" ? <input type="hidden" name="filtre" value={filtre} /> : null}
            <input
              name="q"
              defaultValue={q}
              placeholder="Nom, ville, e-mail, téléphone…"
              className="min-w-0 flex-[1_1_240px] rounded-full border border-line bg-paper px-4 py-[9px] text-base text-ink outline-none focus:border-gold"
            />
            <select
              name="source"
              defaultValue={source ?? ""}
              aria-label="Source"
              className="min-w-0 flex-[0_1_220px] rounded-full border border-line bg-paper px-3 py-[9px] text-base text-ink outline-none focus:border-gold"
            >
              <option value="">Toutes les sources</option>
              {sourcesPresentes.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
            <button type="submit" className="cursor-pointer rounded-full border border-line bg-paper px-4 py-[9px] text-base font-medium text-ink hover:border-line-strong">
              Filtrer
            </button>
            {q || source ? (
              <Link href={lien({ q: null, source: null })} className="text-small text-ink-3">
                Effacer
              </Link>
            ) : null}
          </form>

          <Card>
            <div className="hidden grid-cols-[minmax(0,1.6fr)_110px_minmax(0,1fr)_120px_minmax(0,1.5fr)_110px] gap-3 border-b border-line px-5 py-3 text-small font-medium text-ink-3 lg:grid">
              <span>Contact</span>
              <span>Type</span>
              <span>Source</span>
              <span>Étape</span>
              <span>Prochaine action</span>
              <span className="text-right">Activité</span>
            </div>
            {visibles.length === 0 ? (
              <p className="px-5 py-6 text-base text-ink-3">
                {tout.length === 0
                  ? "L'annuaire est vide. Les clients de l'agence y apparaîtront d'eux-mêmes ; les prospects de l'agent ventes arrivent par l'import (Réglages → Import des prospects)."
                  : "Aucun contact ne correspond à ces filtres."}
              </p>
            ) : (
              visibles.map((l) => <Ligne key={l.id} l={l} today={today} />)
            )}
            {filtrees.length > visibles.length ? (
              <div className="flex justify-center p-4">
                <Link href={lien({ n: String(limite + PAR_PAGE) })} className="rounded-full border border-line px-4 py-[7px] text-small font-medium text-ink no-underline hover:no-underline">
                  Afficher {Math.min(PAR_PAGE, filtrees.length - visibles.length)} de plus ({filtrees.length - visibles.length} restants)
                </Link>
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </>
  );
}

function Ligne({ l, today }: { l: LigneAnnuaire; today: string }) {
  const statut = isStatut(l.status) ? STATUTS[l.status] : null;
  const due = l.nextActionOn && l.nextActionOn <= today && l.status !== "perdu";
  const now = new Date();
  return (
    <Link
      href={`/contacts/${l.id}`}
      className="flex flex-col gap-2 border-b border-line px-5 py-3 text-ink no-underline last:border-b-0 hover:bg-canvas hover:no-underline lg:grid lg:grid-cols-[minmax(0,1.6fr)_110px_minmax(0,1fr)_120px_minmax(0,1.5fr)_110px] lg:items-center lg:gap-3"
    >
      <span className="flex min-w-0 items-center gap-3">
        <ClientChip name={l.name} size={34} />
        <span className="flex min-w-0 flex-col">
          <span className="clip text-base font-semibold">{l.name}</span>
          <span className="clip text-small text-ink-3">
            {[l.contactName, l.sector, l.city ?? l.country].filter(Boolean).join(" · ") || "—"}
          </span>
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-2 lg:contents">
        <span className="flex flex-wrap gap-1">
          <StatusPill tone={KINDS[l.kind].tone}>{KINDS[l.kind].label}</StatusPill>
          {l.activity === "swapiles" ? <StatusPill tone="gold">Swap&apos;Îles</StatusPill> : null}
        </span>
        <span className="clip text-small text-ink-2">{SOURCES[l.source] ?? l.source}</span>
        <span>{statut ? <StatusPill tone={statut.tone}>{statut.label}</StatusPill> : <span className="text-small text-ink-3 max-lg:hidden">—</span>}</span>
      </span>
      <span className={cn("min-w-0 text-small", due ? "text-warn" : "text-ink-2", !l.nextAction && "max-lg:hidden")}>
        {l.nextAction ? (
          <span className="line-clamp-2">
            {l.nextActionOn ? <b className="font-semibold">{dateCourte(l.nextActionOn)} · </b> : null}
            {l.nextAction}
          </span>
        ) : (
          <span className="text-ink-3 max-lg:hidden">—</span>
        )}
      </span>
      <span className="text-small text-ink-3 lg:text-right">{l.lastActivityAt ? jourRelatif(l.lastActivityAt, now) : "—"}</span>
    </Link>
  );
}

const dateCourte = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
