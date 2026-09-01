import "server-only";

/**
 * Limitation de débit de l'API des agents.
 *
 * En mémoire du processus, sans dépendance ni service tiers. Deux raisons
 * tiennent à ce déploiement précis :
 *
 * - `docker-compose.yml` ne lance qu'un conteneur applicatif, et Next en mode
 *   `standalone` un seul processus Node. La mémoire du processus *est* donc
 *   l'application : le compteur est cohérent, sans partage à organiser.
 * - nginx est mutualisé avec les autres sites de la machine, et `limit_req_zone`
 *   se déclare dans son bloc `http` global. `scripts/ensure-nginx.sh` s'astreint
 *   depuis toujours à ne toucher qu'un seul vhost, avec copie de sauvegarde et
 *   retour arrière — poser la limite dans nginx romprait cette discipline et
 *   ferait courir un risque à des sites qui n'ont rien demandé.
 *
 * À ne surtout pas déplacer dans `proxy.ts` : le proxy compile vers un bundle
 * distinct (`.next/server/middleware.js`), et l'état de module qui y vit n'est
 * pas la même instance que celui d'une route. Un compteur incrémenté là n'est
 * pas le compteur que la route relit.
 */

/**
 * Deux budgets, tenus séparément.
 *
 * Une lecture coûte une requête et se répète sans dommage — un agent qui
 * consulte le pipeline en boucle est agaçant, pas dangereux. Une écriture
 * modifie l'état de l'agence : c'est là qu'un agent parti en boucle fait des
 * dégâts, et c'est donc là que le plafond doit mordre.
 */
const PLAFONDS = {
  lecture: { max: 120, fenetreMs: 60_000 },
  ecriture: { max: 20, fenetreMs: 60_000 },
} as const;

export type Cadence = keyof typeof PLAFONDS;

type Fenetre = { ouverteA: number; compte: number };

/**
 * Indexé par identifiant de clé, jamais par adresse IP.
 *
 * L'agent arrive derrière nginx : sans analyse de `X-Forwarded-For`, toutes les
 * requêtes semblent venir de 127.0.0.1 et le plafond serait commun à tout le
 * monde. La clé est plus juste, et ne se falsifie pas — il faut la posséder
 * pour la consommer.
 *
 * C'est aussi ce qui borne cette table : sa taille est celle du nombre de clés
 * émises, une poignée. Une table indexée par une valeur que l'appelant choisit
 * serait une fuite de mémoire ; ce n'est pas le cas ici.
 */
const compteurs = new Map<string, Fenetre>();

export type Verdict =
  | { limite: false; restant: number; plafond: number }
  | { limite: true; retryAfter: number; plafond: number };

/**
 * Fenêtre fixe plutôt que glissante.
 *
 * Son défaut est connu et assumé : à cheval sur une bordure, un appelant peut
 * consommer jusqu'à deux fois le plafond. Pour un agent interne, c'est sans
 * conséquence — et la fenêtre glissante coûterait de garder l'horodatage de
 * chaque requête, là où quinze lignes suffisent.
 */
export function checkRateLimit(keyId: string, cadence: Cadence): Verdict {
  const { max, fenetreMs } = PLAFONDS[cadence];
  const maintenant = Date.now();
  // Lecture et écriture ont chacune leur fenêtre : consommer son quota de
  // lecture ne doit pas empêcher d'écrire.
  const cle = `${keyId}:${cadence}`;

  balayer(maintenant);

  const fenetre = compteurs.get(cle);
  if (!fenetre || maintenant - fenetre.ouverteA >= fenetreMs) {
    compteurs.set(cle, { ouverteA: maintenant, compte: 1 });
    return { limite: false, restant: max - 1, plafond: max };
  }

  if (fenetre.compte >= max) {
    // Arrondi au supérieur : annoncer « 0 seconde » inviterait à réessayer
    // aussitôt, et le refus se répéterait.
    const retryAfter = Math.max(1, Math.ceil((fenetre.ouverteA + fenetreMs - maintenant) / 1000));
    return { limite: true, retryAfter, plafond: max };
  }

  fenetre.compte += 1;
  return { limite: false, restant: max - fenetre.compte, plafond: max };
}

/**
 * Le ménage se fait à l'écriture plutôt que sur une minuterie : une minuterie
 * garderait le processus éveillé et devrait être arrêtée quelque part, pour un
 * gain nul à cette échelle.
 */
function balayer(maintenant: number): void {
  const plusLongue = Math.max(...Object.values(PLAFONDS).map((p) => p.fenetreMs));
  for (const [cle, fenetre] of compteurs) {
    if (maintenant - fenetre.ouverteA >= plusLongue) compteurs.delete(cle);
  }
}

/** Réservé aux tests : repart d'une table vide sans redémarrer le serveur. */
export function resetRateLimit(): void {
  compteurs.clear();
}
