import Link from "next/link";
import { and, asc, eq, gte, isNull, lt } from "drizzle-orm";
import { db, contents } from "@/db";
import { coversFor } from "@/db/queries";
import { Cover } from "@/components/ui/Cover";
import { Icon } from "@/components/ui/Icon";
import { NetworkStack } from "@/components/home/bits";
import { CONTENT_KIND, networksLabel, networksOf } from "@/data/content";
import { contextePortail } from "@/lib/portail";
import { realInstant, wallNow, WALL_OFFSET_MS } from "@/lib/publication";
import { cn } from "@/lib/cn";
import { contentsBetween } from "@/app/(agence)/calendrier/calendar-queries";
import { ORDRE_STATUTS, STATUTS, reseauxEnEchec, statutPortail, visibleAuPortail, type StatutPortail } from "./statut";

export const dynamic = "force-dynamic";

const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const JOURS_LONGS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/*
 * Les dates de Pilot sont l'heure murale de La Réunion écrite en UTC
 * (« 18:00 » est enregistré 18:00 UTC, voir lib/publication.ts) : tout se lit
 * avec les accesseurs UTC, jamais avec le fuseau du serveur ni celui du
 * navigateur. C'est ainsi que la page d'un contenu du portail affiche « Prévu
 * le … » (`timeZone: "UTC"`).
 */
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const jour = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const plusJours = (d: Date, n: number) => jour(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n);
const hhmm = (d: Date) => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
/** 0 = lundi. */
const rangSemaine = (d: Date) => (d.getUTCDay() + 6) % 7;
const moisParam = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;

function lireMois(s: string | undefined, defaut: Date) {
  const m = s && /^(\d{4})-(\d{2})$/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    if (y >= 2000 && y <= 2100 && mo >= 0 && mo <= 11) return jour(y, mo, 1);
  }
  return jour(defaut.getUTCFullYear(), defaut.getUTCMonth(), 1);
}

type Publication = {
  id: string;
  title: string;
  kind: string;
  networks: string[];
  reseaux: string;
  /** La date dans le calendrier, en heure murale de La Réunion. */
  wall: Date;
  statut: StatutPortail;
  echecs: string[];
};

/**
 * Le calendrier du client : ce qui est publié, programmé, validé, à valider
 * ou en préparation, mois par mois.
 *
 * Même contrôle d'accès que les autres écrans du portail : le client vient de
 * `contextePortail()` (la session, jamais l'adresse), et il est dans la
 * condition de chaque requête. Un `?mois=` choisi à la main ne change que la
 * période, pas l'entreprise.
 *
 * Ordinateur : la grille du mois, lundi en tête. Téléphone : une grille de
 * points pour se repérer, puis la liste jour par jour — sept colonnes de
 * vignettes ne se lisent pas sur 390 pixels.
 */
