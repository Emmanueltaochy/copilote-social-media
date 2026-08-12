import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/shell/Screen";
import { requireStaff } from "@/lib/auth";
import { db, clients } from "@/db";
import { moisDepuis, moisEnCode, moisEnTexte, planDuMois } from "@/lib/plan";
import { Preparateur, type PlanVue } from "./Preparateur";

export const dynamic = "force-dynamic";

/**
 * La préparation du mois.
 *
 * Un écran à lui seul plutôt qu'un bouton perdu dans une fiche : le geste se
 * fait une fois par mois, pour tout le portefeuille, et il mérite qu'on voie
 * d'abord ce qui sera créé. Un bouton qui crée soixante contenus sans les
 * annoncer est un bouton sur lequel personne n'ose appuyer.
 */
export default async function PreparerPage({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string }>;
}) {
  await requireStaff();
  const { mois: demandé } = await searchParams;
  const mois = moisDepuis(demandé);

  const actifs = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.active, true))
    .orderBy(clients.shortName);

  const plans = (await Promise.all(actifs.map((c) => planDuMois(c.id, mois)))).filter(
    (p): p is NonNullable<typeof p> => p !== null,
  );

  const vues: PlanVue[] = plans.map((p) => ({
    clientId: p.clientId,
    clientName: p.clientName,
    aCreer: p.aCreer,
    sansDecomposition: p.sansDecomposition,
    lignes: p.lignes.map((l) => ({
      label: l.label,
      kind: l.kind,
      reseaux: l.reseaux,
      cible: l.cible,
      existants: l.existants,
      manquants: l.manquants,
    })),
  }));

  const total = vues.reduce((n, v) => n + v.aCreer, 0);
  const précédent = new Date(mois.getFullYear(), mois.getMonth() - 1, 1);
  const suivant = new Date(mois.getFullYear(), mois.getMonth() + 1, 1);

  return (
    <>
      <PageHeader
        title="Préparer le mois"
        sub={
          total > 0
            ? `${moisEnTexte(mois)} · ${total} contenu${total > 1 ? "s" : ""} à créer`
            : `${moisEnTexte(mois)} · rien à créer`
        }
      />

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-4 pb-6 lg:px-5">
        <Preparateur
          mois={moisEnCode(mois)}
          moisPrecedent={moisEnCode(précédent)}
          moisSuivant={moisEnCode(suivant)}
          moisTexte={moisEnTexte(mois)}
          plans={vues}
        />
      </div>
    </>
  );
}
