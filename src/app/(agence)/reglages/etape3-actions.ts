"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { currentDirection } from "@/lib/auth";
import { ajouterAgenda, deconnecterAgenda, retirerAgenda, testerAgenda } from "@/lib/agenda";
import { synchroniser } from "@/lib/etape3";
import { deconnecterGoCardless, enregistrerGoCardless, testerGoCardless } from "@/lib/gocardless";
import { choisirTableaux, deconnecterTrello, enregistrerTrello, testerTrello } from "@/lib/trello";

/*
 * Les cartes « Trello », « GoCardless » et « Google Agenda » de Réglages.
 * Réservé à la direction : chaque action relit la session côté serveur. Les
 * clés, jetons et adresses arrivent ici, sont essayés (en lecture seule),
 * puis chiffrés ; ils ne repartent jamais vers le navigateur et ne sont
 * jamais écrits dans un journal.
 */

export type ResultatEtape3 = { ok: true; message: string } | { ok: false; erreur: string };

const refuse = { ok: false as const, erreur: "Accès refusé." };
const invalide = { ok: false as const, erreur: "Demande invalide." };
const Service = z.enum(["trello", "gocardless", "agenda"]);
const NOMS = { trello: "Trello", gocardless: "GoCardless", agenda: "Google Agenda" } as const;

const rafraichir = () => {
  revalidatePath("/reglages");
  revalidatePath("/");
};

/* ---------------------------------------------------------------- Trello -- */

const SaisieTrello = z.object({ cle: z.string().max(200), jeton: z.string().max(400) });

export async function testerEtEnregistrerTrello(saisie: unknown): Promise<ResultatEtape3> {
  if (!(await currentDirection())) return refuse;
  const p = SaisieTrello.safeParse(saisie);
  if (!p.success) return invalide;
  const cle = p.data.cle.trim();
  const jeton = p.data.jeton.trim();
  if (!/^[0-9a-f]{32}$/i.test(cle)) return { ok: false, erreur: "La clé d'API Trello fait 32 caractères (chiffres et lettres a à f). Copiez-la depuis trello.com/power-ups/admin → votre Power-Up → « Clé API »." };
  if (!/^[A-Za-z0-9]{40,100}$/.test(jeton)) return { ok: false, erreur: "Le jeton Trello est une longue suite de lettres et de chiffres (souvent commençant par « ATTA »). Générez-le avec le lien « Jeton » à côté de la clé API." };
  const r = await testerTrello(cle, jeton);
  if (!r.ok) return { ok: false, erreur: r.erreur };
  await enregistrerTrello(cle, jeton, r.membre, r.tableaux);
  after(() => synchroniser("trello").catch(() => undefined));
  rafraichir();
  return { ok: true, message: `Connexion réussie (${r.membre}) : ${r.tableaux.length} tableau${r.tableaux.length > 1 ? "x" : ""} trouvé${r.tableaux.length > 1 ? "s" : ""}. Clé et jeton chiffrés et enregistrés. Choisissez les tableaux à suivre ci-dessous.` };
}

const SaisieTableaux = z.object({ ids: z.array(z.string().max(64)).max(50) });

export async function choisirTableauxTrello(saisie: unknown): Promise<ResultatEtape3> {
  if (!(await currentDirection())) return refuse;
  const p = SaisieTableaux.safeParse(saisie);
  if (!p.success) return invalide;
  await choisirTableaux(p.data.ids);
  after(() => synchroniser("trello").catch(() => undefined));
  rafraichir();
  return { ok: true, message: p.data.ids.length ? "Tableaux enregistrés : relevé lancé." : "Aucun tableau suivi." };
}

/* ------------------------------------------------------------ GoCardless -- */

const SaisieGc = z.object({ jeton: z.string().max(400), environnement: z.enum(["live", "sandbox"]) });

export async function testerEtEnregistrerGoCardless(saisie: unknown): Promise<ResultatEtape3> {
  if (!(await currentDirection())) return refuse;
  const p = SaisieGc.safeParse(saisie);
  if (!p.success) return invalide;
  const jeton = p.data.jeton.trim();
  if (!/^(live|sandbox)_[A-Za-z0-9_-]{20,}$/.test(jeton)) return { ok: false, erreur: "Un jeton d'accès GoCardless commence par « live_ » (ou « sandbox_ » pour les essais). GoCardless → Développeurs → Créer → Jeton d'accès, droit « Read-only »." };
  if (!jeton.startsWith(`${p.data.environnement}_`)) {
    return { ok: false, erreur: `Ce jeton est un jeton ${jeton.startsWith("live_") ? "live" : "sandbox"} : choisissez l'environnement « ${jeton.startsWith("live_") ? "Live" : "Sandbox"} ».` };
  }
  const r = await testerGoCardless(jeton, p.data.environnement);
  if (!r.ok) return { ok: false, erreur: r.erreur };
  await enregistrerGoCardless(jeton, p.data.environnement);
  after(() => synchroniser("gocardless").catch(() => undefined));
  rafraichir();
  return { ok: true, message: `Connexion réussie (${p.data.environnement === "live" ? "live" : "sandbox"}, lecture seule). Jeton chiffré et enregistré. Premier relevé lancé.` };
}

