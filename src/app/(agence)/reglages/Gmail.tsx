"use client";

import { useState, useTransition } from "react";
import { deconnecterGmailAction, synchroniserGmailMaintenant, testerEtEnregistrerGmail, type ResultatGmail } from "./gmail-actions";

const champ = "min-w-0 flex-1 rounded-control border border-line bg-paper px-3 py-2 text-base text-ink outline-none focus:border-gold";
const primaire = "min-h-[44px] cursor-pointer rounded-full border-none bg-night px-4 py-2 text-base font-medium text-white hover:opacity-85 disabled:opacity-60";
const secondaire =
  "min-h-[44px] cursor-pointer rounded-full border border-line bg-paper px-4 py-2 text-base font-medium text-ink-2 hover:border-line-strong hover:text-ink disabled:opacity-60";

export type EtatCarteGmail = {
  relie: boolean;
  adresse: string | null;
  illisible: boolean;
  erreur: string | null;
  /** « il y a 4 min », calculé côté serveur. */
  dernierReleve: string | null;
  bilan: string | null;
  enCours: boolean;
};

/**
 * La carte « Gmail » : relier la boîte de la direction en lecture seule, avec
 * un mot de passe d'application. Le mot de passe ne revient jamais dans la
 * page : le champ reste vide une fois enregistré.
 */
export function GmailReglages({ etat }: { etat: EtatCarteGmail }) {
  const [adresse, setAdresse] = useState(etat.adresse ?? "");
  const [motDePasse, setMotDePasse] = useState("");
  const [effacer, setEffacer] = useState(false);
  const [confirmer, setConfirmer] = useState(false);
  const [resultat, setResultat] = useState<ResultatGmail | null>(null);
  const [geste, setGeste] = useState<"tester" | "sync" | "deco" | null>(null);
  const [pending, startTransition] = useTransition();

  const lancer = (g: "tester" | "sync" | "deco", f: () => Promise<ResultatGmail>) => {
    setGeste(g);
    setResultat(null);
    startTransition(async () => {
      try {
        const r = await f();
        setResultat(r);
        if (g === "tester" && r.ok) setMotDePasse("");
        if (g === "deco" && r.ok) {
          setConfirmer(false);
          setMotDePasse("");
        }
      } catch {
        setResultat({ ok: false, erreur: "Pas de connexion avec Pilot : rien n'a été fait." });
      }
    });
  };

  return (
    <div className="flex flex-col gap-4 px-5 pt-1 pb-5">
      <p className="text-base text-ink-2">
        Pilot lit la boîte Gmail de la direction <b className="font-semibold text-ink">en lecture seule</b> : il ne marque rien comme lu, ne déplace,
        n&apos;étiquette ni ne supprime rien. Il ne garde que les échanges avec un contact de l&apos;annuaire (objet, date, extrait de 280 caractères,
        noms des pièces jointes, lien vers Gmail) ; tout le reste est ignoré sans être stocké.
      </p>

      {etat.relie ? (
        <div className="flex flex-col gap-1 rounded-[16px] border border-line bg-canvas p-3 text-small" data-etat-gmail="relie">
          <span className="text-base text-ink">
            Relié à <b className="font-semibold">{etat.adresse}</b>
          </span>
          <span className="text-ink-3">
            {etat.enCours ? "Relevé en cours… " : null}
            {etat.dernierReleve ? `Dernier relevé ${etat.dernierReleve}` : "Pas encore relevé"}
            {etat.bilan ? ` : ${etat.bilan}` : ""}. Relevé automatique toutes les 12 minutes.
          </span>
          {etat.illisible ? (
            <span className="text-alert">Le mot de passe enregistré ne peut plus être lu : recollez un mot de passe d&apos;application ci-dessous.</span>
          ) : etat.erreur ? (
            <span className="text-alert">Dernier relevé en échec : {etat.erreur}</span>
          ) : null}
        </div>
      ) : null}

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          lancer("tester", () => testerEtEnregistrerGmail({ adresse, motDePasse }));
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-ink-3">Adresse Gmail</span>
          <input
            type="email"
            name="adresse"
            required
            autoComplete="off"
            inputMode="email"
            value={adresse}
            onChange={(e) => setAdresse(e.target.value)}
            placeholder="prenom@gmail.com"
            className={champ}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-ink-3">Mot de passe d&apos;application · {etat.relie && !etat.illisible ? "enregistré, chiffré" : "16 lettres"}</span>
          <input
            type="password"
            name="motDePasse"
            required
            autoComplete="new-password"
            spellCheck={false}
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            placeholder={etat.relie ? "Collez-en un nouveau pour le remplacer" : "xxxx xxxx xxxx xxxx"}
            className={champ}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending} className={primaire}>
            {pending && geste === "tester" ? "Connexion à Gmail…" : "Tester et enregistrer"}
          </button>
          {etat.relie ? (
            <button type="button" disabled={pending} className={secondaire} onClick={() => lancer("sync", () => synchroniserGmailMaintenant())}>
              {pending && geste === "sync" ? "Relevé en cours…" : "Synchroniser maintenant"}
            </button>
          ) : null}
        </div>
      </form>

      {resultat ? (
        <p role="status" className={resultat.ok ? "text-small text-ok" : "text-small text-alert"} data-resultat-gmail={resultat.ok ? "ok" : "erreur"}>
          {resultat.ok ? resultat.message : resultat.erreur}
        </p>
      ) : null}

      <details className="rounded-[16px] border border-line p-3 text-small text-ink-2" open={!etat.relie}>
        <summary className="cursor-pointer font-semibold text-ink">Créer le mot de passe d&apos;application (2 minutes)</summary>
        <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5">
          <li>
            Ouvrez{" "}
            <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer">
              Compte Google → Sécurité → Mots de passe des applications
            </a>{" "}
            (la validation en deux étapes doit être activée).
          </li>
          <li>Nommez-le « Pilot », puis « Créer ».</li>
          <li>Copiez les 16 lettres affichées et collez-les ci-dessus, espaces compris si vous voulez. Google ne les montrera plus.</li>
          <li>Pour couper l&apos;accès un jour : « Déconnecter » ici, ou supprimez « Pilot » dans la même page Google.</li>
        </ol>
      </details>

      {etat.relie ? (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          {confirmer ? (
            <div className="flex flex-col gap-2 rounded-[16px] border border-line-strong bg-mute/40 p-3 text-small text-ink-2">
              <span>Effacer le mot de passe Gmail ? Pilot cessera de lire la boîte.</span>
              <label className="flex min-h-[44px] cursor-pointer items-center gap-2">
                <input type="checkbox" checked={effacer} onChange={(e) => setEffacer(e.target.checked)} className="h-[18px] w-[18px]" />
                Effacer aussi les e-mails déjà gardés sur les fiches
              </label>
              <span className="flex flex-wrap gap-2">
                <button type="button" disabled={pending} className={primaire} onClick={() => lancer("deco", () => deconnecterGmailAction({ effacer }))}>
                  {pending && geste === "deco" ? "Déconnexion…" : "Oui, déconnecter"}
                </button>
                <button type="button" className={secondaire} onClick={() => setConfirmer(false)}>
                  Non
                </button>
              </span>
            </div>
          ) : (
            <div>
              <button type="button" className={secondaire} onClick={() => setConfirmer(true)}>
                Déconnecter
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
