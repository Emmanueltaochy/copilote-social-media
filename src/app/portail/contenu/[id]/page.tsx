import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { contents, db } from "@/db";
import { Card } from "@/components/ui/Card";
import { Carousel } from "@/components/ui/Carousel";
import { Cover } from "@/components/ui/Cover";
import { StatusPill } from "@/components/ui/primitives";
import { CONTENT_KIND, CONTENT_STATUS, networksLabel } from "@/data/content";
import { coversFor, linksFor, slidesFor } from "@/db/queries";
import { contextePortail } from "@/lib/portail";
import { ActionsValidation } from "../../ActionsValidation";

export const dynamic = "force-dynamic";

/**
 * Un contenu, en grand.
 *
 * Une vignette de 180 pixels suffit à reconnaître un post, pas à le juger : un
 * cadrage serré, une faute dans une date incrustée, un logo trop petit ne se
 * voient qu'à taille réelle. Sur un téléphone, la question ne se pose même
 * pas — la liste ne montre qu'un timbre-poste.
 *
 * La légende est ici aussi, et c'est la moitié du travail : c'est le texte qui
 * partira en ligne, et c'est souvent lui que le client veut corriger.
 */
export default async function ContenuPage({ params }: { params: Promise<{ id: string }> }) {
  const { client, config } = await contextePortail();
  const { id } = await params;

  const [ligne] = await db
    .select({ content: contents })
    .from(contents)
    // Le client est dans la condition, pas vérifié après : c'est ce qui
    // empêche d'ouvrir le contenu d'un autre en changeant l'adresse.
    .where(and(eq(contents.id, id), eq(contents.clientId, client.id)))
    .limit(1);

  if (!ligne) notFound();
  const c = ligne.content;

  const [covers, slides, links] = await Promise.all([
    coversFor([c.id]),
    slidesFor([c.id]),
    linksFor([c.id]),
  ]);
  const cover = covers.get(c.id);
  const vues = slides.get(c.id) ?? [];
  const liens = links.get(c.id) ?? [];

  const aValider = c.status === "validation";
  const statut = CONTENT_STATUS[c.status];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={aValider ? "/portail/valider" : "/portail"}
          className="text-base text-ink-2 no-underline hover:underline"
        >
          ← {aValider ? "À valider" : "Accueil"}
        </Link>
        <span className="flex-1" />
        <StatusPill tone={statut.tone}>{statut.label}</StatusPill>
      </div>

      <div className="flex flex-col gap-[2px]">
        <span className="eyebrow text-ink-3">
          {CONTENT_KIND[c.kind] ?? c.kind} · {networksLabel(c)}
        </span>
        <h1 className="text-display font-semibold tracking-[-0.01em]">{c.title}</h1>
        <span className="text-base text-ink-2">
          {c.scheduledAt
            ? `Prévu le ${c.scheduledAt.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}`
            : "Date à définir"}
          {c.publishedAt
            ? ` · publié le ${c.publishedAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`
            : ""}
        </span>
      </div>

      {/* Le visuel occupe la largeur de lecture, borné pour rester entier à
          l'écran : un post qu'il faut faire défiler pour voir en entier ne se
          juge pas mieux qu'une vignette. */}
      <div className="mx-auto w-full max-w-[520px]">
        {vues.length > 1 ? (
          <Carousel slides={vues} className="w-full" />
        ) : !cover && liens.length > 0 ? (
          <a
            href={liens[0].url}
            target="_blank"
            rel="noreferrer"
            className="flex aspect-4/5 w-full items-center justify-center rounded-card border border-dashed border-line bg-slot px-4 text-center text-lead font-medium text-ink-2 no-underline hover:border-gold hover:text-ink hover:no-underline"
          >
            Ouvrir le contenu ↗
          </a>
        ) : (
          <Cover asset={cover} ratio="4/5" className="w-full" label="Visuel à venir" />
        )}
      </div>

      {liens.length > 0 ? (
        <Card className="flex flex-col gap-1 px-4 py-3 sm:px-6">
          <span className="eyebrow text-ink-3">
            {liens.length > 1 ? "À consulter" : "Le contenu"}
          </span>
          {liens.map((l) => (
            <a key={l.id} href={l.url} target="_blank" rel="noreferrer" className="clip text-base font-medium">
              {l.label || l.url} ↗
            </a>
          ))}
          <span className="text-small text-ink-3">
            Le fichier est trop lourd pour être affiché ici : il s&apos;ouvre dans un nouvel onglet.
          </span>
        </Card>
      ) : null}

      {c.caption ? (
        <Card className="flex flex-col gap-2 px-4 py-4 sm:px-6">
          <span className="eyebrow text-ink-3">La légende</span>
          {/* `whitespace-pre-wrap` : une légende est écrite avec ses retours à
              la ligne et ses émojis, et c'est ainsi qu'elle partira. La
              reformater ici ferait relire autre chose que ce qui sera publié. */}
          <p className="whitespace-pre-wrap text-lead text-ink">{c.caption}</p>
          {c.hashtags.length > 0 ? (
            <p className="text-base text-ink-2">{c.hashtags.map((h) => `#${h}`).join(" ")}</p>
          ) : null}
        </Card>
      ) : (
        <Card className="px-4 py-4 sm:px-6">
          <p className="text-base text-ink-2">
            La légende n&apos;est pas encore écrite. Elle apparaîtra ici dès qu&apos;elle sera
            prête.
          </p>
        </Card>
      )}

      {aValider ? (
        <Card className="flex flex-col gap-3 px-4 py-4 sm:px-6">
          <span className="text-title font-semibold">Votre réponse</span>
          <p className="text-base text-ink-2">
            {c.submittedAt
              ? `En attente depuis le ${c.submittedAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}.`
              : "Ce contenu attend votre réponse."}
          </p>
          <ActionsValidation id={c.id} taille="grand" />
        </Card>
      ) : c.publishedUrl ? (
        <a
          href={c.publishedUrl}
          target="_blank"
          rel="noreferrer"
          className="self-start rounded-control px-4 py-2 text-base font-medium text-paper no-underline hover:no-underline"
          style={{ background: config.primaryColor }}
        >
          Voir la publication ↗
        </a>
      ) : null}
    </div>
  );
}
