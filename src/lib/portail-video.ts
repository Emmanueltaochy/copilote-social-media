/**
 * La version de la vidéo d'accueil, tirée du nom de fichier qui change à
 * chaque envoi. Elle sert de paramètre dans l'adresse — sans quoi le
 * navigateur rejouerait l'ancienne vidéo depuis son cache — et de clé pour
 * le choix « masquer » : une nouvelle vidéo se montre même à qui avait
 * replié la précédente.
 */
export function versionVideo(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null;
  const nom = storagePath.split(/[\\/]/).pop() ?? "";
  return nom.replace(/\.[^.]+$/, "") || null;
}
