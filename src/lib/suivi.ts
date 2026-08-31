/**
 * L'état d'un contenu vu depuis la date à laquelle il doit sortir.
 *
 * Le statut seul ne dit rien d'urgent : « en création » est parfait à dix jours
 * de la publication et alarmant la veille. C'est la distance à l'échéance,
 * croisée avec l'avancement, qui décide de la couleur — et donc de ce que
 * l'écran de suivi met en avant.
 */
import type { Tone } from "./tone";

/** Les étapes après lesquelles un contenu n'attend plus que sa date. */
const PRÊT = new Set(["pret", "publie"]);
/** Les étapes où la balle est dans le camp de quelqu'un d'autre. */
const EN_ATTENTE = new Set(["revision", "validation"]);

export type EtatSuivi = {
  cle: "publie" | "retard" | "aujourdhui" | "bientot" | "attente" | "calme";
  label: string;
  tone: Tone;
  /** Ce qui doit sauter aux yeux : un retard, ou une sortie du jour non prête. */
  alerte: boolean;
};

/** Nombre de jours pleins entre deux dates, sans tenir compte de l'heure. */
export function joursEntre(de: Date, a: Date): number {
  const j = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((j(a) - j(de)) / 86_400_000);
}

export function etatDuContenu(
  contenu: { status: string; scheduledAt: Date | null; publishedAt: Date | null },
  maintenant: Date = new Date(),
): EtatSuivi {
  if (contenu.publishedAt || contenu.status === "publie") {
    return { cle: "publie", label: "Publié", tone: "ok", alerte: false };
  }
  if (!contenu.scheduledAt) {
    // Sans date, il n'y a pas d'échéance à comparer : c'est la colonne « à
    // programmer » qui s'en occupe, pas la couleur d'une carte.
    return { cle: "calme", label: "Sans date", tone: "muted", alerte: false };
  }

  const jours = joursEntre(maintenant, contenu.scheduledAt);

  if (jours < 0) {
    return { cle: "retard", label: "En retard", tone: "alert", alerte: true };
  }
  if (jours === 0) {
    return PRÊT.has(contenu.status)
      ? { cle: "aujourdhui", label: "Part aujourd'hui", tone: "info", alerte: false }
      : { cle: "aujourdhui", label: "Aujourd'hui, pas prêt", tone: "alert", alerte: true };
  }
  if (PRÊT.has(contenu.status)) {
    return { cle: "calme", label: "Prêt", tone: "ok", alerte: false };
  }
  if (jours <= 2) {
    return EN_ATTENTE.has(contenu.status)
      ? { cle: "attente", label: "Attente de validation", tone: "warn", alerte: true }
      : { cle: "bientot", label: "À finir", tone: "warn", alerte: true };
  }
  return { cle: "calme", label: "En cours", tone: "neutral", alerte: false };
}

/** Les sept jours d'une semaine, à partir de son lundi au format ISO. */
export function joursDeLaSemaine(lundiIso: string): Date[] {
  const lundi = new Date(`${lundiIso}T00:00:00`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lundi);
    d.setDate(lundi.getDate() + i);
    return d;
  });
}

/** Décale un lundi de n semaines, et rend son format ISO. */
export function decalerSemaine(lundiIso: string, n: number): string {
  const d = new Date(`${lundiIso}T00:00:00`);
  d.setDate(d.getDate() + n * 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