export default async function CalendrierPortailPage({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string }>;
}) {
  const { client } = await contextePortail();
  const sp = await searchParams;

  const maintenant = wallNow();
  const aujourdhui = jour(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate());
  const debutMois = lireMois(sp.mois, aujourdhui);
  const finMois = jour(debutMois.getUTCFullYear(), debutMois.getUTCMonth() + 1, 1);
  const precedent = jour(debutMois.getUTCFullYear(), debutMois.getUTCMonth() - 1, 1);
  const suivant = finMois;
  const moisCourant = moisParam(debutMois) === moisParam(aujourdhui);

  // La grille commence le lundi avant le 1er et compte juste assez de
  // semaines pour finir le mois (cinq ou six, quatre pour un février).
  const debutGrille = plusJours(debutMois, -rangSemaine(debutMois));
  const semaines = Math.ceil((rangSemaine(debutMois) + (finMois.getTime() - debutMois.getTime()) / 86_400_000) / 7);
  const finGrille = plusJours(debutGrille, semaines * 7);

  const [dates, sansDate] = await Promise.all([
    // La requête du calendrier de l'agence, limitée à ce client.
    contentsBetween(debutGrille, finGrille, client.id),
    // Les publications relevées par Metricool sans date prévue (faites hors
    // de Pilot) : l'accueil les compte dans « Publié ce mois », elles ont
    // donc leur place ici, au jour où elles sont parties.
    db
      .select({ content: contents })
      .from(contents)
      .where(
        and(
          eq(contents.clientId, client.id),
          isNull(contents.scheduledAt),
          gte(contents.publishedAt, realInstant(debutGrille)),
          lt(contents.publishedAt, realInstant(finGrille)),
        ),
      )
      .orderBy(asc(contents.publishedAt)),
  ]);

  const publications: Publication[] = [...dates, ...sansDate]
    .map(({ content: c }) => {
      // `publishedAt` est un instant réel : on le ramène à l'heure murale.
      const wall = c.scheduledAt ?? new Date(c.publishedAt!.getTime() + WALL_OFFSET_MS);
      return { c, wall };
    })
    .filter(({ c, wall }) => visibleAuPortail({ ...c, wall }, maintenant))
    .map(({ c, wall }) => ({
      id: c.id,
      title: c.title,
      kind: CONTENT_KIND[c.kind] ?? c.kind,
      networks: networksOf(c),
      reseaux: networksLabel(c),
      wall,
      statut: statutPortail(c),
      echecs: reseauxEnEchec(c),
    }))
    .sort((a, b) => a.wall.getTime() - b.wall.getTime());

  const couvertures = await coversFor(publications.map((p) => p.id));

  const parJour = new Map<string, Publication[]>();
  for (const p of publications) {
    const k = ymd(p.wall);
    parJour.set(k, [...(parJour.get(k) ?? []), p]);
  }

  const duMois = publications.filter((p) => p.wall >= debutMois && p.wall < finMois);
  const compte = new Map<StatutPortail, number>();
  for (const p of duMois) compte.set(p.statut, (compte.get(p.statut) ?? 0) + 1);
  const aValider = compte.get("aValider") ?? 0;

  const titre = `${MOIS[debutMois.getUTCMonth()].charAt(0).toUpperCase()}${MOIS[debutMois.getUTCMonth()].slice(1)} ${debutMois.getUTCFullYear()}`;
  const href = (d: Date) => (moisParam(d) === moisParam(aujourdhui) ? "/portail/calendrier" : `/portail/calendrier?mois=${moisParam(d)}`);
  /** La page du contenu, avec de quoi revenir au bon mois. */
  const lien = (id: string) => `/portail/contenu/${id}?depuis=calendrier&mois=${moisParam(debutMois)}`;

  const cases = Array.from({ length: semaines * 7 }, (_, i) => plusJours(debutGrille, i));
  // Téléphone : les jours du mois qui ont quelque chose, et aujourd'hui même
  // vide, pour savoir où l'on en est.
  const joursListe = cases.filter(
    (d) => d >= debutMois && d < finMois && ((parJour.get(ymd(d))?.length ?? 0) > 0 || ymd(d) === ymd(aujourdhui)),
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-[2px]">
          <span className="eyebrow text-ink-3">{client.shortName}</span>
          <h1 className="text-[30px] leading-[1.1] font-bold tracking-[-0.03em] sm:text-[36px]">Calendrier</h1>
          <p className="text-base text-ink-2">Vos publications du mois, à l&apos;heure de La Réunion.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={href(precedent)} aria-label="Mois précédent" title="Mois précédent" className={rond}>
            <Icon name="chevronDown" size={16} className="rotate-90" />
          </Link>
          <span className="min-w-0 flex-1 text-center text-lead font-semibold sm:min-w-[150px] sm:flex-none">{titre}</span>
          <Link href={href(suivant)} aria-label="Mois suivant" title="Mois suivant" className={rond}>
            <Icon name="chevronDown" size={16} className="-rotate-90" />
          </Link>
          {moisCourant ? null : (
            <Link
              href="/portail/calendrier"
              className="rounded-full border border-line bg-paper px-4 py-[8px] text-base font-medium text-ink no-underline shadow-soft hover:border-line-strong hover:no-underline"
            >
              Aujourd&apos;hui
            </Link>
          )}
        </div>
      </div>

      {/* Ce qui attend le client passe devant : c'est la seule case du
          calendrier où il a quelque chose à faire. */}
      {aValider > 0 ? (
        <Link
          href="/portail/valider"
          className="flex items-center gap-3 rounded-[18px] border border-accent bg-gold-wash px-4 py-3 text-ink no-underline hover:no-underline"
        >
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-accent text-accent-ink">
            <Icon name="check" size={16} />
          </span>
          <span className="min-w-0 flex-1 text-base">
            <b className="font-semibold">
              {aValider} publication{aValider > 1 ? "s" : ""} de ce mois attend{aValider > 1 ? "ent" : ""} votre validation
            </b>
            <span className="text-ink-2"> · sans elle, rien ne part.</span>
          </span>
          <span className="flex flex-none items-center gap-1 rounded-full bg-night px-[14px] py-[7px] text-small font-semibold text-white">
            Valider
          </span>
        </Link>
      ) : null}

      {/* Le mois en un coup d'œil : un compteur par statut. */}
      {duMois.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {ORDRE_STATUTS.filter((s) => compte.get(s)).map((s) => (
            <span
              key={s}
              className="flex items-center gap-2 rounded-full border border-line bg-paper py-[5px] pr-3 pl-[10px] text-small text-ink shadow-soft"
            >
              <Point statut={s} />
              <b className="font-semibold tabular-nums">{compte.get(s)}</b> {STATUTS[s].label.toLowerCase()}
            </span>
          ))}
        </div>
      ) : null}

      {/* -------------------------------------------- ordinateur -------- */}
      <section className="hidden rounded-[26px] border border-line bg-paper p-4 shadow-soft lg:block">
        <div className="mb-2 grid grid-cols-7 gap-2">
          {JOURS.map((j) => (
            <span key={j} className="px-2 text-micro font-semibold tracking-wide text-ink-3 uppercase">
              {j}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {cases.map((d) => {
            const items = parJour.get(ymd(d)) ?? [];
            const dansLeMois = d >= debutMois && d < finMois;
            const estAujourdhui = ymd(d) === ymd(aujourdhui);
            const visibles = items.slice(0, 3);
            const autres = items.slice(3);
            return (
              <div
                key={ymd(d)}
                className={cn(
                  "flex min-h-[132px] min-w-0 flex-col gap-1 rounded-[16px] border p-[6px]",
                  estAujourdhui
                    ? "border-night ring-1 ring-night"
                    : dansLeMois
                      ? "border-line"
                      : "border-transparent bg-mute/60",
                )}
              >
                <span className="flex items-center justify-between px-1">
                  <span
                    className={cn(
                      "flex h-7 min-w-7 items-center justify-center rounded-full text-small font-semibold tabular-nums",
                      estAujourdhui ? "bg-night px-2 text-white" : dansLeMois ? "text-ink" : "text-ink-3",
                    )}
                  >
                    {d.getUTCDate()}
                  </span>
                  {estAujourdhui ? <span className="text-micro font-semibold text-ink">Aujourd&apos;hui</span> : null}
                </span>
                <span className={cn("flex flex-col gap-1", dansLeMois ? "" : "opacity-60")}>
                  {visibles.map((p) => (
                    <Pastille key={p.id} p={p} href={lien(p.id)} cover={couvertures.get(p.id)} />
                  ))}
                  {autres.length > 0 ? (
                    // Pas de script pour « voir plus » : le navigateur sait
                    // déplier un <details> tout seul.
                    <details className="group">
                      <summary className="cursor-pointer list-none rounded-full bg-mute py-[3px] text-center text-micro font-semibold text-ink-2 hover:text-ink group-open:mb-1 [&::-webkit-details-marker]:hidden">
                        <span className="group-open:hidden">+{autres.length} autre{autres.length > 1 ? "s" : ""}</span>
                        <span className="hidden group-open:inline">Réduire</span>
                      </summary>
                      <span className="flex flex-col gap-1">
                        {autres.map((p) => (
                          <Pastille key={p.id} p={p} href={lien(p.id)} cover={couvertures.get(p.id)} />
                        ))}
                      </span>
                    </details>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* -------------------------------------------- téléphone --------- */}
      <div className="flex flex-col gap-4 lg:hidden">
        {/* Le mois en points : de quoi voir les jours chargés, et y sauter. */}
        <section className="rounded-[26px] border border-line bg-paper p-3 shadow-soft">
          <div className="grid grid-cols-7 gap-y-1 text-center">
            {JOURS.map((j) => (
              <span key={j} className="text-micro font-semibold text-ink-3">
                {j.charAt(0)}
              </span>
            ))}
            {cases.map((d) => {
              const items = parJour.get(ymd(d)) ?? [];
              const dansLeMois = d >= debutMois && d < finMois;
              const estAujourdhui = ymd(d) === ymd(aujourdhui);
              const contenu = (
                <>
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full text-small tabular-nums",
                      estAujourdhui ? "bg-night font-bold text-white" : dansLeMois ? "text-ink" : "text-ink-3/60",
                    )}
                  >
                    {d.getUTCDate()}
                  </span>
                  <span className="flex h-[6px] items-center gap-[2px]">
                    {dansLeMois
                      ? items.slice(0, 3).map((p) => <span key={p.id} className={cn("h-[5px] w-[5px] rounded-full", STATUTS[p.statut].point)} />)
                      : null}
                  </span>
                </>
              );
              return dansLeMois && items.length > 0 ? (
                <a key={ymd(d)} href={`#j-${ymd(d)}`} className="flex flex-col items-center gap-[2px] no-underline hover:no-underline">
                  {contenu}
                </a>
              ) : (
                <span key={ymd(d)} className="flex flex-col items-center gap-[2px]">
                  {contenu}
                </span>
              );
            })}
          </div>
        </section>

        {joursListe.map((d) => {
          const items = parJour.get(ymd(d)) ?? [];
          const estAujourdhui = ymd(d) === ymd(aujourdhui);
          return (
            <section key={ymd(d)} id={`j-${ymd(d)}`} className="flex scroll-mt-40 flex-col gap-2">
              <h2 className="flex items-baseline gap-2 px-1 text-lead font-semibold">
                <span>
                  {JOURS_LONGS[rangSemaine(d)].charAt(0).toUpperCase()}
                  {JOURS_LONGS[rangSemaine(d)].slice(1)} {d.getUTCDate()} {MOIS[d.getUTCMonth()]}
                </span>
                {estAujourdhui ? (
                  <span className="rounded-full bg-night px-2 py-[1px] text-micro font-semibold text-white">Aujourd&apos;hui</span>
                ) : null}
              </h2>
              {items.length === 0 ? (
                <p className="rounded-[18px] bg-mute px-4 py-3 text-base text-ink-2">Rien de prévu aujourd&apos;hui.</p>
              ) : (
                items.map((p) => <Ligne key={p.id} p={p} href={lien(p.id)} cover={couvertures.get(p.id)} />)
              )}
            </section>
          );
        })}
      </div>

      {duMois.length === 0 ? (
        <p className="rounded-[18px] border border-line bg-paper px-5 py-4 text-base text-ink-2 shadow-soft">
          Rien de prévu en {MOIS[debutMois.getUTCMonth()]} pour le moment. Les publications apparaissent ici dès
          qu&apos;elles ont une date.
        </p>
      ) : null}

      {/* La légende : ce que veut dire chaque couleur, en une phrase. */}
      <section className="rounded-[26px] border border-line bg-paper p-5 shadow-soft">
        <h2 className="mb-3 text-lead font-semibold">Légende</h2>
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          {ORDRE_STATUTS.map((s) => (
            <span key={s} className="flex items-start gap-[10px]">
              <Point statut={s} className="mt-[5px]" />
              <span className="flex min-w-0 flex-col">
                <span className="text-base font-semibold text-ink">{STATUTS[s].label}</span>
                <span className="text-small text-ink-3">{STATUTS[s].aide}</span>
              </span>
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

const rond =
  "flex h-10 w-10 flex-none items-center justify-center rounded-full border border-line bg-paper text-ink no-underline shadow-soft hover:border-line-strong hover:no-underline";

function Point({ statut, className }: { statut: StatutPortail; className?: string }) {
  return <span className={cn("h-[10px] w-[10px] flex-none rounded-full", STATUTS[statut].point, className)} />;
}

/** « Publié en partie · échec sur Facebook », pour l'infobulle et la liste. */
function libelle(p: Publication) {
  const base = STATUTS[p.statut].label;
  return p.echecs.length && (p.statut === "partiel" || p.statut === "echec") ? `${base} · échec sur ${p.echecs.join(", ")}` : base;
}

/** Une publication dans une case de la grille : visuel, heure, réseaux, titre, statut. */
function Pastille({ p, href, cover }: { p: Publication; href: string; cover: { id: string; mimeType: string } | undefined }) {
  const s = STATUTS[p.statut];
  return (
    <Link
      href={href}
      title={`${hhmm(p.wall)} · ${p.title} · ${p.kind} · ${p.reseaux} · ${libelle(p)}`}
      className={cn("flex min-w-0 items-center gap-[6px] rounded-[11px] p-1 no-underline hover:no-underline hover:brightness-[1.04]", s.pastille)}
    >
      <Cover asset={cover} ratio="1/1" sizes="32px" className="w-8 flex-none rounded-[8px]" label=" " />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1">
          <span className="text-micro font-bold tabular-nums">{hhmm(p.wall)}</span>
          <NetworkStack networks={p.networks} size={14} />
        </span>
        <span className="clip text-micro leading-tight font-medium">{p.title}</span>
        <span className="clip text-[10px] leading-tight font-semibold opacity-80">{s.label}</span>
      </span>
    </Link>
  );
}

/** Une publication dans la liste du téléphone : tout en clair, sur une ligne. */
function Ligne({ p, href, cover }: { p: Publication; href: string; cover: { id: string; mimeType: string } | undefined }) {
  const s = STATUTS[p.statut];
  return (
    <Link
      href={href}
      className="flex min-w-0 items-center gap-3 rounded-[18px] border border-line bg-paper p-2 pr-3 no-underline shadow-soft hover:border-line-strong hover:no-underline"
    >
      <Cover asset={cover} ratio="1/1" sizes="56px" className="w-[52px] flex-none rounded-[12px]" label=" " />
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="flex min-w-0 items-center gap-2">
          <span className="text-base font-bold tabular-nums text-ink">{hhmm(p.wall)}</span>
          <NetworkStack networks={p.networks} size={18} />
          <span className="clip min-w-0 text-small text-ink-3">{p.reseaux}</span>
        </span>
        <span className="clip text-base font-medium text-ink">{p.title}</span>
        <span className="flex min-w-0 items-center gap-[6px]">
          <span className={cn("inline-flex min-w-0 items-center gap-[6px] rounded-full px-[9px] py-[2px] text-small font-semibold", s.pastille)}>
            <span className="clip">{libelle(p)}</span>
          </span>
        </span>
      </span>
      {p.statut === "aValider" ? (
        <span className="flex flex-none items-center rounded-full bg-night px-3 py-[6px] text-small font-semibold text-white">Valider</span>
      ) : (
        <Icon name="chevronDown" size={16} className="flex-none -rotate-90 text-ink-3" />
      )}
    </Link>
  );
}
