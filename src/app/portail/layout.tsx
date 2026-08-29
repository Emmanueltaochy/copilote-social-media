import Link from "next/link";
import { logout } from "@/app/connexion/actions";
import { compteursPortail } from "@/db/web-queries";
import { contextePortail } from "@/lib/portail";
import { NavPortail } from "./Nav";

export const dynamic = "force-dynamic";

/**
 * La coquille du portail client.
 *
 * L'espace tenait sur une seule page qui déroulait tout : validations, mois en
 * cours, médias, fichiers, projets, charte. Passé quelques contenus, retrouver
 * ses photos demandait de faire défiler dix écrans, et un client venu valider
 * un post traversait ses factures pour y arriver.
 *
 * Chaque chose a maintenant sa page, et la barre du haut dit ce qui attend
 * ailleurs : on ne cache pas une validation en attente derrière un onglet
 * fermé.
 */
export default async function PortailLayout({ children }: { children: React.ReactNode }) {
  const { user, client, config } = await contextePortail();
  const compteurs = await compteursPortail(client.id);

  /*
   * La marque du pôle qui sert ce client.
   *
   * Un client venu pour son site n'a pas à voir la signature du pôle réseaux
   * sociaux : ce n'est pas ce qu'il a acheté. Un client qui prend les deux
   * garde la marque historique, celle sous laquelle la relation a commencé.
   * Sans second logo réglé, tout le monde voit le premier.
   */
  const poles = client.departments?.length ? client.departments : ["social"];
  const logo = !poles.includes("social") && poles.includes("web") && config.logoWebPath
    ? "/api/branding/logo-web"
    : config.logoPath
      ? "/api/branding/logo"
      : null;

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      {/* Le bandeau prend les couleurs réglées par l'agence : le portail est un
          prolongement de sa marque, pas un outil générique où le client se
          demande chez qui il est. */}
      <header style={{ background: config.darkColor }}>
        <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/portail" className="flex items-center gap-[10px] no-underline hover:no-underline">
            {logo ? (
              /* eslint-disable-next-line @next/next/no-img-element -- servi
                 par une route maison, hors du pipeline d'images. */
              <img
                src={logo}
                alt={config.agencyName}
                className="h-6 w-auto max-w-[130px] object-contain"
              />
            ) : (
              <span className="h-2 w-2 rounded-[2px]" style={{ background: config.primaryColor }} />
            )}
            <span className="eyebrow text-paper">{config.agencyName}</span>
          </Link>

          <span className="flex items-center gap-3">
            <span className="hidden text-small text-night-ink sm:inline">{user.name}</span>
            <form action={logout}>
              <button
                type="submit"
                className="cursor-pointer rounded-control border border-ink-2 bg-transparent px-[10px] py-[6px] text-small font-medium text-night-ink hover:border-ink-3 hover:text-paper"
              >
                Se déconnecter
              </button>
            </form>
          </span>
        </div>

        <NavPortail
          accent={config.primaryColor}
          aValider={compteurs.aValider}
          projets={compteurs.projets}
        />
      </header>

      <main className="mx-auto w-full max-w-[1100px] flex-1 p-4 sm:p-6">{children}</main>

      <footer className="mx-auto w-full max-w-[1100px] px-4 pb-8 sm:px-6">
        <p className="text-base text-ink-3">
          {config.portalWelcome ?? "Une question ? Écrivez à votre interlocuteur habituel."}
        </p>
      </footer>
    </div>
  );
}
