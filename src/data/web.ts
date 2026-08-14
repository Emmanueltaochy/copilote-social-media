import type { Tone } from "@/lib/tone";

/**
 * Le vocabulaire du pôle web.
 *
 * Il vit à part de celui du social : ce ne sont ni les mêmes objets ni le même
 * rythme. Un contenu se compte au mois, un projet se suit sur trois à six mois
 * et se juge à ses jalons.
 */

export const PROJECT_TYPE: Record<string, { label: string; short: string }> = {
  vitrine: { label: "Site vitrine", short: "Vitrine" },
  ecommerce: { label: "Boutique en ligne", short: "E-commerce" },
  landing: { label: "Landing page", short: "Landing" },
  location: { label: "Site de location / réservation", short: "Location" },
  refonte: { label: "Refonte", short: "Refonte" },
  autre: { label: "Autre", short: "Autre" },
};

export const PROJECT_TYPES = Object.keys(PROJECT_TYPE);

/**
 * Les étapes d'un projet, dans l'ordre.
 *
 * « Contenus » et « Recette » sont séparées parce qu'elles n'attendent pas la
 * même personne : la première attend les textes et les photos du client, la
 * seconde attend nos corrections. Les confondre fait croire que le retard vient
 * toujours de l'agence.
 */
export const WEB_PHASE: Record<
  string,
  { label: string; tone: Tone; attendClient: boolean; aide: string }
> = {
  cadrage: {
    label: "Cadrage",
    tone: "muted",
    attendClient: false,
    aide: "Besoin, périmètre, budget. Rien n'est promis tant que ce n'est pas écrit.",
  },
  brief: {
    label: "Brief",
    tone: "warn",
    attendClient: true,
    aide: "Le client répond aux questions. C'est lui qui tient la main ici.",
  },
  maquette: {
    label: "Maquette",
    tone: "neutral",
    attendClient: false,
    aide: "Design des pages clés, à faire valider avant d'intégrer une ligne.",
  },
  integration: {
    label: "Intégration",
    tone: "neutral",
    attendClient: false,
    aide: "La maquette devient un site qui fonctionne.",
  },
  contenus: {
    label: "Contenus",
    tone: "warn",
    attendClient: true,
    aide: "Textes, photos, fiches produits. L'étape où les projets s'enlisent.",
  },
  recette: {
    label: "Recette",
    tone: "info",
    attendClient: false,
    aide: "On teste, le client relit, on corrige. Dernière ligne droite.",
  },
  en_ligne: {
    label: "En ligne",
    tone: "ok",
    attendClient: false,
    aide: "Livré. La date de mise en ligne fait foi.",
  },
  maintenance: {
    label: "Maintenance",
    tone: "muted",
    attendClient: false,
    aide: "Le site vit : mises à jour, corrections, petites évolutions.",
  },
};

export const WEB_PHASES = Object.keys(WEB_PHASE);

/** L'étape d'après. Rien après la maintenance : un site vivant n'a pas de fin. */
export function phaseSuivante(phase: string): string | null {
  const i = WEB_PHASES.indexOf(phase);
  if (i === -1 || i === WEB_PHASES.length - 1) return null;
  return WEB_PHASES[i + 1];
}

export const BRIEF_STATUS: Record<string, { label: string; tone: Tone }> = {
  brouillon: { label: "Brouillon", tone: "muted" },
  envoye: { label: "Envoyé au client", tone: "warn" },
  en_cours: { label: "En cours de remplissage", tone: "info" },
  complete: { label: "Complet", tone: "ok" },
};

export type ModeleChamp = {
  section: string;
  label: string;
  help?: string;
  kind: "texte" | "long" | "choix" | "oui_non" | "url" | "nombre";
  options?: string[];
  required?: boolean;
};

