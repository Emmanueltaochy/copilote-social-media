import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/Screen";
import { Card, CardHead } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/primitives";
import {
  TYPES_SANS_SAISIE,
  tailleDuModele,
  type ChampBrief,
  type TypeChamp,
} from "@/data/brief-structure";
import { requireDepartment } from "@/lib/auth";
import { peutEcrire, peutSupprimer } from "@/lib/brief-templates-access";
import { lireModele, usageDesModeles, versionsDuModele } from "@/lib/brief-templates-data";

/**
 * Un modèle, en lecture.
 *
 * L'écran montre la structure telle qu'elle est, pas telle qu'elle sera rendue
 * — l'aperçu du formulaire viendra à côté. Ici on vérifie ce qu'un modèle
 * contient : ses champs, leurs types, ce qui est obligatoire, ce qui bloque, et
 * ce qui sort du forfait.
 */
export const dynamic = "force-dynamic";

const LIBELLE_TYPE: Record<TypeChamp, string> = {
  text: "texte",
  textarea: "texte long",
  email: "e-mail",
  phone: "téléphone",
  url: "adresse web",
  number: "nombre",
  currency: "montant",
  date: "date",
  select: "liste déroulante",
  radio: "choix unique",
  checkbox_group: "cases à cocher",
  checkbox: "oui / non",
  table: "tableau",
  repeater: "bloc répétable",
  priority_list: "à classer",
  heading: "titre",
  info: "encadré",
};

function Champ({ champ, niveau = 0 }: { champ: ChampBrief; niveau?: number }) {
  const horsForfait = (champ.options ?? []).filter((o) => o.out_of_scope);

  return (
    <div
      data-champ={champ.id}
      className="border-b border-line px-[14px] py-3 last:border-b-0"
      style={{ paddingLeft: 14 + niveau * 20 }}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-base font-medium text-ink">{champ.label}</span>
        <span className="text-small text-ink-3">{LIBELLE_TYPE[champ.type]}</span>
        {champ.required ? <StatusPill tone="warn">obligatoire</StatusPill> : null}
        {champ.blocking ? <StatusPill tone="alert">bloquant</StatusPill> : null}
        {champ.visible_if ? (
          // La condition est écrite en clair : « visible si X » se relit, un
          // objet JSON se déchiffre.
          <span className="text-small text-ink-3">
            visible si « {champ.visible_if.field} » {champ.visible_if.operator}
            {champ.visible_if.value !== undefined ? ` ${String(champ.visible_if.value)}` : ""}
          </span>
        ) : null}
      </div>

      {champ.help ? <p className="mt-[2px] text-small text-ink-2">{champ.help}</p> : null}

      {(champ.options ?? []).length > 0 ? (
        <p className="mt-1 text-small text-ink-3">
          {(champ.options ?? []).map((o) => o.label).join(" · ")}
        </p>
      ) : null}

      {horsForfait.length > 0 ? (
        <p className="mt-1 text-small text-alert">
          Hors forfait : {horsForfait.map((o) => `${o.label} (${o.note})`).join(" · ")}
        </p>
      ) : null}

      {(champ.columns ?? []).length > 0 ? (
        <p className="mt-1 text-small text-ink-3">
          Colonnes : {(champ.columns ?? []).map((c) => c.label).join(" · ")}
        </p>
      ) : null}

      {(champ.fields ?? []).map((enfant) => (
        <Champ key={enfant.id} champ={enfant} niveau={niveau + 1} />
      ))}
    </div>
  );
}

