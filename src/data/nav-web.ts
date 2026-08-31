import type { NavItem } from "./nav";

/**
 * La navigation du pôle web.
 *
 * Volontairement courte. Un projet web se suit à quatre endroits : le tableau
 * d'avancement, la fiche du projet, les briefs qu'on attend, et les clients.
 * Tout le reste est du détail qui vit dans la fiche.
 */
export const NAV_WEB: NavItem[] = [
  { label: "Projets", href: "/web" },
  { label: "Briefs", href: "/web/briefs" },
  { label: "Clients", href: "/clients" },
  { label: "Devis", href: "/devis" },
  { label: "Mes heures", href: "/heures" },
  { label: "Équipe", href: "/equipe", directionOnly: true },
  { label: "Réglages", href: "/reglages", directionOnly: true },
];
