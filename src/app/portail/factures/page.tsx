import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/primitives";
import { facturesDuClient } from "@/db/queries";
import { contextePortail } from "@/lib/portail";

export const dynamic = "force-dynamic";

const euros = (cents: number) =>
  `${(cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

const jour = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR") : null;

/**
 * Les factures du client, à télécharger pour sa comptabilité.
 *
 * Groupées par année parce que c'est ainsi qu'on les réclame : un comptable
 * demande « toutes les factures de 2026 », en janvier, et il faut alors les
 * retrouver une par une dans une boîte mail. Le total de l'année est calculé
 * pour la même raison — c'est le premier chiffre qu'il vérifie.
 */
export default async function FacturesPage() {
  const { client, config } = await contextePortail();
  const factures = await facturesDuClient(client.id);

  // Le groupement se fait sur la date d'émission : une facture d'avril
  // déposée en juin appartient à l'exercice d'avril.
  const parAnnee = new Map<string, typeof factures>();
  for (const f of factures) {
    const annee = f.issuedOn.slice(0, 4);
    parAnnee.set(annee, [...(parAnnee.get(annee) ?? []), f]);
  }

  const impayees = factures.filter((f) => !f.paidOn);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-[2px]">
        <span className="eyebrow text-ink-3">{client.shortName}</span>
        <h1 className="text-display font-semibold tracking-[-0.01em]">Vos factures</h1>
      </div>

      {factures.length === 0 ? (
        <Card className="p-6">
          <p className="text-lead text-ink-2">
            Aucune facture pour l&apos;instant. Celles que nous émettrons apparaîtront ici, à
            télécharger quand vous en aurez besoin.
          </p>
        </Card>
      ) : null}

      {impayees.length > 0 ? (
        <Card
          className="px-5 py-4"
          // La couleur d'accent de l'agence, et non un rouge d'huissier : un
          // rappel se fait sans hausser le ton.
        >
          <span className="text-base text-ink-2">
            {impayees.length} facture{impayees.length > 1 ? "s" : ""} en attente de règlement, pour{" "}
            <strong className="font-medium text-ink">
              {euros(impayees.reduce((n, f) => n + f.amountCents, 0))}
            </strong>
            .
          </span>
        </Card>
      ) : null}

      {[...parAnnee.entries()].map(([annee, lignes]) => (
        <Card key={annee}>
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line px-4 py-5 sm:px-6">
            <span className="text-title font-semibold">{annee}</span>
            <span className="text-base tabular-nums text-ink-2">
              {lignes.length} facture{lignes.length > 1 ? "s" : ""} ·{" "}
              {euros(lignes.reduce((n, f) => n + f.amountCents, 0))}
            </span>
          </div>

          {lignes.map((f) => {
            const enRetard = !f.paidOn && f.dueOn ? new Date(`${f.dueOn}T00:00:00`) < new Date() : false;
            return (
              <div
                key={f.id}
                data-facture={f.id}
                className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-4 last:border-b-0 sm:px-6"
              >
                <span className="flex min-w-[200px] flex-1 flex-col">
                  <span className="clip text-lead font-medium text-ink">
                    {f.number}
                    {f.label ? ` — ${f.label}` : ""}
                  </span>
                  <span className="clip text-small text-ink-3">
                    émise le {jour(f.issuedOn)}
                    {f.dueOn ? ` · à régler avant le ${jour(f.dueOn)}` : ""}
                    {f.paidOn ? ` · réglée le ${jour(f.paidOn)}` : ""}
                  </span>
                </span>

                <span className="flex-none text-lead tabular-nums text-ink">
                  {euros(f.amountCents)}
                </span>

                {f.paidOn ? (
                  <StatusPill tone="ok">Réglée</StatusPill>
                ) : enRetard ? (
                  <StatusPill tone="alert">En retard</StatusPill>
                ) : (
                  <StatusPill tone="warn">À régler</StatusPill>
                )}

                <a
                  href={`/api/invoice/${f.id}`}
                  className="flex-none rounded-control px-3 py-[6px] text-small font-medium text-paper no-underline hover:no-underline"
                  style={{ background: config.primaryColor }}
                >
                  Télécharger
                </a>
              </div>
            );
          })}
        </Card>
      ))}

      {factures.length > 0 ? (
        <p className="text-base text-ink-3">
          Chaque facture se télécharge au format PDF, nommée par son numéro. Une question sur
          l&apos;une d&apos;elles ? Écrivez à votre interlocuteur habituel.
        </p>
      ) : null}
    </div>
  );
}