export default async function ModelePage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireDepartment("web");
  const { slug } = await params;

  const modele = await lireModele(user, slug);
  // Interdit et inexistant rendent le même 404 : distinguer confirmerait
  // l'existence d'un modèle d'un autre pôle.
  if (!modele) notFound();

  const [versions, usage] = await Promise.all([
    versionsDuModele(modele.id),
    usageDesModeles([modele.id]),
  ]);
  const briefsCrees = usage.get(modele.id) ?? 0;
  const taille = tailleDuModele(modele.structure);
  const bloquants = modele.structure.sections.flatMap((s) =>
    s.fields.filter((c) => c.blocking).map((c) => c.label),
  );

  return (
    <>
      <PageHeader
        title={`${modele.icon ? `${modele.icon} ` : ""}${modele.name}`}
        sub={`v${modele.version} · ${taille.sections} sections · ${taille.champs} champs${
          briefsCrees > 0 ? ` · ${briefsCrees} brief${briefsCrees > 1 ? "s" : ""} créé${briefsCrees > 1 ? "s" : ""}` : ""
        }`}
      />

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-4 pb-6 lg:px-5">
        <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/web/briefs/templates"
              className="text-small text-ink-2 no-underline hover:underline"
            >
              ← Tous les modèles
            </Link>
            <span className="flex-1" />
            {modele.isSystem ? <StatusPill tone="info">Système</StatusPill> : null}
            {!modele.isActive ? <StatusPill tone="neutral">Archivé</StatusPill> : null}
            <StatusPill tone="neutral">
              {modele.scope === "global" ? "Tous les pôles" : modele.departments.join(" · ")}
            </StatusPill>
          </div>

          {modele.description ? (
            <Card className="p-4">
              <p className="text-base text-ink-2">{modele.description}</p>
            </Card>
          ) : null}

          {bloquants.length > 0 ? (
            <Card className="border-alert-line bg-alert-bg p-4">
              <p className="text-base font-medium text-alert">
                {bloquants.length} point{bloquants.length > 1 ? "s" : ""} bloquant
                {bloquants.length > 1 ? "s" : ""}
              </p>
              <p className="mt-1 text-small text-ink-2">{bloquants.join(" · ")}</p>
            </Card>
          ) : null}

          {modele.structure.sections.map((section) => (
            <Card key={section.id} data-section={section.id}>
              <CardHead
                title={section.title}
                meta={`${section.fields.filter((c) => !TYPES_SANS_SAISIE.has(c.type)).length} champs`}
              />
              {section.description ? (
                <p className="border-b border-line px-[14px] py-2 text-small text-ink-2">
                  {section.description}
                </p>
              ) : null}
              {section.fields.map((champ) => (
                <Champ key={champ.id} champ={champ} />
              ))}
            </Card>
          ))}

          {versions.length > 0 ? (
            <Card>
              <CardHead title="Historique" meta={`${versions.length}`} />
              {versions.map((v) => (
                <div
                  key={v.version}
                  className="flex flex-wrap items-center gap-3 border-b border-line px-[14px] py-2 last:border-b-0"
                >
                  <span className="text-base tabular-nums text-ink">v{v.version}</span>
                  <span className="text-small text-ink-3">
                    {new Date(v.createdAt).toLocaleDateString("fr-FR")}
                    {v.auteur ? ` · ${v.auteur}` : ""}
                  </span>
                </div>
              ))}
            </Card>
          ) : null}

          {/* Les droits sont affichés plutôt que devinés : proposer un bouton
              qui répondra 403 est pire que ne pas le proposer. */}
          <p className="text-small text-ink-3">
            {peutEcrire(user, modele)
              ? "Tu peux modifier ce modèle."
              : modele.scope === "global"
                ? "Modèle global : seule la direction peut le modifier. Duplique-le pour en obtenir une copie éditable."
                : "Ce modèle appartient à un autre pôle."}
            {modele.isSystem
              ? " Un modèle système ne se supprime jamais — il se duplique."
              : peutSupprimer(user, modele) && briefsCrees > 0
                ? ` Il a déjà produit ${briefsCrees} brief${briefsCrees > 1 ? "s" : ""} : il ne peut plus être supprimé, seulement archivé.`
                : ""}
          </p>
        </div>
      </div>
    </>
  );
}
