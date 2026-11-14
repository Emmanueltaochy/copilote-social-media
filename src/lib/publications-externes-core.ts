/*
 * Publications faites hors de Pilot (directement dans Instagram, Facebook,
 * TikTok…) : Metricool les relève comme les autres, mais elles n'ont pas de
 * contenu dans Pilot, donc elles ne comptaient pas dans l'engagement du mois.
 *
 * Ce fichier décide, sans toucher à la base, lesquelles sont vraiment
 * « nouvelles » et comment les regrouper : une vidéo postée sur Instagram et
 * reprise sur Facebook est UNE production, pas deux.
 *
 * Deux risques à tenir :
 * - compter deux fois un contenu publié depuis Pilot (il apparaît aussi dans
 *   le relevé Metricool) ;
 * - compter deux fois une même vidéo partie sur deux réseaux.
 * En cas de doute, on ne crée rien : un contenu manquant se voit et s'ajoute à
 * la main, un doublon gonfle l'engagement sans que personne le remarque.
 */

export type ExternalPost = {
  id: string; // « réseau:identifiant »
  network: string;
  kind: string; // post, reel, video
  publishedAt: Date;
  text: string | null;
  url: string | null;
};

export type KnownContent = {
  /** Identifiant du contenu dans Pilot (absent dans les tests simples). */
  id?: string;
  /** Programmé chez Metricool depuis Pilot : son suivi habituel s'en charge. */
  managed?: boolean;
  publishedAt: Date | null;
  scheduledAt: Date | null;
  caption: string | null;
  title: string | null;
  urls: string[]; // lien publié + liens par réseau
};

export type ExternalGroup = {
  posts: ExternalPost[];
  main: ExternalPost;
  networks: string[];
};

const MIN = 60_000;
/** Écart toléré entre le relevé et l'heure connue dans Pilot. */
const SAME_PUBLICATION_MS = 45 * MIN;
/** Écart entre deux réseaux pour une même vidéo (publication croisée). */
const CROSS_POST_MS = 20 * MIN;
/**
 * Metricool rend parfois l'heure locale (La Réunion, UTC+4) sans fuseau : la
 * même publication peut donc apparaître 4 h plus tard que l'instant réel.
 */
const WALL_OFFSETS_MS = [0, 4 * 60 * MIN, -4 * 60 * MIN];

/** Ce qui identifie un post dans son adresse, quelle que soit sa forme. */
export function urlKey(url: string | null | undefined): string | null {
  if (!url) return null;
  const u = url.trim();
  const ig = u.match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  if (ig) return `ig:${ig[1]}`;
  const tt = u.match(/tiktok\.com\/.*\/video\/(\d+)/i);
  if (tt) return `tt:${tt[1]}`;
  const fb = u.match(/facebook\.com\/(?:reel|watch\/?\?v=|.*\/(?:videos|posts)\/)(?:[^/?#]*\/)?(\d{6,}|pfbid[A-Za-z0-9]+)/i);
  if (fb) return `fb:${fb[1]}`;
  return u.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
}

/** Début d'un texte, sans accents, ponctuation ni mots-dièse : pour comparer deux légendes. */
export function textKey(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/#[\p{L}\p{N}_]+/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return t.length >= 16 ? t.slice(0, 40) : null;
}

const PREFERRED = ["instagram", "tiktok", "facebook", "linkedin", "youtube"];
function rank(n: string) {
  const i = PREFERRED.indexOf(n);
  return i < 0 ? PREFERRED.length : i;
}

function near(a: Date | null, b: Date, tolerance: number) {
  if (!a) return false;
  const d = a.getTime() - b.getTime();
  return WALL_OFFSETS_MS.some((o) => Math.abs(d - o) <= tolerance);
}

/** Le contenu de Pilot auquel ce post du relevé correspond, s'il y en a un. */
export function matchKnown(post: ExternalPost, known: KnownContent[]): KnownContent | null {
  const key = urlKey(post.url);
  const text = textKey(post.text);
  return (
    known.find((c) => {
      if (key && c.urls.some((u) => urlKey(u) === key)) return true;
      if (near(c.publishedAt, post.publishedAt, SAME_PUBLICATION_MS)) return true;
      if (near(c.scheduledAt, post.publishedAt, SAME_PUBLICATION_MS)) return true;
      // Marqué publié à la main, des heures après : l'heure ne colle pas, la légende si.
      if (text && (textKey(c.caption) === text || textKey(c.title) === text)) return true;
      return false;
    }) ?? null
  );
}

export function isKnown(post: ExternalPost, known: KnownContent[]): boolean {
  return matchKnown(post, known) !== null;
}

/**
 * Les contenus prévus dans Pilot mais finalement publiés à la main dans le
 * réseau : ils existent, il leur manque seulement d'être marqués « publié ».
 * Ceux que Pilot a programmés chez Metricool sont laissés à leur suivi.
 */
export function toMarkPublished(posts: ExternalPost[], known: KnownContent[]): Map<string, ExternalPost[]> {
  const marks = new Map<string, ExternalPost[]>();
  for (const p of posts) {
    const c = matchKnown(p, known);
    if (!c || !c.id || c.publishedAt || c.managed) continue;
    marks.set(c.id, [...(marks.get(c.id) ?? []), p]);
  }
  return marks;
}

const PREFERRED_FIRST = (list: ExternalPost[]) => [...list].sort((a, b) => rank(a.network) - rank(b.network));

/** Le post à retenir comme lien principal (Instagram d'abord). */
export function mainOf(list: ExternalPost[]): ExternalPost {
  return PREFERRED_FIRST(list)[0];
}

/**
 * Regroupe les posts inconnus de Pilot en productions : même vidéo sur
 * plusieurs réseaux à quelques minutes d'écart, ou même légende.
 */
export function groupExternal(posts: ExternalPost[], known: KnownContent[]): ExternalGroup[] {
  const fresh = posts
    .filter((p) => !isKnown(p, known))
    .sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());
  const groups: ExternalPost[][] = [];
  for (const p of fresh) {
    const text = textKey(p.text);
    const home = groups.find((g) => {
      if (g.some((q) => q.network === p.network)) return false; // deux posts du même réseau = deux productions
      return g.some(
        (q) => near(q.publishedAt, p.publishedAt, CROSS_POST_MS) || (text !== null && textKey(q.text) === text),
      );
    });
    if (home) home.push(p);
    else groups.push([p]);
  }
  return groups.map((g) => {
    const sorted = [...g].sort((a, b) => rank(a.network) - rank(b.network));
    return { posts: g, main: sorted[0], networks: [...new Set(sorted.map((p) => p.network))] };
  });
}

/** Un titre lisible à partir de la légende, ou à défaut du réseau et de la date. */
export function titleOf(group: ExternalGroup): string {
  const line = (group.main.text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#"));
  if (line) return line.length > 70 ? `${line.slice(0, 67).trimEnd()}…` : line;
  const d = group.main.publishedAt;
  const day = `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const label = group.main.kind === "reel" || group.main.kind === "video" ? "Vidéo" : "Publication";
  return `${label} ${group.main.network} du ${day}`;
}
