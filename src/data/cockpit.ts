import type { Tone } from "@/lib/tone";

/** The four counts that open the day. Each one is a link to the screen that fixes it. */
export const ALERTS: { n: string; label: string; tone: Tone; href: string; filter?: string }[] = [
  {
    n: "2",
    label: "clients en retard sur leur engagement",
    tone: "alert",
    href: "/",
    filter: "late",
  },
  { n: "1", label: "contenu non publié à l'heure prévue", tone: "alert", href: "/a-publier" },
  { n: "2", label: "validations client de plus de 5 jours", tone: "warn", href: "/approbations" },
  { n: "3", label: "sources de données non rafraîchies", tone: "warn", href: "/rapports" },
];

export const QUEUE = [
  {
    time: "09:00",
    kind: "STO",
    title: "Casabona · Story « Braderie de rentrée »",
    meta: "Instagram · Léa",
    state: "Publié 09:03",
    action: "Voir le post",
    status: "published" as const,
  },
  {
    time: "11:00",
    kind: "FEED",
    title: "Cap Marine · Post feed « Sortie catamaran »",
    meta: "Instagram · Kevin",
    state: "En retard de 3 h 50",
    action: "Marquer publié",
    status: "overdue" as const,
  },
  {
    time: "12:30",
    kind: "REEL",
    title: "Pitaya · Reel « Bowl du jour »",
    meta: "TikTok · Noa",
    state: "Prêt à publier",
    action: "Marquer publié",
    status: "ready" as const,
  },
  {
    time: "17:00",
    kind: "FEED",
    title: "AC Gym · Post feed « Défi d'août »",
    meta: "Facebook · Kevin",
    state: "Prêt à publier",
    action: "Marquer publié",
    status: "ready" as const,
  },
  {
    time: "18:30",
    kind: "STO",
    title: "Vite Frais Bien Frais · Story « Panier du soir »",
    meta: "Instagram · Léa",
    state: "Prêt à publier",
    action: "Marquer publié",
    status: "ready" as const,
  },
];

export const APPROVALS_SUMMARY = [
  {
    kind: "REEL",
    title: "Reel « Sortie coucher de soleil »",
    meta: "Cap Marine · attente client",
    age: "6 j",
    old: true,
  },
  {
    kind: "CARR",
    title: "Carrousel « Vide-grenier de septembre »",
    meta: "Swap'Îles · attente client",
    age: "5 j",
    old: true,
  },
  {
    kind: "FEED",
    title: "Post feed « Nouveau coach »",
    meta: "AC Gym · révision interne Léa",
    age: "2 j",
  },
  {
    kind: "REEL",
    title: "Reel « Collection solaire »",
    meta: "Optique de Bourbon · révision interne",
    age: "1 j",
  },
  { kind: "STO", title: "Story « Rentrée déco »", meta: "Centrakor · attente client", age: "1 j" },
  {
    kind: "FEED",
    title: "Post feed « Menu du midi »",
    meta: "Pitaya · attente client",
    age: "8 h",
  },
];

export const SHOOTS_SUMMARY: {
  client: string;
  when: string;
  place: string;
  note: string;
  tone: Tone;
}[] = [
  {
    client: "Cap Marine",
    when: "Jeu. 27/08 · 08:00–12:00",
    place: "Port de Saint-Gilles · Noa + Kevin",
    note: "Shotlist 12 plans · tout est prêt",
    tone: "ok",
  },
  {
    client: "AC Gym",
    when: "Ven. 28/08 · 14:00–17:00",
    place: "Salle Sainte-Clotilde · Noa",
    note: "2 autorisations droit à l'image manquantes",
    tone: "warn",
  },
  {
    client: "Optique de Bourbon",
    when: "Lun. 31/08 · 09:00–13:00",
    place: "Boutique Saint-Denis · Kevin",
    note: "Moodboard à valider par le client",
    tone: "neutral",
  },
  {
    client: "Centrakor",
    when: "Mar. 01/09 · 10:00–16:00",
    place: "Magasin Le Port · Noa + Kevin",
    note: "Matériel non réservé",
    tone: "warn",
  },
];

export const ADS_ALERTS: {
  title: string;
  value: string;
  tone: Tone;
  spentPct: string;
  meta: string;
}[] = [
  {
    title: "Centrakor · Meta « Rentrée déco »",
    value: "94 % du budget",
    tone: "warn",
    spentPct: "94%",
    meta: "3 290 € sur 3 500 € · CPL 8,20 € · reste 6 jours",
  },
  {
    title: "Swap'Îles · Google Search",
    value: "CPL 18,40 €",
    tone: "alert",
    spentPct: "72%",
    meta: "Cible 12,00 € · 1 150 € sur 1 600 € · 62 leads",
  },
  {
    title: "Pitaya · TikTok « Bowl du jour »",
    value: "Arrêtée",
    tone: "alert",
    spentPct: "38%",
    meta: "Aucune dépense depuis 3 jours · 152 € sur 400 €",
  },
];

export const STALE_DATA: { label: string; age: string; tone: Tone }[] = [
  { label: "Statistiques Instagram · Cap Marine", age: "il y a 9 j · Léa", tone: "alert" },
  { label: "Chiffres Google Ads · Swap'Îles", age: "il y a 6 j · Samir", tone: "warn" },
  { label: "Statistiques TikTok · Pitaya", age: "il y a 5 j · Samir", tone: "warn" },
];
