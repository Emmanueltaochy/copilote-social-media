import Link from "next/link";
import { PageHeader, Toolbar } from "@/components/shell/Screen";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/primitives";
import { tailleDuModele } from "@/data/brief-structure";
import { requireDepartment } from "@/lib/auth";
import { categoriesVisibles, listerModeles } from "@/lib/brief-templates-data";

/**
 * La galerie des modèles de brief.
 *
 * Ces modèles existaient déjà, écrits en dur dans `data/web.ts` : ajouter une
 * question demandait un déploiement. Leur donner un écran, c'est permettre de
 * les corriger le jour où l'on découvre la question qui manquait — c'est-à-dire
 * en sortant d'un rendez-vous, pas trois semaines plus tard.
 */
export const dynamic = "force-dynamic";

export default async function GalerieModelesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; inactifs?: string }>;
}) {
  const user = await requireDepartment("web");
  const { q, category, inactifs } = await searchParams;

  const [modeles, categories] = await Promise.all([
    listerModeles(user, { q, category, inactifs: inactifs === "1" }),
    categoriesVisibles(user),
  ]);

  const lien = (modifs: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const valeurs = { q, category, inactifs, ...modifs };
    for (const [k, v] of Object.entries(valeurs)) if (v) p.set(k, v);
    const chaine = p.toString();
    return `/web/briefs/templates${chaine ? `?${chaine}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Modèles de brief"
        sub={
          modeles.length === 0
            ? "Aucun modèle"
            : `${modeles.length} modèle${modeles.length > 1 ? "s" : ""} disponible${modeles.length > 1 ? "s" : ""}`
        }
      />

      <Toolbar>
        {/* Un formulaire GET plutôt qu'un champ réactif : la recherche vit dans
            l'adresse, donc elle se partage et se retrouve dans l'historique. */}
        <form method="get" className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Rechercher un modèle…"
            className="min-w-[200px] rounded-control border border-line bg-paper px-3 py-[6px] text-base outline-none focus:border-gold"
          />
          {category ? <input type="hidden" name="category" value={category} /> : null}
          {inactifs ? <input type="hidden" name="inactifs" value={inactifs} /> : null}
          <button
            type="submit"
            className="cursor-pointer rounded-control border border-line bg-paper px-3 py-[6px] text-base hover:bg-canvas"
          >
            Chercher
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-1">
          <Link
            href={lien({ category: undefined })}
            className={`rounded-control px-[10px] py-[5px] text-small no-underline hover:no-underline ${
              category ? "text-ink-2 hover:bg-canvas" : "bg-ink text-paper"
            }`}
          >
            Toutes
          </Link>
          {categories.map((c) => (
            <Link
              key={c}
              href={lien({ category: c })}
              className={`rounded-control px-[10px] py-[5px] text-small no-underline hover:no-underline ${
                category === c ? "bg-ink text-paper" : "text-ink-2 hover:bg-canvas"
              }`}
            >
              {c}
            </Link>
          ))}
        </div>

        <Link
          href={lien({ inactifs: inactifs === "1" ? undefined : "1" })}
          className="rounded-control px-[10px] py-[5px] text-small text-ink-2 no-underline hover:bg-canvas hover:no-underline"
        >
          {inactifs === "1" ? "Masquer les archivés" : "Voir les archivés"}
        </Link>
      </Toolbar>

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-4 pb-6 lg:px-5">
        <div className="mx-auto w-full max-w-[1000px]">
          {modeles.length === 0 ? (
            <Card className="p-5">
              <p className="text-base text-ink-2">
                {q || category
                  ? "Aucun modèle ne correspond à cette recherche."
                  : "Aucun modèle pour l'instant. Les modèles fournis avec l'outil apparaîtront ici au prochain démarrage."}
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {modeles.map((m) => {
                const taille = tailleDuModele(m.structure);
                return (
                  <Link
                    key={m.id}
                    href={`/web/briefs/templates/${m.slug}`}
                    data-modele={m.slug}
                    className="flex flex-col gap-2 rounded-card border border-line bg-paper p-4 no-underline hover:border-ink-3 hover:no-underline"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-title" aria-hidden>
                        {m.icon || "📄"}
                      </span>
                      <div className="flex flex-none items-center gap-1">
                        {!m.isActive ? <StatusPill tone="neutral">Archivé</StatusPill> : null}
                        <StatusPill tone={m.isSystem ? "info" : "neutral"}>
                          {m.isSystem ? "Système" : "Personnalisé"}
                        </StatusPill>
                      </div>
                    </div>

                    <span className="clip text-lead font-medium text-ink">{m.name}</span>
                    {m.description ? (
                      <span className="text-small text-ink-2">{m.description}</span>
                    ) : null}

                    <span className="mt-auto pt-2 text-small tabular-nums text-ink-3">
                      {taille.sections} section{taille.sections > 1 ? "s" : ""} ·{" "}
                      {taille.champs} champ{taille.champs > 1 ? "s" : ""}
                      {m.category ? ` · ${m.category}` : ""}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
