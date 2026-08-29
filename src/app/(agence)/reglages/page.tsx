import { PageHeader } from "@/components/shell/Screen";
import { Card, CardHead } from "@/components/ui/Card";
import { requireDirection } from "@/lib/auth";
import { reglages } from "@/db/web-queries";
import { mailConfigured } from "@/lib/mail";
import { FormulaireReglages } from "./Formulaire";
import { ImagesDeMarque } from "./Images";

export const dynamic = "force-dynamic";

/**
 * Les réglages de l'agence.
 *
 * Peu de choses, et toutes visibles par les clients : le nom, les deux
 * couleurs du portail, le mot de la fin. Le reste des réglages vit dans les
 * variables d'environnement du serveur, là où un mot de passe ne se lit pas
 * dans une page web.
 */
export default async function ReglagesPage() {
  await requireDirection();
  const config = await reglages();

  return (
    <>
      <PageHeader title="Réglages" sub="Ce que voient vos clients" />

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-4 pb-6 lg:px-5">
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
          <Card>
            <CardHead title="Identité du portail client" />
            <div className="p-[14px]">
              <FormulaireReglages
                agencyName={config.agencyName}
                primaryColor={config.primaryColor}
                darkColor={config.darkColor}
                portalWelcome={config.portalWelcome}
              />
            </div>
          </Card>

          <Card>
            <CardHead title="Logo et visuel" />
            <div className="p-[14px]">
              <ImagesDeMarque logo={Boolean(config.logoPath)} cover={Boolean(config.coverPath)} />
            </div>
          </Card>

          <Card>
            <CardHead title="Messagerie" />
            <div className="flex flex-col gap-2 p-[14px]">
              <p className="text-base text-ink-2">
                Deux boîtes d&apos;envoi : celle du pôle social pour les validations et les
                notifications, celle du pôle web pour les briefs et le suivi de projet. Un client
                qui reçoit son brief depuis l&apos;adresse marketing se demande s&apos;il
                s&apos;est trompé d&apos;interlocuteur, et sa réponse part dans la mauvaise boîte.
              </p>
              <ul className="flex flex-col gap-1 text-base">
                <li className={mailConfigured("social") ? "text-ok" : "text-warn"}>
                  {mailConfigured("social") ? "✓" : "○"} Pôle social —{" "}
                  {mailConfigured("social") ? "configuré" : "non configuré"}
                </li>
                <li className={mailConfigured("web") ? "text-ok" : "text-warn"}>
                  {mailConfigured("web") ? "✓" : "○"} Pôle web —{" "}
                  {mailConfigured("web")
                    ? "configuré"
                    : "non configuré, les briefs partiront de la boîte du social"}
                </li>
              </ul>
              <p className="text-small text-ink-3">
                Les identifiants se règlent sur le serveur, dans le fichier .env :{" "}
                <code>SMTP_WEB_HOST</code>, <code>SMTP_WEB_USER</code>,{" "}
                <code>SMTP_WEB_PASSWORD</code>, <code>SMTP_WEB_FROM</code>. Un mot de passe de
                boîte mail n&apos;a rien à faire dans une page web ni dans une base de données.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
