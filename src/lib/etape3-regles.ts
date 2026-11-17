/*
 * Les règles de l'étape 3 (Trello, GoCardless, Google Agenda), sans
 * dépendance au serveur : découpage des cartes, rapprochement par le nom,
 * statuts GoCardless, absence de double compte avec Abby, extrait et lien de
 * visio d'un rendez-vous.
 *
 * Volontairement isolé (aucun import) : scripts/test-etape3.mjs charge ce
 * fichier tel quel pour éprouver les règles une par une.
 */

/* ----------------------------------------------------- normalisation -- */

/**
 * « Garage Sud-Auto », « GARAGE SUD AUTO », « Garage Sud Auto » : même clé.
 * Sans accents, sans casse, sans symbole ni émoji (identique à cleTexte dans
 * lib/annuaire.ts, recopiée ici pour que ce fichier reste sans import).
 */
export function cleNom(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Une clé trop courte (« a », « sa ») relierait n'importe quoi : on ne s'en sert pas. */
export const cleUtilisable = (k: string) => k.replace(/ /g, "").length >= 3;

/* ---------------------------------------------------------------- Trello -- */

export type Categorie = "web" | "marketing" | "admin" | "swapiles";

/** Les symboles de catégorie posés devant le nom des cartes du tableau d'Emmanuel. */
const CATEGORIES: [string, Categorie][] = [
  ["🌐", "web"],
  ["📣", "marketing"],
  ["🗂️", "admin"],
  ["🗂", "admin"],
  ["🏝️", "swapiles"],
  ["🏝", "swapiles"],
];

/** Les cartes qui valent pour toute l'agence : « 🗂️ Agence — … », « Tous les clients — … ». */
const POUR_TOUTE_L_AGENCE = new Set(["agence", "tous les clients", "toute l agence", "taochy", "taochy agency", "interne"]);

export type CarteDecoupee = {
  categorie: Categorie | null;
  /** Le nom du client avant « — », sans le symbole ; null si la carte n'en a pas. */
  client: string | null;
  /** Ce qu'il y a à faire (après « — »), ou le nom entier. */
  action: string;
  /** « Agence — … », « Tous les clients — … » : la carte ne concerne aucun client en particulier. */
  agence: boolean;
};

/**
 * « 🌐 VTC Services+ — Améliorer le programme tablette »
 *   → catégorie web, client « VTC Services+ », action « Améliorer le programme tablette ».
 * Le séparateur est le tiret long « — » (ou demi-cadratin « – »). Sans lui,
 * la carte n'a pas de client : elle reste « sans fiche ».
 */
export function decouperCarte(nom: string): CarteDecoupee {
  let reste = nom.trim();
  let categorie: Categorie | null = null;
  for (const [symbole, c] of CATEGORIES) {
    if (reste.startsWith(symbole)) {
      categorie = c;
      reste = reste.slice(symbole.length).trim();
      break;
    }
  }
  // Un autre émoji ou symbole en tête (« ⭐ ») : ignoré pour le nom du client.
  reste = reste.replace(/^[^\p{L}\p{N}]+/u, "").trim();
  const m = /^([\s\S]{1,120}?)\s+[—–]\s+([\s\S]+)$/.exec(reste);
  if (!m) return { categorie, client: null, action: reste || nom.trim(), agence: false };
  const client = m[1].trim();
  return { categorie, client, action: m[2].trim(), agence: POUR_TOUTE_L_AGENCE.has(cleNom(client)) };
}

export type ColonneTrello = "objectifs" | "a_trier" | "semaine" | "a_faire" | "attente" | "argent" | "plus_tard" | "termine" | "autre";

/** La colonne d'après son nom, symbole et accents ignorés (« 🔥 Cette semaine (7 cartes max) » → semaine). */
export function colonneTrello(nom: string): ColonneTrello {
  const k = cleNom(nom);
  if (k.includes("cette semaine")) return "semaine";
  if (k.includes("en attente")) return "attente";
  if (k.includes("argent")) return "argent";
  if (k.includes("termine") || k === "fait" || k === "done") return "termine";
  if (k.includes("objectif")) return "objectifs";
  if (k.includes("a trier")) return "a_trier";
  if (k.includes("plus tard")) return "plus_tard";
  if (k.includes("a faire")) return "a_faire";
  return "autre";
}

/** Une carte vue dans un tableau suivi, telle que Pilot la garde. */
export type CarteTrello = {
  id: string;
  nom: string;
  url: string;
  tableau: string;
  colonne: string;
  colonneCle: ColonneTrello;
  /** Échéance (ISO) et case « terminée » de l'échéance. */
  echeance: string | null;
  echeanceFaite: boolean;
  derniereActivite: string;
  /** Arrivée dans la colonne actuelle (ISO), d'après l'historique du tableau ; à défaut, dernière activité. */
  dansLaColonneDepuis: string;
};

export const REGLES_TRELLO = {
  /** « ⏳ En attente du client » depuis plus de 7 jours : relancer le client. */
  relanceAttenteJours: 7,
} as const;

/**
 * Pourquoi une carte entre dans « Ce matin » → Actions (une raison ou
 * plusieurs), ou [] si elle n'y a pas sa place :
 *   - elle est dans « 🔥 Cette semaine » ;
 *   - son échéance est passée (et pas cochée « terminée »), hors « ✅ Terminé » ;
 *   - elle est dans « ⏳ En attente du client » depuis plus de 7 jours.
 */
export function raisonsCarte(c: CarteTrello, maintenant: Date): string[] {
  if (c.colonneCle === "termine") return [];
  const raisons: string[] = [];
  if (c.colonneCle === "semaine") raisons.push("Dans « 🔥 Cette semaine »");
  if (c.echeance && !c.echeanceFaite) {
    const retard = Math.floor((maintenant.getTime() - Date.parse(c.echeance)) / 86_400_000);
    if (Date.parse(c.echeance) < maintenant.getTime()) raisons.push(retard >= 1 ? `Échéance dépassée de ${retard} j` : "Échéance dépassée aujourd'hui");
  }
  if (c.colonneCle === "attente") {
    const jours = Math.floor((maintenant.getTime() - Date.parse(c.dansLaColonneDepuis)) / 86_400_000);
    if (jours > REGLES_TRELLO.relanceAttenteJours) raisons.push(`En attente du client depuis ${jours} j (plus de ${REGLES_TRELLO.relanceAttenteJours}) : relancer`);
  }
  return raisons;
}

/** L'empreinte d'une carte pour « Traité » : colonne + échéance + dernière activité. La ligne revient si la carte bouge. */
export const empreinteCarte = (c: Pick<CarteTrello, "colonne" | "echeance" | "derniereActivite">) => `${c.colonne}|${c.echeance ?? ""}|${c.derniereActivite}`;

/* ------------------------------------------------------- rapprochement -- */

export type Candidat = { entryId: string | null; clientId: string | null; nom: string };

/**
 * Le client ou la fiche qui porte exactement ce nom (même normalisation :
 * accents, casse, symboles ignorés). null s'il n'y en a aucun, ou plusieurs
 * qui ne désignent pas la même fiche : dans le doute, on ne relie pas.
 */
export function parNom(nom: string | null | undefined, candidats: Candidat[]): Candidat | null {
  const k = cleNom(nom);
  if (!cleUtilisable(k)) return null;
  const trouves = candidats.filter((c) => cleNom(c.nom) === k);
  const distincts = new Map(trouves.map((c) => [c.clientId ?? c.entryId, c]));
  return distincts.size === 1 ? [...distincts.values()][0] : null;
}

/** Le nom (déjà normalisé) apparaît-il en mots entiers dans le titre ? « Rdv SPM chantier » contient « spm ». */
export function titreContient(titre: string, cle: string): boolean {
  if (!cleUtilisable(cle)) return false;
  return ` ${cleNom(titre)} `.includes(` ${cle} `);
}

/* -------------------------------------------------------------- GoCardless -- */

/** Les états d'un paiement GoCardless, regroupés comme la fiche les montre. */
export function etatPaiement(statut: string): "encaisse" | "a_venir" | "echec" | "annule" {
  if (statut === "confirmed" || statut === "paid_out") return "encaisse";
  if (statut === "failed" || statut === "charged_back" || statut === "customer_approval_denied") return "echec";
  if (statut === "cancelled") return "annule";
  return "a_venir"; // pending_customer_approval, pending_submission, submitted
}

export const LIBELLE_PAIEMENT: Record<string, string> = {
  pending_customer_approval: "En attente d'accord",
  pending_submission: "À venir",
  submitted: "Envoyé à la banque",
  confirmed: "Encaissé",
  paid_out: "Encaissé (versé)",
  cancelled: "Annulé",
  customer_approval_denied: "Refusé par le client",
  failed: "En échec",
  charged_back: "Contesté (remboursé)",
};

export const LIBELLE_MANDAT: Record<string, string> = {
  pending_customer_approval: "En attente d'accord",
  pending_submission: "En préparation",
  submitted: "Envoyé à la banque",
  active: "Actif",
  failed: "En échec",
  cancelled: "Annulé",
  expired: "Expiré",
  consumed: "Utilisé",
  blocked: "Bloqué",
  suspended_by_payer: "Suspendu par le client",
};

/** « mensuel », « tous les 3 mois », « annuel »… */
export function rythme(intervalle: number, unite: string): string {
  const n = Number(intervalle) || 1;
  if (unite === "monthly") return n === 1 ? "mensuel" : `tous les ${n} mois`;
  if (unite === "weekly") return n === 1 ? "hebdomadaire" : `toutes les ${n} semaines`;
  if (unite === "yearly") return n === 1 ? "annuel" : `tous les ${n} ans`;
  return `${n} ${unite}`;
}

/**
 * L'ENCAISSÉ SANS DOUBLE COMPTE (Abby + GoCardless).
 *
 * Une facture Abby payée par prélèvement GoCardless apparaît deux fois : une
 * fois « payée » chez Abby, une fois « encaissé » chez GoCardless. Elle ne
 * doit compter qu'une fois. Un paiement GoCardless encaissé RÈGLE une facture
 * Abby payée (et n'est alors pas recompté) si :
 *   1. sa référence ou sa description contient le numéro de la facture
 *      (« F-2026-031 », sans tenir compte des espaces ni de la casse) ;
 *   2. sinon, s'il a exactement le même montant (centimes) et que sa date de
 *      prélèvement tombe à 3 jours près de la date de paiement notée chez
 *      Abby (le paiement est noté à l'arrivée de l'argent, un ou deux jours
 *      après le prélèvement).
 * Chaque facture ne règle qu'un paiement, et chaque paiement qu'une facture
 * (le premier trouvé, références d'abord). Les paiements qui ne règlent
 * aucune facture s'ajoutent à l'encaissé.
 */
export function sansDoubleCompte(
  abbyPayees: { number: string; amountCents: number; paidAt: Date | null }[],
  gcEncaisses: { id: string; amountCents: number; chargeDate: string | null; reference: string | null; description: string | null }[],
): { aAjouter: string[]; regles: { paiement: string; facture: string; par: "reference" | "montant_date" }[] } {
  const compact = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const prises = new Set<string>();
  const regles: { paiement: string; facture: string; par: "reference" | "montant_date" }[] = [];
  const restants = new Set(gcEncaisses.map((p) => p.id));
  // 1. Par référence.
  for (const p of gcEncaisses) {
    const texte = `${compact(p.reference)} ${compact(p.description)}`;
    const f = abbyPayees.find((x) => !prises.has(x.number) && compact(x.number).length >= 3 && texte.includes(compact(x.number)));
    if (f) {
      prises.add(f.number);
      restants.delete(p.id);
      regles.push({ paiement: p.id, facture: f.number, par: "reference" });
    }
  }
  // 2. Par montant et date.
  for (const p of gcEncaisses) {
    if (!restants.has(p.id) || !p.chargeDate) continue;
    const jour = Date.parse(`${p.chargeDate}T12:00:00Z`);
    const f = abbyPayees.find(
      (x) => !prises.has(x.number) && x.amountCents === p.amountCents && x.paidAt && Math.abs(x.paidAt.getTime() - jour) <= 3.5 * 86_400_000,
    );
    if (f) {
      prises.add(f.number);
      restants.delete(p.id);
      regles.push({ paiement: p.id, facture: f.number, par: "montant_date" });
    }
  }
  return { aAjouter: [...restants], regles };
}

/* ------------------------------------------------------------- Agenda -- */

export const LONGUEUR_DESCRIPTION = 280;

/** La description d'un rendez-vous, sans balises, resserrée, 280 caractères au plus. Jamais plus. */
export function extraitDescription(texte: string | null | undefined): string | null {
  const net = (texte ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    // Le bloc « Rejoindre avec Google Meet » que Google ajoute après une ligne « -::~:~::~… ».
    .replace(/-::~[:~]*::-[\s\S]*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!net) return null;
  if (net.length <= LONGUEUR_DESCRIPTION) return net;
  const coupe = net.slice(0, LONGUEUR_DESCRIPTION - 1);
  const espace = coupe.lastIndexOf(" ");
  return `${(espace > LONGUEUR_DESCRIPTION * 0.6 ? coupe.slice(0, espace) : coupe).trimEnd()}…`;
}

const VISIO = /https:\/\/(?:meet\.google\.com\/[a-z0-9-]+|[a-z0-9.-]*zoom\.us\/[^\s<>"']+|teams\.microsoft\.com\/[^\s<>"']+|whereby\.com\/[^\s<>"']+)/i;

/** Le lien de visio : propriété de conférence de Google, sinon le premier lien Meet, Zoom, Teams ou Whereby du lieu ou de la description. */
export function lienVisio(conference: string | null | undefined, lieu: string | null | undefined, description: string | null | undefined): string | null {
  for (const t of [conference, lieu, description]) {
    const m = VISIO.exec(t ?? "");
    if (m) return m[0];
  }
  return null;
}

/**
 * L'adresse secrète iCal d'un agenda Google :
 * https://calendar.google.com/calendar/ical/<agenda>/private-<clé>/basic.ics
 * Seule cette forme est acceptée (hors tests locaux, voir lib/agenda.ts).
 */
export function adresseIcalGoogle(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" && u.hostname === "calendar.google.com" && /^\/calendar\/ical\/[^/]+\/private-[^/]+\/basic\.ics$/.test(u.pathname);
  } catch {
    return false;
  }
}

/** Ce qu'on peut montrer d'une adresse iCal sans la révéler : « calendar.google.com · emmanuel…@gmail.com · …a3f9 ». */
export function adresseMasquee(url: string): string {
  try {
    const u = new URL(url.trim());
    const morceaux = u.pathname.split("/");
    const agenda = decodeURIComponent(morceaux[3] ?? "");
    const prive = morceaux[4] ?? "";
    const arobase = agenda.indexOf("@");
    const debut = agenda.length > 10 ? `${agenda.slice(0, 6)}…${arobase > 6 ? agenda.slice(arobase) : ""}` : agenda;
    return `${u.hostname} · ${debut || "agenda"} · …${prive.slice(-4)}`;
  } catch {
    return "adresse enregistrée";
  }
}
