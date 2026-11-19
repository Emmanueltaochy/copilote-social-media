/*
 * Les vidéos prévues d'un tournage : règles pures, partagées par la fiche
 * agence, le portail client, « Ce matin » et le script de vérification.
 *
 * Les dates de tournage suivent la convention de Pilot : l'heure murale de La
 * Réunion écrite en UTC (« 09:00 » est enregistré 09:00 UTC, voir
 * lib/publication.ts). Tout se lit donc avec `timeZone: "UTC"`, jamais avec le
 * fuseau du serveur ni celui du navigateur.
 */

/* ------------------------------------------------------------ libellés -- */

/** Le format visé, dans les mots du client. Mêmes clés qu'un contenu. */
export const FORMAT_VIDEO: Record<string, string> = {
  reel: "Reel",
  story: "Story",
  feed: "Vidéo pour le fil",
  carrousel: "Carrousel",
  autre: "Autre format",
};
export const FORMATS_VIDEO = Object.keys(FORMAT_VIDEO);

/** Qui dit le texte. */
export const PAROLE: Record<string, { agence: string; client: string }> = {
  client: { agence: "Le client", client: "C'est vous qui le dites" },
  equipe: { agence: "L'équipe", client: "Dit par notre équipe" },
  voix_off: { agence: "Voix off", client: "En voix off" },
};
export const PAROLES = Object.keys(PAROLE);

/** L'état d'une vidéo, côté agence. Le client voit « Je suis prêt » à part. */
export const STATUT_VIDEO: Record<string, { label: string; tone: "neutral" | "ok" | "muted" }> = {
  a_preparer: { label: "À préparer", tone: "neutral" },
  pret: { label: "Prêt", tone: "ok" },
  tourne: { label: "Tourné", tone: "muted" },
};
export const STATUTS_VIDEO = Object.keys(STATUT_VIDEO);

/* ---------------------------------------------------- liens de référence -- */

export type Plateforme = "instagram" | "tiktok" | "youtube" | "facebook" | "vimeo" | "autre";

export const PLATEFORME: Record<Plateforme, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  facebook: "Facebook",
  vimeo: "Vimeo",
  autre: "Lien",
};

/** La plateforme d'un lien, d'après son domaine seulement. */
export function plateformeDe(url: string): Plateforme {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\.|^m\./, "");
  } catch {
    return "autre";
  }
  if (host === "instagram.com" || host.endsWith(".instagram.com") || host === "instagr.am") return "instagram";
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
  if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") return "youtube";
  if (host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.watch") return "facebook";
  if (host === "vimeo.com" || host.endsWith(".vimeo.com")) return "vimeo";
  return "autre";
}

/** Un lien de réseau social (et pas un dossier Drive ou un WeTransfer interne). */
export const estReseauSocial = (url: string) => plateformeDe(url) !== "autre";

