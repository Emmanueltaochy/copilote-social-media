import { PageHeader } from "@/components/shell/Screen";
import { Card, CardHead } from "@/components/ui/Card";
import { requireDirection } from "@/lib/auth";
import { reglages } from "@/db/web-queries";
import { mailConfigured } from "@/lib/mail";
import { FormulaireReglages } from "./Formulaire";
import { ImagesDeMarque } from "./Images";
import { Bannieres } from "./Bannieres";
import { listPromos } from "@/db/queries";
import { versionVideo } from "@/lib/portail-video";
import { VideoPortail } from "./VideoPortail";
import { basculerPromo, creerPromo, supprimerPromo } from "./actions";
import { asc, eq } from "drizzle-orm";
import { clients, db } from "@/db";
import { listBrands, metricoolStatus, type MetricoolBrand } from "@/lib/metricool";
import { MetricoolReglages } from "./Metricool";
import { CleIntegration, ConnecteurClaude, PublicationClients } from "./Integrations";
import { getSecret, secretStatus } from "@/lib/secrets";
import { driveAccountEmail } from "@/lib/drive";

/** « Les Copeaux d'Abord » ↔ « Les Copeaux d'Abord Réunion » : même nom, aux accents et espaces près. */
function cle(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function suggerer(nom: string, brands: MetricoolBrand[]): string | null {
  const k = cle(nom);
  if (k.length < 3) return null;
  const hit = brands.find((b) => {
    const l = cle(b.label);
    return l.length >= 3 && (l.includes(k) || k.includes(l));
  });
  return hit?.id ?? null;
}

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
  const [config, bannieres, mc, clientRows] = await Promise.all([
    reglages(),
    listPromos(),
    metricoolStatus(),
    db
      .select({ id: clients.id, name: clients.name, brandId: clients.metricoolBrandId, publishMode: clients.publishMode, driveFolderId: clients.driveFolderId })
      .from(clients)
      .where(eq(clients.active, true))
      .orderBy(asc(clients.name)),
  ]);
  const [ai, abby, drive, mcp, driveEmail] = await Promise.all([
    secretStatus("anthropic"),
    secretStatus("abby"),
    secretStatus("google-drive"),
    getSecret("mcp"),
    driveAccountEmail(),
  ]);
  const mcpUrl = mcp && process.env.APP_DOMAIN ? `https://${process.env.APP_DOMAIN}/api/mcp/${mcp.token}` : mcp ? `/api/mcp/${mcp.token}` : null;
  let brands: MetricoolBrand[] = [];
  let brandsError: string | null = null;
  if (mc.connected) {
    try {
      brands = await listBrands();
    } catch (e) {
      brandsError = (e as Error).message;
    }
  }

  return (
    <>
      <PageHeader title="Réglages" sub="Assistant IA, intégrations et ce que voient vos clients" />

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-4 pb-6 lg:px-5">
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
          <Card>
            <CardHead title="Assistant IA (Jarvis)" meta={ai.connected ? "Connecté" : "Non connecté"} />
            <CleIntegration
              id="anthropic"
              connected={ai.connected}
              fromEnv={ai.fromEnv}
              label="Clé d'API Claude (Anthropic)"
              help={<>console.anthropic.com → API Keys. Jarvis et ses agents l&apos;utilisent pour agir dans Pilot ; la consommation est facturée par Anthropic.</>}
            />
          </Card>

          <Card>
            <CardHead title="Clients : validation et rushs" meta={`${clientRows.length}`} />
            <p className="px-5 pt-1 text-small text-ink-3">
              « Valide avant publication » : chaque contenu passe par le portail du client, et part chez Metricool dès qu&apos;il est validé. « Nous fait
              confiance » : Jarvis peut programmer directement. Le dossier Drive est celui où les vidéastes déposent les rushs.
            </p>
            <PublicationClients rows={clientRows.map((c) => ({ id: c.id, name: c.name, publishMode: c.publishMode, driveFolderId: c.driveFolderId }))} />
          </Card>

          <Card>
            <CardHead title="Google Drive (rushs)" meta={drive.connected ? "Connecté" : "Non connecté"} />
            <CleIntegration
              id="google-drive"
              multiline
              connected={drive.connected}
              fromEnv={drive.fromEnv}
              label="Clé JSON du compte de service Google"
              help={
                <>
                  Google Cloud → IAM → Comptes de service → Clés → JSON (API Google Drive activée). Partagez ensuite chaque dossier de rushs, en lecture, avec{" "}
                  {driveEmail ? <b>{driveEmail}</b> : "l'adresse du compte de service"}.
                </>
              }
            />
          </Card>

          <Card>
            <CardHead title="Abby (devis signés)" meta={abby.connected ? "Connecté" : "Non connecté"} />
            <CleIntegration
              id="abby"
              connected={abby.connected}
              fromEnv={abby.fromEnv}
              label="Clé d'API Abby"
              help={<>Abby → Paramètres → Intégrations → Créer une clé. Le chef de projet web IA y lit les devis signés pour lancer les projets.</>}
            />
          </Card>

          <Card>
            <CardHead title="Claude.ai + Canva" meta={mcpUrl ? "Prêt" : "À activer"} />
            <ConnecteurClaude url={mcpUrl} />
          </Card>

          <Card>
            <CardHead title="Metricool" meta={mc.connected ? "Connecté" : "Non connecté"} />
            <MetricoolReglages
              connected={mc.connected}
              fromEnv={mc.fromEnv}
              lastSyncAt={mc.lastSyncAt ? mc.lastSyncAt.toISOString() : null}
              lastError={mc.lastError}
              brands={brands.map((b) => ({ id: b.id, label: b.label, networks: b.networks }))}
              brandsError={brandsError}
              rows={clientRows.map((c) => ({ ...c, suggested: c.brandId ? null : suggerer(c.name, brands) }))}
            />
          </Card>

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
            <CardHead title="Logos et visuel" />
            <div className="p-[14px]">
              <ImagesDeMarque
                logo={Boolean(config.logoPath)}
                logoWeb={Boolean(config.logoWebPath)}
                cover={Boolean(config.coverPath)}
              />
            </div>
          </Card>

          <Card>
            <CardHead title="Vidéo d'accueil du portail client" />
            <div className="p-[14px]">
              <VideoPortail version={versionVideo(config.portalVideoPath)} />
            </div>
          </Card>

          <Card>
            <CardHead
              title="Bannières du portail client"
              meta={bannieres.length ? `${bannieres.length}` : undefined}
            />
            <Bannieres
              bannieres={bannieres}
              creer={creerPromo}
              basculer={basculerPromo}
              supprimer={supprimerPromo}
            />
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
