import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, notifications } from "@/db";
import { requireVideaste } from "@/lib/auth";
import { wallNow } from "@/lib/publication";
import { estAVenir } from "@/lib/tournages";
import { creneauDit, dansCombien, jourLong } from "@/lib/tournages-regles";
import { mesTournages } from "@/lib/videaste";
import { MarquerVuesVideaste } from "./Gestes";

export const dynamic = "force-dynamic";

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * « Mes tournages » : ceux où le vidéaste est dans l'équipe, à venir d'abord
 * (le plus proche en haut), puis les passés. Rien d'autre de l'agence.
 */
export default async function MesTournages() {
  const user = await requireVideaste();
  const maintenant = wallNow();
  const [tous, nouveautes] = await Promise.all([
    mesTournages(user.id),
    db
      .select({ id: notifications.id, title: notifications.title, href: notifications.href })
      .from(notifications)
      .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)))
      .orderBy(desc(notifications.createdAt))
      .limit(5),
  ]);
  const aVenir = tous.filter((s) => s.status !== "annule" && estAVenir(s, maintenant));
  const passes = tous.filter((s) => !aVenir.includes(s)).reverse();

  return (
    <div className="flex flex-col gap-5">
      {nouveautes.length ? <MarquerVuesVideaste /> : null}
      <div className="flex flex-col gap-1">
        <span className="eyebrow text-ink-3">Bonjour {user.name.split(/\s+/)[0]}</span>
        <h1 className="text-[30px] leading-[1.05] font-bold tracking-[-0.03em]">Mes tournages</h1>
      </div>

      {nouveautes.length ? (
        <section className="flex flex-col gap-1 rounded-card border border-line bg-paper px-4 py-3 shadow-soft" data-nouveautes-videaste>
          <span className="text-base font-semibold">Du nouveau</span>
          {nouveautes.map((n) => (
            <span key={n.id} className="text-small break-words text-ink-2">
              {n.title}
            </span>
          ))}
        </section>
      ) : null}

      <section className="flex flex-col gap-3" aria-label="À venir">
        <h2 className="text-lead font-semibold">À venir · {aVenir.length}</h2>
        {aVenir.length === 0 ? (
          <p className="rounded-card border border-dashed border-line px-4 py-5 text-base text-ink-2">
            Aucun tournage prévu pour vous. L&apos;agence vous préviendra dès qu&apos;elle vous ajoute à une équipe.
          </p>
        ) : (
          aVenir.map((s, i) => (
            <Link
              key={s.id}
              href={`/videaste/${s.id}`}
              data-mon-tournage={s.id}
              className={`flex flex-col gap-2 rounded-card border p-4 no-underline shadow-soft hover:no-underline ${
                i === 0 ? "border-night bg-night text-white" : "border-line bg-paper text-ink hover:border-line-strong"
              }`}
            >
              <span className={`text-small font-semibold ${i === 0 ? "text-gold" : "text-ink-3"}`}>
                {i === 0 ? "Prochain · " : ""}
                {dansCombien(s.startsAt, maintenant)}
              </span>
              <span className="text-[22px] leading-tight font-bold tracking-[-0.02em] break-words">
                {majuscule(jourLong(s.startsAt))} · {creneauDit(s.startsAt, s.endsAt)}
              </span>
              <span className={`text-base break-words ${i === 0 ? "text-white" : "text-ink"}`}>
                {s.client} · {s.title}
              </span>
              {s.place ? <span className={`text-small break-words ${i === 0 ? "text-night-ink" : "text-ink-3"}`}>{s.place}</span> : null}
              <span className={`text-small ${i === 0 ? "text-night-ink" : "text-ink-3"}`}>
                {s.videos} vidéo{s.videos > 1 ? "s" : ""} prévue{s.videos > 1 ? "s" : ""}
                {s.tournees ? ` · ${s.tournees} tournée${s.tournees > 1 ? "s" : ""}` : ""}
                {s.roleLabel ? ` · vous : ${s.roleLabel}` : ""}
              </span>
            </Link>
          ))
        )}
      </section>

      {passes.length ? (
        <details className="rounded-card border border-line bg-paper p-4 shadow-soft">
          <summary className="flex min-h-11 cursor-pointer items-center text-lead font-semibold">Passés · {passes.length}</summary>
          <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
            {passes.map((s) => (
              <li key={s.id}>
                <Link href={`/videaste/${s.id}`} className="flex min-h-11 flex-col justify-center border-t border-line py-2 text-ink no-underline hover:no-underline">
                  <span className="text-base font-medium break-words">
                    {majuscule(jourLong(s.startsAt))} · {s.client}
                  </span>
                  <span className="text-small break-words text-ink-3">
                    {s.title}
                    {s.status === "annule" ? " · annulé" : ""} · {s.tournees}/{s.videos} vidéo{s.videos > 1 ? "s" : ""} tournée{s.tournees > 1 ? "s" : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
