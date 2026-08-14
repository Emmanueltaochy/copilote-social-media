import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/Screen";
import { Card, CardHead } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/primitives";
import { requireDepartment } from "@/lib/auth";
import { getBrief, listBriefFields } from "@/db/web-queries";
import { BRIEF_STATUS } from "@/data/web";
import { ChampBrief } from "./ChampBrief";
import { EnvoiBrief } from "./EnvoiBrief";
import { deleteBrief } from "../../actions";

export const dynamic = "force-dynamic";

export default async function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  await requireDepartment("web");
  const { id } = await params;

  const row = await getBrief(id);
  if (!row) notFound();

  const champs = await listBriefFields(id);
  const remplis = champs.filter((c) => (c.field.answer ?? "").trim() !== "").length;
  const manquants = champs.filter((c) => c.field.required && !(c.field.answer ?? "").trim()).length;

  const sections = [...new Set(champs.map((c) => c.field.section))];

  return (
    <>
      <PageHeader
        title={row.brief.title}
        sub={`${row.clientName}${row.projectName ? ` · ${row.projectName}` : ""} · ${remplis}/${champs.length} réponses`}
      >
        <StatusPill tone={BRIEF_STATUS[row.brief.status].tone}>
          {BRIEF_STATUS[row.brief.status].label}
        </StatusPill>
        <Link href="/web/briefs" className="text-small">
          ← Tous les briefs
        </Link>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-4 pb-6 lg:px-5">
        <div className="mx-auto flex w-full max-w-[820px] flex-col gap-4">
          <Card className="flex flex-col gap-3 p-4">
            <EnvoiBrief id={row.brief.id} dejaEnvoye={Boolean(row.brief.sentAt)} />
            <p className="text-small text-ink-2">
              Le courriel part de la boîte du pôle web et contient un lien vers l&apos;espace du
              client, pas le questionnaire lui-même : un brief rempli dans un e-mail revient en
              texte libre qu&apos;il faut recopier, et la copie devient fausse à la première
              précision.
            </p>
            {manquants > 0 ? (
              <p className="text-small text-warn">
                {manquants} question{manquants > 1 ? "s" : ""} obligatoire{manquants > 1 ? "s" : ""}{" "}
                sans réponse. Le brief passera en « complet » tout seul quand elles seront remplies.
              </p>
            ) : (
              <p className="text-small text-ok">Toutes les questions obligatoires ont une réponse.</p>
            )}
          </Card>

          {sections.map((section) => (
            <Card key={section}>
              <CardHead
                title={section}
                meta={`${champs.filter((c) => c.field.section === section && (c.field.answer ?? "").trim()).length}/${champs.filter((c) => c.field.section === section).length}`}
              />
              {champs
                .filter((c) => c.field.section === section)
                .map(({ field, answeredByName }) => (
                  <ChampBrief
                    key={field.id}
                    id={field.id}
                    briefId={row.brief.id}
                    label={field.label}
                    help={field.help}
                    kind={field.kind}
                    options={field.options}
                    required={field.required}
                    answer={field.answer}
                    auteur={answeredByName ?? (field.answeredAt ? "le client" : null)}
                  />
                ))}
            </Card>
          ))}

          <Card className="flex items-center justify-between gap-4 p-4">
            <span className="text-small text-ink-3">
              Supprimer le brief efface aussi les réponses du client.
            </span>
            <form action={deleteBrief}>
              <input type="hidden" name="id" value={row.brief.id} />
              <button
                type="submit"
                className="cursor-pointer rounded-control border border-line bg-paper px-3 py-2 text-small text-ink-2 hover:border-alert hover:text-alert"
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
