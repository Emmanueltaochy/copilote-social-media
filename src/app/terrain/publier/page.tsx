import { requireStaff } from "@/lib/auth";
import { listTodayQueue } from "@/db/queries";
import { CONTENT_KIND, CONTENT_STATUS } from "@/data/content";
import { markPublished } from "@/app/(agence)/contenu/actions";
import { CopyText } from "./CopyText";

export const dynamic = "force-dynamic";

/**
 * Ce qui doit partir aujourd'hui.
 *
 * Sur le terrain, publier veut dire : copier la légende, ouvrir l'application
 * du réseau, coller, puis revenir noter le lien. L'écran est construit autour
 * de ces trois gestes et de rien d'autre.
 */
export default async function TerrainPublierPage() {
  await requireStaff();
  const queue = await listTodayQueue();

  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="text-title font-semibold">À publier aujourd&apos;hui</h1>

      {queue.length === 0 ? (
        <p className="rounded-card border border-dashed border-line px-3 py-4 text-base text-ink-2">
          Rien de programmé aujourd&apos;hui.
        </p>
      ) : (
        queue.map(({ content, clientName }) => (
          <section
            key={content.id}
            className="flex flex-col gap-2 rounded-card border border-line bg-paper px-3 py-3"
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="clip text-micro text-ink-3">
                {clientName} · {CONTENT_KIND[content.kind] ?? content.kind}
              </span>
              <span className="flex-none text-micro tabular-nums text-ink-3">
                {content.scheduledAt?.toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </span>

            <span className="text-lead leading-tight font-medium">{content.title}</span>
            <span className="text-small text-ink-3">{CONTENT_STATUS[content.status].label}</span>

            {content.caption ? <CopyText text={content.caption} /> : null}

            {content.publishedAt ? (
              <span className="text-small text-ok">
                Publié à{" "}
                {content.publishedAt.toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            ) : (
              <form action={markPublished} className="flex flex-col gap-2">
                <input type="hidden" name="id" value={content.id} />
                <input
                  name="url"
                  type="url"
                  required
                  placeholder="Coller le lien du post"
                  className="w-full rounded-control border border-line bg-paper px-3 py-[10px] text-base outline-none focus:border-gold"
                />
                <button
                  type="submit"
                  className="w-full cursor-pointer rounded-control border border-ink bg-ink px-3 py-[10px] text-base font-medium text-paper"
                >
                  Marquer comme publié
                </button>
              </form>
            )}
          </section>
        ))
      )}

      <p className="text-small text-ink-3">
        Le lien du post est demandé : c&apos;est lui qui fait compter la publication dans
        l&apos;engagement du mois.
      </p>
    </div>
  );
}
