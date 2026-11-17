import { NETWORK_LABEL } from "@/data/content";

/*
 * Le statut d'une publication, tel que le client le lit dans son calendrier.
 *
 * Rien n'est inventé ici : chaque cas traduit une règle que l'agence applique
 * déjà ailleurs, et le commentaire dit où. Le client n'a pas à connaître le
 * pipeline interne (idée, brief, tournage, dérush, création, révision) : tout
 * ce qui se fabrique encore est « en préparation », comme sur l'accueil du
 * portail où ces contenus apparaissent déjà dans « Ce qui arrive ».
 */

export type StatutPortail =
  | "aValider"
  | "preparation"
  | "valide"
  | "programme"
  | "publie"
  | "partiel"
  | "echec";

type ContenuStatut = {
  status: string;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  metricoolState: string | null;
  metricoolNetworks: { network: string; status: string }[];
};

/**
 * L'ordre des tests compte.
 *
 * 1. « partiel » d'abord : un réseau est en ligne, un autre en échec
 *    (`syncPublications`, lib/metricool-schedule.ts). C'est une publication —
 *    elle compte dans le mois — mais l'échec reste signalé, comme dans
 *    « Publiés aujourd'hui » de la page « À publier ».
 * 2. Publié : `publishedAt` est posé par la confirmation manuelle, par le
 *    relevé Metricool ou par les publications faites hors de Pilot ; c'est la
 *    même preuve que « Publié ce mois » de l'accueil du portail.
 * 3. À valider : `status = validation`, le filtre de la page « À valider ».
 *    Passe avant un éventuel état Metricool : tant que le client n'a pas
 *    répondu, c'est à lui d'agir.
 * 4. En échec : Metricool a refusé sur tous les réseaux (`erreur`).
 * 5. Programmé : `metricoolState = programme`, la règle de la page d'un
 *    contenu du portail (« Publication programmée, elle partira toute
 *    seule »). Un brouillon Metricool ne part pas seul : il reste « validé ».
 * 6. Validé : `status = pret` (le client a validé, ou l'agence pour un client
 *    « confiance »), pas encore programmé — Metricool non relié, programmation
 *    bloquée, ou publication à la main.
 * 7. Le reste se fabrique encore.
 */
export function statutPortail(c: ContenuStatut): StatutPortail {
  if (c.metricoolState === "partiel") return "partiel";
  if (c.publishedAt || c.status === "publie") return "publie";
  if (c.status === "validation") return "aValider";
  if (c.metricoolState === "erreur") return "echec";
  if (c.metricoolState === "programme") return "programme";
  if (c.status === "pret") return "valide";
  return "preparation";
}

/**
 * Ce que le client voit déjà ailleurs dans son portail, et rien de plus.
 *
 * - l'accueil montre ce qui est publié (« Publié ce mois »), ce qui attend sa
 *   validation, et tout ce qui est daté dans le futur, quel que soit son état
 *   (« Ce qui arrive ») ;
 * - un contenu qu'il a validé, programmé ou dont la publication a échoué le
 *   concerne aussi une fois la date passée : c'est sa publication à lui.
 *
 * Reste caché ce qui est daté dans le passé sans avoir été validé (retard de
 * fabrication, contenu abandonné « non publié ») : c'est la cuisine interne
 * de l'agence, que l'accueil ne montre pas non plus.
 *
 * `wall` est la date du contenu dans le calendrier, en heure murale de La
 * Réunion ; `maintenant` aussi (`wallNow()`).
 */
export function visibleAuPortail(c: ContenuStatut & { wall: Date }, maintenant: Date): boolean {
  const s = statutPortail(c);
  if (s === "publie" || s === "partiel") return true;
  // « Non publié » : l'agence a renoncé à ce créneau. L'accueil ne le montre
  // pas, le calendrier non plus.
  if (c.status === "manque") return false;
  if (s === "preparation") return c.wall.getTime() >= maintenant.getTime();
  return true;
}

/** Les réseaux sur lesquels Metricool a échoué, en clair (« Facebook »). */
export function reseauxEnEchec(c: Pick<ContenuStatut, "metricoolNetworks">): string[] {
  return c.metricoolNetworks
    .filter((n) => n.status === "ERROR")
    .map((n) => NETWORK_LABEL[n.network] ?? n.network);
}

/**
 * Libellé, explication et couleurs de chaque statut.
 *
 * Les couleurs reprennent le code du calendrier de l'agence (or = en
 * validation, bleu = prêt / programmé, vert = publié, rouge = problème), pour
 * qu'un même contenu ait la même teinte des deux côtés.
 */
export const STATUTS: Record<
  StatutPortail,
  { label: string; aide: string; point: string; pastille: string }
> = {
  aValider: {
    label: "À valider",
    aide: "Attend votre réponse avant publication",
    point: "bg-accent",
    pastille: "bg-accent text-accent-ink",
  },
  preparation: {
    label: "En préparation",
    aide: "L'équipe le prépare, vous le validerez ensuite",
    point: "bg-ink-3",
    pastille: "border border-dashed border-line-strong bg-paper text-ink-2",
  },
  valide: {
    label: "Validé",
    aide: "En attente de programmation par l'équipe",
    point: "border-2 border-info bg-paper",
    pastille: "bg-info-bg text-ink",
  },
  programme: {
    label: "Programmé",
    aide: "Partira tout seul à l'heure prévue",
    point: "bg-info",
    pastille: "bg-info text-white",
  },
  publie: {
    label: "Publié",
    aide: "En ligne",
    point: "bg-ok",
    pastille: "bg-ok-bg text-ink",
  },
  partiel: {
    label: "Publié en partie",
    aide: "En ligne sur un réseau, en échec sur un autre",
    point: "bg-warn",
    pastille: "bg-warn-bg text-ink",
  },
  echec: {
    label: "En échec",
    aide: "La publication n'a pas pu partir, l'équipe est prévenue",
    point: "bg-alert",
    pastille: "bg-alert-bg text-ink",
  },
};

export const ORDRE_STATUTS: StatutPortail[] = [
  "aValider",
  "preparation",
  "valide",
  "programme",
  "publie",
  "partiel",
  "echec",
];
