"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  choisirTableauxTrello,
  deconnecterService,
  retirerAgendaAction,
  synchroniserService,
  testerEtAjouterAgenda,
  testerEtEnregistrerGoCardless,
  testerEtEnregistrerTrello,
  type ResultatEtape3,
} from "./etape3-actions";

/*
 * Les cartes « Trello », « GoCardless » et « Google Agenda » de Réglages,
 * sur le modèle de la carte Gmail : « Tester et enregistrer », « Synchroniser
 * maintenant », « Déconnecter ». Un secret enregistré ne revient jamais dans
 * la page : les champs restent vides, l'agenda n'est montré que masqué.
 */

const champ = "min-w-0 flex-1 rounded-control border border-line bg-paper px-3 py-2 text-base text-ink outline-none focus:border-gold";
const primaire = "min-h-[44px] cursor-pointer rounded-full border-none bg-night px-4 py-2 text-base font-medium text-white hover:opacity-85 disabled:opacity-60";
const secondaire =
  "min-h-[44px] cursor-pointer rounded-full border border-line bg-paper px-4 py-2 text-base font-medium text-ink-2 hover:border-line-strong hover:text-ink disabled:opacity-60";

type Service = "trello" | "gocardless" | "agenda";
export type EtatCommun = { relie: boolean; illisible: boolean; erreur: string | null; dernierReleve: string | null; bilan: string | null; enCours: boolean };

function useGeste() {
  const [resultat, setResultat] = useState<ResultatEtape3 | null>(null);
  const [geste, setGeste] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const lancer = (g: string, f: () => Promise<ResultatEtape3>, ensuite?: (r: ResultatEtape3) => void) => {
    setGeste(g);
    setResultat(null);
    startTransition(async () => {
      try {
        const r = await f();
        setResultat(r);
        ensuite?.(r);
      } catch {
        setResultat({ ok: false, erreur: "Pas de connexion avec Pilot : rien n'a été fait." });
      }
    });
  };
  return { resultat, geste, pending, lancer };
}

function Resultat({ r, service }: { r: ResultatEtape3 | null; service: Service }) {
  if (!r) return null;
  return (
    <p role="status" className={r.ok ? "text-small text-ok" : "text-small text-alert"} data-resultat={`${service}-${r.ok ? "ok" : "erreur"}`}>
      {r.ok ? r.message : r.erreur}
    </p>
  );
}

function Etat({ etat, service, quoi, rythme = "toutes les 15 minutes" }: { etat: EtatCommun; service: Service; quoi: React.ReactNode; rythme?: string }) {
  if (!etat.relie) return null;
  return (
    <div className="flex flex-col gap-1 rounded-[16px] border border-line bg-canvas p-3 text-small" data-etat={`${service}-relie`}>
      <span className="text-base text-ink">{quoi}</span>
      <span className="text-ink-3">
        {etat.enCours ? "Relevé en cours… " : null}
        {etat.dernierReleve ? `Dernier relevé ${etat.dernierReleve}` : "Pas encore relevé"}
        {etat.bilan ? ` : ${etat.bilan}` : ""}. Relevé automatique {rythme}.
      </span>
      {etat.illisible ? (
        <span className="text-alert">Le secret enregistré ne peut plus être lu (clé de chiffrement changée) : recollez-le ci-dessous.</span>
      ) : etat.erreur ? (
        <span className="text-alert">Dernier relevé en échec : {etat.erreur}</span>
      ) : null}
    </div>
  );
}

function Deconnecter({ service, texte, pending, lancer }: { service: Service; texte: string; pending: boolean; lancer: ReturnType<typeof useGeste>["lancer"] }) {
  const [confirmer, setConfirmer] = useState(false);
  const [effacer, setEffacer] = useState(false);
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      {confirmer ? (
        <div className="flex flex-col gap-2 rounded-[16px] border border-line-strong bg-mute/40 p-3 text-small text-ink-2">
          <span>{texte}</span>
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2">
            <input type="checkbox" checked={effacer} onChange={(e) => setEffacer(e.target.checked)} className="h-[18px] w-[18px]" />
            Effacer aussi ce qui est déjà gardé sur les fiches
          </label>
          <span className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} className={primaire} onClick={() => lancer("deco", () => deconnecterService({ service, effacer }), (r) => r.ok && setConfirmer(false))}>
              Oui, déconnecter
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
  );
}

function BoutonSync({ service, pending, geste, lancer }: { service: Service; pending: boolean; geste: string | null; lancer: ReturnType<typeof useGeste>["lancer"] }) {
  return (
    <button type="button" disabled={pending} className={secondaire} onClick={() => lancer("sync", () => synchroniserService(service))}>
      {pending && geste === "sync" ? "Relevé en cours…" : "Synchroniser maintenant"}
    </button>
  );
}

