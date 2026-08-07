import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckBox } from "@/components/ui/primitives";
import { requireStaff } from "@/lib/auth";
import { getShoot } from "@/db/queries";
import { readiness, SHOOT_STATUS, slotLabel } from "@/data/shoot";
import {
  toggleDeliverable,
  toggleGear,
  toggleRight,
  toggleShot,
} from "@/app/(agence)/tournages/actions";

export const dynamic = "force-dynamic";

/**
 * La fiche tournage sur le terrain.
 *
 * Tout est cochable au pouce, rien n'est modifiable autrement : sur place on
 * constate, on ne prépare plus. Ajouter un plan, changer le lieu ou assigner
 * quelqu'un se fait au bureau — proposer ces gestes ici encombrerait l'écran
 * de champs qu'on ne remplit jamais debout.
 *
 * Les listes sont dans l'ordre où l'on s'en sert : le matériel et les
 * autorisations avant de partir, la shotlist pendant, les livrables après.
 */
/** Une ligne cochable, assez haute pour être touchée sans viser. */
function Ligne({
  id,
  shootId,
  label,
  aside,
  done,
  action,
}: {
  id: string;
  shootId: string;
  label: string;
  aside?: string;
  done: boolean;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={action} className="border-b border-line last:border-b-0">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="shootId" value={shootId} />
      <button
        type="submit"
        className="flex w-full cursor-pointer items-center gap-3 border-none bg-transparent px-3 py-[14px] text-left"
      >
        <CheckBox checked={done} />
        <span className={`min-w-0 flex-1 text-base ${done ? "text-ink-3 line-through" : "text-ink"}`}>
          {label}
        </span>
        {aside ? <span className="flex-none text-small text-ink-3">{aside}</span> : null}
      </button>
    </form>
  );
}

function Bloc({
  titre,
  compteur,
  vide,
  children,
}: {
  titre: string;
  compteur: string;
  vide: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-card border border-line bg-paper">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <span className="eyebrow text-ink-3">{titre}</span>
        <span className="text-small tabular-nums text-ink-3">{compteur}</span>
      </div>
      {children ?? <p className="px-3 py-4 text-base text-ink-2">{vide}</p>}
    </section>
  );
}

export default async function TerrainShootPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;

  const data = await getShoot(id);
  if (!data) notFound();

  const { shoot, client, shots, gear, rights, deliverables, crew } = data;
  const state = readiness({
    shots: shots.length,
    gearTotal: gear.length,
    gearReserved: gear.filter((g) => g.reserved).length,
    rightsTotal: rights.length,
    rightsSigned: rights.filter((r) => r.signed).length,
    crew: crew.length,
  });

  const shotsDone = shots.filter((s) => s.done).length;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <Link href="/terrain/tournages" className="text-small text-ink-3 no-underline">
          ← Tournages
        </Link>
        <span className="mt-2 block text-micro text-ink-3">
          {client.shortName} · {SHOOT_STATUS[shoot.status].label}
        </span>
        <h1 className="text-title leading-tight font-semibold">{shoot.title}</h1>
        <p className="mt-1 text-base text-ink-2">
          {slotLabel(shoot.startsAt, shoot.endsAt)}
          {shoot.place ? ` · ${shoot.place}` : ""}
        </p>
        {shoot.note ? <p className="mt-2 text-base text-ink-2">{shoot.note}</p> : null}
      </div>

      <div
        className={`rounded-card px-3 py-3 text-base ${
          state.ready ? "border border-ok bg-ok-bg text-ok" : "border border-warn bg-warn-bg text-warn"
        }`}
      >
        {state.ready
          ? "Tout est prêt pour le départ."
          : `À traiter : ${state.blocking.join(", ")}.`}
      </div>

      {crew.length > 0 ? (
        <p className="text-small text-ink-2">
          Équipe : {crew.map((c) => `${c.name}${c.roleLabel ? ` (${c.roleLabel})` : ""}`).join(", ")}
        </p>
      ) : null}

      <Bloc
        titre="Matériel"
        compteur={`${gear.filter((g) => g.reserved).length}/${gear.length}`}
        vide="Aucun matériel listé."
      >
        {gear.length > 0
          ? gear.map((g) => (
              <Ligne
                key={g.id}
                id={g.id}
                shootId={shoot.id}
                label={g.label}
                aside={g.reserved ? "Réservé" : "Non réservé"}
                done={g.reserved}
                action={toggleGear}
              />
            ))
          : null}
      </Bloc>

      <Bloc
        titre="Droit à l'image"
        compteur={`${rights.filter((r) => r.signed).length}/${rights.length}`}
        vide="Aucune autorisation à recueillir."
      >
        {rights.length > 0
          ? rights.map((r) => (
              <Ligne
                key={r.id}
                id={r.id}
                shootId={shoot.id}
                label={r.person}
                aside={r.signed ? "Signée" : "Non signée"}
                done={r.signed}
                action={toggleRight}
              />
            ))
          : null}
      </Bloc>

      <Bloc titre="Shotlist" compteur={`${shotsDone}/${shots.length}`} vide="Shotlist vide.">
        {shots.length > 0
          ? shots.map((s) => (
              <Ligne
                key={s.id}
                id={s.id}
                shootId={shoot.id}
                label={s.label}
                aside={s.kind ?? undefined}
                done={s.done}
                action={toggleShot}
              />
            ))
          : null}
      </Bloc>

      <Bloc
        titre="Livrables"
        compteur={`${deliverables.filter((d) => d.delivered).length}/${deliverables.length}`}
        vide="Aucun livrable listé."
      >
        {deliverables.length > 0
          ? deliverables.map((d) => (
              <Ligne
                key={d.id}
                id={d.id}
                shootId={shoot.id}
                label={d.label}
                aside={
                  d.dueOn
                    ? new Date(`${d.dueOn}T00:00:00`).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "short",
                      })
                    : undefined
                }
                done={d.delivered}
                action={toggleDeliverable}
              />
            ))
          : null}
      </Bloc>

      <p className="text-small text-ink-3">
        Tout se coche ici. Ajouter un plan, changer le lieu ou assigner quelqu&apos;un se fait
        depuis le bureau.
      </p>
    </div>
  );
}
