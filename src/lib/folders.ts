/**
 * Les dossiers de la bibliothèque, mis à plat pour l'affichage.
 *
 * La base ne stocke qu'un parent par dossier : c'est suffisant pour ranger, et
 * insuffisant pour montrer. Ces fonctions reconstituent ce qui manque —
 * l'ordre d'un arbre parcouru en profondeur, le chemin complet d'un dossier,
 * le fil d'Ariane qui y mène.
 */

export type Noeud = {
  id: string;
  parentId: string | null;
  name: string;
  /** Médias rangés directement dedans. Absent quand l'écran n'en a pas besoin. */
  medias?: number;
};

export type Rangee = Noeud & {
  /** Profondeur, pour l'indentation d'une liste déroulante. */
  niveau: number;
  /** « Shooting mars / Brut ». */
  chemin: string;
  /** Médias du dossier et de tout ce qu'il contient. */
  total: number;
};

/** Les enfants directs d'un dossier, triés par nom. */
export function enfants(noeuds: Noeud[], parentId: string | null): Noeud[] {
  return noeuds
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/**
 * L'arbre entier, à plat, dans l'ordre où on le lirait.
 *
 * Le total inclut les sous-dossiers : un dossier « Shooting mars » qui affiche
 * zéro parce que tout est rangé dans ses deux sous-dossiers donnerait
 * l'impression d'être vide.
 */
export function aplatir(noeuds: Noeud[]): Rangee[] {
  const sortie: Rangee[] = [];

  const descendre = (parentId: string | null, niveau: number, prefixe: string) => {
    for (const n of enfants(noeuds, parentId)) {
      const chemin = prefixe ? `${prefixe} / ${n.name}` : n.name;
      const rangee: Rangee = { ...n, niveau, chemin, total: n.medias ?? 0 };
      sortie.push(rangee);
      const avant = sortie.length;
      descendre(n.id, niveau + 1, chemin);
      for (let i = avant; i < sortie.length; i += 1) {
        if (sortie[i].niveau === niveau + 1) rangee.total += sortie[i].total;
      }
    }
  };

  descendre(null, 0, "");
  return sortie;
}

/** Le chemin d'un dossier jusqu'à la racine, racine en premier. */
export function filDAriane(noeuds: Noeud[], id: string | null): Noeud[] {
  const parId = new Map(noeuds.map((n) => [n.id, n]));
  const chemin: Noeud[] = [];
  let courant = id ? parId.get(id) : undefined;
  // Borné par le nombre de dossiers : une boucle de parents fabriquée à la
  // main ne doit pas figer la page.
  let garde = 0;
  while (courant && garde < 100) {
    chemin.unshift(courant);
    courant = courant.parentId ? parId.get(courant.parentId) : undefined;
    garde += 1;
  }
  return chemin;
}

/**
 * Les dossiers où l'on peut déplacer `id` sans créer de boucle.
 *
 * Ranger un dossier dans son propre sous-dossier le détacherait de l'arbre :
 * il deviendrait inatteignable, avec tout ce qu'il contient.
 */
export function destinations(noeuds: Noeud[], id: string): Rangee[] {
  const interdits = new Set<string>([id]);
  let bouge = true;
  while (bouge) {
    bouge = false;
    for (const n of noeuds) {
      if (n.parentId && interdits.has(n.parentId) && !interdits.has(n.id)) {
        interdits.add(n.id);
        bouge = true;
      }
    }
  }
  return aplatir(noeuds).filter((r) => !interdits.has(r.id));
}
