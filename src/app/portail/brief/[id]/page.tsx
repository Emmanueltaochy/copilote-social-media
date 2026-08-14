import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, briefs } from "@/db";
import { requireUser } from "@/lib/auth";
import { listBriefFields } from "@/db/web-queries";
import { reglages } from "@/db/web-queries";
import { Card, CardHead } from "@/components/ui/Card";
import { Eyebrow } from "@/components/ui/primitives";
import { ChampPortail } from "./ChampPortail";

export const dynamic = "force-dynamic";

/**
 * Le brief, côté client.
 *
 * Chaque réponse s'enregistre en quittant le champ : un questionnaire de
 * quarante lignes ne se remplit pas d'une traite, et un bouton « envoyer » en
 * bas de page transforme une interruption en travail perdu.
 */
export default async function BriefClientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const [brief] = await db.select().from(briefs).where(eq(briefs.id, id)).limit(1);
  if (!brief) notFound();

  // Un compte interne consulte le brief depuis l'outil de l'agence.
  if (user.role !== "client") redirect(`/web/briefs/${id}`);
  if (brief.clientId !== user.clientId) notFound();
  // Un brouillon n'a pas été envoyé : il n'existe pas encore pour le client.
  if (brief.status === "brouillon") notFound();

  const [champs, config] = await Promise.all([listBriefFields(id), reglages()]);
  const remplis = champs.filter((c) => (c.field.answer ?? "").trim() !== "").length;
  const manquants = champs.filter((c) => c.field.required && !(c.field.answer ?? "").trim()).length;
  const sections = [...new Set(champs.map((c) => c.field.section))];

  return (
    <main className="min-h-screen bg-canvas">
      <div
        className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6"
        style={{ background: config.darkColor }}
      >
        <span className="flex items-center gap-[10px]">
          <span
            className="h-2 w-2 rounded-[2px]"
            style={{ background: config.primaryColor }}
          />
          <Eyebrow className="text-paper">{config.agencyName}</Eyebrow>
        </span>
        <Link href="/portail" className="text-small text-night-ink no-underline hover:text-paper">
          ← Mon espace
        </Link>
      </div>

      <div className="mx-auto flex w-full max-w-[820px] flex-col gap-4 p-4 sm:p-6">
        <div className="flex flex-col gap-[2px]">
          <Eyebrow>Brief</Eyebrow>
          <h1 className="text-display font-semibold tracking-[-0.01em]">{brief.title}</h1>
        </div>

        <Card className="flex flex-col gap-2 p-4">
          {brief.intro ? <p className="text-base text-ink-2">{brief.intro}</p> : null}
          <p className="text-small text-ink-3">
            {remplis} réponse{remplis > 1 ? "s" : ""} sur {champs.length}
            {manquants > 0
              ? ` · ${manquants} question${manquants > 1 ? "s" : ""} obligatoire${manquants > 1 ? "s" : ""} à remplir`
              : " · tout est rempli, merci"}
            . Chaque réponse est enregistrée dès que vous passez au champ suivant : vous pouvez
            fermer cette page et revenir plus tard.
          </p>
        </Card>

        {sections.map((section) => (
          <Card key={section}>
            <CardHead
              title={section}
              meta={`${champs.filter((c) => c.field.section === section && (c.field.answer ?? "").trim()).length}/${champs.filter((c) => c.field.section === section).length}`}
            />
            {champs
              .filter((c) => c.field.section === section)
              .map(({ field }) => (
                <ChampPortail
                  key={field.id}
                  id={field.id}
                  briefId={brief.id}
                  label={field.label}
                  help={field.help}
                  kind={field.kind}
                  options={field.options}
                  required={field.required}
                  answer={field.answer}
                  accent={config.primaryColor}
                />
              ))}
          </Card>
        ))}

        <p className="pb-6 text-base text-ink-3">
          Une question sur le questionnaire ? Répondez simplement au courriel que vous avez reçu.
        </p>
      </div>
    </main>
  );
}
