"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/**
 * L'évolution du revenu mensuel sur 12 mois, en deux graphiques qui partagent
 * leurs colonnes : en haut le revenu en fin de mois, en dessous ce qui a été
 * gagné (au-dessus de la ligne) et perdu (en dessous). Survoler ou toucher un
 * mois affiche tous ses chiffres ; le tableau sous le graphique les donne
 * aussi, pour qui ne voit pas les couleurs.
 *
 * Colonnes en HTML plutôt qu'en SVG mis à l'échelle : le texte garde sa
 * taille sur un téléphone. Couleurs : les variables du thème (clair et sombre).
 */

export type MoisGraphique = {
  mois: string;
  court: string;
  long: string;
  finCents: number;
  nouveauCents: number;
  perduCents: number;
  netCents: number;
  encaisseCents: number;
  estime: boolean;
  avant: boolean;
  enCours: boolean;
};

const euros = (c: number) => `${Math.round(c / 100).toLocaleString("fr-FR")} €`;
const signe = (c: number) => (c > 0 ? `+${euros(c)}` : c < 0 ? `−${euros(-c)}` : "0 €");

/** Un maximum rond pour l'axe : 1 000, 2 000, 2 500, 5 000… */
function maxRond(cents: number) {
  const v = Math.max(cents / 100, 1);
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p * 100;
  return 10 * p * 100;
}

