import type { NavItem } from "./nav";

/**
 * La navigation du pôle web.
 *
 * Volontairement courte. Un projet web se suit à quatre endroits : le tableau
 * d'avancement, la fiche du projet, les briefs qu'on attend, et les contacts
 * (annuaire, fiche client, portefeuille). Tout le reste vit dans la fiche.
 */
export const NAV_WEB_MAIN: NavItem[] = [
  { label: "Projets", href: "/web", icon: "layers", hint: "Les sites en cours, phase par phase" },
  { label: "Briefs", href: "/web/briefs", icon: "list", hint: "Les questionnaires envoyés aux clients" },
  {
    label: "Contacts",
    href: "/contacts",
    icon: "users",
    hint: "Clients, prospects et partenaires : une fiche par contact",
    match: ["/clients"],
  },
  { label: "Devis", href: "/devis", icon: "inbox", badge: "devis", hint: "Demandes arrivées des portails" },
  { label: "Jarvis", href: "/jarvis", icon: "sparkles", hint: "Le chef de projet web IA : devis Abby, projets, cahiers des charges" },
];

export const NAV_WEB_MORE: NavItem[] = [
  { group: "Outils", label: "Mes heures", href: "/heures", icon: "clock", hint: "Saisie de la semaine" },
  { group: "Direction", label: "Équipe", href: "/equipe", icon: "users", directionOnly: true, hint: "Accès, rôles et invitations" },
  { group: "Direction", label: "Réglages", href: "/reglages", icon: "settings", directionOnly: true, hint: "Agence, portail, logos, offres" },
];

export const NAV_WEB: NavItem[] = [...NAV_WEB_MAIN, ...NAV_WEB_MORE];
