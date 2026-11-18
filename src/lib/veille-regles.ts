/*
 * Les règles de la veille, sans base ni réseau : périodes, format, score,
 * « x fois sa moyenne », et la remontée de l'historique par tranches.
 * Pures, pour être vérifiées telles quelles par scripts/test-veille.mjs.
 */

export const JOUR_MS = 86_400_000;

/* -------------------------------------------------------------- périodes -- */

export const PERIODES = [
  { cle: "30j", label: "30 jours", jours: 30 },
  { cle: "90j", label: "90 jours", jours: 90 },
  { cle: "6m", label: "6 mois", jours: 183 },
  { cle: "1a", label: "1 an", jours: 365 },
  { cle: "tout", label: "Depuis toujours", jours: null },
] as const;

export type Periode = (typeof PERIODES)[number]["cle"];
export const PERIODE_DEFAUT: Periode = "30j";

export function periodeDe(v: unknown): Periode {
  return PERIODES.some((p) => p.cle === v) ? (v as Periode) : PERIODE_DEFAUT;
}

export const libellePeriode = (p: Periode) => PERIODES.find((x) => x.cle === p)!.label;

/** Le début de la période (null : depuis toujours). */
export function debutPeriode(p: Periode, maintenant: Date): Date | null {
  const jours = PERIODES.find((x) => x.cle === p)!.jours;
  return jours == null ? null : new Date(maintenant.getTime() - jours * JOUR_MS);
}

/* --------------------------------------------------------------- formats -- */

export type Format = "reel" | "carrousel" | "photo" | "video" | "short" | "publication";

export const FORMAT_LABEL: Record<Format, string> = {
  reel: "Reel",
  carrousel: "Carrousel",
  photo: "Photo",
  video: "Vidéo",
  short: "Short",
  publication: "Publication",
};

