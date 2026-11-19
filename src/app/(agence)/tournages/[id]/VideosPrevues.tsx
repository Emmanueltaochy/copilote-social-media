import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Eyebrow, StatusPill } from "@/components/ui/primitives";
import { ReferenceVideo } from "@/components/tournages/Reference";
import { CONTENT_STATUS } from "@/data/content";
import type { videosAgence } from "@/lib/tournages";
import { dureeVideo, FORMAT_VIDEO, PAROLE, resume, STATUT_VIDEO } from "@/lib/tournages-regles";
import {
  changerStatutVideo,
  creerContenuDepuisVideo,
  deplacerVideo,
  depublierTournage,
  publierTournage,
  relierContenu,
  repondreVideo,
  supprimerVideo,
} from "../actions-videos";
import { DepuisContenu } from "./DepuisContenu";
import { VideoForm } from "./VideoForm";

type Donnees = Awaited<ReturnType<typeof videosAgence>>;

const petitBouton =
  "flex min-h-9 cursor-pointer items-center justify-center rounded-full border border-line bg-paper px-3 text-small font-medium text-ink-2 hover:border-line-strong hover:text-ink disabled:cursor-default disabled:opacity-40";

const quand = (d: Date) =>
  d.toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Indian/Reunion" });

/**
 * « Vidéos prévues pour ce tournage » et ce que le client en dit.
 *
 * En tête, l'état de publication au client : tant que le tournage est en
 * brouillon interne, rien n'apparaît dans son portail. Puis la liste ordonnée
 * des vidéos, chacune avec ce que le client lira (description, référence,
 * script, choses à préparer) et ce qu'il a répondu (« Je suis prêt »,
 * questions).
 */
