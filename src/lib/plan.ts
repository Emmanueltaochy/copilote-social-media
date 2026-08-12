import "server-only";

import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { activity, clients, contents, contractLines } from "@/db/schema";
import { networksLabel, networksOf } from "@/data/content";
import { monthRange } from "./pacing";

/**
 * La préparation d'un mois.
 *
 * Une agence au forfait refait chaque mois le même geste : recréer à la main
 * les contenus que le contrat décrit déjà — six posts feed, huit stories, trois
 * reels. Le contrat est en base, la répétition est mécanique : c'est
 * exactement ce qu'une machine doit faire à notre place.
 *
 * Trois règles gouvernent tout ce fichier.
 *
 * 1. On ne crée que ce qui manque. Le bouton se compare à l'existant plutôt
 *    que de créer aveuglément : on peut donc l'utiliser en milieu de mois, et
 *    appuyer deux fois sans se retrouver avec le double.
 * 2. Rien n'est inventé. Sans décomposition de l'engagement, on ne génère
 *    rien : seize contenus au hasard coûteraient plus à trier qu'à saisir.
 * 3. Tout naît au statut « idée », sans légende. La machine pose le squelette
 *    du mois ; elle ne prétend pas savoir quoi raconter.
 */

export type LigneDuMois = {
  lineId: string;
  label: string;
  kind: string;
  network: string;
  networks: string[];
  /** « Instagram · Facebook », prêt à afficher. */
  reseaux: string;
  cible: number;
  /** Contenus de ce format déjà présents sur le mois, quel qu'en soit l'auteur. */
  existants: number;
  manquants: number;
};

export type PlanDuMois = {
  clientId: string;
  clientName: string;
  mois: Date;
  lignes: LigneDuMois[];
  /** Somme des manquants : ce que le bouton créerait. */
  aCreer: number;
  /** Vrai quand le client n'a aucune décomposition : rien à générer. */
  sansDecomposition: boolean;
};

/** Le premier jour du mois désigné par « 2026-09 ». Le mois courant sinon. */
export function moisDepuis(valeur: string | null | undefined, maintenant = new Date()): Date {
  const m = /^(\d{4})-(\d{2})$/.exec(valeur ?? "");
  if (!m) return new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
  const année = Number(m[1]);
  const mois = Number(m[2]) - 1;
  if (mois < 0 || mois > 11) return new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
  return new Date(année, mois, 1);
}

export const moisEnCode = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export const moisEnTexte = (d: Date) =>
  d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

/**
 * Ce qu'il manque à un client pour tenir son engagement sur un mois donné.
 *
 * Le décompte se fait sur la date de publication prévue, et non sur la date de
 * création : un contenu créé en août pour le 3 septembre appartient à
 * septembre. C'est ce que dit le contrat, et c'est ce que le client comptera.
 */
export async function planDuMois(clientId: string, mois: Date): Promise<PlanDuMois | null> {
  const [client] = await db
    .select({ id: clients.id, name: clients.shortName })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) return null;

  const { start, end } = monthRange(mois);

  const [lignes, existants] = await Promise.all([
    db
      .select()
      .from(contractLines)
      .where(eq(contractLines.clientId, clientId))
      .orderBy(asc(contractLines.position)),
    db
      .select({ kind: contents.kind, id: contents.id })
      .from(contents)
      .where(
        and(
          eq(contents.clientId, clientId),
          gte(contents.scheduledAt, start),
          lt(contents.scheduledAt, end),
        ),
      ),
  ]);

  // Le décompte est par format, pas par ligne de contrat : deux lignes du même
  // format se partagent ce qui existe déjà, sans quoi chacune croirait que
  // l'autre n'a rien fait et le mois serait créé en double.
  const parFormat = new Map<string, number>();
  for (const c of existants) parFormat.set(c.kind, (parFormat.get(c.kind) ?? 0) + 1);

  const restant = new Map(parFormat);
  const détail: LigneDuMois[] = lignes.map((l) => {
    const dispo = restant.get(l.kind) ?? 0;
    const imputés = Math.min(dispo, l.monthlyTarget);
    restant.set(l.kind, dispo - imputés);
    return {
      lineId: l.id,
      label: l.label,
      kind: l.kind,
      network: l.network,
      networks: networksOf(l),
      reseaux: networksLabel(l),
      cible: l.monthlyTarget,
      existants: imputés,
      manquants: Math.max(0, l.monthlyTarget - imputés),
    };
  });

  return {
    clientId: client.id,
    clientName: client.name,
    mois: start,
    lignes: détail,
    aCreer: détail.reduce((n, l) => n + l.manquants, 0),
    sansDecomposition: lignes.length === 0,
  };
}

