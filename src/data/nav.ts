export type NavItem = {
  label: string;
  href: string;
  /** Coûts internes et marges : réservés à la direction. */
  directionOnly?: boolean;
};

export const NAV: NavItem[] = [
  { label: "Cockpit", href: "/" },
  { label: "Avancement", href: "/avancement" },
  { label: "Calendrier", href: "/calendrier" },
  { label: "Production", href: "/production" },
  { label: "Approbations", href: "/approbations" },
  { label: "À publier", href: "/a-publier" },
  { label: "Tournages", href: "/tournages" },
  { label: "Assets", href: "/assets" },
  { label: "Ads", href: "/ads" },
  { label: "Rapports", href: "/rapports" },
  { label: "Mes heures", href: "/heures" },
  { label: "Clients", href: "/clients" },
  { label: "Équipe", href: "/equipe", directionOnly: true },
  { label: "Rentabilité", href: "/rentabilite", directionOnly: true },
];
