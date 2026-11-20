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
  /** Section du menu « Plus ». */
  group?: string;
  /**
   * Autres adresses qui allument cette entrée. « Contacts » reste allumé sur
   * le portefeuille et les engagements : ce sont des vues du même espace.
   */
  match?: string[];
};

/*
 * Navigation du pôle social, revue en novembre 2026 (audit UX).
 *
 * Quatre espaces, chacun avec un rôle :
 *   - « Aujourd'hui » : quoi faire maintenant ;
 *   - « Contacts » : tout sur un client (annuaire, fiche, portefeuille,
 *     engagements du mois) ;
 *   - les modules métier : travailler sur un type d'objet (contenus,
 *     validations, messages, chiffres) ;
 *   - les réglages : la configuration, réservée à la direction.
 *
 * Sept destinations du quotidien dans la barre, le reste rangé par thème dans
 * « Plus ». Aucune route n'a disparu : les anciennes adresses redirigent.
 */
export const NAV_MAIN: NavItem[] = [
  { label: "Aujourd'hui", href: "/", icon: "home", hint: "Ce qui attend quelqu'un, ce qui part, la semaine" },
  {
    label: "Contacts",
    href: "/contacts",
    icon: "users",
    hint: "Clients, prospects et partenaires : une fiche par contact",
    match: ["/clients", "/avancement"],
  },
  { label: "Calendrier", href: "/calendrier", icon: "calendar", hint: "Les contenus programmés, mois par mois" },
  { label: "Production", href: "/production", icon: "layers", hint: "Chaque contenu, de l'idée à la publication", match: ["/contenu"] },
  { label: "À valider", href: "/approbations", icon: "check", badge: "validation", hint: "Contenus en attente de validation" },
  { label: "Réception", href: "/boite", icon: "inbox", hint: "Messages et commentaires de tous les comptes" },
  { label: "Statistiques", href: "/statistiques", icon: "chart", hint: "Audience, publications et meilleurs moments" },
];

export const NAV_MORE: NavItem[] = [
  { group: "Contenus", label: "À publier", href: "/a-publier", icon: "send", badge: "publier", hint: "Prêt, daté, pas encore en ligne" },
  { group: "Contenus", label: "Suivi de la semaine", href: "/suivi", icon: "list", hint: "Les contenus de la semaine, jour par jour" },
  { group: "Contenus", label: "Préparer le mois", href: "/preparer", icon: "sparkles", hint: "Créer d'un coup les contenus du mois" },
  { group: "Contenus", label: "Tournages", href: "/tournages", icon: "camera", hint: "Le planning des tournages" },
  { group: "Contenus", label: "Bibliothèque", href: "/assets", icon: "image", hint: "Photos et vidéos par client" },
  { group: "Contenus", label: "Vidéos du stock", href: "/videos-stock", icon: "camera", hint: "Les Reels montés sur taochyagency.com, à importer" },
  { group: "Suivi client", label: "Rapports", href: "/rapports", icon: "chart", hint: "Le rapport mensuel de chaque client" },
  { group: "Suivi client", label: "Campagnes", href: "/ads", icon: "megaphone", hint: "Publicité, ensembles de publicités et budget" },
  { group: "Suivi client", label: "Devis", href: "/devis", icon: "inbox", badge: "devis", hint: "Demandes arrivées des portails" },
  { group: "Suivi client", label: "Veille", href: "/veille", icon: "eye", hint: "Les concurrents de chaque client et ce qui marche chez eux" },
  { group: "Outils", label: "Jarvis", href: "/jarvis", icon: "sparkles", hint: "Votre directeur marketing IA, à la voix ou à l'écrit" },
  { group: "Outils", label: "Terrain", href: "/terrain", icon: "phone", hint: "La version téléphone pour les tournages" },
  { group: "Outils", label: "Mes heures", href: "/heures", icon: "clock", hint: "Saisie de la semaine" },
  { group: "Direction", label: "Rentabilité", href: "/rentabilite", icon: "euro", directionOnly: true, hint: "Forfaits, heures et marges" },
  { group: "Direction", label: "Revenu mensuel", href: "/revenu", icon: "activity", directionOnly: true, hint: "Prélèvements GoCardless, objectif et fuites" },
  { group: "Direction", label: "Équipe", href: "/equipe", icon: "users", directionOnly: true, hint: "Accès, rôles et invitations" },
  { group: "Direction", label: "Réglages", href: "/reglages", icon: "settings", directionOnly: true, hint: "Metricool, Gmail, Abby, agence, portail" },
];

/**
 * Les vues de l'espace « Contacts », en onglets en haut de ces écrans. Elles
 * ne sont pas dans la barre (Contacts y est déjà) mais restent trouvables par
 * la recherche.
 */
export const NAV_CONTACTS: (NavItem & { pole?: "social" })[] = [
  { label: "Annuaire", href: "/contacts", icon: "users", hint: "Clients, prospects et partenaires" },
  { label: "Portefeuille", href: "/clients", icon: "layers", hint: "Les clients sous contrat, et en ajouter un" },
  { label: "Engagements du mois", href: "/avancement", icon: "gauge", hint: "Publié contre vendu, client par client", pole: "social" },
];

/**
 * Les écrans de liste qui suivent le sélecteur de client (en haut à droite).
 * Ailleurs, le sélecteur n'est pas affiché : l'accueil, les contacts et le
 * portefeuille montrent toujours toute l'agence.
 */
export const ROUTES_FILTRABLES = [
  "/calendrier",
  "/production",
  "/approbations",
  "/boite",
  "/statistiques",
  "/a-publier",
  "/suivi",
  "/preparer",
  "/tournages",
  "/assets",
  "/veille",
  "/rapports",
  "/ads",
  "/devis",
  "/heures",
  "/rentabilite",
  "/contenu",
  "/web",
  "/web/briefs",
];

/** Tout le pôle social, pour la recherche et le menu mobile. */
export const NAV: NavItem[] = [...NAV_MAIN, ...NAV_MORE];