/**
 * Les dates auxquelles étaler n contenus dans un mois.
 *
 * Étalées, et non toutes le 1er : un mois entier programmé le même jour se
 * repère mal dans le calendrier et se redate un par un, ce qui annule le gain.
 * Les week-ends sont sautés par défaut — une agence publie en semaine, et un
 * post programmé un dimanche est un post que personne ne relira avant.
 */
export function répartir(
  mois: Date,
  combien: number,
  options: { joursOuvres: boolean; heure: number; decalage?: number },
): Date[] {
  if (combien <= 0) return [];

  const dernier = new Date(mois.getFullYear(), mois.getMonth() + 1, 0).getDate();
  const jours: number[] = [];
  for (let j = 1; j <= dernier; j += 1) {
    const jour = new Date(mois.getFullYear(), mois.getMonth(), j).getDay();
    if (options.joursOuvres && (jour === 0 || jour === 6)) continue;
    jours.push(j);
  }
  // Un mois sans jour ouvré n'existe pas, mais un garde-fou coûte moins cher
  // qu'une division par zéro en production.
  if (jours.length === 0) jours.push(1);

  const pas = jours.length / combien;
  const décalage = options.decalage ?? 0;
  return Array.from({ length: combien }, (_, i) => {
    const index = Math.min(jours.length - 1, Math.floor(i * pas + pas / 2) + décalage);
    const jour = jours[Math.max(0, index) % jours.length];
    return new Date(mois.getFullYear(), mois.getMonth(), jour, options.heure, 0, 0, 0);
  });
}

export type ResultatGeneration = {
  crees: number;
  clientName: string;
  message: string;
};

/**
 * Crée les contenus manquants d'un mois, et rien d'autre.
 *
 * Les contenus naissent au statut « idée », sans légende ni consigne : le
 * planning est posé, le travail reste entier. Le titre reprend le libellé de la
 * ligne et son rang — « Post feed 3/6 » — pour qu'on sache d'un coup d'œil ce
 * qui est encore un emplacement vide et ce qui a déjà été nommé.
 */
export async function genererLeMois(
  clientId: string,
  mois: Date,
  auteurId: string,
  options: { joursOuvres: boolean; heure: number },
): Promise<ResultatGeneration> {
  const plan = await planDuMois(clientId, mois);
  if (!plan) return { crees: 0, clientName: "", message: "Client introuvable." };

  if (plan.sansDecomposition) {
    return {
      crees: 0,
      clientName: plan.clientName,
      message:
        "Aucune décomposition de l'engagement pour ce client : ajoute ses lignes (posts feed, stories, reels…) sur sa fiche, et le mois se génèrera à partir d'elles.",
    };
  }
  if (plan.aCreer === 0) {
    return {
      crees: 0,
      clientName: plan.clientName,
      message: `${moisEnTexte(plan.mois)} est déjà complet pour ${plan.clientName}.`,
    };
  }

  const àCréer: (typeof contents.$inferInsert)[] = [];
  let rang = 0;
  for (const ligne of plan.lignes) {
    if (ligne.manquants === 0) continue;
    // Chaque ligne est étalée sur tout le mois, décalée d'un cran par rapport à
    // la précédente : sinon les stories et les reels tomberaient tous les mêmes
    // jours et laisseraient des semaines entières vides.
    const dates = répartir(plan.mois, ligne.manquants, { ...options, decalage: rang });
    rang += 1;

    dates.forEach((date, i) => {
      àCréer.push({
        clientId,
        title: `${ligne.label} ${ligne.existants + i + 1}/${ligne.cible}`,
        kind: ligne.kind as typeof contents.$inferInsert.kind,
        network: ligne.network as typeof contents.$inferInsert.network,
        networks: ligne.networks,
        status: "idee",
        scheduledAt: date,
      });
    });
  }

  await db.insert(contents).values(àCréer);
  await db.insert(activity).values({
    clientId,
    actorId: auteurId,
    text: `${àCréer.length} contenus préparés pour ${moisEnTexte(plan.mois)}`,
  });

  return {
    crees: àCréer.length,
    clientName: plan.clientName,
    message: `${àCréer.length} contenu${àCréer.length > 1 ? "s" : ""} préparé${
      àCréer.length > 1 ? "s" : ""
    } pour ${plan.clientName} · ${moisEnTexte(plan.mois)}.`,
  };
}
