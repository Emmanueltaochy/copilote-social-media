import {
  CONTENT_STAGES,
  CONTENT_STATUS,
  ETAPES_FACULTATIVES,
  type ContentStatus,
} from "@/data/content";

/**
 * Ce qu'un changement de statut a le droit de faire.
 *
 * Logique pure, sans base ni requête : elle se relit d'un bloc, et c'est ce
 * qu'on veut d'une règle qui décide ce qu'un agent peut faire du pipeline.
 *
 * Trois principes, et aucun n'est arbitraire :
 *
 * - **On avance dans l'ordre, en sautant ce qui est facultatif.** Le pipeline
 *   décrit une fabrication réelle ; sauter « validation » ne raccourcit pas le
 *   travail, ça efface la trace qu'il a eu lieu. Les étapes qu'on peut sauter
 *   sont déclarées dans `ETAPES_FACULTATIVES`, pas décidées ici.
 *
 * - **On recule librement.** Une reprise demandée par le client renvoie en
 *   création depuis n'importe où, et c'est fréquent. Une règle qui n'autorise
 *   que la marche avant bloque la première correction réelle — donc dès le
 *   premier jour d'usage.
 *
 * - **« Publié » ne s'atteint pas par ici.** C'est la trace qu'une personne a
 *   constaté une publication réelle, avec son lien. Un agent qui pourrait la
 *   poser pourrait faire dire à l'outil qu'un post est parti alors qu'il
 *   n'existe pas — et c'est sur cette colonne que le suivi calcule les retards.
 */
export type Verdict = { permise: true } | { permise: false; raison: string };

const rang = (statut: ContentStatus): number =>
  (CONTENT_STAGES as readonly string[]).indexOf(statut);

const nom = (statut: ContentStatus): string => CONTENT_STATUS[statut]?.label ?? statut;

export function transitionPermise(depuis: ContentStatus, vers: ContentStatus): Verdict {
  if (depuis === vers) return { permise: true };

  if (vers === "publie") {
    return {
      permise: false,
      raison:
        "« Publié » se constate, il ne se décide pas : seule une personne qui a vu le post en ligne peut le poser, avec son lien.",
    };
  }

  if (vers === "manque") {
    return {
      permise: false,
      raison:
        "« Non publié » est un constat, pas une étape : il n'est pas posé à la main pour l'instant.",
    };
  }

  // Un contenu tombé en « non publié » doit pouvoir être repris : c'est même la
  // seule chose utile qu'on puisse en faire.
  if (depuis === "manque") return { permise: true };

  const a = rang(depuis);
  const b = rang(vers);
  if (a === -1 || b === -1) {
    return { permise: false, raison: `Statut inconnu : « ${depuis} » ou « ${vers} ».` };
  }

  // Reculer est toujours permis.
  if (b < a) return { permise: true };

  // Avancer : tout ce qu'on enjambe doit être facultatif.
  const obligatoiresSautees = CONTENT_STAGES.slice(a + 1, b).filter(
    (etape) => !ETAPES_FACULTATIVES.has(etape),
  );

  if (obligatoiresSautees.length > 0) {
    const manquantes = obligatoiresSautees.map(nom);
    return {
      permise: false,
      raison:
        `On ne passe pas de « ${nom(depuis)} » à « ${nom(vers)} » : ` +
        `${manquantes.length > 1 ? "les étapes" : "l'étape"} ${manquantes
          .map((m) => `« ${m} »`)
          .join(", ")} ${manquantes.length > 1 ? "sont obligatoires" : "est obligatoire"}. ` +
        `Prochaine étape possible : « ${nom(CONTENT_STAGES[a + 1])} ».`,
    };
  }

  return { permise: true };
}
