export type NavItem = {
  label: string;
  href: string;
  /** Badge count. Empty when there is nothing waiting. */
  count?: string;
  /** Red dot: something in here is past its deadline. */
  late?: boolean;
};

export const NAV: NavItem[] = [
  { label: "Cockpit", href: "/" },
  { label: "Avancement", href: "/avancement" },
  { label: "Calendrier", href: "/calendrier" },
  { label: "Production", href: "/production", count: "24" },
  { label: "Approbations", href: "/approbations", count: "6" },
  { label: "À publier", href: "/a-publier", count: "4", late: true },
  { label: "Tournages", href: "/tournages", count: "4" },
  { label: "Assets", href: "/assets" },
  { label: "Ads", href: "/ads", count: "7" },
  { label: "Rapports", href: "/rapports" },
  { label: "Clients", href: "/clients", count: "13" },
  { label: "Rentabilité", href: "/rentabilite" },
];
