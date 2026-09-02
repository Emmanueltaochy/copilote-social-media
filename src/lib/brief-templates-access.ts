import type { BriefTemplate, User } from "@/db";
import { departmentsOf, type Department } from "./auth";

/**
 * Qui a le droit de faire quoi sur un modèle de brief.
 *
 * Logique pure, sans base ni requête, et dans son propre fichier : c'est le
 * seul endroit de ce chantier où une erreur a des conséquences réelles, et
 * une règle d'autorisation noyée dans une route est une règle qu'on ne relit
 * jamais. Ici elle se lit d'un bloc et se teste sans rien monter.
 *
 * Trois principes, et le troisième est le moins évident :
 *
 * - **Un compte client n'a rien à faire ici**, en lecture comme en écriture.
 *   Les modèles sont un outil d'agence ; le portail n'en montre jamais un. Un
 *   client répond à un brief, il ne voit pas la machine qui l'a fabriqué.
 *
 * - **Un modèle de pôle n'appartient qu'à ses pôles.** Même lecture : laisser
 *   l'équipe web parcourir les questionnaires du social reviendrait à défaire
 *   le cloisonnement que `requireDepartment` tient partout ailleurs.
 *
 * - **Un modèle global se lit par tous mais ne se modifie que par la
 *   direction.** C'est ce qui empêche qu'une retouche faite pour un client
 *   parte silencieusement dans le questionnaire de tous les autres.
 */

/** Ce qu'il faut savoir d'un modèle pour trancher — pas la ligne entière. */
export type PorteeModele = Pick<BriefTemplate, "scope" | "departments" | "isSystem">;

const polesDe = (user: Pick<User, "role" | "departments">): Department[] => departmentsOf(user);

const partageUnPole = (user: Pick<User, "role" | "departments">, modele: PorteeModele): boolean =>
  polesDe(user).some((pole) => (modele.departments ?? []).includes(pole));

/** Voir le modèle dans la galerie, l'ouvrir, l'exporter. */
export function peutLire(user: User, modele: PorteeModele): boolean {
  if (user.role === "client") return false;
  if (modele.scope === "global") return true;
  return partageUnPole(user, modele);
}

/** Modifier la structure, renommer, archiver. */
export function peutEcrire(user: User, modele: PorteeModele): boolean {
  if (user.role === "client") return false;
  // Un modèle global sert tout le monde : le retoucher est un arbitrage, pas
  // une commodité. La direction seule.
  if (modele.scope === "global") return user.role === "direction";
  return partageUnPole(user, modele);
}

/**
 * Supprimer.
 *
 * Un modèle fourni avec le produit ne se supprime pas — il se duplique. Sans
 * cette barrière, une suppression faite un jour de ménage emporterait un
 * modèle que le seed remettrait au démarrage suivant, en écrasant les
 * retouches qu'on croyait avoir gardées.
 */
export const peutSupprimer = (user: User, modele: PorteeModele): boolean =>
  !modele.isSystem && peutEcrire(user, modele);

/**
 * Créer un modèle avec la portée demandée.
 *
 * Créer un modèle global équivaut à en modifier un : il s'appliquera à tous
 * les pôles. Réservé à la direction, sinon la règle du dessus se contourne en
 * créant plutôt qu'en modifiant.
 *
 * Un modèle de pôle ne peut viser que des pôles auxquels on appartient soi-même.
 */
export function peutCreer(user: User, portee: Pick<PorteeModele, "scope" | "departments">): boolean {
  if (user.role === "client") return false;
  if (portee.scope === "global") return user.role === "direction";
  const miens = polesDe(user);
  const vises = portee.departments ?? [];
  return vises.length > 0 && vises.every((pole) => miens.includes(pole as Department));
}
