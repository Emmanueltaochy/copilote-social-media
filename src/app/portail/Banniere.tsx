import type { Tone } from "@/lib/tone";

type Banniere = {
  id: string;
  title: string;
  body: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  imagePath: string | null;
};

/**
 * Une offre de l'agence, dans le portail de son client.
 *
 * Elle emprunte la couleur d'accent réglée par l'agence plutôt qu'un rouge de
 * promotion : le portail est un prolongement de la marque, pas une régie
 * publicitaire. Et elle se place après ce qu'on attend du client — une offre
 * qui passerait devant une validation en retard ferait manquer la validation.
 *
 * Sa hauteur est bornée, et c'est le point. Sans plafond, une affiche verticale
 * exportée d'un outil de création occupait tout l'écran : le client faisait
 * défiler une publicité pour retrouver ses contenus. Une offre se remarque, elle
 * ne s'impose pas.
 */
export function BanniereClient({
  banniere,
  accent,
}: {
  banniere: Banniere;
  accent: string;
}) {
  const { id, title, body, ctaLabel, ctaUrl, imagePath } = banniere;

  return (
    <section
      data-promo={id}
      className="overflow-hidden rounded-card border"
      style={{ borderColor: accent, background: `${accent}0F` }}
    >
      {imagePath ? (
        /* eslint-disable-next-line @next/next/no-img-element -- servi par
           une route maison, hors du pipeline d'images. */
        <img
          src={`/api/promo/${id}`}
          alt=""
          className="block h-[96px] w-full object-cover sm:h-[132px]"
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <span className="flex min-w-[200px] flex-1 flex-col">
          <span className="text-lead font-medium text-ink">{title}</span>
          {/* Deux lignes au plus : le détail d'une offre vit sur la page vers
              laquelle elle mène, pas dans le bandeau. */}
          {body ? <span className="line-clamp-2 text-small text-ink-2">{body}</span> : null}
        </span>
        {ctaLabel && ctaUrl ? (
          <a
            href={ctaUrl}
            target="_blank"
            rel="noreferrer"
            className="flex-none rounded-control px-3 py-[6px] text-base font-medium text-paper no-underline hover:no-underline"
            style={{ background: accent }}
          >
            {ctaLabel}
          </a>
        ) : null}
      </div>
    </section>
  );
}

/** Le ton n'est pas paramétrable ici : l'accent de l'agence tient ce rôle. */
export const TON_BANNIERE: Tone = "gold";