/** Le type brut de Metricool (REEL, CAROUSEL_ALBUM, IMAGE, VIDEO…) → un format lisible. */
export function formatDe(type: string | null | undefined, network: string, url?: string | null): Format {
  const t = (type ?? "").toLowerCase();
  if (/reel/.test(t) || /instagram\.com\/reels?\//i.test(url ?? "")) return "reel";
  if (/carou|album|sidecar/.test(t)) return "carrousel";
  if (/short/.test(t) || /youtube\.com\/shorts\//i.test(url ?? "")) return "short";
  if (/video|vid[ée]o/.test(t) || network === "youtube") return "video";
  if (/image|photo|picture/.test(t)) return "photo";
  return "publication";
}

/** Le format du contenu Pilot qui reprend l'idée (types de contenu de Pilot). */
export function formatPilot(f: Format): "reel" | "carrousel" | "feed" {
  return f === "reel" || f === "video" || f === "short" ? "reel" : f === "carrousel" ? "carrousel" : "feed";
}

/* ----------------------------------------------------------------- score -- */

/**
 * Le classement « meilleur » de la veille, inchangé : interactions (j'aime,
 * commentaires, partages) plus une vue pour vingt. Calculé sur les métriques
 * du dernier relevé, de la même façon pour toutes les périodes : une
 * publication a le même score sur 30 jours et « Depuis toujours ».
 */
export const score = (p: { interactions: number; views: number }) => p.interactions + p.views / 20;

/** Fenêtre autour d'une publication pour la moyenne de son compte « au même moment ». */
export const FENETRE_MOYENNE_JOURS = 60;
/** Il faut au moins ce nombre d'autres publications du compte dans la fenêtre. */
export const MIN_VOISINES = 3;

/**
 * « x fois sa moyenne » : le score d'une publication divisé par le score moyen
 * des AUTRES publications du même compte publiées à ±60 jours. Un compte qui a
 * grossi depuis n'est pas avantagé : on compare chaque publication à ce que le
 * compte faisait à ce moment-là. null quand le compte n'a pas assez de
 * publications autour (ou une moyenne nulle).
 */
export function foisMoyenne<T extends { id: string; compte: string; date: Date | null; score: number }>(posts: T[]): Map<string, number | null> {
  const parCompte = new Map<string, T[]>();
  for (const p of posts) {
    if (!p.date) continue;
    const l = parCompte.get(p.compte) ?? [];
    l.push(p);
    parCompte.set(p.compte, l);
  }
  const out = new Map<string, number | null>();
  const fenetre = FENETRE_MOYENNE_JOURS * JOUR_MS;
  for (const liste of parCompte.values()) {
    liste.sort((a, b) => a.date!.getTime() - b.date!.getTime());
    for (let i = 0; i < liste.length; i++) {
      const t = liste[i].date!.getTime();
      let somme = 0;
      let n = 0;
      for (let j = i - 1; j >= 0 && t - liste[j].date!.getTime() <= fenetre; j--) {
        somme += liste[j].score;
        n++;
      }
      for (let j = i + 1; j < liste.length && liste[j].date!.getTime() - t <= fenetre; j++) {
        somme += liste[j].score;
        n++;
      }
      out.set(liste[i].id, n >= MIN_VOISINES && somme > 0 ? Math.round((liste[i].score / (somme / n)) * 10) / 10 : null);
    }
  }
  for (const p of posts) if (!out.has(p.id)) out.set(p.id, null);
  return out;
}

export type Tri = "engagement" | "moyenne";
export const triDe = (v: unknown): Tri => (v === "moyenne" ? "moyenne" : "engagement");

/** Trie sans modifier la liste : par score, ou par « x fois sa moyenne » (les inconnus à la fin, départagés par le score). */
export function classer<T extends { score: number; fois: number | null }>(posts: T[], tri: Tri): T[] {
  return [...posts].sort((a, b) => {
    if (tri === "moyenne") {
      const fa = a.fois ?? -1;
      const fb = b.fois ?? -1;
      if (fa !== fb) return fb - fa;
    }
    return b.score - a.score;
  });
}

/* -------------------------------------------------------------- textes -- */

export const cleCompte = (h: string) => h.replace(/^@/, "").trim().toLowerCase();

/** Le début de la légende, pour reconnaître la publication (jamais pour la recopier). */
export function legendeCourte(texte: string | null | undefined, max = 280): string | null {
  const t = (texte ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/** « aujourd'hui », « il y a 3 jours », « il y a 5 mois », « il y a 2 ans ». */
export function ilYa(date: Date, maintenant: Date): string {
  const jours = Math.floor((maintenant.getTime() - date.getTime()) / JOUR_MS);
  if (jours <= 0) return "aujourd'hui";
  if (jours === 1) return "hier";
  if (jours < 14) return `il y a ${jours} jours`;
  if (jours < 45) return `il y a ${Math.round(jours / 7)} semaines`;
  const mois = Math.round(jours / 30.44);
  if (mois < 12) return `il y a ${mois} mois`;
  const ans = Math.floor(jours / 365.25);
  return ans <= 1 ? "il y a 1 an" : `il y a ${ans} ans`;
}

/* ------------------------------------------------- remontée par tranches -- */

/**
 * Le plancher de la remontée : le lancement d'Instagram. La documentation de
 * Metricool ne fixe aucune durée maximale aux paramètres from / to des
 * concurrents ; on demande donc tout, et on s'adapte à ce qui revient.
 */
export const PLANCHER = new Date("2010-10-01T00:00:00Z");
/** Une erreur sur une tranche plus longue que ceci : on la coupe en deux et on réessaie. */
export const TRANCHE_MIN_ERREUR_JOURS = 31;
/** Plus d'un an sans aucune publication en remontant : le début de l'historique est atteint. */
export const VIDE_MAX_JOURS = 400;
/** Trois erreurs de suite sur des tranches courtes : ce réseau s'arrête pour cette fois. */
export const ERREURS_SUITE_MAX = 3;

export type EtatReseau = {
  /** On remonte vers le passé : tout ce qui est après le curseur est déjà relu. */
  curseur: string;
  /** Taille de la prochaine tranche, en jours. */
  taille: number;
  /** La plus grande tranche qui n'a pas échoué (null : inconnue). */
  tailleOk: number | null;
  /** Jours consécutifs relus sans aucune publication. */
  vide: number;
  fini: boolean;
  succes: boolean;
  publications: number;
  erreurs: number;
  erreursSuite: number;
  derniereErreur?: string | null;
};

export function etatInitial(maintenant: Date): EtatReseau {
  return {
    curseur: maintenant.toISOString(),
    taille: Math.ceil((maintenant.getTime() - PLANCHER.getTime()) / JOUR_MS),
    tailleOk: null,
    vide: 0,
    fini: false,
    succes: false,
    publications: 0,
    erreurs: 0,
    erreursSuite: 0,
    derniereErreur: null,
  };
}

export type Tranche = { from: Date; to: Date; jours: number };

/** La prochaine tranche à demander (la plus récente qui reste), ou null si ce réseau est terminé. */
export function trancheSuivante(e: EtatReseau): Tranche | null {
  const to = new Date(e.curseur);
  if (e.fini || to.getTime() <= PLANCHER.getTime()) return null;
  const from = new Date(Math.max(to.getTime() - e.taille * JOUR_MS, PLANCHER.getTime()));
  return { from, to, jours: Math.max(1, Math.ceil((to.getTime() - from.getTime()) / JOUR_MS)) };
}

/**
 * Une tranche a répondu `n` publications. Si elle en a rendu autant que la
 * limite demandée, la réponse est sans doute tronquée : on recoupe la même
 * période en deux (sans avancer). Sinon on avance, et la tranche suivante peut
 * grandir de nouveau (sans dépasser une taille qui a déjà échoué).
 */
export function apresSucces(e: EtatReseau, t: Tranche, n: number, limite: number): EtatReseau {
  const x = { ...e, succes: true, erreursSuite: 0 };
  if (n >= limite && t.jours > 1) return { ...x, taille: Math.max(1, Math.floor(t.jours / 2)) };
  x.curseur = t.from.toISOString();
  x.publications += n;
  x.vide = n ? 0 : x.vide + t.jours;
  if (n < limite / 4) x.taille = Math.min(Math.max(x.taille, t.jours) * 2, x.tailleOk ?? Number.POSITIVE_INFINITY);
  if (t.from.getTime() <= PLANCHER.getTime() || x.vide >= VIDE_MAX_JOURS) x.fini = true;
  return x;
}

/**
 * Une tranche a échoué. 429 : on s'arrête là pour cette fois (« pause »).
 * Tranche longue : on la coupe en deux et on retient que cette taille ne passe
 * pas. Tranche courte : on la saute (réponse partielle acceptée) ; si le réseau
 * n'a jamais répondu, ou trois fois de suite, il s'arrête.
 */
export function apresErreur(e: EtatReseau, t: Tranche, statut: number | null, message: string): { etat: EtatReseau; pause: boolean } {
  if (statut === 429) return { etat: { ...e, derniereErreur: message }, pause: true };
  const x = { ...e, erreurs: e.erreurs + 1, derniereErreur: message };
  if (t.jours > TRANCHE_MIN_ERREUR_JOURS) {
    const moitie = Math.max(1, Math.floor(t.jours / 2));
    return { etat: { ...x, tailleOk: moitie, taille: Math.min(x.taille, moitie) }, pause: false };
  }
  x.erreursSuite = e.erreursSuite + 1;
  if (!e.succes || x.erreursSuite >= ERREURS_SUITE_MAX) return { etat: { ...x, fini: true }, pause: false };
  x.curseur = t.from.toISOString();
  if (t.from.getTime() <= PLANCHER.getTime()) x.fini = true;
  return { etat: x, pause: false };
}
