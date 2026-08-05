import type { Tone } from "@/lib/tone";

export type Access = "Accès complet" | "Lecture seule" | "Aucun accès";

export const ACCESS_TONE: Record<Access, Tone> = {
  "Accès complet": "ok",
  "Lecture seule": "neutral",
  "Aucun accès": "muted",
};

export type Contact = { name: string; role: string; reach: string; access: Access };
export type CostLine = { label: string; hours: string; cost: string; share: string };

export type Brand = {
  sector: string;
  adsBudget: string;
  since: string;
  /** Display string; `feeAmount` is what the maths uses. */
  fee: string;
  feeAmount: number;
  palette: string[];
  fonts: string;
  voice: string;
  tags: string[];
  /** Words the client has banned, and why — the reason is the useful half. */
  banned: [string, string][];
  contacts: Contact[];
  /** Hours consumed to date vs. hours sold in the retainer. */
  hours: number;
  sold: number;
  cost: number;
  costs: CostLine[];
};

const contact = (name: string, role: string, reach: string, access: Access): Contact => ({
  name,
  role,
  reach,
  access,
});

const cost = (label: string, hours: string, amount: string, share: string): CostLine => ({
  label,
  hours,
  cost: amount,
  share,
});

export const BRANDS: Record<string, Brand> = {
  "Cap Marine": {
    sector: "Nautisme et événementiel",
    adsBudget: "1 800 € par mois",
    since: "Client depuis mars 2024 · cheffe de projet Léa",
    fee: "2 400 € HT / mois",
    feeAmount: 2400,
    palette: ["#0F3B57", "#2E9BC4", "#E8D9B5", "#121212"],
    fonts: "Poppins (titres) · Source Sans (corps)",
    voice: "Chaleureux, factuel, jamais racoleur",
    tags: ["#capmarine", "#lareunion", "#974", "#catamaran", "#saintgilles", "#nautisme"],
    banned: [
      ["croisière", "trop premium, hors positionnement"],
      ["pas cher", "dévalorise l'offre"],
      ["promo", "jamais de remise affichée"],
      ["luxe", "le client refuse ce mot"],
    ],
    contacts: [
      contact("Élodie Payet", "Gérante · décide", "elodie@capmarine.re", "Accès complet"),
      contact("Jean-Marc Hoarau", "Skipper · relit", "0692 41 22 08", "Lecture seule"),
      contact("Sonia Técher", "Administratif", "compta@capmarine.re", "Aucun accès"),
    ],
    hours: 34,
    sold: 30,
    cost: 2040,
    costs: [
      cost("Création graphique · Kevin", "12,5 h", "750 €", "37 %"),
      cost("Vidéo et montage · Noa", "11 h", "660 €", "32 %"),
      cost("Gestion de projet · Léa", "7,5 h", "450 €", "22 %"),
      cost("Media buying · Samir", "3 h", "180 €", "9 %"),
    ],
  },
  "AC Gym": {
    sector: "Salle de sport · Anabolic Concept Gym",
    adsBudget: "1 200 € par mois",
    since: "Client depuis janvier 2025 · cheffe de projet Léa",
    fee: "2 800 € HT / mois",
    feeAmount: 2800,
    palette: ["#121212", "#D8FF3E", "#7A7A7A", "#FFFFFF"],
    fonts: "Archivo (titres) · Inter (corps)",
    voice: "Direct, motivant, tutoiement assumé",
    tags: ["#acgym", "#anabolicconcept", "#974", "#musculation", "#saintedenis", "#coaching"],
    banned: [
      ["régime", "on parle de nutrition"],
      ["maigrir", "vocabulaire proscrit"],
      ["dopage", "sujet sensible"],
    ],
    contacts: [
      contact("Yohan Grondin", "Gérant · décide", "yohan@acgym.re", "Accès complet"),
      contact("Sarah Lebon", "Coach · fournit le contenu", "0693 18 44 71", "Lecture seule"),
    ],
    hours: 26,
    sold: 34,
    cost: 1560,
    costs: [
      cost("Création graphique · Kevin", "9 h", "540 €", "35 %"),
      cost("Vidéo et montage · Noa", "10 h", "600 €", "38 %"),
      cost("Gestion de projet · Léa", "5 h", "300 €", "19 %"),
      cost("Media buying · Samir", "2 h", "120 €", "8 %"),
    ],
  },
  "Swap'Îles": {
    sector: "Marketplace locale",
    adsBudget: "1 600 € par mois",
    since: "Client depuis septembre 2025 · cheffe de projet Léa",
    fee: "1 900 € HT / mois",
    feeAmount: 1900,
    palette: ["#F25C2A", "#1D3557", "#F1FAEE", "#121212"],
    fonts: "Manrope (titres) · Inter (corps)",
    voice: "Complice, pratique, orienté bon plan",
    tags: ["#swapiles", "#974", "#secondemain", "#videgrenier", "#lareunion"],
    banned: [
      ["occasion", "on dit seconde main"],
      ["brocante", "hors positionnement"],
      ["gratuit", "modèle payant"],
    ],
    contacts: [
      contact("Nathan Bègue", "Fondateur · décide", "nathan@swapiles.re", "Accès complet"),
      contact("Aurélie Sery", "Community manager interne", "aurelie@swapiles.re", "Accès complet"),
    ],
    hours: 41,
    sold: 24,
    cost: 2460,
    costs: [
      cost("Création graphique · Kevin", "16 h", "960 €", "39 %"),
      cost("Gestion de projet · Léa", "12 h", "720 €", "29 %"),
      cost("Vidéo et montage · Noa", "8 h", "480 €", "20 %"),
      cost("Media buying · Samir", "5 h", "300 €", "12 %"),
    ],
  },
  Centrakor: {
    sector: "Grande distribution · décoration",
    adsBudget: "3 500 € par mois",
    since: "Client depuis juin 2023 · cheffe de projet Léa",
    fee: "3 600 € HT / mois",
    feeAmount: 3600,
    palette: ["#E30613", "#FFD100", "#1A1A1A", "#FFFFFF"],
    fonts: "Gotham (titres) · Inter (corps)",
    voice: "Familial, enthousiaste, orienté prix",
    tags: ["#centrakor974", "#deco", "#lareunion", "#bonplan", "#maison"],
    banned: [
      ["bas de gamme", "interdit par la centrale"],
      ["copie", "risque juridique"],
    ],
    contacts: [
      contact("Marion Fontaine", "Responsable com · décide", "marion@centrakor974.re", "Accès complet"),
      contact(
        "Directeur magasin Le Port",
        "Valide les visuels magasin",
        "direction.leport@centrakor.re",
        "Lecture seule",
      ),
    ],
    hours: 38,
    sold: 45,
    cost: 2280,
    costs: [
      cost("Création graphique · Kevin", "15 h", "900 €", "40 %"),
      cost("Gestion de projet · Léa", "10 h", "600 €", "26 %"),
      cost("Vidéo et montage · Noa", "8 h", "480 €", "21 %"),
      cost("Media buying · Samir", "5 h", "300 €", "13 %"),
    ],
  },
  Casabona: {
    sector: "Centre commercial",
    adsBudget: "2 400 € par mois",
    since: "Client depuis avril 2024 · cheffe de projet Léa",
    fee: "3 200 € HT / mois",
    feeAmount: 3200,
    palette: ["#00524B", "#C9A227", "#F5F1E8", "#121212"],
    fonts: "Playfair Display (titres) · Inter (corps)",
    voice: "Accueillant, familial, événementiel",
    tags: ["#casabona", "#974", "#shopping", "#sainteclotilde", "#centrecommercial", "#sortieenfamille"],
    banned: [
      ["galerie marchande", "on dit centre commercial"],
      ["discount", "positionnement milieu de gamme"],
      ["liquidation", "réservé aux enseignes"],
    ],
    contacts: [
      contact("Christelle Vidot", "Directrice · décide", "direction@casabona.re", "Accès complet"),
      contact("Bruno Ah-Nieme", "Animation commerciale", "0692 55 30 12", "Lecture seule"),
    ],
    hours: 31,
    sold: 40,
    cost: 1860,
    costs: [
      cost("Création graphique · Kevin", "13 h", "780 €", "42 %"),
      cost("Gestion de projet · Léa", "9 h", "540 €", "29 %"),
      cost("Vidéo et montage · Noa", "6 h", "360 €", "19 %"),
      cost("Media buying · Samir", "3 h", "180 €", "10 %"),
    ],
  },
  "Optique de Bourbon": {
    sector: "Optique et lunetterie",
    adsBudget: "900 € par mois",
    since: "Client depuis février 2025 · cheffe de projet Léa",
    fee: "1 800 € HT / mois",
    feeAmount: 1800,
    palette: ["#1B2A41", "#C0A062", "#FFFFFF", "#8A8F98"],
    fonts: "Cormorant (titres) · Inter (corps)",
    voice: "Sobre, expert, conseil avant vente",
    tags: ["#optiquedebourbon", "#974", "#lunettes", "#saintdenis", "#vue", "#solaires"],
    banned: [
      ["pas cher", "positionnement conseil"],
      ["2 pour 1", "interdit par la marque"],
      ["gratuit", "hors cadre réglementaire"],
    ],
    contacts: [
      contact("Fabrice Ramassamy", "Opticien gérant · décide", "fabrice@optiquedebourbon.re", "Accès complet"),
      contact("Anaïs Boyer", "Responsable boutique", "0692 77 41 03", "Lecture seule"),
    ],
    hours: 22,
    sold: 24,
    cost: 1320,
    costs: [
      cost("Création graphique · Kevin", "11 h", "660 €", "50 %"),
      cost("Gestion de projet · Léa", "6 h", "360 €", "27 %"),
      cost("Vidéo et montage · Noa", "3 h", "180 €", "14 %"),
      cost("Media buying · Samir", "2 h", "120 €", "9 %"),
    ],
  },
  Pitaya: {
    sector: "Restauration rapide saine",
    adsBudget: "400 € par mois",
    since: "Client depuis novembre 2024 · cheffe de projet Léa",
    fee: "2 100 € HT / mois",
    feeAmount: 2100,
    palette: ["#E8467C", "#1F9D5A", "#FFF7F0", "#121212"],
    fonts: "Poppins (titres) · Inter (corps)",
    voice: "Jeune, gourmand, phrases courtes",
    tags: ["#pitaya974", "#bowl", "#healthy", "#lareunion", "#dejeuner", "#saintdenis"],
    banned: [
      ["diététique", "connotation régime"],
      ["fast-food", "positionnement contraire"],
      ["calories", "jamais affiché"],
    ],
    contacts: [
      contact("Manon Técher", "Gérante · décide", "manon@pitaya974.re", "Accès complet"),
      contact("Kevin Payet", "Responsable salle", "0693 22 18 65", "Aucun accès"),
    ],
    hours: 25,
    sold: 26,
    cost: 1500,
    costs: [
      cost("Vidéo et montage · Noa", "11 h", "660 €", "44 %"),
      cost("Création graphique · Kevin", "8 h", "480 €", "32 %"),
      cost("Gestion de projet · Léa", "4 h", "240 €", "16 %"),
      cost("Media buying · Samir", "2 h", "120 €", "8 %"),
    ],
  },
  Pokya: {
    sector: "Restauration · poké et livraison",
    adsBudget: "600 € par mois",
    since: "Client depuis mai 2025 · cheffe de projet Léa",
    fee: "1 700 € HT / mois",
    feeAmount: 1700,
    palette: ["#0A6E6E", "#F4A259", "#FFFDF7", "#121212"],
    fonts: "Nunito (titres) · Inter (corps)",
    voice: "Décontracté, pratique, orienté livraison",
    tags: ["#pokya", "#poke", "#974", "#livraison", "#saintpierre", "#dejeuner"],
    banned: [
      ["sushi", "produit non proposé"],
      ["asiatique", "trop vague"],
      ["promo", "jamais de remise affichée"],
    ],
    contacts: [
      contact("Steve Hoareau", "Gérant · décide", "steve@pokya.re", "Accès complet"),
      contact("Laura Grondin", "Community manager interne", "laura@pokya.re", "Accès complet"),
    ],
    hours: 21,
    sold: 22,
    cost: 1260,
    costs: [
      cost("Création graphique · Kevin", "9 h", "540 €", "43 %"),
      cost("Vidéo et montage · Noa", "7 h", "420 €", "33 %"),
      cost("Gestion de projet · Léa", "4 h", "240 €", "19 %"),
      cost("Media buying · Samir", "1 h", "60 €", "5 %"),
    ],
  },
  "Vite Frais Bien Frais": {
    sector: "Épicerie · aéroport Roland Garros",
    adsBudget: "500 € par mois",
    since: "Client depuis juillet 2025 · cheffe de projet Léa",
    fee: "1 600 € HT / mois",
    feeAmount: 1600,
    palette: ["#2E7D32", "#FFC107", "#FAFAF5", "#121212"],
    fonts: "Barlow (titres) · Inter (corps)",
    voice: "Pratique, rapide, orienté voyageur",
    tags: ["#vitefraisbienfrais", "#rolandgarros", "#974", "#snacking", "#voyage", "#local"],
    banned: [
      ["industriel", "produits frais uniquement"],
      ["surgelé", "faux sur l'offre"],
      ["duty free", "hors périmètre"],
    ],
    contacts: [
      contact("Sabrina Nativel", "Responsable · décide", "sabrina@vfbf.re", "Accès complet"),
      contact("Équipe boutique", "Envoie les photos produits", "boutique@vfbf.re", "Lecture seule"),
    ],
    hours: 19,
    sold: 20,
    cost: 1140,
    costs: [
      cost("Création graphique · Kevin", "9 h", "540 €", "47 %"),
      cost("Gestion de projet · Léa", "6 h", "360 €", "32 %"),
      cost("Vidéo et montage · Noa", "3 h", "180 €", "16 %"),
      cost("Media buying · Samir", "1 h", "60 €", "5 %"),
    ],
  },
  "Stéphane Plaza": {
    sector: "Immobilier · réseau d'agences",
    adsBudget: "2 200 € par mois",
    since: "Client depuis octobre 2024 · cheffe de projet Léa",
    fee: "2 600 € HT / mois",
    feeAmount: 2600,
    palette: ["#E30613", "#1A1A1A", "#F2F2F2", "#FFFFFF"],
    fonts: "Montserrat (titres) · Inter (corps)",
    voice: "Rassurant, professionnel, jamais familier",
    tags: ["#stephaneplazaimmobilier", "#974", "#immobilier", "#saintleu", "#achatmaison"],
    banned: [
      ["affaire", "connotation spéculative"],
      ["coup de cœur", "réservé au réseau national"],
      ["urgent", "pression interdite"],
    ],
    contacts: [
      contact("Vincent Maillot", "Directeur d'agence · décide", "vincent.maillot@plaza974.fr", "Accès complet"),
      contact("Nadia Cadet", "Assistante commerciale", "0262 33 21 90", "Lecture seule"),
      contact("Réseau national", "Valide l'usage de la marque", "com@stephaneplaza.fr", "Aucun accès"),
    ],
    hours: 29,
    sold: 28,
    cost: 1740,
    costs: [
      cost("Création graphique · Kevin", "12 h", "720 €", "41 %"),
      cost("Vidéo et montage · Noa", "9 h", "540 €", "31 %"),
      cost("Gestion de projet · Léa", "6 h", "360 €", "21 %"),
      cost("Media buying · Samir", "2 h", "120 €", "7 %"),
    ],
  },
  "Hair by M": {
    sector: "Salon de coiffure",
    adsBudget: "450 € par mois",
    since: "Client depuis mars 2025 · cheffe de projet Léa",
    fee: "1 400 € HT / mois",
    feeAmount: 1400,
    palette: ["#2B1B17", "#C9A66B", "#F7F1EA", "#FFFFFF"],
    fonts: "Marcellus (titres) · Inter (corps)",
    voice: "Élégant, personnel, à la première personne",
    tags: ["#hairbym", "#974", "#coiffure", "#balayage", "#saintegilles", "#coloration"],
    banned: [
      ["bon marché", "positionnement premium"],
      ["extension", "prestation non proposée"],
      ["défrisage", "hors carte"],
    ],
    contacts: [
      contact("Marie Ah-Hot", "Gérante · décide", "marie@hairbym.re", "Accès complet"),
      contact("Océane Rivière", "Coiffeuse · fournit les avant/après", "0692 84 12 47", "Lecture seule"),
    ],
    hours: 18,
    sold: 18,
    cost: 1080,
    costs: [
      cost("Création graphique · Kevin", "8 h", "480 €", "44 %"),
      cost("Vidéo et montage · Noa", "5 h", "300 €", "28 %"),
      cost("Gestion de projet · Léa", "4 h", "240 €", "22 %"),
      cost("Media buying · Samir", "1 h", "60 €", "6 %"),
    ],
  },
  "Roulé Mon Z'Avirons": {
    sector: "Artisan · produits locaux",
    adsBudget: "Aucun budget ads",
    since: "Client depuis juin 2025 · cheffe de projet Léa",
    fee: "1 300 € HT / mois",
    feeAmount: 1300,
    palette: ["#7B3F00", "#F2C14E", "#FFF8E7", "#121212"],
    fonts: "Bitter (titres) · Inter (corps)",
    voice: "Authentique, créole assumé, chaleureux",
    tags: ["#roulemonzavirons", "#974", "#peiproduit", "#marche", "#artisanal", "#lesavirons"],
    banned: [
      ["industriel", "production artisanale"],
      ["importé", "tout est local"],
      ["chimique", "sujet sensible"],
    ],
    contacts: [
      contact("Jean-Yves Lauret", "Artisan · décide", "0692 60 07 33", "Accès complet"),
      contact("Ginette Lauret", "Gère les marchés", "roulemonz@gmail.com", "Lecture seule"),
    ],
    hours: 15,
    sold: 16,
    cost: 900,
    costs: [
      cost("Création graphique · Kevin", "7 h", "420 €", "47 %"),
      cost("Gestion de projet · Léa", "5 h", "300 €", "33 %"),
      cost("Vidéo et montage · Noa", "3 h", "180 €", "20 %"),
      cost("Media buying · Samir", "0 h", "0 €", "0 %"),
    ],
  },
  "Taochy VIP": {
    sector: "Compte interne · marque Taochy",
    adsBudget: "Aucun budget ads",
    since: "Compte interne depuis janvier 2023 · pilotage Emmanuel",
    fee: "Interne · non facturé",
    feeAmount: 0,
    palette: ["#121212", "#A67C1A", "#FAF9F7", "#E8E6E1"],
    fonts: "Inter (titres et corps)",
    voice: "Stratégie. Création. Performance.",
    tags: ["#taochyconsulting", "#974", "#strategie", "#communication", "#lareunion"],
    banned: [
      ["agence low cost", "contraire au positionnement"],
      ["prestataire", "on dit partenaire"],
      ["buzz", "vocabulaire proscrit"],
    ],
    contacts: [
      contact("Emmanuel", "Fondateur · décide", "emmanuel@taochy.re", "Accès complet"),
      contact("Léa", "Cheffe de projet", "lea@taochy.re", "Accès complet"),
    ],
    hours: 12,
    sold: 16,
    cost: 720,
    costs: [
      cost("Création graphique · Kevin", "5 h", "300 €", "42 %"),
      cost("Vidéo et montage · Noa", "4 h", "240 €", "33 %"),
      cost("Gestion de projet · Léa", "3 h", "180 €", "25 %"),
      cost("Media buying · Samir", "0 h", "0 €", "0 %"),
    ],
  },
};

/** Gross margin on the retainer, or null for the internal account. */
export function margin(brand: Brand): number | null {
  if (brand.feeAmount <= 0) return null;
  return Math.round(((brand.feeAmount - brand.cost) / brand.feeAmount) * 100);
}
