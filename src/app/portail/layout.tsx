import Link from "next/link";
import { logout } from "@/app/connexion/actions";
import { compteursPortail } from "@/db/web-queries";
import { facturesAregler } from "@/db/queries";
import { contextePortail } from "@/lib/portail";
import { NavPortail } from "./Nav";
import { Icon } from "@/components/ui/Icon";
import { ThemeButton } from "@/components/shell/ThemeToggle";
import { quitterApercu } from "./actions-apercu";
import { eq } from "drizzle-orm";
import { db, audienceDaily, socialPosts } from "@/db";

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
  const { user, client, config, apercu } = await contextePortail();
  const [compteurs, factures, relevesAudience, relevesPosts] = await Promise.all([
    compteursPortail(client.id),
    facturesAregler(client.id),
    db.select({ x: audienceDaily.day }).from(audienceDaily).where(eq(audienceDaily.clientId, client.id)).limit(1),
    db.select({ x: socialPosts.id }).from(socialPosts).where(eq(socialPosts.clientId, client.id)).limit(1),
  ]);
  const statistiques = relevesAudience.length > 0 || relevesPosts.length > 0;

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

  const roundBtn =
    "flex h-10 w-10 flex-none cursor-pointer items-center justify-center rounded-full border border-line bg-paper text-ink shadow-soft hover:border-line-strong";

  return (
    <div className="flex min-h-dvh flex-col">
      {apercu ? (
        // Bandeau de l'aperçu agence : toujours visible, impossible à confondre
        // avec le vrai portail.
        <div className="sticky top-0 z-40 flex flex-wrap items-center gap-x-3 gap-y-1 bg-night px-4 py-2 text-small text-white sm:px-6">
          <span className="h-2 w-2 flex-none rounded-full bg-accent" />
          <span className="min-w-0 flex-1">
            <b className="font-semibold">Aperçu</b> · vous voyez le portail de{" "}
            <b className="font-semibold">{client.shortName}</b> tel que votre client le voit · lecture seule
          </span>
          <form action={quitterApercu}>
            <button
              type="submit"
              className="cursor-pointer rounded-full border border-white/30 bg-transparent px-3 py-[5px] text-small font-medium text-white hover:bg-white/10"
            >
              Quitter l&apos;aperçu
            </button>
          </form>
        </div>
      ) : null}
      {/* L'en-tête de la nouvelle coquille : la marque de l'agence dans sa
          tuile (le logo est dessiné pour un fond sombre, celui que l'agence a
          réglé), le nom du client, la navigation en pilules et le thème. */}
      <header className={`sticky z-30 bg-canvas/80 backdrop-blur-md ${apercu ? "top-[38px] max-sm:static" : "top-0"}`}>
        <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center gap-x-4 gap-y-3 px-4 pt-3 pb-3 sm:px-6 lg:pt-4">
          <Link
            href="/portail"
            className="flex min-w-0 flex-none items-center gap-[10px] text-ink no-underline hover:no-underline"
          >
            <span
              className="flex h-10 min-w-10 flex-none items-center justify-center rounded-[13px] border border-night-line px-[10px]"
              style={{ background: config.darkColor }}
            >
              {logo ? (
                /* eslint-disable-next-line @next/next/no-img-element -- servi
                   par une route maison, hors du pipeline d'images. */
                <img
                  src={logo}
                  alt={config.agencyName}
                  className="h-5 w-auto max-w-[96px] object-contain"
                />
              ) : (
                <span className="h-2 w-2 rounded-[2px]" style={{ background: config.primaryColor }} />
              )}
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="clip text-[17px] font-bold tracking-[-0.02em]">{client.shortName}</span>
              <span className="clip text-small text-ink-3">Espace client · {config.agencyName}</span>
            </span>
          </Link>

          {/* Sa propre ligne, à toutes les tailles : huit onglets ne tiennent
              pas à côté du logo, et un onglet rogné serait un onglet perdu. */}
          <div className="order-last w-full min-w-0">
            <NavPortail aValider={compteurs.aValider} projets={compteurs.projets} factures={factures} statistiques={statistiques} />
          </div>

          <div className="ml-auto flex flex-none items-center gap-2">
            <ThemeButton className={roundBtn} />
            <span
              className="hidden h-10 items-center gap-2 rounded-full border border-line bg-paper py-1 pr-4 pl-1 text-base font-medium text-ink shadow-soft sm:flex"
              title={user.name}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-night text-small font-semibold text-white">
                {user.initials}
              </span>
              <span className="clip max-w-[140px]">{user.name}</span>
            </span>
            {apercu ? null : (
              <form action={logout}>
                <button type="submit" title="Se déconnecter" aria-label="Se déconnecter" className={roundBtn}>
                  <Icon name="logout" size={17} />
                </button>
              </form>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 pt-5 pb-6 sm:px-6 lg:pt-7">{children}</main>

      <footer className="mx-auto w-full max-w-[1180px] px-4 pb-8 sm:px-6">
        <p className="rounded-card border border-line bg-paper px-5 py-4 text-base text-ink-2 shadow-soft">
          {config.portalWelcome ?? "Une question ? Écrivez à votre interlocuteur habituel."}
        </p>
      </footer>
    </div>
  );
}
