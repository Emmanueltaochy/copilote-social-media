/**
 * Durées d'accès proposées à l'invitation d'un renfort.
 *
 * Un monteur pris pour un tournage, un graphiste pour une semaine chargée :
 * ces accès-là doivent s'éteindre seuls. Choisir la durée au moment d'inviter
 * évite de compter sur quelqu'un pour la retirer plus tard, ce que personne ne
 * fait.
 */
export const ACCESS_DURATIONS: Record<string, { label: string; days: number | null }> = {
  permanent: { label: "Permanent", days: null },
  jour: { label: "1 jour", days: 1 },
  semaine: { label: "1 semaine", days: 7 },
  quinzaine: { label: "15 jours", days: 15 },
  mois: { label: "1 mois", days: 30 },
  trimestre: { label: "3 mois", days: 90 },
};

export const ACCESS_DURATION_KEYS = Object.keys(ACCESS_DURATIONS);
