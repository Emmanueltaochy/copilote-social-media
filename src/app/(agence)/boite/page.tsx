import Link from "next/link";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { clients, db } from "@/db";
import { requireDepartment } from "@/lib/auth";
import { listBrands, metricoolStatus } from "@/lib/metricool";
import { loadInbox, type InboxThread } from "@/lib/metricool-inbox";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { ClientChip, NetworkDot, Panel, ago } from "@/components/home/bits";
import { actualiser } from "./actions";
import { Reply } from "./Reply";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "", label: "Tout" },
  { key: "repondre", label: "À répondre" },
  { key: "messages", label: "Messages" },
  { key: "commentaires", label: "Commentaires" },
] as const;

/** Le dernier mot n'est pas le nôtre : quelqu'un attend une réponse. */
const waiting = (t: InboxThread) => !(t.messages.at(-1)?.mine ?? false);

/**
 * Boîte de réception — messages privés et commentaires de tous les comptes
 * clients, au même endroit, avec la réponse sur place.
 */
export default async function BoitePage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; client?: string; t?: string }>;
}) {
  await requireDepartment("social");
  const sp = await searchParams;
  const mc = await metricoolStatus();

  const linked = await db
    .select({ id: clients.id, name: clients.shortName, brandId: clients.metricoolBrandId })
    .from(clients)
    .where(and(eq(clients.active, true), isNotNull(clients.metricoolBrandId)))
    .orderBy(asc(clients.shortName));

  if (!mc.connected || linked.length === 0) {
    return (
      <div className="min-h-0 flex-1 overflow-auto px-4 pt-1 pb-10 lg:px-7">
        <h1 className="mb-5 text-[34px] font-bold tracking-[-0.03em] lg:text-[40px]">Boîte de réception</h1>
        <Panel title="À raccorder">
          <p className="text-base text-ink-2">
            Les messages et commentaires arrivent de Metricool : raccordez-le et reliez vos clients à leur marque.
          </p>
          <Link href="/reglages" className="mt-4 w-fit rounded-full bg-night px-4 py-2 text-base font-medium text-white no-underline hover:no-underline">
            Réglages → Metricool
          </Link>
        </Panel>
      </div>
    );
  }

  const brands = await listBrands();
  const scope = linked
    .filter((c) => !sp.client || c.id === sp.client)
    .map((c) => {
      const b = brands.find((x) => x.id === c.brandId);
      return b ? { clientId: c.id, clientName: c.name, brandId: b.id, networks: b.networks } : null;
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const { threads, errors } = await loadInbox(scope);
  const f = sp.f ?? "";
  const shown = threads.filter((t) =>
    f === "repondre" ? waiting(t) : f === "messages" ? t.kind === "message" : f === "commentaires" ? t.kind === "commentaire" : true,
  );
  const current = shown.find((t) => t.key === sp.t) ?? shown[0];
  const counts = {
    "": threads.length,
    repondre: threads.filter(waiting).length,
    messages: threads.filter((t) => t.kind === "message").length,
    commentaires: threads.filter((t) => t.kind === "commentaire").length,
  } as Record<string, number>;

  const href = (o: { f?: string; t?: string; client?: string | null }) => {
    const q = new URLSearchParams();
    const ff = o.f ?? f;
    if (ff) q.set("f", ff);
    const c = o.client === undefined ? sp.client : o.client;
    if (c) q.set("client", c);
    if (o.t) q.set("t", o.t);
    const s = q.toString();
    return `/boite${s ? `?${s}` : ""}`;
  };
  const draftOnly = process.env.METRICOOL_DRAFT_ONLY === "1";

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pt-1 pb-4 lg:px-7">
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <h1 className="text-[34px] leading-[1.05] font-bold tracking-[-0.03em] lg:text-[40px]">Boîte de réception</h1>
        <span className="text-base text-ink-3">
          {counts.repondre} à répondre · {threads.length} conversations · {scope.length} compte{scope.length > 1 ? "s" : ""}
        </span>
        <form action={actualiser} className="ml-auto">
          <input type="hidden" name="brands" value={scope.map((s) => s.brandId).join(",")} />
          <button type="submit" className="flex cursor-pointer items-center gap-2 rounded-full border border-line bg-paper px-4 py-2 text-base text-ink hover:border-line-strong">
            <Icon name="activity" size={15} /> Actualiser
          </button>
        </form>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {FILTERS.map((x) => (
          <Link
            key={x.key}
            href={href({ f: x.key })}
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-[6px] text-small font-medium no-underline hover:no-underline",
              f === x.key ? "border-night bg-night text-white" : "border-line bg-paper text-ink hover:border-line-strong",
            )}
          >
            {x.label} <span className={f === x.key ? "text-white/70" : "text-ink-3"}>{counts[x.key]}</span>
          </Link>
        ))}
        <span className="mx-1 h-5 w-px bg-line" />
        {linked.map((c) => (
          <Link
            key={c.id}
            href={href({ client: sp.client === c.id ? null : c.id })}
            title={c.name}
            className={cn("rounded-full p-[2px] no-underline", sp.client === c.id ? "ring-2 ring-ink" : "opacity-80 hover:opacity-100")}
          >
            <ClientChip name={c.name} size={26} />
          </Link>
        ))}
      </div>

      {errors.length ? <p className="mb-2 text-small text-warn">Certains comptes n&apos;ont pas répondu : {errors.slice(0, 3).join(" · ")}</p> : null}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
        {/* Liste */}
        <div className="flex min-h-[300px] flex-col overflow-hidden rounded-[26px] border border-line bg-paper shadow-soft">
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {shown.length === 0 ? <p className="p-4 text-base text-ink-3">Rien ici. Belle boîte vide.</p> : null}
            {shown.map((t) => {
              const last = t.messages.at(-1);
              return (
                <Link
                  key={t.key}
                  href={href({ t: t.key })}
                  className={cn(
                    "flex gap-3 rounded-[16px] p-3 text-ink no-underline hover:bg-mute hover:no-underline",
                    current?.key === t.key && "bg-mute",
                  )}
                >
                  <span className="relative flex-none">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slot text-small font-bold text-ink-2 uppercase">
                      {t.who.slice(0, 2)}
                    </span>
                    <span className="absolute -right-1 -bottom-1">
                      <NetworkDot network={t.network} size={18} />
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-2">
                      <span className="clip text-base font-semibold">{t.who}</span>
                      {waiting(t) ? <span className="h-2 w-2 flex-none rounded-full bg-alert" title="À répondre" /> : null}
                      <span className="ml-auto flex-none text-micro text-ink-3">{ago(new Date(t.updatedAt), new Date())}</span>
                    </span>
                    <span className="clip text-small text-ink-2">{last?.text ?? ""}</span>
                    <span className="mt-1 flex items-center gap-2 text-micro text-ink-3">
                      <ClientChip name={t.clientName} size={16} /> {t.clientName} · {t.kind === "message" ? "Message privé" : "Commentaire"}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Conversation */}
        <div className="flex min-h-[400px] flex-col overflow-hidden rounded-[26px] border border-line bg-paper shadow-soft">
          {current ? (
            <>
              <div className="flex items-center gap-3 border-b border-line p-4">
                <NetworkDot network={current.network} size={30} />
                <span className="flex min-w-0 flex-col">
                  <span className="text-lead font-semibold">{current.who}</span>
                  <span className="text-small text-ink-3">
                    {current.clientName} · {current.kind === "message" ? "Message privé" : "Commentaire"}
                  </span>
                </span>
                {current.link ? (
                  <a href={current.link} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 rounded-full border border-line px-3 py-[6px] text-small text-ink no-underline hover:no-underline">
                    Voir la publication <Icon name="arrowUpRight" size={14} />
                  </a>
                ) : null}
              </div>
              {current.postText ? (
                <p className="m-4 mb-0 rounded-[14px] bg-mute px-3 py-2 text-small text-ink-2">
                  <span className="line-clamp-2">Sous : « {current.postText} »</span>
                </p>
              ) : null}
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
                {current.messages.map((m) => (
                  <div key={m.id} className={cn("flex max-w-[80%] flex-col gap-1", m.mine ? "self-end items-end" : "self-start")}>
                    <span
                      className={cn(
                        "rounded-[18px] px-4 py-2 text-base whitespace-pre-wrap",
                        m.mine ? "rounded-br-[6px] bg-night text-white" : "rounded-bl-[6px] bg-mute text-ink",
                      )}
                    >
                      {m.text}
                    </span>
                    <span className="text-micro text-ink-3">
                      {m.author} · {new Date(m.at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Indian/Reunion" })}
                    </span>
                  </div>
                ))}
              </div>
              <Reply
                disabled={draftOnly}
                hidden={{
                  kind: current.kind,
                  provider: current.provider,
                  brandId: current.brandId,
                  id: current.id,
                  recipient: current.recipient ?? "",
                  objectId: current.objectId ?? "",
                }}
              />
            </>
          ) : (
            <p className="p-6 text-base text-ink-3">Choisissez une conversation.</p>
          )}
        </div>
      </div>
    </div>
  );
}