/** L'identifiant d'une vidéo YouTube (watch, youtu.be, shorts, embed), sinon null. */
export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0] ?? null;
    else if (host.endsWith("youtube.com")) {
      id = u.searchParams.get("v");
      const m = /^\/(shorts|embed|live)\/([^/?#]+)/.exec(u.pathname);
      if (!id && m) id = m[2];
    }
    return id && /^[\w-]{6,20}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * Les liens d'un champ libre : un par ligne (ou séparés par des espaces),
 * http(s) seulement, sans doublon, cinq au plus.
 */
export function lireLiens(texte: string): string[] {
  const vus = new Set<string>();
  for (const brut of texte.split(/\s+/)) {
    const t = brut.trim().replace(/[),.;]+$/, "");
    if (!/^https?:\/\//i.test(t)) continue;
    try {
      const u = new URL(t);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      vus.add(u.toString());
    } catch {
      continue;
    }
    if (vus.size >= 5) break;
  }
  return [...vus];
}

/* ------------------------------------------------------------ préparation -- */

export type ElementPrep = { id: string; label: string };

/**
 * « Ce que le client doit préparer », une ligne par élément.
 *
 * Un élément déjà présent garde son identifiant (même libellé, casse et
 * espaces ignorés) : modifier la liste ne décoche pas ce que le client avait
 * déjà coché de son côté.
 */
export function lirePreparation(texte: string, existant: ElementPrep[], nouvelId: () => string): ElementPrep[] {
  const cle = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const parCle = new Map(existant.map((e) => [cle(e.label), e]));
  const out: ElementPrep[] = [];
  const vus = new Set<string>();
  for (const ligne of texte.split("\n")) {
    const label = ligne.replace(/^\s*[-•*·]\s*/, "").trim().slice(0, 200);
    if (!label || vus.has(cle(label))) continue;
    vus.add(cle(label));
    out.push({ id: parCle.get(cle(label))?.id ?? nouvelId(), label });
    if (out.length >= 20) break;
  }
  return out;
}

/* ----------------------------------------------------------------- dates -- */

/** « jeudi 4 décembre » (heure de La Réunion, voir l'en-tête). */
export const jourLong = (d: Date) =>
  d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** « jeu. 4 déc. » */
export const jourCourt = (d: Date) =>
  d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** « 9 h », « 9 h 30 » : l'heure telle qu'on la dit. */
export const heureDite = (d: Date) => {
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
};

/** « 9 h – 12 h », ou « 9 h » sans fin connue. */
export const creneauDit = (debut: Date, fin: Date | null) => (fin ? `${heureDite(debut)} – ${heureDite(fin)}` : heureDite(debut));

/** « 3 h », « 1 h 30 », « 45 min » ; null sans fin connue. */
export function dureeDite(debut: Date, fin: Date | null): string | null {
  if (!fin) return null;
  const min = Math.round((fin.getTime() - debut.getTime()) / 60_000);
  if (min <= 0) return null;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h} h ${String(r).padStart(2, "0")}` : `${h} h`;
}

/** « 30 s », « 1 min », « 1 min 30 ». */
export function dureeVideo(sec: number | null | undefined): string | null {
  if (!sec || sec <= 0) return null;
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m} min ${String(s).padStart(2, "0")}` : `${m} min`;
}

/** « dans 3 jours », « demain », « aujourd'hui » — en jours de calendrier, à La Réunion. */
export function dansCombien(debut: Date, maintenantMural: Date): string {
  const jour = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const n = Math.round((jour(debut) - jour(maintenantMural)) / 86_400_000);
  if (n <= 0) return "aujourd'hui";
  if (n === 1) return "demain";
  return `dans ${n} jours`;
}

/** Le prénom seul : le client n'a pas à lire le nom complet de l'équipe. */
export const prenom = (nom: string) => nom.trim().split(/\s+/)[0] ?? nom;

/** « Emmanuel », « Emmanuel et Léa », « Emmanuel, Léa et Yohan ». */
export function enumerer(noms: string[]): string {
  if (noms.length <= 1) return noms[0] ?? "";
  return `${noms.slice(0, -1).join(", ")} et ${noms[noms.length - 1]}`;
}

/* ---------------------------------------------------------- récapitulatif -- */

type VideoResume = {
  prep: ElementPrep[];
  prepDone: string[];
  clientReadyAt: Date | null;
  script: string | null;
  speaker: string | null;
};

/**
 * Ce qui reste à préparer pour un tournage, côté client :
 * - `choses` : les éléments « à préparer » pas encore cochés ;
 * - `nonPretes` : les vidéos sans « Je suis prêt » ;
 * - `scripts` : les vidéos dont le client dit lui-même le texte.
 */
export function resume(videos: VideoResume[]) {
  let choses = 0;
  let total = 0;
  for (const v of videos) {
    const faits = new Set(v.prepDone);
    total += v.prep.length;
    choses += v.prep.filter((p) => !faits.has(p.id)).length;
  }
  return {
    videos: videos.length,
    choses,
    chosesTotal: total,
    pretes: videos.filter((v) => v.clientReadyAt).length,
    nonPretes: videos.filter((v) => !v.clientReadyAt).length,
    scripts: videos.filter((v) => v.script?.trim() && v.speaker === "client").length,
  };
}

/** « 5 vidéos · 2 choses à préparer » */
export function resumeDit(r: ReturnType<typeof resume>): string {
  const morceaux = [`${r.videos} vidéo${r.videos > 1 ? "s" : ""}`];
  if (r.choses > 0) morceaux.push(`${r.choses} chose${r.choses > 1 ? "s" : ""} à préparer`);
  else if (r.chosesTotal > 0) morceaux.push("tout est préparé");
  return morceaux.join(" · ");
}

/* ------------------------------------------------- « Ce matin » : relance -- */

/**
 * LA RÈGLE « Relancer le client avant le tournage » : un tournage publié au
 * client, ni annulé ni réalisé, qui commence dans 3 jours ou moins (à partir
 * de maintenant, heure de La Réunion), dont au moins une vidéo visible par le
 * client n'est pas encore marquée « Je suis prêt ».
 */
export const RELANCE_TOURNAGE_JOURS = 3;

export function aRelancer(
  shoot: { startsAt: Date; status: string; publishedAt: Date | null },
  videos: { visibleToClient: boolean; clientReadyAt: Date | null }[],
  maintenantMural: Date,
): boolean {
  if (!shoot.publishedAt) return false;
  if (shoot.status === "annule" || shoot.status === "realise") return false;
  const ecart = shoot.startsAt.getTime() - maintenantMural.getTime();
  if (ecart < 0 || ecart > RELANCE_TOURNAGE_JOURS * 86_400_000) return false;
  return videos.some((v) => v.visibleToClient && !v.clientReadyAt);
}
