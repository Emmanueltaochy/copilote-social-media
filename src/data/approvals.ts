export type Pin = {
  n: string;
  /** Position on the visual, as CSS percentages. */
  x: string;
  y: string;
  who: string;
  when: string;
  text: string;
  status: string;
};

export type Approval = {
  id: string;
  kind: string;
  title: string;
  client: string;
  /** Who we're waiting on. */
  stage: "Client" | "Interne";
  age: string;
  /** Waiting longer than the 5-day threshold. */
  old?: boolean;
  pins: Pin[];
  history: [string, string][];
};

export const APPROVALS: Approval[] = [
  {
    id: "a1",
    kind: "REEL",
    title: "Reel « Sortie coucher de soleil »",
    client: "Cap Marine",
    stage: "Client",
    age: "6 j",
    old: true,
    pins: [
      {
        n: "1",
        x: "38%",
        y: "44%",
        who: "Cap Marine · client",
        when: "21 août",
        text: "Le bateau est trop petit dans le cadre, on ne voit pas la voile.",
        status: "Traité en V2",
      },
      {
        n: "2",
        x: "72%",
        y: "78%",
        who: "Cap Marine · client",
        when: "23 août",
        text: "Ajouter l'horaire de départ sur le visuel, pas seulement en légende.",
        status: "Traité en V3",
      },
    ],
    history: [
      ["V3 envoyée au client", "24 août"],
      ["V2 refusée · horaire manquant", "23 août"],
      ["V2 envoyée au client", "22 août"],
      ["V1 refusée · cadrage", "21 août"],
    ],
  },
  {
    id: "a2",
    kind: "CARR",
    title: "Carrousel « Vide-grenier de septembre »",
    client: "Swap'Îles",
    stage: "Client",
    age: "5 j",
    old: true,
    pins: [
      {
        n: "1",
        x: "50%",
        y: "30%",
        who: "Swap'Îles · client",
        when: "22 août",
        text: "La date du 12 septembre n'est pas lisible sur la première image.",
        status: "En attente de reprise",
      },
    ],
    history: [
      ["V1 envoyée au client", "20 août"],
      ["Relance automatique", "23 août"],
    ],
  },
  {
    id: "a3",
    kind: "FEED",
    title: "Post feed « Nouveau coach »",
    client: "AC Gym",
    stage: "Interne",
    age: "2 j",
    pins: [
      {
        n: "1",
        x: "44%",
        y: "62%",
        who: "Léa · cheffe de projet",
        when: "24 août",
        text: "Le prénom du coach est mal orthographié : Yohan, pas Yohann.",
        status: "À corriger par Kevin",
      },
    ],
    history: [
      ["Passé en révision interne", "23 août"],
      ["Créé par Kevin", "22 août"],
    ],
  },
  {
    id: "a4",
    kind: "CARR",
    title: "Carrousel « Collection solaire »",
    client: "Optique de Bourbon",
    stage: "Interne",
    age: "1 j",
    pins: [],
    history: [["Passé en révision interne", "24 août"]],
  },
  {
    id: "a5",
    kind: "STO",
    title: "Story « Rentrée déco »",
    client: "Centrakor",
    stage: "Client",
    age: "1 j",
    pins: [],
    history: [["V1 envoyée au client", "24 août"]],
  },
  {
    id: "a6",
    kind: "FEED",
    title: "Post feed « Menu du midi »",
    client: "Pitaya",
    stage: "Client",
    age: "8 h",
    pins: [],
    history: [["V1 envoyée au client", "25 août"]],
  },
];

export const VERSION_META: Record<string, string> = {
  V1: "20 août · Kevin · refusée le 21 août",
  V2: "22 août · Kevin · refusée le 23 août",
  V3: "24 août · Kevin · en attente du client",
};

/** Why a change was requested — kept short so it can be counted over time. */
export const CHANGE_REASONS = ["Cadrage", "Texte", "Colorimétrie", "Hors marque"];
