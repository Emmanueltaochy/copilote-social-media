import Link from "next/link";
import { notFound } from "next/navigation";
import { ReferenceVideo } from "@/components/tournages/Reference";
import { Icon } from "@/components/ui/Icon";
import { requireVideaste } from "@/lib/auth";
import { creneauDit, dureeDite, dureeVideo, FORMAT_VIDEO, jourLong, PAROLE } from "@/lib/tournages-regles";
import { tournageDuVideaste } from "@/lib/videaste";
import { BoutonTournee, FormNote, FormRushes } from "../Gestes";

export const dynamic = "force-dynamic";

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const quand = (d: Date) =>
  d.toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Indian/Reunion" });

function Bloc({ titre, meta, children }: { titre: string; meta?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-paper p-4 shadow-soft">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lead font-semibold">{titre}</h2>
        {meta ? <span className="text-small tabular-nums text-ink-3">{meta}</span> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * La fiche d'un tournage, vue par le vidéaste qui en fait partie : où, quand,
 * qui, le matériel, les autorisations, les plans, et surtout chaque vidéo
 * avec tout ce qu'il faut pour la filmer (référence, script, ce que le client
 * a préparé, ses remarques, les notes de l'équipe).
 *
 * Un tournage dont il ne fait pas partie répond « introuvable », comme une
 * adresse qui n'existe pas.
 */
export default async function FicheVideaste({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireVideaste();
  const { id } = await params;
  const t = await tournageDuVideaste(user.id, id);
  if (!t) notFound();
  const { shoot } = t;
  const duree = dureeDite(shoot.startsAt, shoot.endsAt);
  const tournees = t.videos.filter((v) => v.status === "tourne").length;

  return (
    <div className="flex flex-col gap-4" data-fiche-videaste={shoot.id}>
      <Link href="/videaste" className="flex min-h-11 w-fit items-center gap-1 text-base text-ink-3 no-underline hover:text-ink hover:no-underline">
        <span aria-hidden>←</span> Mes tournages
      </Link>

      <section className="flex flex-col gap-3 rounded-[26px] bg-night p-5 text-white shadow-soft">
        <span className="text-small font-semibold text-gold">
          {t.client}
          {shoot.status === "annule" ? " · annulé" : ""}
        </span>
        <h1 className="text-[26px] leading-[1.1] font-bold tracking-[-0.02em] break-words">
          {majuscule(jourLong(shoot.startsAt))} · {creneauDit(shoot.startsAt, shoot.endsAt)}
        </h1>
        <p className="text-base break-words">{shoot.title}</p>
        <ul className="m-0 flex list-none flex-col gap-2 p-0 text-base">
          {duree ? (
            <li className="flex items-start gap-3">
              <Icon name="clock" size={18} />
              <span>{duree} sur place (heure de La Réunion)</span>
            </li>
          ) : null}
          {shoot.place ? (
            <li className="flex items-start gap-3">
              <Icon name="home" size={18} />
              <span className="min-w-0 break-words">
                {shoot.place}
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shoot.place)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-2 inline-flex min-h-11 items-center text-gold underline"
                >
                  Itinéraire ↗
                </a>
              </span>
            </li>
          ) : null}
          {shoot.onSiteContact ? (
            <li className="flex items-start gap-3">
              <Icon name="phone" size={18} />
              <span className="min-w-0 break-words" data-contact-sur-place>
                Sur place : {shoot.onSiteContact}
              </span>
            </li>
          ) : null}
          <li className="flex items-start gap-3">
            <Icon name="camera" size={18} />
            <span>
              {t.videos.length} vidéo{t.videos.length > 1 ? "s" : ""} · {tournees} tournée{tournees > 1 ? "s" : ""}
            </span>
          </li>
        </ul>
      </section>

      {shoot.note ? (
        <Bloc titre="Note de l'équipe">
          <p className="text-base break-words whitespace-pre-line" data-note-equipe>
            {shoot.note}
          </p>
        </Bloc>
      ) : null}

      <Bloc titre="Équipe" meta={`${t.equipe.length}`}>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {t.equipe.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-base font-medium break-words">
                {m.name}
                {m.userId === user.id ? <span className="text-ink-3"> · vous</span> : null}
              </span>
              <span className="text-small text-ink-3">
                {[m.roleLabel, m.state].filter(Boolean).join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      </Bloc>

      <Bloc titre="Rushes">
        {shoot.rushesUrl ? (
          <a href={shoot.rushesUrl} target="_blank" rel="noreferrer" className="flex min-h-11 items-center text-base break-all" data-lien-rushes>
            {shoot.rushesUrl} ↗
          </a>
        ) : (
          <p className="text-base text-ink-2">Après le tournage, indiquez où sont les rushes : l&apos;équipe est prévenue.</p>
        )}
        <FormRushes shootId={shoot.id} lien={shoot.rushesUrl} />
      </Bloc>

      <section className="flex flex-col gap-3" aria-label="Vidéos prévues">
        <h2 className="text-[22px] font-bold tracking-[-0.02em]">Vidéos prévues · {t.videos.length}</h2>
        {t.videos.length === 0 ? (
          <p className="rounded-card border border-dashed border-line px-4 py-5 text-base text-ink-2">Les vidéos de ce tournage ne sont pas encore décrites.</p>
        ) : null}
        {t.videos.map((v, i) => {
          const faits = new Set(v.prepDone);
          return (
            <article key={v.id} data-video-videaste={v.id} className="flex flex-col gap-3 rounded-[26px] border border-line bg-paper p-4 shadow-soft">
              <div className="flex items-start gap-3">
                <span
                  className={`flex h-9 w-9 flex-none items-center justify-center rounded-full text-base font-bold text-white ${v.status === "tourne" ? "bg-ok" : "bg-night"}`}
                >
                  {v.status === "tourne" ? "✓" : i + 1}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h3 className="text-lead leading-snug font-semibold break-words">{v.title}</h3>
                  <span className="text-small text-ink-3">
                    {[v.format ? FORMAT_VIDEO[v.format] : null, dureeVideo(v.durationSec)].filter(Boolean).join(" · ") || "Format à préciser"}
                    {v.clientReadyAt ? " · client prêt" : " · client pas encore prêt"}
                    {v.visibleToClient ? "" : " · non montrée au client"}
                  </span>
                </div>
              </div>

              {v.description ? <p className="text-base break-words whitespace-pre-line">{v.description}</p> : null}

              {v.references.length ? (
                <div className="flex flex-col gap-2">
                  {v.references.map((r) => (
                    <ReferenceVideo key={r.url} {...r} />
                  ))}
                </div>
              ) : null}

              {v.script ? (
                <div className="rounded-[18px] bg-mute px-4 py-3">
                  <span className="eyebrow text-ink-3">Script{v.speaker ? ` · ${PAROLE[v.speaker]?.agence ?? ""}` : ""}</span>
                  <p className="mt-1 text-base break-words whitespace-pre-line">{v.script}</p>
                </div>
              ) : null}

              {v.prep.length ? (
                <div className="flex flex-col gap-1">
                  <span className="text-small font-semibold text-ink-2">
                    Préparé par le client · {v.prep.filter((p) => faits.has(p.id)).length}/{v.prep.length}
                  </span>
                  <ul className="m-0 flex list-none flex-col gap-1 p-0">
                    {v.prep.map((p) => (
                      <li key={p.id} className={`text-base break-words ${faits.has(p.id) ? "text-ok" : "text-ink-2"}`}>
                        {faits.has(p.id) ? "✓ " : "○ "}
                        {p.label}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {v.echanges.length ? (
                <div className="flex flex-col gap-2 rounded-[18px] border border-line px-4 py-3">
                  <span className="text-small font-semibold text-ink-2">Échanges avec le client</span>
                  {v.echanges.map((e) => (
                    <div key={e.id} className="flex flex-col">
                      <span className="text-small text-ink-3">
                        {e.role === "client" ? `${e.auteur ?? "Client"} (client)` : (e.auteur ?? "Équipe")} · {quand(e.createdAt)}
                      </span>
                      <span className="text-base break-words whitespace-pre-line">{e.body}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              {v.notes.length ? (
                <div className="flex flex-col gap-2 rounded-[18px] bg-mute px-4 py-3" data-notes-tournage={v.id}>
                  <span className="text-small font-semibold text-ink-2">Notes de tournage</span>
                  {v.notes.map((n) => (
                    <div key={n.id} className="flex flex-col">
                      <span className="text-small text-ink-3">
                        {n.auteur ?? "Équipe"} · {quand(n.createdAt)}
                      </span>
                      <span className="text-base break-words whitespace-pre-line">{n.body}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              <BoutonTournee videoId={v.id} tournee={v.status === "tourne"} />
              <FormNote videoId={v.id} />
            </article>
          );
        })}
      </section>

      <Bloc titre="Plans prévus" meta={`${t.plans.filter((p) => p.done).length}/${t.plans.length}`}>
        {t.plans.length ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {t.plans.map((p) => (
              <li key={p.id} className={`text-base break-words ${p.done ? "text-ink-3 line-through" : ""}`}>
                {p.label}
                {p.kind ? <span className="text-small text-ink-3"> · {p.kind}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-base text-ink-2">Pas de plans listés.</p>
        )}
      </Bloc>

      <Bloc titre="Matériel prévu" meta={`${t.materiel.length}`}>
        {t.materiel.length ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {t.materiel.map((g) => (
              <li key={g.id} className="flex flex-wrap justify-between gap-x-3 text-base">
                <span className="break-words">{g.label}</span>
                <span className={`text-small ${g.reserved ? "text-ok" : "text-warn"}`}>{g.reserved ? "Réservé" : "Non réservé"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-base text-ink-2">Pas de matériel listé.</p>
        )}
      </Bloc>

      {t.droits.length ? (
        <Bloc titre="Droit à l'image" meta={`${t.droits.filter((d) => d.signed).length}/${t.droits.length} signées`}>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {t.droits.map((d) => (
              <li key={d.id} className="flex flex-wrap justify-between gap-x-3 text-base">
                <span className="break-words">{d.person}</span>
                <span className={`text-small ${d.signed ? "text-ok" : "text-warn"}`}>{d.signed ? "Signée" : "Pas encore signée"}</span>
              </li>
            ))}
          </ul>
        </Bloc>
      ) : null}
    </div>
  );
}
