import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/home/bits";
import { ReferenceVideo } from "@/components/tournages/Reference";
import { contextePortail } from "@/lib/portail";
import { wallNow } from "@/lib/publication";
import { estAVenir, nouveautesTournage, tournagesDuPortail, type TournagePortail } from "@/lib/tournages";
import {
  creneauDit,
  dansCombien,
  dureeDite,
  dureeVideo,
  enumerer,
  FORMAT_VIDEO,
  jourLong,
  PAROLE,
  resume,
  resumeDit,
} from "@/lib/tournages-regles";
import { BoutonPret, CasePreparation, FormQuestion, MarquerVu } from "./Gestes";

export const dynamic = "force-dynamic";

const quand = (d: Date) =>
  d.toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Indian/Reunion" });

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * « Tournages » : ce que l'agence va filmer, quand, et ce que le client
 * prépare de son côté.
 *
 * Le prochain tournage en grand, puis « À préparer avant le tournage » (tout
 * ce qui est à apporter ou à apprendre, regroupé), puis chaque vidéo avec sa
 * référence, son texte et « Je suis prêt ». Les tournages suivants viennent
 * ensuite en liste courte ; les passés restent repliés.
 *
 * Seuls les tournages publiés au client et leurs vidéos visibles sont lus
 * (lib/tournages.ts) : ni note d'équipe, ni matériel, ni droits, ni budget.
 */