/* Les questions communes à tout projet web. */
const COMMUN: ModeleChamp[] = [
  {
    section: "L'entreprise",
    label: "Que faites-vous, en deux phrases ?",
    help: "Comme si vous l'expliquiez à quelqu'un qui ne connaît pas votre métier.",
    kind: "long",
    required: true,
  },
  {
    section: "L'entreprise",
    label: "À qui vous adressez-vous ?",
    help: "Vos clients types : leur âge, leur métier, ce qu'ils cherchent.",
    kind: "long",
    required: true,
  },
  {
    section: "L'entreprise",
    label: "Qu'est-ce qui vous distingue de vos concurrents ?",
    kind: "long",
  },
  {
    section: "Le projet",
    label: "Qu'attendez-vous de ce site ?",
    help: "Être trouvé sur Google, recevoir des demandes de devis, vendre en ligne…",
    kind: "long",
    required: true,
  },
  {
    section: "Le projet",
    label: "Comment saurez-vous que le site est une réussite ?",
    help: "Un chiffre si possible : appels par semaine, commandes par mois.",
    kind: "texte",
  },
  {
    section: "Le projet",
    label: "Avez-vous déjà un site ?",
    kind: "url",
    help: "Son adresse, même si vous ne l'aimez plus.",
  },
  {
    section: "Le projet",
    label: "Trois sites que vous aimez, et pourquoi",
    help: "Concurrents ou non, l'important est ce qui vous plaît chez eux.",
    kind: "long",
  },
  {
    section: "Le projet",
    label: "Trois sites que vous n'aimez pas, et pourquoi",
    help: "Souvent plus instructif que les précédents.",
    kind: "long",
  },
  {
    section: "Contenus",
    label: "Qui écrit les textes ?",
    kind: "choix",
    options: ["Nous les fournissons", "L'agence les rédige", "À décider ensemble"],
    required: true,
  },
  {
    section: "Contenus",
    label: "Avez-vous des photos professionnelles ?",
    kind: "choix",
    options: ["Oui, prêtes", "Quelques-unes", "Non, à produire"],
    required: true,
  },
  {
    section: "Contenus",
    label: "Avez-vous un logo et une charte graphique ?",
    kind: "choix",
    options: ["Oui, complète", "Un logo seulement", "Rien, à créer"],
    required: true,
  },
  {
    section: "Pratique",
    label: "Avez-vous déjà un nom de domaine ?",
    kind: "texte",
    help: "L'adresse du site : monentreprise.re",
  },
  {
    section: "Pratique",
    label: "Chez qui est hébergé votre site ou votre domaine ?",
    kind: "texte",
    help: "OVH, Hostinger, Ionos… Écrivez « je ne sais pas » si c'est le cas.",
  },
  {
    section: "Pratique",
    label: "Une date de mise en ligne souhaitée ?",
    kind: "texte",
    help: "Un événement, une saison, une ouverture.",
  },
  {
    section: "Pratique",
    label: "Qui décide, chez vous ?",
    help: "La personne qui valide les maquettes et les textes.",
    kind: "texte",
    required: true,
  },
];

/* Ce qu'on ne demande qu'aux boutiques. */
const ECOMMERCE: ModeleChamp[] = [
  {
    section: "Boutique",
    label: "Combien de produits, à peu près ?",
    kind: "nombre",
    required: true,
  },
  {
    section: "Boutique",
    label: "Vos produits ont-ils des variantes ?",
    help: "Tailles, couleurs, parfums…",
    kind: "oui_non",
  },
  {
    section: "Boutique",
    label: "Comment souhaitez-vous être payé ?",
    kind: "choix",
    options: ["Carte bancaire", "Carte + PayPal", "Virement", "À définir"],
    required: true,
  },
  {
    section: "Boutique",
    label: "Comment livrez-vous ?",
    help: "Retrait sur place, La Poste, transporteur, livraison sur l'île…",
    kind: "long",
    required: true,
  },
  {
    section: "Boutique",
    label: "Avez-vous un stock à suivre ?",
    kind: "oui_non",
  },
];

