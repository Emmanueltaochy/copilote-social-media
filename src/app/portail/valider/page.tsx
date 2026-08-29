import { and, desc, eq } from "drizzle-orm";
import { db, contents } from "@/db";
import { Card } from "@/components/ui/Card";
import { CONTENT_KIND } from "@/data/content";
import { coversFor, linksFor, slidesFor } from "@/db/queries";
import { livrablesDuClient } from "@/db/web-queries";
import { contextePortail } from "@/lib/portail";
import { ValidationCard } from "../ValidationCard";
import { LivrableClient } from "../EspaceWeb";

export const dynamic = "force-dynamic";

/**
 * Tout ce qui attend une réponse du client, au même endroit.
 *
 * Les contenus à valider et les maquettes à approuver étaient à deux hauteurs
 * différentes de la même page : on répondait aux premiers sans voir les
 * secondes. Le geste est le même — regarder, puis dire oui ou demander une
 * retouche — donc l'écran est le même.
 */
export default async function ValiderPage() {
  const { client, config } = await contextePortail();

  const [waiting, livrables] = await Promise.all([
    db
      .select({ content: contents })
      .from(contents)
      .where(and(eq(contents.clientId, client.id), eq(contents.status, "validation")))
      .orderBy(desc(contents.submittedAt)),
    livrablesDuClient(client.id),
  ]);

  const enAttente = livrables.filter((l) => l.livrable.status === "en_attente");
  const traités = livrables.filter((l) => l.livrable.status !== "en_attente");

  // Le visuel de ce qui attend une réponse : on ne valide pas un titre.
  const ids = waiting.map((w) => w.content.id);
  const [covers, slides, links] = await Promise.all([
    coversFor(ids),
    slidesFor(ids),
    linksFor(ids),
  ]);

  const rien = waiting.length === 0 && enAttente.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-[2px]">
        <span className="eyebrow text-ink-3">{client.shortName}</span>
        <h1 className="text-display font-semibold tracking-[-0.01em]">À valider</h1>
      </div>

      {rien ? (
        <Card className="p-6">
          <p className="text-lead text-ink-2">
            Rien n&apos;attend votre réponse pour le moment. Vous recevrez un courriel dès
            qu&apos;un contenu ou une maquette sera prêt.
          </p>
        </Card>
      ) : null}

      {waiting.length > 0 ? (
        <Card>
          <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-5">
            <span className="text-title font-semibold">
              {waiting.length} contenu{waiting.length > 1 ? "s" : ""}
            </span>
          </div>
          {waiting.map(({ content }) => (
            <ValidationCard
              key={content.id}
              id={content.id}
              title={content.title}
              kind={CONTENT_KIND[content.kind] ?? content.kind}
              cover={covers.get(content.id)}
              slides={content.kind === "carrousel" ? (slides.get(content.id) ?? []) : []}
              links={links.get(content.id) ?? []}
              scheduled={
                content.scheduledAt
                  ? content.scheduledAt.toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "long",
                    })
                  : null
              }
              waitingSince={
                content.submittedAt ? content.submittedAt.toLocaleDateString("fr-FR") : null
              }
            />
          ))}
          <p className="px-6 py-4 text-base text-ink-3">
            Une validation programme la publication. Une demande de modification renvoie le
            contenu en fabrication avec votre remarque.
          </p>
        </Card>
      ) : null}

      {enAttente.length > 0 ? (
        <Card>
          <div className="border-b border-line px-6 py-5">
            <span className="text-title font-semibold">
              {enAttente.length} maquette{enAttente.length > 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex flex-col gap-3 p-4 sm:p-6">
            {enAttente.map(({ livrable, projet }) => (
              <LivrableClient
                key={livrable.id}
                id={livrable.id}
                label={`${livrable.label} — ${projet}`}
                note={livrable.note}
                href={livrable.url ?? `/api/client-files/${livrable.fileId}`}
                statut={livrable.status}
                remarque={livrable.clientNote}
                accent={config.primaryColor}
              />
            ))}
          </div>
        </Card>
      ) : null}

      {/* Ce qui est déjà répondu reste consultable : une validation d'hier
          doit pouvoir se relire, et une demande de retouche se vérifier. */}
      {traités.length > 0 ? (
        <Card>
          <div className="border-b border-line px-6 py-5">
            <span className="text-title font-semibold">Déjà répondu</span>
          </div>
          <div className="flex flex-col gap-3 p-4 sm:p-6">
            {traités.map(({ livrable, projet }) => (
              <LivrableClient
                key={livrable.id}
                id={livrable.id}
                label={`${livrable.label} — ${projet}`}
                note={livrable.note}
                href={livrable.url ?? `/api/client-files/${livrable.fileId}`}
                statut={livrable.status}
                remarque={livrable.clientNote}
                accent={config.primaryColor}
              />
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
