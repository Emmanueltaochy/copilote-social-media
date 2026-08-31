import Link from "next/link";
import { PageHeader } from "@/components/shell/Screen";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusPill } from "@/components/ui/primitives";
import { requireStaff } from "@/lib/auth";
import { listDevis } from "@/db/queries";
import { DEVIS_KIND, DEVIS_STATUS, DEVIS_STATUSES } from "@/data/devis";
import { majDevis } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Les demandes de devis venues des portails clients.
 *
 * Ouvertes d'abord : une demande close reste consultable mais n'a plus à
 * disputer la place à celle qui attend une réponse. Le statut est visible du
 * client dans son portail — c'est ce qui lui évite de rappeler pour savoir si
 * sa demande est arrivée — tandis que la note reste interne.
 */
export default async function DevisPage() {
  await requireStaff();
  const demandes = await listDevis();

  if (demandes.length === 0) {
    return (
      <>
        <PageHeader title="Demandes de devis" sub="Aucune demande pour l'instant" />
        <EmptyState title="Rien à chiffrer" actionLabel="Voir les clients" actionHref="/clients">
          Vos clients peuvent demander un devis depuis leur portail : un projet leur vient
          souvent le soir, et cette demande arrive ici plutôt que de se perdre dans une boîte
          mail. Vous êtes prévenu à chaque fois.
        </EmptyState>
      </>
    );
  }

  const nouvelles = demandes.filter((d) => d.devis.status === "nouvelle").length;

  return (
    <>
      <PageHeader
        title="Demandes de devis"
        sub={`${demandes.length} demande${demandes.length > 1 ? "s" : ""}${nouvelles > 0 ? ` · ${nouvelles} à ouvrir` : ""}`}
      />

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-4 pb-6 lg:px-5">
        <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-3">
          {demandes.map(({ devis, clientName, demandeur }) => {
            const statut = DEVIS_STATUS[devis.status] ?? DEVIS_STATUS.nouvelle;
            return (
              // « Card » ne transmet pas les attributs libres : le repère de
              // test se pose sur un cadre à soi.
              <div key={devis.id} data-devis={devis.id}>
              <Card className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <span className="flex min-w-0 flex-col gap-[2px]">
                    <span className="text-small text-ink-3">
                      <Link href={`/clients/${devis.clientId}`}>{clientName}</Link>
                      {demandeur ? ` · ${demandeur}` : ""} ·{" "}
                      {devis.createdAt.toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "long",
                      })}
                    </span>
                    <span className="text-title font-semibold text-ink">{devis.subject}</span>
                    <span className="text-base text-ink-2">
                      {DEVIS_KIND[devis.kind]?.label ?? devis.kind}
                      {devis.budget ? ` · budget : ${devis.budget}` : ""}
                      {devis.deadline
                        ? ` · pour le ${new Date(`${devis.deadline}T00:00:00`).toLocaleDateString("fr-FR")}`
                        : ""}
                    </span>
                  </span>
                  <StatusPill tone={statut.tone}>{statut.label}</StatusPill>
                </div>

                {devis.details ? (
                  <p className="whitespace-pre-line rounded-card border border-line bg-canvas px-3 py-2 text-base text-ink-2">
                    {devis.details}
                  </p>
                ) : null}

                {/* Le statut et la note partent ensemble : deux formulaires
                    voisins feraient perdre la note en changeant le statut. */}
                <form action={majDevis} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={devis.id} />
                  <label className="flex flex-col gap-[4px]">
                    <span className="eyebrow text-ink-3">Où en est-on</span>
                    <select
                      name="status"
                      defaultValue={devis.status}
                      className="rounded-control border border-line bg-paper px-2 py-[6px] text-small outline-none focus:border-gold"
                    >
                      {DEVIS_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {DEVIS_STATUS[s].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex min-w-[220px] flex-1 flex-col gap-[4px]">
                    <span className="eyebrow text-ink-3">Note interne</span>
                    <input
                      name="agencyNote"
                      defaultValue={devis.agencyNote ?? ""}
                      placeholder="Relancer lundi, devis à 4 200 € envoyé…"
                      className="rounded-control border border-line bg-paper px-2 py-[6px] text-small outline-none focus:border-gold"
                    />
                  </label>
                  <button
                    type="submit"
                    className="cursor-pointer rounded-control border border-line bg-paper px-3 py-[6px] text-small font-medium text-ink-2 hover:border-line-strong hover:text-ink"
                  >
                    Enregistrer
                  </button>
                </form>

                <p className="text-small text-ink-3">
                  Le client voit « {statut.client} » dans son portail. La note reste entre nous.
                </p>
              </Card>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
