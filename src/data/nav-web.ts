import type { NavItem } from "./nav";

/**
 * La navigation du pôle web.
 *
 * Volontairement courte. Un projet web se suit à quatre endroits : le tableau
 * d'avancement, la fiche du projet, les briefs qu'on attend, et les clients.
 * Tout le reste est du détail qui vit dans la fiche.
 */
export const NAV_WEB_MAIN: NavItem[] = [
  { label: "Projets", href: "/web", icon: "layers" },
  { label: "Briefs", href: "/web/briefs", icon: "list" },
  { label: "Clients", href: "/clients", icon: "users" },
  { label: "Devis", href: "/devis", icon: "inbox", badge: "devis" },
];

export const NAV_WEB_MORE: NavItem[] = [
  { label: "Mes heures", href: "/heures", icon: "clock", hint: "Saisie de la semaine" },
  { label: "Équipe", href: "/equipe", icon: "users", directionOnly: true, hint: "Accès, rôles et invitations" },
  { label: "Réglages", href: "/reglages", icon: "settings", directionOnly: true, hint: "Agence, portail, logos, offres" },
];

export const NAV_WEB: NavItem[] = [...NAV_WEB_MAIN, ...NAV_WEB_MORE];