/* Ce qu'on ne demande qu'aux sites de réservation ou de location. */
const LOCATION: ModeleChamp[] = [
  {
    section: "Réservation",
    label: "Que loue-t-on ou que réserve-t-on ?",
    help: "Véhicules, logements, matériel, créneaux…",
    kind: "long",
    required: true,
  },
  {
    section: "Réservation",
    label: "Combien de biens ou de créneaux à gérer ?",
    kind: "nombre",
  },
  {
    section: "Réservation",
    label: "Le paiement se fait-il en ligne ?",
    kind: "choix",
    options: ["Oui, intégralement", "Acompte en ligne", "Sur place uniquement"],
    required: true,
  },
  {
    section: "Réservation",
    label: "Utilisez-vous déjà un outil de réservation ?",
    kind: "texte",
    help: "Airbnb, Booking, un tableur… On regardera comment le remplacer ou s'y connecter.",
  },
];

/* Une landing page pose moins de questions : elle a un seul but. */
const LANDING: ModeleChamp[] = [
  {
    section: "La page",
    label: "Quelle est l'action unique attendue du visiteur ?",
    help: "Remplir un formulaire, appeler, acheter un produit précis.",
    kind: "texte",
    required: true,
  },
  {
    section: "La page",
    label: "D'où viendra le trafic ?",
    kind: "choix",
    options: ["Publicité Meta", "Google Ads", "E-mailing", "Réseaux sociaux", "Plusieurs sources"],
  },
];

/**
 * Le brief proposé pour un type de projet.
 *
 * Un modèle par type plutôt qu'un questionnaire unique : demander le mode de
 * paiement à quelqu'un qui veut une page de contact, c'est lui faire douter du
 * devis qu'il vient de signer.
 */
export function modeleBrief(type: string): ModeleChamp[] {
  if (type === "ecommerce") return [...COMMUN, ...ECOMMERCE];
  if (type === "location") return [...COMMUN, ...LOCATION];
  if (type === "landing") return [...LANDING, ...COMMUN];
  return COMMUN;
}

/**
 * Les jalons proposés à la création d'un projet.
 *
 * Ils ne sont pas figés — on les coche, on en ajoute, on en retire. Mais un
 * projet qui démarre avec une liste vide démarre sans plan.
 */
export function jalonsParDefaut(type: string): { label: string; attendClient: boolean }[] {
  const base = [
    { label: "Brief rempli par le client", attendClient: true },
    { label: "Arborescence validée", attendClient: true },
    { label: "Maquette page d'accueil validée", attendClient: true },
    { label: "Maquettes pages intérieures validées", attendClient: true },
    { label: "Textes et photos reçus", attendClient: true },
    { label: "Intégration terminée", attendClient: false },
    { label: "Recette client", attendClient: true },
    { label: "Nom de domaine et hébergement prêts", attendClient: false },
    { label: "Mise en ligne", attendClient: false },
  ];

  if (type === "ecommerce") {
    return [
      ...base.slice(0, 5),
      { label: "Fiches produits reçues", attendClient: true },
      { label: "Paiement en ligne configuré et testé", attendClient: false },
      { label: "Livraison et taxes configurées", attendClient: false },
      ...base.slice(5),
    ];
  }
  if (type === "location") {
    return [
      ...base.slice(0, 5),
      { label: "Calendrier et tarifs configurés", attendClient: false },
      { label: "Parcours de réservation testé", attendClient: false },
      ...base.slice(5),
    ];
  }
  if (type === "landing") {
    return [
      { label: "Brief rempli par le client", attendClient: true },
      { label: "Maquette validée", attendClient: true },
      { label: "Textes et visuels reçus", attendClient: true },
      { label: "Intégration terminée", attendClient: false },
      { label: "Suivi des conversions en place", attendClient: false },
      { label: "Mise en ligne", attendClient: false },
    ];
  }
  return base;
}
