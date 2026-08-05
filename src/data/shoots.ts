import type { Tone } from "@/lib/tone";

export type Shoot = {
  id: string;
  group: "Cette semaine" | "Semaine prochaine";
  client: string;
  title: string;
  slot: string;
  place: string;
  /** The one thing standing between this shoot and "ready". */
  note: string;
  noteTone: Tone;
  status: string;
  statusTone: Tone;
  facts: { label: string; value: string; meta: string }[];
  crew: { initial: string; name: string; role: string; state: string; tone: Tone }[];
  gear: { label: string; state: string; tone: Tone }[];
  /** Image rights — the thing that sinks a shoot after the fact. */
  rights: { name: string; state: string; tone: Tone }[];
  shots: { label: string; kind: string }[];
  deliverables: { label: string; value: string; tone: Tone }[];
};

export const SHOOTS: Shoot[] = [
  {
    id: "s1",
    group: "Cette semaine",
    client: "Cap Marine",
    title: "Sortie catamaran au coucher du soleil",
    slot: "Jeu. 27/08 · 08:00–12:00",
    place: "Port de Saint-Gilles-les-Bains",
    note: "Tout est prêt",
    noteTone: "ok",
    status: "Confirmé",
    statusTone: "ok",
    facts: [
      { label: "Lieu", value: "Saint-Gilles", meta: "Port de plaisance, ponton C" },
      { label: "Créneau", value: "08:00–12:00", meta: "4 heures · marée haute 09:20" },
      { label: "Équipe", value: "2 personnes", meta: "Noa et Kevin" },
      { label: "Météo", value: "Ensoleillé", meta: "Vent 12 nœuds · relevé ce matin" },
    ],
    crew: [
      { initial: "N", name: "Noa", role: "Vidéaste · chef de plateau", state: "Confirmé", tone: "ok" },
      { initial: "K", name: "Kevin", role: "Photographe", state: "Confirmé", tone: "ok" },
      { initial: "L", name: "Léa", role: "Cheffe de projet", state: "En option", tone: "muted" },
    ],
    gear: [
      { label: "Sony FX3 + 24-70 mm", state: "Réservé", tone: "ok" },
      { label: "Drone DJI Mini 4", state: "Réservé", tone: "ok" },
      { label: "Stabilisateur Ronin", state: "Réservé", tone: "ok" },
      { label: "Micro-cravate ×2", state: "Réservé", tone: "ok" },
      { label: "Batteries et cartes", state: "À charger la veille", tone: "warn" },
    ],
    rights: [
      { name: "Élodie Payet · gérante", state: "Signée", tone: "ok" },
      { name: "Skipper Jean-Marc", state: "Signée", tone: "ok" },
      {
        name: "Clients à bord (12)",
        state: "Formulaire à faire signer sur place",
        tone: "warn",
      },
    ],
    shots: [
      { label: "Départ du port, plan large drone", kind: "Drone" },
      { label: "Largage des amarres, gros plan mains", kind: "Photo" },
      { label: "Voile qui se déploie, contre-jour", kind: "Vidéo" },
      { label: "Skipper à la barre, portrait", kind: "Photo" },
      { label: "Apéro à bord, ambiance", kind: "Vidéo" },
      { label: "Coucher de soleil, timelapse", kind: "Vidéo" },
      { label: "Retour au port, plan de fin", kind: "Drone" },
      { label: "Détails bateau pour la banque d'images", kind: "Photo" },
    ],
    deliverables: [
      { label: "1 reel Instagram · 0:30", value: "Livraison le 30 août", tone: "neutral" },
      { label: "1 carrousel 5 images", value: "Livraison le 31 août", tone: "neutral" },
      { label: "12 photos retouchées", value: "Livraison le 1er sept.", tone: "neutral" },
      { label: "Rushes archivés", value: "Bibliothèque d'assets", tone: "muted" },
    ],
  },
  {
    id: "s2",
    group: "Cette semaine",
    client: "AC Gym",
    title: "Série coachs et adhérents",
    slot: "Ven. 28/08 · 14:00–17:00",
    place: "Salle Sainte-Clotilde",
    note: "2 autorisations manquantes",
    noteTone: "warn",
    status: "À sécuriser",
    statusTone: "warn",
    facts: [
      { label: "Lieu", value: "Sainte-Clotilde", meta: "Salle principale + mezzanine" },
      { label: "Créneau", value: "14:00–17:00", meta: "3 heures · salle fermée au public" },
      { label: "Équipe", value: "2 personnes", meta: "Noa et Léa" },
      { label: "Risque", value: "Droits", meta: "2 groupes non couverts" },
    ],
    crew: [
      { initial: "N", name: "Noa", role: "Vidéaste", state: "Confirmé", tone: "ok" },
      { initial: "L", name: "Léa", role: "Cheffe de projet", state: "Confirmée", tone: "ok" },
    ],
    gear: [
      { label: "Sony FX3 + 35 mm", state: "Réservé", tone: "ok" },
      { label: "Kit lumière LED ×2", state: "Réservé", tone: "ok" },
      { label: "Stabilisateur Ronin", state: "Déjà pris par Cap Marine", tone: "alert" },
    ],
    rights: [
      { name: "Yohan · coach", state: "Signée", tone: "ok" },
      { name: "Sarah · coach", state: "Signée", tone: "ok" },
      { name: "Adhérents du cours de 15h", state: "Non envoyée", tone: "alert" },
      { name: "Adhérents du cours de 16h", state: "Non envoyée", tone: "alert" },
    ],
    shots: [
      { label: "Ouverture de salle, plan large", kind: "Vidéo" },
      { label: "Yohan en démonstration", kind: "Vidéo" },
      { label: "Portraits coachs sur fond noir", kind: "Photo" },
      { label: "Cours collectif, plans serrés", kind: "Vidéo" },
      { label: "Matériel et espace musculation", kind: "Photo" },
      { label: "Interview Yohan · 3 questions", kind: "Vidéo" },
    ],
    deliverables: [
      { label: "2 reels · 0:20", value: "Livraison le 31 août", tone: "neutral" },
      { label: "8 photos retouchées", value: "Livraison le 1er sept.", tone: "neutral" },
      { label: "1 interview montée", value: "Livraison le 3 sept.", tone: "neutral" },
    ],
  },
  {
    id: "s3",
    group: "Semaine prochaine",
    client: "Optique de Bourbon",
    title: "Collection solaire automne",
    slot: "Lun. 31/08 · 09:00–13:00",
    place: "Boutique Saint-Denis",
    note: "Moodboard à valider",
    noteTone: "neutral",
    status: "En préparation",
    statusTone: "neutral",
    facts: [
      { label: "Lieu", value: "Saint-Denis", meta: "Boutique rue Maréchal-Leclerc" },
      { label: "Créneau", value: "09:00–13:00", meta: "4 heures · avant ouverture" },
      { label: "Équipe", value: "2 personnes", meta: "Kevin et Léa" },
      { label: "Moodboard", value: "En attente", meta: "Envoyé au client le 24 août" },
    ],
    crew: [
      { initial: "K", name: "Kevin", role: "Photographe", state: "Confirmé", tone: "ok" },
      { initial: "L", name: "Léa", role: "Cheffe de projet", state: "À confirmer", tone: "warn" },
    ],
    gear: [
      { label: "Canon R6 + 85 mm", state: "Réservé", tone: "ok" },
      { label: "Fond blanc + softbox", state: "Réservé", tone: "ok" },
      { label: "Table de présentation", state: "Fournie par le client", tone: "muted" },
    ],
    rights: [
      { name: "Modèle Anaïs", state: "Contrat envoyé", tone: "warn" },
      { name: "Vendeuses en boutique", state: "Signée", tone: "ok" },
    ],
    shots: [
      { label: "Packshots 12 montures fond blanc", kind: "Photo" },
      { label: "Modèle en extérieur, lumière naturelle", kind: "Photo" },
      { label: "Détails branches et verres", kind: "Photo" },
      { label: "Boutique, ambiance clients", kind: "Photo" },
      { label: "Vidéo verticale essayage", kind: "Vidéo" },
    ],
    deliverables: [
      { label: "12 packshots détourés", value: "Livraison le 3 sept.", tone: "neutral" },
      { label: "1 carrousel 6 images", value: "Livraison le 4 sept.", tone: "neutral" },
      { label: "1 reel essayage", value: "Livraison le 5 sept.", tone: "neutral" },
    ],
  },
  {
    id: "s4",
    group: "Semaine prochaine",
    client: "Centrakor",
    title: "Rentrée déco en magasin",
    slot: "Mar. 01/09 · 10:00–16:00",
    place: "Magasin du Port",
    note: "Matériel non réservé",
    noteTone: "warn",
    status: "À sécuriser",
    statusTone: "warn",
    facts: [
      { label: "Lieu", value: "Le Port", meta: "Magasin Centrakor, zone Sacré-Cœur" },
      { label: "Créneau", value: "10:00–16:00", meta: "6 heures · magasin ouvert" },
      { label: "Équipe", value: "2 personnes", meta: "Noa et Kevin" },
      { label: "Risque", value: "Matériel", meta: "2 équipements non réservés" },
    ],
    crew: [
      { initial: "N", name: "Noa", role: "Vidéaste", state: "Confirmé", tone: "ok" },
      { initial: "K", name: "Kevin", role: "Photographe", state: "Confirmé", tone: "ok" },
    ],
    gear: [
      { label: "Sony FX3", state: "Non réservé", tone: "alert" },
      { label: "Kit lumière LED ×2", state: "Non réservé", tone: "alert" },
      { label: "Chariot travelling", state: "Disponible", tone: "ok" },
    ],
    rights: [
      { name: "Personnel du magasin (6)", state: "Signées", tone: "ok" },
      { name: "Clients en rayon", state: "Affichage prévu à l'entrée", tone: "neutral" },
    ],
    shots: [
      { label: "Vitrine et entrée du magasin", kind: "Photo" },
      { label: "Rayons rentrée, travelling", kind: "Vidéo" },
      { label: "Produits phares, packshots", kind: "Photo" },
      { label: "Équipe en situation", kind: "Photo" },
      { label: "Plan de fin avec logo", kind: "Vidéo" },
    ],
    deliverables: [
      { label: "1 reel · 0:25", value: "Livraison le 4 sept.", tone: "neutral" },
      { label: "10 photos retouchées", value: "Livraison le 5 sept.", tone: "neutral" },
    ],
  },
];

export const MOODBOARD = [
  "Lumière rasante",
  "Cadres serrés",
  "Palette bleu / sable",
  "Références client",
];