/* ---------------------------------------------------------------- Trello -- */

export type CarteSansFiche = { id: string; nom: string; colonne: string; url: string };

export function TrelloReglages({
  etat,
  membre,
  disponibles,
  suivis,
  sansFiche,
}: {
  etat: EtatCommun;
  membre: string | null;
  disponibles: { id: string; nom: string }[];
  suivis: string[];
  sansFiche: CarteSansFiche[];
}) {
  const [cle, setCle] = useState("");
  const [jeton, setJeton] = useState("");
  const [choix, setChoix] = useState<string[]>(suivis);
  const { resultat, geste, pending, lancer } = useGeste();

  return (
    <div className="flex flex-col gap-4 px-5 pt-1 pb-5">
      <p className="text-base text-ink-2">
        Pilot lit les tableaux Trello choisis <b className="font-semibold text-ink">en lecture seule</b> : il ne crée, ne déplace, ne commente ni
        n&apos;archive aucune carte. Une carte « Client — action » va sur la fiche du client (nom sans symbole, accents ni majuscules) ; les cartes de
        « 🔥 Cette semaine », en retard ou « ⏳ En attente du client » depuis plus de 7 jours arrivent dans « Ce matin ».
      </p>
      <Etat etat={etat} service="trello" quoi={<>Relié au compte Trello <b className="font-semibold">{membre ?? "?"}</b></>} />

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          lancer("tester", () => testerEtEnregistrerTrello({ cle, jeton }), (r) => {
            if (r.ok) {
              setCle("");
              setJeton("");
            }
          });
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-ink-3">Clé d&apos;API Trello · {etat.relie && !etat.illisible ? "enregistrée, chiffrée" : "32 caractères"}</span>
          <input name="cle" required autoComplete="off" spellCheck={false} value={cle} onChange={(e) => setCle(e.target.value)} placeholder={etat.relie ? "Collez-en une nouvelle pour la remplacer" : "Clé API du Power-Up"} className={champ} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-ink-3">Jeton Trello</span>
          <input name="jeton" type="password" required autoComplete="new-password" spellCheck={false} value={jeton} onChange={(e) => setJeton(e.target.value)} placeholder="ATTA…" className={champ} />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending} className={primaire}>
            {pending && geste === "tester" ? "Connexion à Trello…" : "Tester et enregistrer"}
          </button>
          {etat.relie ? <BoutonSync service="trello" pending={pending} geste={geste} lancer={lancer} /> : null}
        </div>
      </form>
      <Resultat r={resultat} service="trello" />

      {etat.relie && disponibles.length ? (
        <fieldset className="flex flex-col gap-2 rounded-[16px] border border-line p-3" data-tableaux-trello>
          <legend className="px-1 text-small font-semibold text-ink">Tableaux à suivre</legend>
          {disponibles.map((t) => (
            <label key={t.id} className="flex min-h-[44px] cursor-pointer items-center gap-2 text-base text-ink">
              <input
                type="checkbox"
                className="h-[18px] w-[18px]"
                checked={choix.includes(t.id)}
                onChange={(e) => setChoix((c) => (e.target.checked ? [...c, t.id] : c.filter((x) => x !== t.id)))}
              />
              {t.nom}
            </label>
          ))}
          <div>
            <button type="button" disabled={pending} className={secondaire} onClick={() => lancer("tableaux", () => choisirTableauxTrello({ ids: choix }))}>
              {pending && geste === "tableaux" ? "Enregistrement…" : "Enregistrer les tableaux"}
            </button>
          </div>
        </fieldset>
      ) : null}

      {etat.relie ? (
        <details className="rounded-[16px] border border-line p-3 text-small text-ink-2" data-cartes-sans-fiche>
          <summary className="cursor-pointer font-semibold text-ink">Cartes Trello sans fiche ({sansFiche.length})</summary>
          {sansFiche.length === 0 ? (
            <p className="mt-2 text-ink-3">Toutes les cartes « Client — action » ont trouvé leur fiche.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {sansFiche.slice(0, 40).map((c) => (
                <li key={c.id} className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="break-words">
                    {c.nom}
                  </a>
                  <span className="text-micro text-ink-3">{c.colonne}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-ink-3">Pour en relier une : ouvrez la fiche du client, section « Actions Trello », et choisissez-la.</p>
        </details>
      ) : null}

      <details className="rounded-[16px] border border-line p-3 text-small text-ink-2" open={!etat.relie}>
        <summary className="cursor-pointer font-semibold text-ink">Créer la clé et le jeton (3 minutes)</summary>
        <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5">
          <li>
            Ouvrez{" "}
            <a href="https://trello.com/power-ups/admin" target="_blank" rel="noopener noreferrer">
              trello.com/power-ups/admin
            </a>{" "}
            et créez un Power-Up « Pilot » (espace de travail de l&apos;agence ; l&apos;adresse du connecteur peut rester vide).
          </li>
          <li>Onglet « Clé API » : « Générer une nouvelle clé API ». Copiez la clé (32 caractères) ci-dessus.</li>
          <li>À côté de la clé, cliquez sur le lien « Jeton », acceptez (« Autoriser »), puis copiez le jeton affiché ci-dessus.</li>
          <li>« Tester et enregistrer », puis cochez « CEO / EMMANUEL TAOCHY » (coché d&apos;office s&apos;il existe).</li>
          <li>Pour couper l&apos;accès : « Déconnecter » ici, et révoquez le jeton dans Trello (Paramètres du compte → Applications).</li>
        </ol>
      </details>

      {etat.relie ? <Deconnecter service="trello" texte="Effacer la clé et le jeton Trello ? Pilot cessera de lire les tableaux." pending={pending} lancer={lancer} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------ GoCardless -- */

export function GoCardlessReglages({
  etat,
  environnement,
  sansFiche,
}: {
  etat: EtatCommun;
  environnement: "live" | "sandbox";
  sansFiche: { id: string; nom: string; echecs: number }[];
}) {
  const [jeton, setJeton] = useState("");
  const [env, setEnv] = useState<"live" | "sandbox">(environnement);
  const { resultat, geste, pending, lancer } = useGeste();
  return (
    <div className="flex flex-col gap-4 px-5 pt-1 pb-5">
      <p className="text-base text-ink-2">
        Pilot lit GoCardless <b className="font-semibold text-ink">en lecture seule</b> (jeton « Read-only ») : mandats, abonnements et paiements des
        clients reliés à une fiche (par e-mail, sinon par nom d&apos;entreprise, ou à la main depuis la fiche). Il ne crée, n&apos;annule ni ne rembourse
        rien.
      </p>
      <Etat etat={etat} service="gocardless" quoi={<>Relié en <b className="font-semibold">{environnement === "live" ? "live" : "sandbox (essais)"}</b>, lecture seule</>} />
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          lancer("tester", () => testerEtEnregistrerGoCardless({ jeton, environnement: env }), (r) => r.ok && setJeton(""));
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-ink-3">Jeton d&apos;accès (Read-only) · {etat.relie && !etat.illisible ? "enregistré, chiffré" : "commence par live_"}</span>
          <input name="jeton" type="password" required autoComplete="new-password" spellCheck={false} value={jeton} onChange={(e) => setJeton(e.target.value)} placeholder={etat.relie ? "Collez-en un nouveau pour le remplacer" : "live_…"} className={champ} />
        </label>
        <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-base text-ink">
          <legend className="eyebrow mb-1 text-ink-3">Environnement</legend>
          {(["live", "sandbox"] as const).map((e) => (
            <label key={e} className="flex min-h-[44px] cursor-pointer items-center gap-2">
              <input type="radio" name="environnement" value={e} checked={env === e} onChange={() => setEnv(e)} className="h-[18px] w-[18px]" />
              {e === "live" ? "Live (vrais prélèvements)" : "Sandbox (essais)"}
            </label>
          ))}
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending} className={primaire}>
            {pending && geste === "tester" ? "Connexion à GoCardless…" : "Tester et enregistrer"}
          </button>
          {etat.relie ? <BoutonSync service="gocardless" pending={pending} geste={geste} lancer={lancer} /> : null}
        </div>
      </form>
      <Resultat r={resultat} service="gocardless" />
      {etat.relie && sansFiche.length ? (
        <details className="rounded-[16px] border border-line p-3 text-small text-ink-2" data-gocardless-sans-fiche>
          <summary className="cursor-pointer font-semibold text-ink">Clients GoCardless sans fiche ({sansFiche.length})</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {sansFiche.slice(0, 40).map((c) => (
              <li key={c.id}>
                {c.nom}
                {c.echecs ? <span className="text-alert"> · {c.echecs} paiement{c.echecs > 1 ? "s" : ""} en échec</span> : null}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-ink-3">Pour en relier un : ouvrez sa fiche, partie « Argent », et choisissez-le.</p>
        </details>
      ) : null}
      <details className="rounded-[16px] border border-line p-3 text-small text-ink-2" open={!etat.relie}>
        <summary className="cursor-pointer font-semibold text-ink">Créer le jeton (2 minutes)</summary>
        <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5">
          <li>
            Ouvrez{" "}
            <a href="https://manage.gocardless.com/developers/access-tokens/create" target="_blank" rel="noopener noreferrer">
              GoCardless → Développeurs → Créer → Jeton d&apos;accès
            </a>
            .
          </li>
          <li>Nommez-le « Pilot » et choisissez le droit « Read-only » (lecture seule), puis « Créer ».</li>
          <li>Copiez le jeton (il commence par « live_ ») et collez-le ci-dessus. GoCardless ne le montrera plus.</li>
          <li>Pour couper l&apos;accès : « Déconnecter » ici, et supprimez le jeton dans la même page GoCardless.</li>
        </ol>
      </details>
      {etat.relie ? <Deconnecter service="gocardless" texte="Effacer le jeton GoCardless ? Pilot cessera de lire les prélèvements." pending={pending} lancer={lancer} /> : null}
    </div>
  );
}

/* --------------------------------------------------------- Google Agenda -- */

export function AgendaReglages({ etat, agendas }: { etat: EtatCommun; agendas: { nom: string; adresse: string }[] }) {
  const [url, setUrl] = useState("");
  const [nom, setNom] = useState("");
  const { resultat, geste, pending, lancer } = useGeste();
  return (
    <div className="flex flex-col gap-4 px-5 pt-1 pb-5">
      <p className="text-base text-ink-2">
        Pilot lit l&apos;agenda par son <b className="font-semibold text-ink">adresse secrète au format iCal</b>, en lecture seule. C&apos;est votre
        agenda personnel : seuls les rendez-vous qui concernent une fiche (invité connu, nom d&apos;un client ou d&apos;un prospect dans le titre, ou mot
        choisi sur la fiche) sont gardés ; tout le reste est ignoré sans être stocké. Description : 280 caractères au plus.
      </p>
      <Etat etat={etat} service="agenda" quoi={<>{agendas.length} agenda{agendas.length > 1 ? "s" : ""} relié{agendas.length > 1 ? "s" : ""}</>} />
      {agendas.length ? (
        <ul className="flex flex-col gap-2" data-agendas>
          {agendas.map((a, i) => (
            <li key={`${a.adresse}-${i}`} className="flex min-w-0 flex-wrap items-center gap-2 rounded-[14px] border border-line px-3 py-2">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="clip text-base font-semibold text-ink">{a.nom}</span>
                <span className="clip text-small text-ink-3">{a.adresse}</span>
              </span>
              <button type="button" disabled={pending} className={secondaire} onClick={() => lancer("retirer", () => retirerAgendaAction({ position: i }))}>
                Retirer
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          lancer("tester", () => testerEtAjouterAgenda({ url, nom }), (r) => {
            if (r.ok) {
              setUrl("");
              setNom("");
            }
          });
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-ink-3">{agendas.length ? "Ajouter un autre agenda · adresse secrète iCal" : "Adresse secrète au format iCal"}</span>
          <input name="url" type="password" required autoComplete="off" spellCheck={false} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" className={champ} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-ink-3">Nom (pour vous y retrouver)</span>
          <input name="nom" autoComplete="off" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Agenda principal" className={champ} />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending} className={primaire}>
            {pending && geste === "tester" ? "Lecture de l'agenda…" : "Tester et enregistrer"}
          </button>
          {etat.relie ? <BoutonSync service="agenda" pending={pending} geste={geste} lancer={lancer} /> : null}
        </div>
      </form>
      <Resultat r={resultat} service="agenda" />
      <details className="rounded-[16px] border border-line p-3 text-small text-ink-2" open={!etat.relie}>
        <summary className="cursor-pointer font-semibold text-ink">Trouver l&apos;adresse secrète (1 minute, sur ordinateur)</summary>
        <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5">
          <li>
            Ouvrez{" "}
            <a href="https://calendar.google.com/calendar/r/settings" target="_blank" rel="noopener noreferrer">
              Google Agenda → Paramètres
            </a>
            , puis, à gauche, l&apos;agenda à relier (« Paramètres de mes agendas »).
          </li>
          <li>Descendez jusqu&apos;à « Intégrer l&apos;agenda » → « Adresse secrète au format iCal », cliquez sur l&apos;icône de copie.</li>
          <li>Collez-la ci-dessus. Recommencez pour chaque agenda à relier.</li>
          <li>Pour couper l&apos;accès : « Retirer » ici, et « Réinitialiser » l&apos;adresse secrète dans Google Agenda.</li>
        </ol>
        <p className="mt-2 text-ink-3">
          Pourquoi pas une connexion Google ? Avec un compte Google personnel, une application non vérifiée perd son accès tous les 7 jours. L&apos;adresse
          iCal reste valable tant que vous ne la réinitialisez pas.
        </p>
      </details>
      {etat.relie ? <Deconnecter service="agenda" texte="Effacer toutes les adresses d'agenda ? Pilot cessera de lire vos rendez-vous." pending={pending} lancer={lancer} /> : null}
      <p className="text-micro text-ink-3">
        Les rendez-vous gardés apparaissent sur les fiches (section « Rendez-vous ») et dans « Ce matin ». <Link href="/contacts">Contacts</Link>
      </p>
    </div>
  );
}
