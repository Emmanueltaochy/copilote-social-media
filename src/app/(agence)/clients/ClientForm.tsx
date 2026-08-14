"use client";

import { useActionState, useState } from "react";
import type { ClientFormState } from "./actions";

type Values = {
  departments?: string[];
  id?: string;
  name?: string;
  shortName?: string;
  sector?: string;
  monthlyFee?: number;
  contentTarget?: number;
  shootsIncluded?: number;
  hoursSold?: number;
  adsBudgetLabel?: string;
  webMaintenance?: number;
  webHoursSold?: number;
};

const field =
  "rounded-control border border-line bg-paper px-3 py-2 text-base outline-none focus:border-gold";

/** Un bloc de contrat, titré par son pôle. Sans titre s'il est seul à l'écran. */
function Bloc({
  titre,
  aide,
  seul,
  children,
}: {
  titre: string;
  aide: string;
  seul: boolean;
  children: React.ReactNode;
}) {
  if (seul) return <div className="flex flex-col gap-3">{children}</div>;
  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-canvas p-4">
      <div>
        <span className="eyebrow text-ink-3">{titre}</span>
        <p className="text-small text-ink-2">{aide}</p>
      </div>
      {children}
    </div>
  );
}

/**
 * La fiche d'un client.
 *
 * Les montants n'apparaissent que pour la direction. Ce n'est pas seulement un
 * masquage d'affichage : l'action serveur ignore ces champs quand l'auteur
 * n'a pas le droit de les voir, sinon un formulaire modifié à la main les
 * écraserait.
 *
 * Le contrat n'a pas la même forme des deux côtés : le social se vend au mois
 * et se pilote en nombre de contenus, le web se vend au projet et ne laisse au
 * client que ce qui court après la mise en ligne. Les champs suivent donc les
 * pôles cochés, en direct — inutile d'enregistrer pour voir apparaître les
 * bons. Un client qui achète les deux voit les deux blocs.
 */
