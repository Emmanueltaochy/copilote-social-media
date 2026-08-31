import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/primitives";
import { devisDuClient } from "@/db/queries";
import { DEVIS_KIND, DEVIS_STATUS } from "@/data/devis";
import { contextePortail } from "@/lib/portail";
import { FormulaireDevis } from "./Formulaire";

export const dynamic = "force-dynamic";

/**
 * Demander un devis, depuis son propre espace.
 *
 * Un client qui a une idée l'a le soir, pas au moment où on l'appelle. Le
 * portail est ouvert en permanence : il peut y déposer sa demande quand elle
 * lui vient, avec ce qu'il en sait déjà — et retrouver ensuite où elle en est,
 * ce qu'un courriel envoyé dans le vide ne permet pas.
 */
export default async function DevisPage() {
  const { client, config } = await contextePortail();
  const demandes = await devisDuClient(client.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-[2px]">
        <span className="eyebrow text-ink-3">{client.shortName}</span>
        <h1 className="text-display font-semibold tracking-[-0.01em]">Demander un devis</h1>
      </div>

      <Card className="flex flex-col gap-4 p-4 sm:p-6">
        <p className="text-base text-ink-2">
          Un projet en tête ? Dites-nous ce que vous imaginez, même sans tout savoir. Nous
          revenons vers vous avec une proposition chiffrée — et vous suivez ici où en est votre
          demande.
        </p>
        <FormulaireDevis accent={config.primaryColor} />
      </Card>

      {demandes.length > 0 ? (
        <Card>
          <div className="border-b border-line px-4 py-5 sm:px-6">
            <span className="text-title font-semibold">Vos demandes</span>
          </div>
          {demandes.map((d) => {
            const statut = DEVIS_STATUS[d.status] ?? DEVIS_STATUS.nouvelle;
            return (
              <div
                key={d.id}
                data-devis={d.id}
                className="flex flex-col gap-1 border-b border-line px-4 py-4 last:border-b-0 sm:px-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-lead font-medium text-ink">{d.subject}</span>
                  <StatusPill tone={statut.tone}>{statut.client}</StatusPill>
                </div>
                <span className="text-small text-ink-3">
                  {DEVIS_KIND[d.kind]?.label ?? d.kind} · demandé le{" "}
                  {d.createdAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
                  {d.deadline ? ` · souhaité pour le ${new Date(`${d.deadline}T00:00:00`).toLocaleDateString("fr-FR")}` : ""}
                </span>
                {d.details ? <span className="text-base text-ink-2">{d.details}</span> : null}
              </div>
            );
          })}
        </Card>
      ) : null}
    </div>
  );
}
