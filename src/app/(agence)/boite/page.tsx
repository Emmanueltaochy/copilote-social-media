import Link from "next/link";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { clients, db } from "@/db";
import { requireDepartment } from "@/lib/auth";
import { metricoolStatus } from "@/lib/metricool";
import { Panel } from "@/components/home/bits";
import { InboxApp } from "./InboxApp";
import { scopeClientId } from "@/lib/scope";

export const dynamic = "force-dynamic";

/**
 * Réception — messages privés et commentaires de tous les comptes clients,
 * au même endroit, avec la réponse sur place. L'écran s'affiche tout de
 * suite ; chaque compte se remplit dès que Metricool a répondu.
 */
export default async function BoitePage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  await requireDepartment("social");
  const sp = await searchParams;
  const mc = await metricoolStatus();

  const linked = await db
    .select({ id: clients.id, name: clients.shortName })
    .from(clients)
    .where(and(eq(clients.active, true), isNotNull(clients.metricoolBrandId)))
    .orderBy(asc(clients.shortName));

  if (!mc.connected || linked.length === 0) {
    return (
      <div className="min-h-0 flex-1 overflow-auto px-4 pt-1 pb-10 lg:px-7">
        <h1 className="mb-5 text-[34px] font-bold tracking-[-0.03em] lg:text-[40px]">Réception</h1>
        <Panel title={mc.connected ? "Aucun client relié" : "Metricool n'est pas raccordé"}>
          <p className="text-base text-ink-2">
            {mc.connected
              ? "Les messages et commentaires arrivent de Metricool : reliez vos clients à leur marque Metricool."
              : "Les messages et commentaires arrivent de Metricool : collez votre clé Metricool, puis reliez vos clients à leur marque."}
          </p>
          <Link href="/reglages" className="mt-4 w-fit rounded-full bg-night px-4 py-2 text-base font-medium text-white no-underline hover:no-underline">
            Réglages → Metricool
          </Link>
        </Panel>
      </div>
    );
  }

  // Le client choisi en haut à droite : seuls ses messages sont chargés.
  const scopeId = await scopeClientId(sp.client);
  const scoped = linked.find((c) => c.id === scopeId) ?? null;
  if (scopeId && !scoped) {
    return (
      <div className="min-h-0 flex-1 overflow-auto px-4 pt-1 pb-10 lg:px-7">
        <h1 className="mb-5 text-[34px] font-bold tracking-[-0.03em] lg:text-[40px]">Réception</h1>
        <Panel title="Ce client n'est pas relié à Metricool">
          <p className="text-base text-ink-2">Ses messages et commentaires ne peuvent pas être lus tant qu&apos;il n&apos;est pas relié à sa marque Metricool.</p>
          <Link href="/reglages" className="mt-4 w-fit rounded-full bg-night px-4 py-2 text-base font-medium text-white no-underline hover:no-underline">
            Réglages → Metricool
          </Link>
        </Panel>
      </div>
    );
  }

  return (
    <InboxApp
      key={scoped?.id ?? "tous"}
      clients={scoped ? [scoped] : linked}
      scoped={Boolean(scoped)}
      draftOnly={process.env.METRICOOL_DRAFT_ONLY === "1"}
    />
  );
}
