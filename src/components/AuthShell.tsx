import { reglages } from "@/db/web-queries";

/**
 * La mise en page des écrans d'entrée : connexion, création de compte,
 * invitation d'un client.
 *
 * Deux volets sur un écran — le formulaire à gauche, le visuel de l'agence à
 * droite. C'est la disposition des outils que les clients connaissent déjà, et
 * elle a une raison : le formulaire reste à taille de lecture au lieu de
 * flotter au milieu d'une page vide, et la moitié droite dit chez qui on est
 * avant même d'avoir lu une ligne.
 *
 * Sur un téléphone il n'y a pas deux colonnes à donner : le visuel passe en
 * fond, un dégradé le fonce assez pour que le texte reste lisible quelle que
 * soit la photo, et le formulaire se pose par-dessus. Le même écran, plié.
 *
 * Faute de visuel envoyé dans les réglages, le fond est un dégradé construit à
 * partir des deux couleurs de l'agence : jamais de trou gris, jamais d'image
 * d'illustration générique.
 */
export async function AuthShell({
  titre,
  sous,
  children,
  bas,
}: {
  titre: string;
  sous: string;
  children: React.ReactNode;
  /** Ligne discrète sous le formulaire. */
  bas?: React.ReactNode;
}) {
  const config = await reglages();
  const cover = config.coverPath ? "/api/branding/cover" : null;

  // Deux teintes suffisent à faire une image : la couleur d'accent en haut, le
  // fond sombre en bas, et un halo décentré qui évite l'aplat de dégradé plat.
  const degrade =
    `radial-gradient(120% 90% at 15% 5%, ${config.primaryColor}55 0%, transparent 60%), ` +
    `radial-gradient(90% 70% at 85% 100%, ${config.primaryColor}33 0%, transparent 55%), ` +
    `linear-gradient(160deg, ${config.darkColor} 0%, #000 100%)`;

  /**
   * Le bloc de marque. `avecNom` écrit le nom à côté du logo : dans le volet
   * visuel il y a la place, et un logo réduit à un symbole ne dit pas chez qui
   * on est. Dans la colonne du formulaire, le logo se suffit.
   */
  const marque = (avecNom: boolean) => (
    <span className="flex items-center gap-[10px]">
      {config.logoPath ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- servi hors
              du pipeline d'images : la page doit s'afficher sans session. */}
          <img
            src="/api/branding/logo"
            alt={config.agencyName}
            className="h-7 w-auto max-w-[160px] object-contain"
          />
          {avecNom ? <span className="eyebrow">{config.agencyName}</span> : null}
        </>
      ) : (
        <>
          <span
            className="h-2 w-2 rounded-[2px]"
            style={{ background: config.primaryColor }}
          />
          <span className="eyebrow">{config.agencyName}</span>
        </>
      )}
    </span>
  );

  return (
    <main className="flex min-h-dvh flex-col lg:flex-row">
      {/* Volet du formulaire. Sur mobile il occupe tout, posé sur le fond. */}
      <div className="relative flex min-h-dvh flex-1 items-center justify-center overflow-hidden p-6 lg:min-h-0 lg:bg-canvas">
        {/* Le fond n'existe que sur téléphone : sur grand écran, le visuel a
            sa propre colonne et le formulaire garde un fond clair. */}
        <div className="absolute inset-0 lg:hidden" aria-hidden>
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: cover ? `url(${cover})` : degrade,
              backgroundColor: config.darkColor,
            }}
          />
          {/* Sans ce voile, un visuel clair rendrait le texte illisible. Il
              fonce vers le bas, là où se trouve le formulaire. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.72) 45%, rgba(0,0,0,0.92) 100%)",
            }}
          />
        </div>

        <div className="relative w-full max-w-[400px]">
          <div className="mb-6 flex items-center gap-2 text-paper lg:text-ink">{marque(false)}</div>

          <h1 className="mb-1 text-display font-semibold tracking-[-0.01em] text-paper lg:text-ink">
            {titre}
          </h1>
          <p className="mb-6 text-base text-night-ink lg:text-ink-2">{sous}</p>

          <div className="rounded-card border border-line bg-paper p-5 shadow-[0_18px_40px_rgba(0,0,0,0.25)] lg:shadow-none">
            {children}
          </div>

          {bas ? (
            <p className="mt-4 text-small text-night-ink lg:text-ink-3">{bas}</p>
          ) : null}
        </div>
      </div>

      {/* Volet visuel, sur grand écran seulement. */}
      <div
        className="relative hidden w-[46%] max-w-[720px] flex-none overflow-hidden bg-cover bg-center lg:block"
        style={{
          backgroundImage: cover ? `url(${cover})` : degrade,
          backgroundColor: config.darkColor,
        }}
      >
        {cover ? (
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(200deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 70%, rgba(0,0,0,0.85) 100%)",
            }}
          />
        ) : null}
        <div className="relative flex h-full flex-col justify-end gap-3 p-10">
          <span className="text-paper">{marque(true)}</span>
          <p className="max-w-[420px] text-lead text-night-ink">
            {config.portalWelcome ??
              "Vos contenus, vos validations et vos projets, au même endroit."}
          </p>
        </div>
      </div>
    </main>
  );
}
