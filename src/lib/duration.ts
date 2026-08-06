/**
 * Une durée saisie comme on la dit : « 3 », « 3,5 », « 3h30 », « 45min ».
 *
 * Obliger à convertir en minutes ferait perdre quelques secondes à chaque
 * saisie, et une saisie pénible finit par ne plus être faite du tout — or sans
 * les heures passées, la marge affichée est une fiction.
 *
 * Retourne null quand la forme n'est pas reconnue : mieux vaut redemander que
 * d'enregistrer un nombre deviné.
 */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase().replace(",", ".");
  if (!s) return null;

  // « 3h30 » — la forme la plus courante à l'oral.
  const hm = s.match(/^(\d+)\s*h\s*(\d{1,2})$/);
  if (hm) {
    const minutes = Number(hm[2]);
    if (minutes >= 60) return null;
    return Number(hm[1]) * 60 + minutes;
  }

  // « 3 », « 3.5 », « 3h »
  const h = s.match(/^(\d+(?:\.\d+)?)\s*h?$/);
  if (h) return Math.round(Number(h[1]) * 60);

  // « 45min », « 45m »
  const m = s.match(/^(\d+)\s*(?:min|mn|m)$/);
  if (m) return Number(m[1]);

  return null;
}

/** « 3 h 30 » plutôt que « 3,5 h » : c'est ainsi qu'on lit un temps passé. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

export const hoursFromMinutes = (minutes: number): number => minutes / 60;
