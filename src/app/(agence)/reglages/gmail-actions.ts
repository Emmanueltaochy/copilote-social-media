"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { currentDirection } from "@/lib/auth";
import { cleEmail } from "@/lib/annuaire";
import { deconnecterGmail, enregistrerGmail, gmailRelie, synchroniserGmail, testerConnexion, type ResultatSync } from "@/lib/gmail";
import { nettoyerMotDePasse } from "@/lib/gmail-regles";

/*
 * La carte « Gmail » de Réglages. Réservé à la direction : chaque action relit
 * la session côté serveur. Le mot de passe d'application arrive ici, est
 * essayé, puis chiffré ; il ne repart jamais vers le navigateur et n'est
 * jamais écrit dans un journal.
 */

export type ResultatGmail = { ok: true; message: string } | { ok: false; erreur: string };

const Saisie = z.object({ adresse: z.string().max(200), motDePasse: z.string().max(100) });

/** « Tester et enregistrer » : se connecte en lecture seule ; enregistre seulement si Gmail accepte. */
export async function testerEtEnregistrerGmail(saisie: unknown): Promise<ResultatGmail> {
  if (!(await currentDirection())) return { ok: false, erreur: "Accès refusé." };
  const p = Saisie.safeParse(saisie);
  if (!p.success) return { ok: false, erreur: "Demande invalide." };
  const adresse = cleEmail(p.data.adresse);
  if (!adresse) return { ok: false, erreur: "Saisissez l'adresse Gmail complète (par exemple prenom@gmail.com)." };
  const motDePasse = nettoyerMotDePasse(p.data.motDePasse);
  if (!motDePasse) {
    return {
      ok: false,
      erreur: "Un mot de passe d'application Gmail fait 16 lettres (les espaces sont acceptés). Le mot de passe habituel du compte ne marche pas ici.",
    };
  }

  const r = await testerConnexion(adresse, motDePasse);
  if (!r.ok) return { ok: false, erreur: r.erreur };
  await enregistrerGmail(adresse, motDePasse);
  // Le premier relevé (60 derniers jours) part juste après la réponse.
  after(() => synchroniserGmail().catch(() => undefined));
  revalidatePath("/reglages");
  return {
    ok: true,
    message: `Connexion réussie : boîte ouverte en lecture seule${r.envoyes ? "" : " (dossier « Messages envoyés » introuvable : seuls les messages reçus seront lus)"}. Mot de passe chiffré et enregistré. Premier relevé (60 derniers jours) lancé.`,
  };
}

function texteSync(r: ResultatSync): ResultatGmail {
  if (r.etat === "non_relie") return { ok: false, erreur: "Gmail n'est pas relié." };
  if (r.etat === "deja_en_cours") return { ok: true, message: "Un relevé est déjà en cours : les e-mails arrivent dans un instant." };
  if (r.etat === "erreur") return { ok: false, erreur: r.erreur };
  const b = r.bilan;
  return {
    ok: true,
    message: `Relevé terminé : ${b.lus} message${b.lus > 1 ? "s" : ""} examiné${b.lus > 1 ? "s" : ""}, ${b.retenus} gardé${b.retenus > 1 ? "s" : ""} (contacts de l'annuaire), ${b.ignoresInconnus + b.ignoresAutomatiques} ignoré${b.ignoresInconnus + b.ignoresAutomatiques > 1 ? "s" : ""}.${b.incomplet ? " Il en reste : le relevé suivant continuera." : ""}`,
  };
}

/** « Synchroniser maintenant » : attend au plus 25 s, puis laisse le relevé finir en arrière-plan. */
export async function synchroniserGmailMaintenant(): Promise<ResultatGmail> {
  if (!(await currentDirection())) return { ok: false, erreur: "Accès refusé." };
  if (!(await gmailRelie())) return { ok: false, erreur: "Gmail n'est pas relié." };
  const releve = synchroniserGmail();
  const delai = new Promise<null>((ok) => setTimeout(() => ok(null), 25_000));
  const r = await Promise.race([releve, delai]);
  revalidatePath("/reglages");
  revalidatePath("/");
  if (!r) return { ok: true, message: "Le relevé est long (premier passage ?) : il continue en arrière-plan. Rechargez la page dans quelques minutes." };
  return texteSync(r);
}

const Deconnexion = z.object({ effacer: z.boolean() });

/** « Déconnecter » : efface le mot de passe ; sur demande, les e-mails déjà gardés. */
export async function deconnecterGmailAction(saisie: unknown): Promise<ResultatGmail> {
  if (!(await currentDirection())) return { ok: false, erreur: "Accès refusé." };
  const p = Deconnexion.safeParse(saisie);
  if (!p.success) return { ok: false, erreur: "Demande invalide." };
  await deconnecterGmail(p.data.effacer);
  revalidatePath("/reglages");
  revalidatePath("/");
  return {
    ok: true,
    message: p.data.effacer
      ? "Gmail déconnecté : mot de passe effacé, et les e-mails gardés dans Pilot aussi."
      : "Gmail déconnecté : mot de passe effacé. Les e-mails déjà gardés restent sur les fiches.",
  };
}
