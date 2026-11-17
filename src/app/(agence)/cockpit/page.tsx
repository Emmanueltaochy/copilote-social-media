import { redirect } from "next/navigation";

/**
 * L'ancien « Cockpit agence ».
 *
 * Il montrait, à côté de l'accueil, les engagements triés par urgence, les
 * contenus en retard, les validations et les tournages : les mêmes données
 * que « Aujourd'hui » (ce qui attend) et « Engagements du mois » (le rythme de
 * chaque client). Il n'y a plus qu'un tableau des engagements : l'adresse y
 * mène, pour les favoris et les liens déjà partagés.
 */
export default function AncienCockpit() {
  redirect("/avancement");
}