export default async function TournagesPortail({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { user, client, config, apercu } = await contextePortail();
  const { t } = await searchParams;
  const maintenant = wallNow();
  const [tous, nouveautes] = await Promise.all([
    tournagesDuPortail(client.id),
    apercu ? Promise.resolve([]) : nouveautesTournage(user.id),
  ]);

  const aVenir = tous.filter((s) => estAVenir(s, maintenant));
  const passes = tous.filter((s) => !estAVenir(s, maintenant)).reverse();
  const choisi = aVenir.find((s) => s.id === t) ?? aVenir[0] ?? null;
  const suivants = aVenir.filter((s) => s.id !== choisi?.id);
  const accent = config.primaryColor;

  return (
    <div className="flex flex-col gap-5">
      {nouveautes.length ? <MarquerVu /> : null}

      <div className="flex flex-col gap-1">
        <span className="eyebrow text-ink-3">{client.shortName} · tournages</span>
        <h1 className="text-[30px] leading-[1.05] font-bold tracking-[-0.03em] sm:text-[40px]">Vos tournages</h1>
        <p className="max-w-[640px] text-base text-ink-2">
          Ce que nous allons filmer, quand, et ce que vous pouvez préparer. Dites-nous quand vous êtes prêt, ou posez
          votre question sous chaque vidéo.
        </p>
      </div>

      {nouveautes.length ? (
        <div className="flex items-start gap-3 rounded-[18px] border border-line bg-paper px-4 py-3 shadow-soft" data-nouveautes>
          <span className="mt-[2px] flex h-7 w-7 flex-none items-center justify-center rounded-full text-white" style={{ background: accent }}>
            <Icon name="bell" size={14} />
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="text-base font-semibold">Du nouveau depuis votre dernière visite</span>
            {nouveautes.map((n) => (
              <span key={n.id} className="text-small break-words text-ink-2">
                {n.title}
              </span>
            ))}
          </span>
        </div>
      ) : null}

      {choisi ? (
        <Prochain tournage={choisi} premier={choisi.id === aVenir[0]?.id} maintenant={maintenant} accent={accent} />
      ) : (
        <div className="rounded-card border border-line bg-paper px-5 py-6 text-base text-ink-2 shadow-soft" data-aucun-tournage>
          Aucun tournage n&apos;est prévu pour le moment. Dès que nous en préparons un, vous le retrouverez ici avec les
          vidéos prévues.
        </div>
      )}

      {suivants.length ? (
        <Panel title="Les tournages suivants">
          <ul className="m-0 flex list-none flex-col gap-2 p-0" data-suivants>
            {suivants.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/portail/tournages?t=${s.id}`}
                  className="flex min-h-11 items-center gap-3 rounded-[16px] border border-line px-3 py-2 text-ink no-underline hover:border-line-strong hover:no-underline"
                >
                  <span className="flex w-[54px] flex-none flex-col items-center rounded-[12px] bg-mute py-1 leading-tight">
                    <span className="text-micro text-ink-3 uppercase">{s.startsAt.toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" })}</span>
                    <span className="text-[20px] font-bold tabular-nums">{s.startsAt.getUTCDate()}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-base font-semibold break-words">{majuscule(jourLong(s.startsAt))}</span>
                    <span className="text-small break-words text-ink-3">
                      {creneauDit(s.startsAt, s.endsAt)}
                      {s.place ? ` · ${s.place}` : ""} · {resumeDit(resume(s.videos))}
                    </span>
                  </span>
                  <span aria-hidden className="flex-none text-ink-3">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {passes.length ? (
        <details className="group rounded-card border border-line bg-paper p-5 shadow-soft" data-passes>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-lead font-semibold [&::-webkit-details-marker]:hidden">
            Tournages passés · {passes.length}
            <Icon name="chevronDown" size={18} />
          </summary>
          <ul className="mt-3 flex list-none flex-col gap-4 p-0">
            {passes.map((s) => (
              <li key={s.id} className="flex flex-col gap-1 border-t border-line pt-3">
                <span className="text-base font-semibold">{majuscule(jourLong(s.startsAt))}</span>
                <span className="text-small text-ink-3">
                  {s.place ? `${s.place} · ` : ""}
                  {s.videos.length} vidéo{s.videos.length > 1 ? "s" : ""} prévue{s.videos.length > 1 ? "s" : ""}
                </span>
                {s.produits.length ? (
                  <span className="mt-1 flex flex-wrap gap-2">
                    {s.produits.map((c) => (
                      <Link
                        key={c.id}
                        href={`/portail/contenu/${c.id}`}
                        className="flex min-h-11 items-center rounded-full border border-line px-3 text-small font-medium text-ink no-underline hover:border-line-strong hover:no-underline"
                      >
                        {c.title} →
                      </Link>
                    ))}
                  </span>
                ) : (
                  <span className="text-small text-ink-3">Les contenus issus de ce tournage apparaîtront ici.</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/** Le tournage montré en entier : en-tête, récapitulatif, puis les vidéos. */
function Prochain({
  tournage: s,
  premier,
  maintenant,
  accent,
}: {
  tournage: TournagePortail;
  premier: boolean;
  maintenant: Date;
  accent: string;
}) {
  const r = resume(s.videos);
  const duree = dureeDite(s.startsAt, s.endsAt);
  // Tout ce qui est à préparer, regroupé : on prépare une fois pour tout le
  // tournage, pas vidéo par vidéo.
  const aPreparer = s.videos.flatMap((v, i) =>
    v.prep.map((p) => ({ ...p, videoId: v.id, fait: v.prepDone.includes(p.id), pour: `Vidéo ${i + 1} · ${v.title}` })),
  );
  const scripts = s.videos
    .map((v, i) => ({ v, n: i + 1 }))
    .filter(({ v }) => v.script?.trim() && v.speaker === "client");

  return (
    <>
      <section
        className="flex flex-col gap-4 rounded-[26px] bg-night p-5 text-white shadow-soft sm:p-6"
        data-prochain-tournage={s.id}
        aria-label="Le prochain tournage"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full px-3 py-[3px] text-small font-semibold text-white" style={{ background: accent }}>
            {premier ? "Prochain tournage" : "Tournage"} · {dansCombien(s.startsAt, maintenant)}
          </span>
          {!premier ? (
            <Link href="/portail/tournages" className="text-small text-night-ink underline">
              Revenir au prochain
            </Link>
          ) : null}
        </div>
        <h2 className="text-[28px] leading-[1.1] font-bold tracking-[-0.02em] break-words sm:text-[34px]">
          {majuscule(jourLong(s.startsAt))}
        </h2>
        <ul className="m-0 flex list-none flex-col gap-2 p-0 text-base">
          <li className="flex items-start gap-3">
            <Icon name="clock" size={18} />
            <span className="min-w-0 break-words">
              {creneauDit(s.startsAt, s.endsAt)}
              {duree ? <span className="text-night-ink"> · {duree} prévues</span> : null}
              <span className="text-night-ink"> (heure de La Réunion)</span>
            </span>
          </li>
          {s.place ? (
            <li className="flex items-start gap-3">
              <Icon name="home" size={18} />
              <span className="min-w-0 break-words">{s.place}</span>
            </li>
          ) : null}
          {s.equipe.length ? (
            <li className="flex items-start gap-3">
              <Icon name="users" size={18} />
              <span className="min-w-0 break-words">Avec {enumerer(s.equipe)}, de notre équipe</span>
            </li>
          ) : null}
          <li className="flex items-start gap-3">
            <Icon name="camera" size={18} />
            <span className="min-w-0 break-words" data-resume-tournage>
              {resumeDit(r)}
              {r.videos ? ` · ${r.pretes}/${r.videos} prête${r.pretes > 1 ? "s" : ""} de votre côté` : ""}
            </span>
          </li>
        </ul>
      </section>

      {aPreparer.length || scripts.length ? (
        <Panel
          title="À préparer avant le tournage"
          right={
            aPreparer.length ? (
              <span className="text-small text-ink-3 tabular-nums">
                {aPreparer.filter((p) => p.fait).length}/{aPreparer.length}
              </span>
            ) : undefined
          }
        >
          <div className="flex flex-col gap-3" data-recapitulatif>
            {aPreparer.length ? (
              <div className="flex flex-col">
                {aPreparer.map((p) => (
                  <CasePreparation key={`${p.videoId}-${p.id}`} videoId={p.videoId} item={p.id} label={p.label} fait={p.fait} pour={p.pour} />
                ))}
              </div>
            ) : null}
            {scripts.length ? (
              <div className="rounded-[16px] bg-mute px-4 py-3">
                <span className="text-base font-semibold">
                  {scripts.length > 1 ? `${scripts.length} textes à préparer` : "Un texte à préparer"}
                </span>
                <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
                  {scripts.map(({ v, n }) => (
                    <li key={v.id}>
                      <a href={`#video-${v.id}`} className="flex min-h-11 items-center text-base break-words">
                        Vidéo {n} · {v.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {s.videos.length ? (
        <section className="flex flex-col gap-3" aria-label="Les vidéos prévues">
          <h2 className="text-[22px] font-bold tracking-[-0.02em]">
            Les vidéos prévues · {s.videos.length}
          </h2>
          <ol className="m-0 flex list-none flex-col gap-4 p-0">
            {s.videos.map((v, i) => (
              <li
                key={v.id}
                id={`video-${v.id}`}
                data-video-client={v.id}
                className="flex scroll-mt-24 flex-col gap-4 rounded-[26px] border border-line bg-paper p-4 shadow-soft sm:p-5"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-base font-bold text-white"
                    style={{ background: v.clientReadyAt ? "var(--color-ok)" : accent }}
                  >
                    {v.clientReadyAt ? "✓" : i + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <h3 className="text-lead leading-snug font-semibold break-words">{v.title}</h3>
                    <span className="text-small text-ink-3">
                      {[v.format ? FORMAT_VIDEO[v.format] : null, dureeVideo(v.durationSec) ? `environ ${dureeVideo(v.durationSec)}` : null]
                        .filter(Boolean)
                        .join(" · ") || "Vidéo"}
                      {v.clientReadyAt ? " · vous êtes prêt" : ""}
                    </span>
                  </div>
                </div>

                {v.description ? <p className="text-base break-words whitespace-pre-line text-ink">{v.description}</p> : null}

                {v.references.length ? (
                  <div className="flex flex-col gap-2">
                    {v.references.map((ref) => (
                      <ReferenceVideo key={ref.url} {...ref} />
                    ))}
                  </div>
                ) : null}

                {v.script ? (
                  <div className="rounded-[18px] bg-mute px-4 py-3">
                    <span className="eyebrow text-ink-3">
                      {v.speaker === "client" ? "Le texte à préparer" : "Le texte"}
                      {v.speaker ? ` · ${PAROLE[v.speaker]?.client ?? ""}` : ""}
                    </span>
                    <p className="mt-1 text-base break-words whitespace-pre-line">{v.script}</p>
                  </div>
                ) : null}

                {v.prep.length ? (
                  <div className="flex flex-col">
                    <span className="text-base font-semibold">Ce que vous devez préparer</span>
                    {v.prep.map((p) => (
                      <CasePreparation key={p.id} videoId={v.id} item={p.id} label={p.label} fait={v.prepDone.includes(p.id)} />
                    ))}
                  </div>
                ) : null}

                <BoutonPret videoId={v.id} pret={Boolean(v.clientReadyAt)} accent={accent} />

                <div className="flex flex-col gap-3 border-t border-line pt-3">
                  {v.echanges.map((e) => (
                    <div
                      key={e.id}
                      className={`flex max-w-[92%] flex-col rounded-[16px] px-3 py-2 ${e.deVous ? "self-end bg-mute" : "self-start border border-line"}`}
                      data-echange={e.deVous ? "client" : "equipe"}
                    >
                      <span className="text-small text-ink-3">
                        {e.deVous ? "Vous" : e.auteur} · {quand(e.createdAt)}
                      </span>
                      <span className="text-base break-words whitespace-pre-line">{e.body}</span>
                    </div>
                  ))}
                  <FormQuestion videoId={v.id} />
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <p className="rounded-card border border-line bg-paper px-5 py-4 text-base text-ink-2 shadow-soft">
          Les vidéos de ce tournage seront bientôt détaillées ici.
        </p>
      )}

    </>
  );
}
