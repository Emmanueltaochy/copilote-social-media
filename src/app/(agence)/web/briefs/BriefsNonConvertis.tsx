import Link from "next/link";
import { Card } from "@/components/ui/Card";

/**
 * Le bandeau des briefs restés à l'ancien format.
 *
 * Il ne disparaît que lorsqu'il n'en reste aucun — c'est la condition qui
 * commande aussi la survie du rendu historique. Tant qu'un brief n'a pas de
 * `structure_snapshot`, sa structure ne vit que dans `brief_fields` : retirer
 * l'ancien affichage le rendrait **inouvrable, en silence, côté client**. Ce
 * genre de panne se découvre par un appel, jamais par un journal.
 *
 * Nommément, et à l'écran. Un compteur dirait qu'il y a un problème sans dire
 * lequel reprendre ; un message dans les journaux du serveur ne serait lu par
 * personne.
 */
export function BriefsNonConvertis({
  briefs,
}: {
  briefs: { id: string; titre: string; clientNomCourt: string }[];
}) {
  if (briefs.length === 0) return null;

  return (
    <Card className="border-alert-line bg-alert-bg p-[14px]">
      <p className="text-base font-medium text-alert">
        {briefs.length} brief{briefs.length > 1 ? "s" : ""} au format d&apos;origine
      </p>
      <p className="mt-1 text-small text-ink-2">
        Ces briefs n&apos;ont pas été convertis au nouveau format. Ils restent lisibles et
        remplissables — l&apos;ancien affichage est conservé exprès — mais ils ne bénéficient
        d&apos;aucune nouveauté. Ouvre-les et enregistre une réponse pour déclencher la reprise, ou
        signale-les si la conversion échoue à nouveau.
      </p>
      <ul className="mt-3 flex list-none flex-col gap-1 p-0">
        {briefs.map((b) => (
          <li key={b.id}>
            <Link href={`/web/briefs/${b.id}`} className="text-base text-ink hover:underline">
              {b.titre}
            </Link>
            <span className="text-small text-ink-3"> · {b.clientNomCourt}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
