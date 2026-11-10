import { PageHeader } from "@/components/shell/Screen";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon, type IconName } from "@/components/ui/Icon";
import { requireDepartment } from "@/lib/auth";
import { listClientOptions } from "@/db/queries";
import { Composer, IdeasList } from "@/components/compose/Composer";
import { createContent } from "./actions";
import { bestSlotsByClient, composeCounts, recentIdeas, reunionNow, scheduledSoon } from "./compose-queries";

export const dynamic = "force-dynamic";

/**
 * Créer — écrire un contenu en voyant le post et en choisissant le bon moment.
 * `?client=` et `?date=AAAA-MM-JJ` préremplissent l'écran (depuis le calendrier).
 */
export default async function NouveauContenuPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; date?: string }>;
}) {
  await requireDepartment("social");
  const sp = await searchParams;
  const clients = await listClientOptions("social");

  if (clients.length === 0) {
    return (
      <>
        <PageHeader title="Nouveau contenu" sub="Un contenu appartient toujours à un client" />
        <EmptyState title="Aucun client" actionLabel="Ajouter un client" actionHref="/clients">
          Un contenu se rattache à un client : c&apos;est ce qui permet de le compter dans son
          engagement du mois.
        </EmptyState>
      </>
    );
  }

  const [best, scheduled, counts, ideas] = await Promise.all([
    bestSlotsByClient(clients.map((c) => c.id)),
    scheduledSoon(),
    composeCounts(),
    recentIdeas(5),
  ]);
  const initialClientId = clients.some((c) => c.id === sp.client) ? sp.client : undefined;
  const initialDate = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : undefined;

  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 pt-1 pb-10 lg:px-7">
      <div className="mb-5 flex flex-wrap items-center gap-x-8 gap-y-4">
        <h1 className="text-[34px] leading-[1.05] font-bold tracking-[-0.03em] lg:text-[40px]">Créer</h1>
        <div className="grid w-full grid-cols-2 gap-4 sm:flex sm:w-auto sm:flex-wrap sm:gap-x-8">
          <Stat icon="sparkles" value={counts.ideas} label="idées en attente" />
          <Stat icon="check" value={counts.validation} label="en validation" />
          <Stat icon="calendar" value={counts.week} label="programmés sur 7 jours" />
        </div>
      </div>

      <Composer
        action={createContent}
        clients={clients}
        bestByClient={best.byClient}
        agencySlots={best.agency}
        scheduled={scheduled.map((s) => ({ clientId: s.clientId, title: s.title, at: s.scheduledAt!.toISOString().slice(0, 16) }))}
        nowWall={reunionNow()}
        initialClientId={initialClientId}
        initialDate={initialDate}
      />

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <IdeasList ideas={ideas} />
      </div>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: IconName; value: number; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-line bg-paper text-ink shadow-soft">
        <Icon name={icon} size={18} />
      </span>
      <span className="flex flex-col">
        <span className="text-[22px] leading-tight font-bold tracking-[-0.02em] tabular-nums">{value}</span>
        <span className="text-small text-ink-3">{label}</span>
      </span>
    </div>
  );
}
