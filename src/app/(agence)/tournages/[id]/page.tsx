import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/Screen";
import { Card, CardHead, Kpi, KpiGrid } from "@/components/ui/Card";
import { Avatar, Eyebrow, StatusPill } from "@/components/ui/primitives";
import { requireStaff } from "@/lib/auth";
import { getShoot, listStaff } from "@/db/queries";
import { durationHours, readiness, SHOOT_STATUS, SHOOT_STATUSES, slotLabel } from "@/data/shoot";
import { isVideo } from "@/lib/storage";
import { CheckList } from "./CheckList";
import {
  addCrew,
  addDeliverable,
  addGear,
  addRight,
  addShot,
  deleteShoot,
  removeCrew,
  removeDeliverable,
  removeGear,
  removeRight,
  removeShot,
  toggleCrew,
  toggleDeliverable,
  toggleGear,
  toggleRight,
  toggleShot,
  updateShoot,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function ShootPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;

  const [data, staff] = await Promise.all([getShoot(id), listStaff()]);
  if (!data) notFound();

  const { shoot, client, shots, gear, rights, deliverables, crew, media } = data;
  const status = SHOOT_STATUS[shoot.status];
  const hours = durationHours(shoot.startsAt, shoot.endsAt);

  const state = readiness({
    shots: shots.length,
    gearTotal: gear.length,
    gearReserved: gear.filter((g) => g.reserved).length,
    rightsTotal: rights.length,
    rightsSigned: rights.filter((r) => r.signed).length,
    crew: crew.length,
  });

  const shotsDone = shots.filter((s) => s.done).length;
  const assigned = new Set(crew.map((c) => c.userId));
  const available = staff.filter((u) => !assigned.has(u.id));

  return (
    <>
      <PageHeader
        title={shoot.title}
        sub={`${client.shortName} · ${slotLabel(shoot.startsAt, shoot.endsAt)}${
          shoot.place ? ` · ${shoot.place}` : ""
        }`}
      >
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
        <Link
          href="/tournages"
          className="rounded-control border border-line bg-paper px-[11px] py-[7px] text-small font-medium text-ink-2 no-underline hover:border-line-strong hover:text-ink hover:no-underline"
        >
          Retour au planning
        </Link>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-auto px-5 pt-4 pb-6">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4">
          {/* Ce qui bloque le départ, avant tout le reste : c'est la seule
              information qui change ce qu'on fait dans l'heure. */}
          <Card
            className={`px-5 py-4 ${state.ready ? "" : "border-warn bg-warn-bg"}`}
          >
            {state.ready ? (
              <p className="text-lead text-ok">
                Tout est prêt pour le départ : équipe assignée, shotlist établie, matériel réservé
                et autorisations signées.
              </p>
            ) : (
              <>
                <Eyebrow tone="warn">Avant le départ</Eyebrow>
                <p className="mt-1 text-lead text-warn">
                  {state.blocking.length} point{state.blocking.length > 1 ? "s" : ""} à traiter :{" "}
                  {state.blocking.join(", ")}.
                </p>
              </>
            )}
          </Card>

          <KpiGrid columns={4}>
            <Kpi
              label="Créneau"
              value={shoot.startsAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              meta={hours ? `${hours} h sur place` : "fin à préciser"}
            />
            <Kpi
              label="Shotlist"
              value={`${shotsDone} / ${shots.length}`}
              valueTone={shots.length > 0 && shotsDone === shots.length ? "ok" : "ink"}
              meta="plans tournés"
            />
            <Kpi
              label="Matériel"
              value={`${gear.filter((g) => g.reserved).length} / ${gear.length}`}
              valueTone={gear.length > gear.filter((g) => g.reserved).length ? "warn" : "ok"}
              meta="réservé"
            />
            <Kpi
              label="Droit à l'image"
              value={`${rights.filter((r) => r.signed).length} / ${rights.length}`}
              valueTone={rights.length > rights.filter((r) => r.signed).length ? "warn" : "ok"}
              meta="autorisations signées"
            />
          </KpiGrid>

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <CheckList
              title="Shotlist"
              meta={`${shotsDone}/${shots.length}`}
              items={shots.map((s) => ({
                id: s.id,
                label: s.label,
                aside: s.kind ?? undefined,
                done: s.done,
              }))}
              shootId={shoot.id}
              toggleAction={toggleShot}
              removeAction={removeShot}
              addAction={addShot}
              addFields={[
                { name: "label", placeholder: "Yohan en démonstration", required: true },
                { name: "kind", placeholder: "Vidéo", width: "w-[90px] flex-none" },
              ]}
              addLabel="Ajouter un plan"
              hint="Cochable depuis le mobile pendant le tournage."
              empty="Aucun plan pour l'instant. Une shotlist écrite avant de partir évite de rentrer sans le plan qu'on croyait avoir."
            />

            <CheckList
              title="Matériel"
              meta={`${gear.filter((g) => g.reserved).length}/${gear.length}`}
              items={gear.map((g) => ({
                id: g.id,
                label: g.label,
                aside: g.reserved ? "Réservé" : "Non réservé",
                done: g.reserved,
                pendingIsBlocking: true,
              }))}
              shootId={shoot.id}
              toggleAction={toggleGear}
              removeAction={removeGear}
              addAction={addGear}
              addFields={[{ name: "label", placeholder: "Boîtier A7 IV + 24-70", required: true }]}
              addLabel="Ajouter"
              hint="Le matériel non réservé bloque le départ : il peut être pris ailleurs le jour même."
              empty="Aucun matériel listé."
            />

            <CheckList
              title="Droit à l'image"
              meta={`${rights.filter((r) => r.signed).length}/${rights.length}`}
              items={rights.map((r) => ({
                id: r.id,
                label: r.person,
                aside: r.signed ? "Signée" : "Non signée",
                done: r.signed,
                pendingIsBlocking: true,
              }))}
              shootId={shoot.id}
              toggleAction={toggleRight}
              removeAction={removeRight}
              addAction={addRight}
              addFields={[{ name: "person", placeholder: "Nom de la personne filmée", required: true }]}
              addLabel="Ajouter"
              hint="Une autorisation manquante fait retirer une publication après coup, parfois des semaines plus tard."
              empty="Personne d'identifiable n'est prévu à l'image, ou les autorisations restent à lister."
            />

            <CheckList
              title="Livrables attendus"
              meta={`${deliverables.filter((d) => d.delivered).length}/${deliverables.length}`}
              items={deliverables.map((d) => ({
                id: d.id,
                label: d.label,
                aside: d.dueOn
                  ? new Date(`${d.dueOn}T00:00:00`).toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                    })
                  : undefined,
                done: d.delivered,
              }))}
              shootId={shoot.id}
              toggleAction={toggleDeliverable}
              removeAction={removeDeliverable}
              addAction={addDeliverable}
              addFields={[
                { name: "label", placeholder: "3 reels · 1 série photo", required: true },
                { name: "dueOn", placeholder: "", type: "date", width: "w-[150px] flex-none" },
              ]}
              addLabel="Ajouter"
              empty="Ce qui doit sortir du tournage n'est pas encore écrit."
            />
          </div>

          <Card>
            <CardHead title="Équipe" meta={`${crew.length}`} />
            {crew.length === 0 ? (
              <p className="px-[14px] py-4 text-base text-ink-2">
                Personne n&apos;est assigné. Un tournage sans équipe nommée est un tournage que
                personne ne prépare.
              </p>
            ) : (
              crew.map((c) => (
                <div
                  key={c.userId}
                  className="flex items-center gap-3 border-b border-line px-[14px] py-2"
                >
                  <Avatar initials={c.initials} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="clip text-base font-medium">{c.name}</span>
                    {c.roleLabel ? (
                      <span className="clip text-small text-ink-3">{c.roleLabel}</span>
                    ) : null}
                  </span>
                  <form action={toggleCrew}>
                    <input type="hidden" name="shootId" value={shoot.id} />
                    <input type="hidden" name="userId" value={c.userId} />
                    <button
                      type="submit"
                      className={`cursor-pointer rounded-control border px-2 py-1 text-small ${
                        c.state === "Confirmé"
                          ? "border-ok bg-ok-bg text-ok"
                          : "border-line bg-paper text-ink-2 hover:border-line-strong hover:text-ink"
                      }`}
                    >
                      {c.state}
                    </button>
                  </form>
                  <form action={removeCrew}>
                    <input type="hidden" name="shootId" value={shoot.id} />
                    <input type="hidden" name="userId" value={c.userId} />
                    <button
                      type="submit"
                      title="Retirer"
                      className="cursor-pointer rounded-control border border-line bg-paper px-[6px] py-[2px] text-micro text-ink-3 hover:border-alert hover:text-alert"
                    >
                      ✕
                    </button>
                  </form>
                </div>
              ))
            )}

            {available.length > 0 ? (
              <form action={addCrew} className="flex flex-wrap items-center gap-2 px-[14px] py-3">
                <input type="hidden" name="shootId" value={shoot.id} />
                <select
                  name="userId"
                  required
                  defaultValue=""
                  className="rounded-control border border-line bg-paper px-2 py-[6px] text-small outline-none focus:border-gold"
                >
                  <option value="" disabled>
                    Qui part ?
                  </option>
                  {available.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <input
                  name="roleLabel"
                  placeholder="Cadre, son, photo…"
                  className="min-w-0 flex-1 rounded-control border border-line bg-paper px-2 py-[6px] text-small outline-none focus:border-gold"
                />
                <button
                  type="submit"
                  className="cursor-pointer rounded-control border border-line bg-paper px-[10px] py-[6px] text-small font-medium text-ink-2 hover:border-line-strong hover:text-ink"
                >
                  Assigner
                </button>
              </form>
            ) : (
              <p className="px-[14px] py-3 text-small text-ink-3">
                Toute l&apos;équipe est déjà assignée à ce tournage.
              </p>
            )}
          </Card>

          {media.length > 0 ? (
            <Card>
              <CardHead title="Médias issus de ce tournage" meta={`${media.length}`} />
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 p-[14px]">
                {media.map((a) => (
                  <a
                    key={a.id}
                    href={`/api/media/${a.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex flex-col overflow-hidden rounded-card border border-line no-underline hover:border-line-strong hover:no-underline"
                  >
                    <span className="relative block aspect-4/5 bg-slot">
                      {isVideo(a.mimeType) ? (
                        <span className="flex h-full items-center justify-center">
                          <Eyebrow>Vidéo</Eyebrow>
                        </span>
                      ) : (
                        <Image
                          src={`/api/media/${a.id}?format=thumb`}
                          alt={a.filename}
                          fill
                          sizes="180px"
                          className="object-cover"
                          unoptimized
                        />
                      )}
                    </span>
                    <span className="clip px-2 py-2 text-small text-ink">{a.filename}</span>
                  </a>
                ))}
              </div>
            </Card>
          ) : null}

          <Card className="flex flex-col gap-4 p-5">
            <div>
              <Eyebrow>Fiche</Eyebrow>
              <h2 className="text-title font-semibold">Lieu, état et notes</h2>
            </div>
            <form action={updateShoot} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={shoot.id} />
              <label className="flex flex-col gap-[6px]">
                <span className="eyebrow text-ink-3">État</span>
                <select
                  name="status"
                  defaultValue={shoot.status}
                  className="rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold"
                >
                  {SHOOT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {SHOOT_STATUS[s].label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-[200px] flex-1 flex-col gap-[6px]">
                <span className="eyebrow text-ink-3">Lieu</span>
                <input
                  name="place"
                  defaultValue={shoot.place ?? ""}
                  className="rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold"
                />
              </label>
              <label className="flex min-w-[240px] flex-[2] flex-col gap-[6px]">
                <span className="eyebrow text-ink-3">Note</span>
                <input
                  name="note"
                  defaultValue={shoot.note ?? ""}
                  placeholder="Parking à l'arrière, demander Kevin à l'accueil"
                  className="rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold"
                />
              </label>
              <button
                type="submit"
                className="cursor-pointer rounded-control border border-ink bg-ink px-3 py-2 text-base font-medium text-paper hover:bg-black"
              >
                Enregistrer
              </button>
            </form>
          </Card>

          <Card className="flex items-center justify-between gap-4 p-5">
            <p className="text-base text-ink-2">
              Supprimer ce tournage retire aussi sa shotlist, son matériel et ses autorisations.
              Pour un tournage qui n&apos;a pas eu lieu, préférer l&apos;état « Annulé » : la trace
              reste.
            </p>
            <form action={deleteShoot}>
              <input type="hidden" name="id" value={shoot.id} />
              <button
                type="submit"
                className="flex-none cursor-pointer rounded-control border border-line bg-paper px-3 py-2 text-base text-ink-3 hover:border-alert hover:text-alert"
              >
                Supprimer
              </button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