export function ClientForm({
  action,
  values = {},
  submitLabel,
  showMoney,
}: {
  action: (prev: ClientFormState, data: FormData) => Promise<ClientFormState>;
  values?: Values;
  submitLabel: string;
  showMoney: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [poles, setPoles] = useState<string[]>(values.departments ?? ["social"]);

  // Aucun pôle coché retombe sur le social côté serveur : l'écran doit montrer
  // la même chose, sinon on enregistre des champs qu'on n'a pas vus.
  const social = poles.length === 0 || poles.includes("social");
  const web = poles.includes("web");
  const seul = !(social && web);

  const bascule = (valeur: string, coché: boolean) =>
    setPoles((p) => (coché ? [...p.filter((d) => d !== valeur), valeur] : p.filter((d) => d !== valeur)));

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-[6px]">
          <span className="eyebrow text-ink-3">Nom du client</span>
          <input name="name" required defaultValue={values.name} className={field} />
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className="eyebrow text-ink-3">Nom court</span>
          <input
            name="shortName"
            defaultValue={values.shortName}
            placeholder="pour les tableaux denses"
            className={field}
          />
        </label>
      </div>

      <label className="flex flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Secteur</span>
        <input name="sector" defaultValue={values.sector ?? ""} className={field} />
      </label>

      {/* Les pôles qui travaillent pour ce client. Un client web n'apparaît pas
          dans les écrans du social, et inversement : le cockpit compterait
          sinon un engagement mensuel que personne n'a vendu. */}
      <label className="flex flex-col gap-[6px]">
        <span className="eyebrow text-ink-3">Pôles</span>
        <span className="flex flex-wrap items-center gap-4 rounded-control border border-line bg-paper px-3 py-2">
          {(
            [
              ["social", "Réseaux sociaux"],
              ["web", "Web"],
            ] as const
          ).map(([valeur, libellé]) => (
            <label key={valeur} className="flex cursor-pointer items-center gap-[6px] text-base">
              <input
                type="checkbox"
                name="departments"
                value={valeur}
                checked={poles.includes(valeur)}
                onChange={(e) => bascule(valeur, e.target.checked)}
                className="h-[15px] w-[15px] accent-ink"
              />
              {libellé}
            </label>
          ))}
        </span>
      </label>

      {social ? (
        <Bloc
          titre="Contrat réseaux sociaux"
          aide="Un forfait mensuel, un volume de contenus dû."
          seul={seul}
        >
          <div className={showMoney ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "grid grid-cols-1 gap-3"}>
            {showMoney ? (
              <label className="flex flex-col gap-[6px]">
                <span className="eyebrow text-ink-3">Forfait mensuel (€ HT)</span>
                <input
                  name="monthlyFee"
                  type="number"
                  min={0}
                  step="1"
                  defaultValue={values.monthlyFee ?? 0}
                  className={field}
                />
              </label>
            ) : null}
            <label className="flex flex-col gap-[6px]">
              <span className="eyebrow text-ink-3">Contenus par mois</span>
              <input
                name="contentTarget"
                type="number"
                min={0}
                defaultValue={values.contentTarget ?? 0}
                className={field}
              />
              <span className="text-small text-ink-3">
                C&apos;est ce nombre qui pilote le rythme attendu. Zéro = pas d&apos;engagement
                chiffré.
              </span>
            </label>
          </div>

          <div className={showMoney ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "grid grid-cols-1 gap-3"}>
            <label className="flex flex-col gap-[6px]">
              <span className="eyebrow text-ink-3">Shootings inclus</span>
              <input
                name="shootsIncluded"
                type="number"
                min={0}
                defaultValue={values.shootsIncluded ?? 0}
                className={field}
              />
            </label>
            {showMoney ? (
              <label className="flex flex-col gap-[6px]">
                <span className="eyebrow text-ink-3">Heures vendues</span>
                <input
                  name="hoursSold"
                  type="number"
                  min={0}
                  defaultValue={values.hoursSold ?? 0}
                  className={field}
                />
                <span className="text-small text-ink-3">Base du calcul de rentabilité.</span>
              </label>
            ) : null}
          </div>

          <label className="flex flex-col gap-[6px]">
            <span className="eyebrow text-ink-3">Budget ads géré</span>
            <input
              name="adsBudgetLabel"
              defaultValue={values.adsBudgetLabel ?? ""}
              placeholder="1 800 € par mois, ou vide"
              className={field}
            />
          </label>
        </Bloc>
      ) : null}

      {web ? (
        <Bloc
          titre="Contrat web"
          aide="Le prix d'un site se saisit sur le projet lui-même. Ici, ce qui court une fois le site en ligne."
          seul={seul}
        >
          {showMoney ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-[6px]">
                <span className="eyebrow text-ink-3">Maintenance mensuelle (€ HT)</span>
                <input
                  name="webMaintenance"
                  type="number"
                  min={0}
                  step="1"
                  defaultValue={values.webMaintenance ?? 0}
                  className={field}
                />
                <span className="text-small text-ink-3">
                  Hébergement, mises à jour, petites retouches. Zéro = pas d&apos;abonnement.
                </span>
              </label>
              <label className="flex flex-col gap-[6px]">
                <span className="eyebrow text-ink-3">Heures vendues sur le web</span>
                <input
                  name="webHoursSold"
                  type="number"
                  min={0}
                  defaultValue={values.webHoursSold ?? 0}
                  className={field}
                />
                <span className="text-small text-ink-3">
                  Toutes prestations web confondues. Les heures saisies sous le pôle web se
                  comparent à ce chiffre, sans toucher au forfait social.
                </span>
              </label>
            </div>
          ) : (
            <p className="text-base text-ink-2">
              Les montants du contrat web ne sont visibles que par la direction. Le suivi du
              projet, lui, se fait depuis sa fiche.
            </p>
          )}
        </Bloc>
      ) : null}

      {state.error ? (
        <p className="rounded-control border border-alert-line bg-alert-bg px-3 py-2 text-base text-alert">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="cursor-pointer rounded-control border border-ink bg-ink px-3 py-2 text-base font-medium text-paper hover:bg-black disabled:opacity-60"
        >
          {pending ? "Enregistrement…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
