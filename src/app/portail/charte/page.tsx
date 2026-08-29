import { eq } from "drizzle-orm";
import { db, brands } from "@/db";
import { Card } from "@/components/ui/Card";
import { contextePortail } from "@/lib/portail";
import { CharteClient } from "../EspaceWeb";

export const dynamic = "force-dynamic";

/**
 * La charte graphique, écrite des deux côtés.
 *
 * Le client renseigne ce qu'il sait, l'agence complète depuis la fiche : c'est
 * le même document, pas deux versions à réconcilier ensuite.
 */
export default async function ChartePage() {
  const { client, config } = await contextePortail();
  const [charte] = await db.select().from(brands).where(eq(brands.clientId, client.id)).limit(1);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-[2px]">
        <span className="eyebrow text-ink-3">{client.shortName}</span>
        <h1 className="text-display font-semibold tracking-[-0.01em]">Votre charte graphique</h1>
      </div>

      <Card>
        <div className="border-b border-line px-4 py-5 sm:px-6">
          <p className="text-base text-ink-2">
            Remplissez ce que vous savez — nous complétons le reste. Vos réponses arrivent chez
            nous au fur et à mesure, il n&apos;y a rien à envoyer.
          </p>
        </div>
        <CharteClient
          couleurs={charte?.palette ?? []}
          polices={charte?.fonts ?? null}
          ton={charte?.voice ?? null}
          accent={config.primaryColor}
        />
      </Card>
    </div>
  );
}