export function VideosPrevues({
  shoot,
  donnees,
}: {
  shoot: { id: string; title: string; publishedAt: Date | null; clientName: string };
  donnees: Donnees;
}) {
  const { videos, candidats } = donnees;
  const visibles = videos.filter((v) => v.visibleToClient);
  const r = resume(visibles);
  const questions = videos.reduce((n, v) => n + (v.echanges.at(-1)?.deClient ? 1 : 0), 0);
  const dejaLies = new Set(videos.map((v) => v.contentId).filter(Boolean));

  return (
    <Card>
      <div className="flex flex-col gap-4 border-b border-line px-5 pt-5 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Eyebrow>Pour le client</Eyebrow>
            <h2 className="text-title font-semibold">Vidéos prévues pour ce tournage</h2>
          </div>
          <span className="text-small text-ink-3 tabular-nums">
            {videos.length} vidéo{videos.length > 1 ? "s" : ""}
            {videos.length !== visibles.length ? ` · ${videos.length - visibles.length} masquée${videos.length - visibles.length > 1 ? "s" : ""} au client` : ""}
          </span>
        </div>

        {/* L'état côté client, en une ligne : publié ou non, et ce qu'il a fait. */}
        <div
          data-etat-client={shoot.publishedAt ? "publie" : "brouillon"}
          className={`flex flex-col gap-3 rounded-[18px] px-4 py-3 sm:flex-row sm:items-center ${shoot.publishedAt ? "bg-ok-bg" : "bg-mute"}`}
        >
          <div className="min-w-0 flex-1">
            {shoot.publishedAt ? (
              <>
                <p className="text-base font-semibold text-ok">Publié au client · {quand(shoot.publishedAt)}</p>
                <p className="text-small text-ink-2" data-resume-client>
                  {visibles.length === 0
                    ? "Aucune vidéo visible : le client voit seulement la date et le lieu."
                    : `Client prêt pour ${r.pretes} vidéo${r.pretes > 1 ? "s" : ""} sur ${visibles.length} · ${
                        r.chosesTotal ? `${r.chosesTotal - r.choses}/${r.chosesTotal} choses à préparer cochées` : "rien à préparer"
                      }${questions ? ` · ${questions} question${questions > 1 ? "s" : ""} du client sans réponse` : ""}`}
                </p>
              </>
            ) : (
              <>
                <p className="text-base font-semibold text-ink">Brouillon interne</p>
                <p className="text-small text-ink-2">
                  {shoot.clientName} ne voit pas encore ce tournage. Publiez-le quand les vidéos sont prêtes à être lues : le
                  client est prévenu dans son espace et par courriel.
                </p>
              </>
            )}
          </div>
          {shoot.publishedAt ? (
            <form action={depublierTournage}>
              <input type="hidden" name="id" value={shoot.id} />
              <button type="submit" className={`${petitBouton} min-h-11 w-full sm:w-auto`}>
                Repasser en brouillon
              </button>
            </form>
          ) : (
            <form action={publierTournage}>
              <input type="hidden" name="id" value={shoot.id} />
              <button
                type="submit"
                data-bouton="publier-tournage"
                className="min-h-11 w-full cursor-pointer rounded-full border border-night bg-night px-5 py-2 text-base font-semibold text-white hover:opacity-85 sm:w-auto"
              >
                Publier au client
              </button>
            </form>
          )}
        </div>
      </div>

      {videos.length === 0 ? (
        <p className="px-5 py-4 text-base text-ink-2">
          Aucune vidéo prévue. Décrivez chaque vidéo, ou collez le lien d&apos;une tendance à reproduire : le client saura quoi
          préparer, lui et son texte.
        </p>
      ) : (
        <ol className="m-0 list-none p-0">
          {videos.map((v, i) => {
            const st = STATUT_VIDEO[v.status] ?? STATUT_VIDEO.a_preparer;
            const faits = new Set(v.prepDone);
            const derniere = v.echanges.at(-1);
            return (
              <li key={v.id} data-video={v.id} className="flex flex-col gap-3 border-b border-line px-5 py-4">
                <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-night text-small font-bold text-white">
                    {i + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <h3 className="text-lead leading-snug font-semibold">{v.title}</h3>
                    <span className="text-small text-ink-3">
                      {[v.format ? FORMAT_VIDEO[v.format] : null, dureeVideo(v.durationSec)].filter(Boolean).join(" · ") || "Format à préciser"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!v.visibleToClient ? <StatusPill tone="muted">Masquée au client</StatusPill> : null}
                    {v.visibleToClient && shoot.publishedAt ? (
                      v.clientReadyAt ? (
                        <StatusPill tone="ok">Client prêt</StatusPill>
                      ) : (
                        <StatusPill tone="warn">Client pas encore prêt</StatusPill>
                      )
                    ) : null}
                    <StatusPill tone={st.tone}>{st.label}</StatusPill>
                  </div>
                </div>

                {v.description ? <p className="text-base whitespace-pre-line text-ink-2">{v.description}</p> : null}

                {v.references.length ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    {v.references.map((ref) => (
                      <ReferenceVideo key={ref.url} {...ref} />
                    ))}
                  </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-2">
                  {v.script ? (
                    <div className="rounded-[16px] bg-mute px-4 py-3">
                      <Eyebrow>Script · {v.speaker ? PAROLE[v.speaker]?.agence : "qui le dit à préciser"}</Eyebrow>
                      <p className="mt-1 line-clamp-4 text-base whitespace-pre-line">{v.script}</p>
                    </div>
                  ) : null}
                  {v.prep.length ? (
                    <div className="rounded-[16px] bg-mute px-4 py-3">
                      <Eyebrow>
                        À préparer par le client · {v.prep.filter((p) => faits.has(p.id)).length}/{v.prep.length} cochées
                      </Eyebrow>
                      <ul className="mt-1 flex list-none flex-col gap-1 p-0">
                        {v.prep.map((p) => (
                          <li key={p.id} className={`text-base ${faits.has(p.id) ? "text-ink-3 line-through" : ""}`}>
                            {faits.has(p.id) ? "✓ " : "• "}
                            {p.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>

                {/* Le contenu qu'elle deviendra : on la retrouve en production. */}
                <div className="flex flex-wrap items-center gap-2 text-small">
                  <span className="text-ink-3">Devient le contenu :</span>
                  {v.contenu ? (
                    <Link href={`/contenu/${v.contenu.id}`} className="font-medium" data-contenu-lie={v.contenu.id}>
                      {v.contenu.title} · {CONTENT_STATUS[v.contenu.status as keyof typeof CONTENT_STATUS]?.label ?? v.contenu.status}
                    </Link>
                  ) : (
                    <>
                      <form action={creerContenuDepuisVideo}>
                        <input type="hidden" name="id" value={v.id} />
                        <input type="hidden" name="shootId" value={shoot.id} />
                        <button type="submit" className={petitBouton}>
                          Créer le contenu
                        </button>
                      </form>
                      {candidats.length ? (
                        <form action={relierContenu} className="flex min-w-0 items-center gap-1">
                          <input type="hidden" name="id" value={v.id} />
                          <input type="hidden" name="shootId" value={shoot.id} />
                          <select
                            name="contentId"
                            required
                            defaultValue=""
                            aria-label="Relier à un contenu existant"
                            className="max-w-[220px] min-w-0 rounded-full border border-line bg-paper px-2 py-[5px] text-small"
                          >
                            <option value="" disabled>
                              ou relier à…
                            </option>
                            {candidats
                              .filter((c) => !dejaLies.has(c.id))
                              .map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.title}
                                </option>
                              ))}
                          </select>
                          <button type="submit" className={petitBouton}>
                            Relier
                          </button>
                        </form>
                      ) : null}
                    </>
                  )}
                </div>

                {/* Ce que le client a écrit, et la réponse de l'équipe. */}
                {v.echanges.length || (v.visibleToClient && shoot.publishedAt) ? (
                  <div className="flex flex-col gap-2 rounded-[16px] border border-line px-4 py-3" data-echanges={v.id}>
                    <Eyebrow tone={derniere?.deClient ? "warn" : "muted"}>
                      {derniere?.deClient ? "Question du client, sans réponse" : "Échanges avec le client"}
                    </Eyebrow>
                    {v.echanges.map((e) => (
                      <div key={e.id} className="flex flex-col">
                        <span className="text-small text-ink-3">
                          {e.deClient ? `${e.auteur ?? "Le client"} (client)` : (e.auteur ?? "L'équipe")} ·{" "}
                          {quand(e.createdAt)}
                        </span>
                        <span className="text-base whitespace-pre-line">{e.body}</span>
                      </div>
                    ))}
                    <form action={repondreVideo} className="flex flex-col gap-2 sm:flex-row">
                      <input type="hidden" name="id" value={v.id} />
                      <input type="hidden" name="shootId" value={shoot.id} />
                      <input
                        name="body"
                        required
                        maxLength={2000}
                        placeholder={derniere?.deClient ? "Répondre au client…" : "Écrire au client à propos de cette vidéo…"}
                        className="min-h-11 min-w-0 flex-1 rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold"
                      />
                      <button type="submit" className={`${petitBouton} min-h-11`}>
                        Envoyer
                      </button>
                    </form>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <form action={deplacerVideo}>
                    <input type="hidden" name="id" value={v.id} />
                    <input type="hidden" name="shootId" value={shoot.id} />
                    <input type="hidden" name="sens" value="haut" />
                    <button type="submit" disabled={i === 0} className={petitBouton} aria-label="Monter la vidéo">
                      ↑
                    </button>
                  </form>
                  <form action={deplacerVideo}>
                    <input type="hidden" name="id" value={v.id} />
                    <input type="hidden" name="shootId" value={shoot.id} />
                    <input type="hidden" name="sens" value="bas" />
                    <button type="submit" disabled={i === videos.length - 1} className={petitBouton} aria-label="Descendre la vidéo">
                      ↓
                    </button>
                  </form>
                  {v.status !== "tourne" ? (
                    <form action={changerStatutVideo}>
                      <input type="hidden" name="id" value={v.id} />
                      <input type="hidden" name="shootId" value={shoot.id} />
                      <input type="hidden" name="status" value={v.status === "pret" ? "tourne" : "pret"} />
                      <button type="submit" className={petitBouton}>
                        {v.status === "pret" ? "Marquer tournée" : "Marquer prête"}
                      </button>
                    </form>
                  ) : null}
                  <details className="group min-w-0 flex-1 basis-full sm:basis-auto">
                    <summary className={`${petitBouton} w-fit list-none [&::-webkit-details-marker]:hidden`}>Modifier</summary>
                    <div className="mt-3 rounded-[18px] border border-line p-4">
                      <VideoForm
                        shootId={shoot.id}
                        valeurs={{
                          id: v.id,
                          title: v.title,
                          description: v.description,
                          references: v.references.map((x) => x.url).join("\n"),
                          script: v.script,
                          speaker: v.speaker,
                          prep: v.prep.map((p) => p.label).join("\n"),
                          durationSec: v.durationSec,
                          format: v.format,
                          status: v.status,
                          visibleToClient: v.visibleToClient,
                        }}
                      />
                    </div>
                  </details>
                  <form action={supprimerVideo} className="ml-auto">
                    <input type="hidden" name="id" value={v.id} />
                    <input type="hidden" name="shootId" value={shoot.id} />
                    <button type="submit" className={`${petitBouton} hover:border-alert hover:text-alert`}>
                      Supprimer
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex flex-col gap-4 px-5 py-5">
        <details open={videos.length === 0} className="rounded-[18px] border border-line p-4">
          <summary className="cursor-pointer text-base font-semibold">Ajouter une vidéo</summary>
          <p className="mt-1 mb-3 text-small text-ink-3">
            Tout ce qui est écrit ici est lu par le client si la vidéo lui est visible. Les consignes internes vont dans la note
            du tournage.
          </p>
          <VideoForm shootId={shoot.id} />
        </details>
        <DepuisContenu shootId={shoot.id} candidats={candidats.filter((c) => !dejaLies.has(c.id))} />
      </div>
    </Card>
  );
}
