import type { IconName } from "@/components/ui/Icon";

export type NavItem = {
  label: string;
  href: string;
  /** Coûts internes et marges : réservés à la direction. */
  directionOnly?: boolean;
  icon?: IconName;
  /** Compteur affiché à côté du libellé. */
  badge?: "validation" | "publier" | "devis";
  /** Une phrase pour le menu « Plus » et la recherche. */
  hint?: string;
};

/*
 * Navigation du pôle social, refondue en novembre 2026.
 *
 * Avant : dix-neuf entrées au même niveau, dont trois écrans de suivi qui se
 * ressemblaient. Maintenant, sur le modèle de Murmura : sept destinations du quotidien en haut, le reste
 * rangé dans « Plus » avec une phrase qui dit à quoi il sert. Aucune route n'a
 * disparu : les anciens liens continuent de fonctionner.
 */
export const NAV_MAIN: NavItem[] = [
  { label: "Aujourd'hui", href: "/", icon: "home" },
  { label: "Calendrier", href: "/calendrier", icon: "calendar" },
  { label: "Production", href: "/production", icon: "layers" },
  { label: "Réception", href: "/boite", icon: "inbox", hint: "Messages et commentaires de tous les comptes" },
  { label: "À valider", href: "/approbations", icon: "check", badge: "validation" },
  { label: "Statistiques", href: "/statistiques", icon: "chart", hint: "Audience, publications et meilleurs moments" },
  { label: "Veille", href: "/veille", icon: "eye", hint: "Les concurrents de chaque client et ce qui marche chez eux" },
  { label: "Tournages", href: "/tournages", icon: "camera" },
];

export const NAV_MORE: NavItem[] = [
  { label: "Jarvis", href: "/jarvis", icon: "sparkles", hint: "Votre directeur marketing IA, à la voix ou à l'écrit" },
  { label: "Clients", href: "/clients", icon: "users", hint: "Fiches, contrats et accès portail" },
  { label: "À publier", href: "/a-publier", icon: "send", badge: "publier", hint: "Prêt, daté, pas encore en ligne" },
  { label: "Campagnes", href: "/ads", icon: "megaphone", hint: "Publicité, ensembles de publicités et budget" },
  { label: "Bibliothèque", href: "/assets", icon: "image", hint: "Photos et vidéos par client" },
  { label: "Rapports", href: "/rapports", icon: "chart", hint: "Le rapport mensuel de chaque client" },
  { label: "Semaine de suivi", href: "/suivi", icon: "list", hint: "Les contenus de la semaine, jour par jour" },
  { label: "Avancement", href: "/avancement", icon: "gauge", hint: "Livré contre vendu, client par client" },
  { label: "Cockpit", href: "/cockpit", icon: "gauge", hint: "Engagements triés par urgence" },
  { label: "Préparer le mois", href: "/preparer", icon: "sparkles", hint: "Créer d'un coup les contenus du mois" },
  { label: "Devis", href: "/devis", icon: "inbox", badge: "devis", hint: "Demandes arrivées des portails" },
  { label: "Mes heures", href: "/heures", icon: "clock", hint: "Saisie de la semaine" },
  { label: "Terrain", href: "/terrain", icon: "phone", hint: "La version téléphone pour les tournages" },
  { label: "Équipe", href: "/equipe", icon: "users", directionOnly: true, hint: "Accès, rôles et invitations" },
  { label: "Rentabilité", href: "/rentabilite", icon: "euro", directionOnly: true, hint: "Forfaits, heures et marges" },
  { label: "Réglages", href: "/reglages", icon: "settings", directionOnly: true, hint: "Metricool, agence, portail, logos" },
];

/** Tout le pôle social, pour la recherche et le menu mobile. */
export const NAV: NavItem[] = [...NAV_MAIN, ...NAV_MORE];