/* --------------------------------------------------------- Google Agenda -- */

const SaisieAgenda = z.object({ url: z.string().max(2000), nom: z.string().max(80) });

export async function testerEtAjouterAgenda(saisie: unknown): Promise<ResultatEtape3> {
  if (!(await currentDirection())) return refuse;
  const p = SaisieAgenda.safeParse(saisie);
  if (!p.success) return invalide;
  const r = await testerAgenda(p.data.url);
  if (!r.ok) return { ok: false, erreur: r.erreur };
  await ajouterAgenda(p.data.url, p.data.nom);
  after(() => synchroniser("agenda").catch(() => undefined));
  rafraichir();
  return { ok: true, message: `Agenda lu : ${r.evenements} rendez-vous dans la fenêtre lue (90 jours avant, 120 jours après). Adresse chiffrée et enregistrée. Seuls ceux qui concernent une fiche seront gardés.` };
}

const SaisiePosition = z.object({ position: z.number().int().min(0).max(50) });

export async function retirerAgendaAction(saisie: unknown): Promise<ResultatEtape3> {
  if (!(await currentDirection())) return refuse;
  const p = SaisiePosition.safeParse(saisie);
  if (!p.success) return invalide;
  await retirerAgenda(p.data.position);
  after(() => synchroniser("agenda").catch(() => undefined));
  rafraichir();
  return { ok: true, message: "Agenda retiré : son adresse est effacée." };
}

/* ------------------------------------------------------------- communs -- */

/** « Synchroniser maintenant » : attend au plus 25 s, puis laisse le relevé finir en arrière-plan. */
export async function synchroniserService(saisie: unknown): Promise<ResultatEtape3> {
  if (!(await currentDirection())) return refuse;
  const p = Service.safeParse(saisie);
  if (!p.success) return invalide;
  const releve = synchroniser(p.data);
  const r = await Promise.race([releve, new Promise<null>((ok) => setTimeout(() => ok(null), 25_000))]);
  rafraichir();
  if (!r) return { ok: true, message: "Le relevé est long : il continue en arrière-plan. Rechargez la page dans une minute." };
  if (r.etat === "non_relie") return { ok: false, erreur: `${NOMS[p.data]} n'est pas relié.` };
  if (r.etat === "deja_en_cours") return { ok: true, message: "Un relevé est déjà en cours : les données arrivent dans un instant." };
  if (r.etat === "erreur") return { ok: false, erreur: r.erreur };
  const b = ("bilan" in r ? r.bilan : {}) as unknown as Record<string, number>;
  const message =
    p.data === "trello"
      ? `Relevé terminé : ${b.cartes} carte${b.cartes > 1 ? "s" : ""}, ${b.rattachees} rattachée${b.rattachees > 1 ? "s" : ""} à une fiche, ${b.agence} pour toute l'agence, ${b.sansFiche} sans fiche.`
      : p.data === "gocardless"
        ? `Relevé terminé : ${b.clients} client${b.clients > 1 ? "s" : ""} GoCardless, ${b.rattaches} rattaché${b.rattaches > 1 ? "s" : ""}, ${b.paiements} paiement${b.paiements > 1 ? "s" : ""} lus.`
        : `Relevé terminé : ${b.lus} rendez-vous lus, ${b.gardes} gardé${b.gardes > 1 ? "s" : ""} (rattachés à une fiche), ${b.ignores} ignoré${b.ignores > 1 ? "s" : ""} sans être stockés.`;
  return { ok: true, message };
}

const Deconnexion = z.object({ service: Service, effacer: z.boolean() });

export async function deconnecterService(saisie: unknown): Promise<ResultatEtape3> {
  if (!(await currentDirection())) return refuse;
  const p = Deconnexion.safeParse(saisie);
  if (!p.success) return invalide;
  if (p.data.service === "trello") await deconnecterTrello(p.data.effacer);
  else if (p.data.service === "gocardless") await deconnecterGoCardless(p.data.effacer);
  else await deconnecterAgenda(p.data.effacer);
  rafraichir();
  return {
    ok: true,
    message: `${NOMS[p.data.service]} déconnecté : ${p.data.service === "agenda" ? "adresses effacées" : "clé effacée"}${p.data.effacer ? ", et les données gardées sur les fiches aussi." : ". Ce qui est déjà sur les fiches y reste."}`,
  };
}