export function GraphiqueRevenu({ mois }: { mois: MoisGraphique[] }) {
  const [actif, setActif] = useState<number | null>(null);
  const max = maxRond(Math.max(...mois.map((m) => m.finCents), 1));
  const graduations = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const maxMouvement = maxRond(Math.max(...mois.map((m) => Math.max(m.nouveauCents, m.perduCents)), 1));
  const m = actif === null ? null : mois[actif];
  const cols = { gridTemplateColumns: `repeat(${mois.length}, minmax(0, 1fr))` };

  const colonne = (i: number, contenu: React.ReactNode, className?: string) => (
    <button
      key={mois[i].mois}
      type="button"
      aria-label={`${mois[i].long} : ${euros(mois[i].finCents)} en fin de mois, nouveau ${euros(mois[i].nouveauCents)}, perdu ${euros(mois[i].perduCents)}`}
      // Au doigt, pas de « sortie » : l'infobulle reste jusqu'au toucher suivant ailleurs.
      onPointerEnter={(e) => e.pointerType === "mouse" && setActif(i)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setActif(null)}
      onFocus={() => setActif(i)}
      onBlur={() => setActif(null)}
      onClick={() => setActif(i)}
      className={cn("relative flex h-full cursor-default justify-center rounded-[6px] border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-gold", actif === i && "bg-mute", className)}
    >
      {contenu}
    </button>
  );

  return (
    <div className="relative px-5 pb-4" data-graphique-revenu>
      {/* Revenu mensuel en fin de mois */}
      <div className="relative h-[190px] pl-11 sm:h-[230px] sm:pl-14">
        {graduations.map((v) => (
          <div key={v} className="pointer-events-none absolute right-0 left-11 border-t border-line sm:left-14" style={{ bottom: `${(v / max) * 100}%` }}>
            <span className="absolute -left-11 w-10 -translate-y-1/2 text-right text-micro text-ink-3 tabular-nums sm:-left-14 sm:w-[52px]">
              {v >= 1_000_000 ? `${(v / 100_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k` : Math.round(v / 100).toLocaleString("fr-FR")}
            </span>
          </div>
        ))}
        <div className="absolute inset-y-0 right-0 left-11 grid gap-[2px] sm:left-14 sm:gap-2" style={cols}>
          {mois.map((x, i) =>
            colonne(
              i,
              <span className="flex h-full w-full items-end justify-center">
                {x.finCents > 0 ? (
                  <span
                    className={cn("block w-full max-w-6 rounded-t-[4px] bg-gold", x.enCours && "opacity-75")}
                    style={{
                      height: `${Math.max((x.finCents / max) * 100, 0.8)}%`,
                      // Un mois dont une fin d'abonnement est estimée : hachuré.
                      backgroundImage: x.estime ? "repeating-linear-gradient(135deg, transparent 0 4px, color-mix(in srgb, var(--c-paper) 55%, transparent) 4px 6px)" : undefined,
                    }}
                  />
                ) : null}
              </span>,
            ),
          )}
        </div>
      </div>
      <div className="grid gap-[2px] pt-2 pl-11 sm:gap-2 sm:pl-14" style={cols} aria-hidden>
        {mois.map((x, i) => (
          <span key={x.mois} className={cn("text-center text-micro text-ink-3", (mois.length - 1 - i) % 2 === 1 && "max-sm:invisible", x.enCours && "font-semibold text-ink-2")}>
            {x.court}
          </span>
        ))}
      </div>

      {/* Gagné et perdu, mois par mois */}
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-ink-2">
        <span className="font-medium text-ink">Gagné et perdu chaque mois</span>
        <span className="flex items-center gap-[6px]">
          <span className="h-[9px] w-[9px] rounded-[2px] bg-ok" aria-hidden /> Nouveau (au-dessus)
        </span>
        <span className="flex items-center gap-[6px]">
          <span className="h-[9px] w-[9px] rounded-[2px] bg-alert" aria-hidden /> Perdu (en dessous)
        </span>
      </div>
      <div className="relative mt-2 h-[96px] pl-11 sm:pl-14">
        <div className="pointer-events-none absolute top-1/2 right-0 left-11 border-t border-line-strong sm:left-14" />
        <span className="absolute top-0 left-0 w-10 text-right text-micro text-ink-3 tabular-nums sm:w-[52px]">+{Math.round(maxMouvement / 100).toLocaleString("fr-FR")}</span>
        <span className="absolute bottom-0 left-0 w-10 text-right text-micro text-ink-3 tabular-nums sm:w-[52px]">−{Math.round(maxMouvement / 100).toLocaleString("fr-FR")}</span>
        <div className="absolute inset-y-0 right-0 left-11 grid gap-[2px] sm:left-14 sm:gap-2" style={cols}>
          {mois.map((x, i) =>
            colonne(
              i,
              <span className="relative block h-full w-full">
                {x.nouveauCents > 0 ? (
                  <span className="absolute bottom-1/2 left-1/2 block w-full max-w-6 -translate-x-1/2 rounded-t-[4px] bg-ok" style={{ height: `${Math.max((x.nouveauCents / maxMouvement) * 50, 1.5)}%` }} />
                ) : null}
                {x.perduCents > 0 ? (
                  <span className="absolute top-1/2 left-1/2 block w-full max-w-6 -translate-x-1/2 rounded-b-[4px] bg-alert" style={{ height: `${Math.max((x.perduCents / maxMouvement) * 50, 1.5)}%` }} />
                ) : null}
              </span>,
            ),
          )}
        </div>
      </div>

      {/* L'infobulle du mois survolé */}
      {m ? (
        <div
          role="status"
          className="pointer-events-none absolute top-2 z-10 w-[220px] rounded-[14px] border border-line bg-paper px-3 py-2 text-small shadow-soft"
          style={{ left: `clamp(8px, calc(${((actif! + 0.5) / mois.length) * 100}% - 110px), calc(100% - 228px))` }}
        >
          <div className="font-semibold text-ink">
            {m.long}
            {m.enCours ? " (en cours)" : ""}
          </div>
          {m.avant ? (
            <div className="text-ink-3">Aucun abonnement GoCardless avant ce mois.</div>
          ) : (
            <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-[2px] tabular-nums">
              <dt className="text-ink-3">{m.enCours ? "Revenu aujourd'hui" : "Revenu fin de mois"}</dt>
              <dd className="m-0 text-right font-semibold text-ink">{euros(m.finCents)}</dd>
              <dt className="text-ink-3">Nouveau</dt>
              <dd className="m-0 text-right text-ink">{signe(m.nouveauCents)}</dd>
              <dt className="text-ink-3">Perdu</dt>
              <dd className="m-0 text-right text-ink">{m.perduCents ? `−${euros(m.perduCents)}` : "0 €"}</dd>
              <dt className="text-ink-3">Net</dt>
              <dd className="m-0 text-right font-medium text-ink">{signe(m.netCents)}</dd>
              <dt className="text-ink-3">Encaissé (contrôle)</dt>
              <dd className="m-0 text-right text-ink-2">{euros(m.encaisseCents)}</dd>
            </dl>
          )}
          {m.estime ? <div className="mt-1 text-warn">Une date d&apos;arrêt est estimée ce mois-ci.</div> : null}
        </div>
      ) : null}
    </div>
  );
}
