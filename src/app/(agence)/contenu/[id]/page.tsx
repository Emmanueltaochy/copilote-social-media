import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/Screen";
import { Card, CardHead } from "@/components/ui/Card";
import { Avatar, Eyebrow, StatusPill } from "@/components/ui/primitives";
import { requireStaff } from "@/lib/auth";
import {
  getContent,
  listActivity,
  listAssets,
  listClientOptions,
  listComments,
  listContentMedia,
  listStaff,
  listVersions,
} from "@/db/queries";
import { CONTENT_KIND, CONTENT_STAGES, CONTENT_STATUS, NETWORK_LABEL } from "@/data/content";
import { ContentForm } from "../ContentForm";
import { AssignPicker } from "../../production/AssignPicker";
import { MediaCard } from "./MediaCard";
import {
  addComment,
  approveContent,
  deleteContent,
  markPublished,
  moveStage,
  requestChange,
  unmarkPublished,
  updateContent,
} from "../actions";

const REASONS = ["Cadrage", "Texte", "Colorimétrie", "Hors marque"];

/** L'input datetime-local attend « AAAA-MM-JJTHH:MM » en heure locale. */
function toLocalInput(d: Date | null): string | undefined {
  if (!d) return undefined;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default async function ContenuPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;

  const row = await getContent(id);
  if (!row) notFound();
  const { content, client, ownerName } = row;

  const [thread, versions, history, clients, staff, attached, library] = await Promise.all([
    listComments(id),
    listVersions(id),
    listActivity(id),
    listClientOptions(),
    listStaff(),
    listContentMedia(id),
    listAssets(content.clientId),
  ]);

  const st = CONTENT_STATUS[content.status];
  const overdue =
    !content.publishedAt && content.scheduledAt && content.scheduledAt < new Date();

  return (
    <>
      <PageHeader
        title={content.title}
        sub={`${client.shortName} · ${CONTENT_KIND[content.kind] ?? content.kind} · ${NETWORK_LABEL[content.network]} · ${
          content.scheduledAt
            ? content.scheduledAt.toLocaleString("fr-FR", {
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "sans date"
        }`}
      />

      <div className="flex flex-none items-center justify-between gap-4 border-b border-line bg-paper px-5 py-2">
        <div className="flex items-center gap-[10px]">
          <StatusPill tone={st.tone}>{st.label}</StatusPill>
          {overdue ? (
            <span className="text-small font-medium text-alert">
              L&apos;heure prévue est passée
            </span>
          ) : null}
          {content.publishedUrl ? (
            <a href={content.publishedUrl} target="_blank" rel="noreferrer" className="text-small">
              Voir le post publié
            </a>
          ) : null}
        </div>

        {/* Le déplacement d'étape est un formulaire par étape : pas de glisser-
            déposer à distance, et chaque changement est journalisé. */}
        <form action={moveStage} className="flex items-center gap-2">
          <input type="hidden" name="id" value={content.id} />
          <Eyebrow className="whitespace-nowrap">Étape</Eyebrow>
          <select
            name="stage"
            defaultValue={content.status}
            className="rounded-control border border-line bg-paper px-2 py-[5px] text-small outline-none focus:border-gold"
          >
            {CONTENT_STAGES.map((s) => (
              <option key={s} value={s}>
                {CONTENT_STATUS[s].label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="cursor-pointer rounded-control border border-line bg-paper px-[10px] py-[5px] text-small font-medium text-ink-2 hover:border-line-strong hover:text-ink"
          >
            Déplacer
          </button>
        </form>
      </div>

      <div
        className="grid min-h-0 flex-1 items-start gap-4 overflow-auto px-5 pt-4 pb-6"
        style={{ gridTemplateColumns: "minmax(360px,1fr) 360px" }}
      >
        <div className="flex min-w-0 flex-col gap-4">
          {content.status === "validation" || content.status === "revision" ? (
            <Card className="border-gold p-4">
              <Eyebrow tone="gold">En attente de validation</Eyebrow>
              <p className="mt-1 mb-3 text-base text-ink-2">
                {content.submittedAt
                  ? `Envoyé le ${content.submittedAt.toLocaleDateString("fr-FR")}`
                  : "Pas encore envoyé"}
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <form action={approveContent}>
                  <input type="hidden" name="id" value={content.id} />
                  <button
                    type="submit"
                    className="cursor-pointer rounded-control border border-ink bg-ink px-3 py-2 text-base font-medium text-paper hover:bg-black"
                  >
                    Valider
                  </button>
                </form>

                <form action={requestChange} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={content.id} />
                  <label className="flex flex-col gap-1">
                    <span className="eyebrow text-ink-3">Motif</span>
                    <select
                      name="reason"
                      className="rounded-control border border-line bg-paper px-2 py-2 text-base outline-none focus:border-gold"
                    >
                      {REASONS.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </label>
                  <input
                    name="note"
                    placeholder="Précision (facultatif)"
                    className="w-[220px] rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold"
                  />
                  <button
                    type="submit"
                    className="cursor-pointer rounded-control border border-line bg-paper px-3 py-2 text-base font-medium text-ink-2 hover:border-line-strong hover:text-ink"
                  >
                    Demander une modification
                  </button>
                </form>
              </div>
            </Card>
          ) : null}

          {content.status === "pret" ? (
            <Card className="p-4">
              <Eyebrow>Publication</Eyebrow>
              <p className="mt-1 mb-3 text-base text-ink-2">
                Le lien du post est demandé : sans lui, « publié » n&apos;est qu&apos;une
                déclaration, et c&apos;est cette publication qui compte dans l&apos;engagement du
                mois.
              </p>
              <form action={markPublished} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={content.id} />
                <input
                  name="url"
                  type="url"
                  required
                  placeholder="https://instagram.com/p/…"
                  className="min-w-[280px] flex-1 rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold"
                />
                <button
                  type="submit"
                  className="cursor-pointer rounded-control border border-ink bg-ink px-3 py-2 text-base font-medium text-paper hover:bg-black"
                >
                  Marquer comme publié
                </button>
              </form>
            </Card>
          ) : null}

          {content.publishedAt ? (
            <Card className="flex items-center justify-between gap-4 p-4">
              <div>
                <Eyebrow tone="ok">Publié</Eyebrow>
                <p className="mt-1 text-base text-ink-2">
                  Le {content.publishedAt.toLocaleString("fr-FR")}
                </p>
              </div>
              <form action={unmarkPublished}>
                <input type="hidden" name="id" value={content.id} />
                <button
                  type="submit"
                  className="cursor-pointer rounded-control border border-line bg-paper px-3 py-2 text-small font-medium text-ink-2 hover:border-line-strong"
                >
                  Annuler la publication
                </button>
              </form>
            </Card>
          ) : null}

          <MediaCard
            contentId={content.id}
            attached={attached.map((a) => a.asset)}
            library={library.map((a) => a.asset)}
            isCarousel={content.kind === "carrousel"}
          />

          <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <Eyebrow>Responsable</Eyebrow>
              <p className="mt-1 text-base text-ink-2">
                {ownerName
                  ? `Suivi par ${ownerName}.`
                  : "Suivi par toute l'équipe : c'est l'étape du pipeline qui dit ce qui reste à faire."}
              </p>
            </div>
            <div className="w-[220px] flex-none">
              <AssignPicker contentId={content.id} ownerId={content.ownerId} staff={staff} />
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-4">
              <Eyebrow>Fiche</Eyebrow>
              <h2 className="text-title font-semibold">Modifier le contenu</h2>
            </div>
            <ContentForm
              action={updateContent}
              clients={clients}
              submitLabel="Enregistrer"
              values={{
                id: content.id,
                clientId: content.clientId,
                title: content.title,
                kind: content.kind,
                network: content.network,
                scheduledAt: toLocalInput(content.scheduledAt),
                caption: content.caption ?? "",
                instructions: content.instructions ?? "",
              }}
            />
          </Card>

          <Card className="flex items-center justify-between gap-4 p-5">
            <p className="text-small text-ink-2">
              Supprimer efface le contenu et son historique. Pour un contenu abandonné, préférer
              l&apos;étape « Idée ».
            </p>
            <form action={deleteContent}>
              <input type="hidden" name="id" value={content.id} />
              <button
                type="submit"
                className="cursor-pointer rounded-control border border-line bg-paper px-3 py-2 text-base font-medium text-alert hover:border-alert"
              >
                Supprimer
              </button>
            </form>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHead title="Commentaires" meta={`${thread.length}`} />
            {thread.map(({ comment, authorName, authorInitials }) => (
              <div key={comment.id} className="flex gap-[9px] border-b border-line px-[14px] py-[10px]">
                <Avatar initials={authorInitials ?? "?"} size={22} />
                <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <span className="flex items-baseline gap-2">
                    <span className="text-small font-semibold">{authorName ?? "Système"}</span>
                    <span className="ml-auto text-micro whitespace-nowrap text-ink-3">
                      {comment.createdAt.toLocaleDateString("fr-FR")}
                    </span>
                  </span>
                  <span className="text-base leading-relaxed">{comment.body}</span>
                </span>
              </div>
            ))}
            {thread.length === 0 ? (
              <p className="px-[14px] py-3 text-base text-ink-3">Aucun commentaire.</p>
            ) : null}
            <form action={addComment} className="flex flex-col gap-2 px-[14px] py-3">
              <input type="hidden" name="id" value={content.id} />
              <textarea
                name="body"
                rows={2}
                required
                placeholder="Ajouter un commentaire…"
                className="rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold"
              />
              <button
                type="submit"
                className="cursor-pointer self-start rounded-control border border-ink bg-ink px-3 py-[6px] text-small font-medium text-paper hover:bg-black"
              >
                Envoyer
              </button>
            </form>
          </Card>

          <Card>
            <CardHead title="Versions" meta={`${versions.length}`} />
            {versions.length === 0 ? (
              <p className="px-[14px] py-3 text-base text-ink-3">
                Une version est créée à chaque demande de modification.
              </p>
            ) : (
              versions.map((v) => (
                <div key={v.id} className="flex items-center gap-[10px] border-b border-line px-[14px] py-[10px]">
                  <span className="w-6 text-small font-semibold tabular-nums text-ink-2">
                    V{v.number}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="clip text-base">{v.note ?? "Version"}</span>
                    <span className="text-micro text-ink-3">
                      {v.approvedAt
                        ? `Validée le ${v.approvedAt.toLocaleDateString("fr-FR")}`
                        : v.rejectedAt
                          ? `Refusée le ${v.rejectedAt.toLocaleDateString("fr-FR")}`
                          : "En cours"}
                    </span>
                  </span>
                </div>
              ))
            )}
          </Card>

          <Card>
            <CardHead title="Historique" />
            {history.map(({ entry, actorName }) => (
              <div key={entry.id} className="flex items-baseline gap-2 border-b border-line px-[14px] py-2">
                <span className="min-w-0 flex-1 text-small text-ink-2">{entry.text}</span>
                <span className="text-micro whitespace-nowrap text-ink-3">
                  {actorName ?? "Système"} · {entry.createdAt.toLocaleDateString("fr-FR")}
                </span>
              </div>
            ))}
          </Card>

          <Link href="/production" className="text-base">← Pipeline</Link>
          <span className="text-small text-ink-3">
            Propriétaire : {ownerName ?? "non assigné"}
          </span>
        </div>
      </div>
    </>
  );
}
