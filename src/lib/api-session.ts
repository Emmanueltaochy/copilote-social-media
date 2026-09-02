import "server-only";

import { currentUser } from "./auth";
import type { User } from "@/db";

/**
 * La garde des routes d'API à session.
 *
 * `requireStaff()` redirige un compte client vers son portail : c'est juste
 * pour une page, trompeur pour un appel programmé — `fetch` suit, reçoit une
 * page en 200, et l'appelant croit avoir réussi. Une route répond.
 *
 * Les deux refus sont distingués à dessein. **401** dit « je ne sais pas qui
 * tu es » et invite à se reconnecter ; **403** dit « je sais qui tu es, et ce
 * n'est pas pour toi ». Les confondre laisse un compte client tourner en rond
 * sur un écran de connexion alors qu'il est déjà connecté.
 */
export type Garde = { user: User } | { refus: Response };

export const estRefuse = (g: Garde): g is { refus: Response } => "refus" in g;

/** Exige un compte interne : ni visiteur, ni client. */
export async function exigeEquipe(): Promise<Garde> {
  const user = await currentUser();
  if (!user) {
    return {
      refus: Response.json({ error: "Connexion requise." }, { status: 401 }),
    };
  }
  if (user.role === "client") {
    return {
      refus: Response.json(
        { error: "Les modèles de brief sont réservés à l'agence." },
        { status: 403 },
      ),
    };
  }
  return { user };
}
