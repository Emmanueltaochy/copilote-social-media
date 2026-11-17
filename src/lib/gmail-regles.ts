/*
 * Les règles de la lecture Gmail, sans dépendance au serveur : ce qui est
 * retenu, ce qui est ignoré, l'extrait, le fil, le lien vers Gmail.
 *
 * Volontairement isolé (aucun import) : le script de vérification
 * (scripts/test-gmail.mjs) charge ce fichier tel quel pour éprouver les règles
 * une par une, sans base ni serveur.
 */

/* ----------------------------------------------------- domaines publics -- */

/**
 * Les messageries grand public : une adresse @gmail.com ne dit rien de
 * l'entreprise de quelqu'un. Le rapprochement « même domaine qu'une fiche »
 * ne s'applique donc jamais à ces domaines (seule l'adresse exacte compte).
 */
const DOMAINES_PUBLICS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.fr",
  "outlook.com",
  "outlook.fr",
  "live.com",
  "live.fr",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "yahoo.com",
  "yahoo.fr",
  "ymail.com",
  "aol.com",
  "aol.fr",
  "orange.fr",
  "wanadoo.fr",
  "laposte.net",
  "free.fr",
  "sfr.fr",
  "neuf.fr",
  "club-internet.fr",
  "numericable.fr",
  "bbox.fr",
  "cegetel.net",
  "noos.fr",
  "voila.fr",
  "aliceadsl.fr",
  "gmx.fr",
  "gmx.com",
  "gmx.de",
  "protonmail.com",
  "proton.me",
  "pm.me",
  "tutanota.com",
  "mail.com",
  "yandex.com",
  "zoho.com",
  // Réunion
  "zeop.re",
  "orange.re",
  "outremer-telecom.fr",
]);

/** outlook.be, hotmail.co.uk, yahoo.es, live.ca… : toutes les déclinaisons. */
const FAMILLES_PUBLIQUES = /^(gmail|googlemail|hotmail|outlook|live|yahoo|ymail|msn|aol|gmx|yandex|icloud|proton(mail)?)\./;

export function domaineDe(adresse: string | null | undefined): string | null {
  const a = (adresse ?? "").trim().toLowerCase();
  const i = a.lastIndexOf("@");
  return i > 0 && i < a.length - 1 ? a.slice(i + 1) : null;
}

export function estDomainePublic(domaine: string | null | undefined): boolean {
  const d = (domaine ?? "").trim().toLowerCase();
  return !d || DOMAINES_PUBLICS.has(d) || FAMILLES_PUBLIQUES.test(d);
}

/* -------------------------------------------------- messages automatiques -- */

export type EnTetes = Map<string, string[]>;

/** « En-tête: valeur » sur plusieurs lignes repliées → Map nom (minuscules) → valeurs. */
export function lireEnTetes(brut: string | Buffer | null | undefined): EnTetes {
  const texte = (typeof brut === "string" ? brut : (brut?.toString("utf8") ?? "")).replace(/\r\n/g, "\n");
  const map: EnTetes = new Map();
  let courant: [string, string] | null = null;
  const pousser = () => {
    if (!courant) return;
    const [nom, val] = courant;
    map.set(nom, [...(map.get(nom) ?? []), val.trim()]);
  };
  for (const ligne of texte.split("\n")) {
    if (/^[ \t]/.test(ligne) && courant) {
      courant[1] += " " + ligne.trim();
      continue;
    }
    pousser();
    const m = /^([!-9;-~]+):(.*)$/.exec(ligne);
    courant = m ? [m[1].toLowerCase(), m[2]] : null;
  }
  pousser();
  return map;
}

/** Les en-têtes demandés au serveur : les seuls dont on a besoin. */
export const EN_TETES_UTILES = ["List-Unsubscribe", "List-Id", "Auto-Submitted", "Precedence", "References", "In-Reply-To", "X-Autoreply", "X-Autorespond"];

const EXPEDITEUR_AUTOMATIQUE =
  /^(no-?reply|do-?not-?reply|donotreply|ne-?pas-?repondre|nepasrepondre|noreply-[\w-]+|mailer-daemon|postmaster|bounces?|notifications?|notification-[\w-]+|newsletter|news)([+._-].*)?@/i;

/**
 * Un message envoyé par une machine : lettre d'information, notification,
 * réponse automatique, rebond. Il n'attend pas de réponse : on l'ignore.
 * Renvoie la raison, ou null pour un message écrit par quelqu'un.
 */
export function messageAutomatique(enTetes: EnTetes, expediteur: string | null | undefined): string | null {
  if (enTetes.has("list-unsubscribe")) return "List-Unsubscribe";
  if (enTetes.has("list-id")) return "List-Id";
  const auto = (enTetes.get("auto-submitted") ?? []).map((v) => v.toLowerCase());
  if (auto.some((v) => v && v !== "no")) return "Auto-Submitted";
  const precedence = (enTetes.get("precedence") ?? []).map((v) => v.toLowerCase());
  if (precedence.some((v) => /\b(bulk|list|junk|auto_reply)\b/.test(v))) return "Precedence";
  if (enTetes.has("x-autoreply") || enTetes.has("x-autorespond")) return "X-Autoreply";
  if (expediteur && EXPEDITEUR_AUTOMATIQUE.test(expediteur.trim())) return "Expéditeur no-reply";
  return null;
}

/* ------------------------------------------------------------------ fil -- */

/** Les identifiants <…> d'un en-tête References / In-Reply-To. */
export function identifiants(valeur: string | null | undefined): string[] {
  return [...(valeur ?? "").matchAll(/<([^<>\s]+)>/g)].map((m) => m[1]);
}

export const sansChevrons = (id: string | null | undefined) => (id ?? "").trim().replace(/^<|>$/g, "");

/**
 * Le fil d'un message. Gmail donne son propre numéro de fil (X-GM-THRID) :
 * c'est lui qu'on prend. Sinon, le premier message du fil d'après References,
 * à défaut In-Reply-To, à défaut le message lui-même.
 */
export function cleDeFil(opts: { gmailThreadId?: string | null; references?: string | null; inReplyTo?: string | null; messageId?: string | null; empreinte: (s: string) => string }): string {
  if (opts.gmailThreadId) return `g:${opts.gmailThreadId}`;
  const racine = identifiants(opts.references)[0] ?? identifiants(opts.inReplyTo)[0] ?? sansChevrons(opts.messageId);
  return `m:${opts.empreinte(racine.toLowerCase()).slice(0, 24)}`;
}

/** « Ouvrir dans Gmail » : la recherche par Message-ID retrouve le message dans la boîte. */
export function lienGmail(messageId: string | null | undefined): string | null {
  const id = sansChevrons(messageId);
  return id ? `https://mail.google.com/mail/u/0/#search/rfc822msgid%3A${encodeURIComponent(id)}` : null;
}

/* --------------------------------------------------------------- extrait -- */

export const LONGUEUR_EXTRAIT = 280;

/** Décode un morceau de partie MIME (quoted-printable ou base64), tronqué sans casse. */
export function decoderPartie(brut: Buffer, encodage: string | null | undefined, charset: string | null | undefined): string {
  const enc = (encodage ?? "").toLowerCase();
  let octets: Buffer = brut;
  if (enc === "base64") {
    const b64 = brut.toString("ascii").replace(/[^A-Za-z0-9+/=]/g, "");
    octets = Buffer.from(b64.slice(0, b64.length - (b64.length % 4)), "base64");
  } else if (enc === "quoted-printable") {
    const qp = brut
      .toString("latin1")
      .replace(/=\r?\n/g, "")
      .replace(/=[0-9A-Fa-f]?$/, "");
    const out: number[] = [];
    for (let i = 0; i < qp.length; i++) {
      if (qp[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(qp.slice(i + 1, i + 3))) {
        out.push(parseInt(qp.slice(i + 1, i + 3), 16));
        i += 2;
      } else out.push(qp.charCodeAt(i) & 0xff);
    }
    octets = Buffer.from(out);
  }
  let jeu = (charset ?? "utf-8").toLowerCase();
  if (jeu === "us-ascii" || jeu === "ascii") jeu = "utf-8";
  try {
    return new TextDecoder(jeu, { fatal: false }).decode(octets);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(octets);
  }
}

/** Le texte d'une partie HTML, sans balises ni styles. */
export function texteDuHtml(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, " ")
    .replace(/<div[^>]*class="?gmail_quote[\s\S]*$/i, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

/** Les lignes qui ouvrent une citation : à partir d'elles, ce n'est plus le message. */
const DEBUT_CITATION = [
  /^le .{3,120} a écrit\s*:?\s*$/i,
  /^on .{3,120} wrote\s*:?\s*$/i,
  /^-{2,}\s*(original message|message d'origine|message original)\s*-{2,}/i,
  /^_{5,}\s*$/,
  /^(de|from)\s*:\s*.+@/i,
  /^envoyé de mon (iphone|ipad|android|mobile)/i,
  /^sent from my /i,
];

/**
 * L'extrait affiché : le texte brut du message, sans les citations, sans la
 * signature quand elle est marquée (« -- »), espaces resserrés, 280 caractères
 * au plus. Le reste du corps n'est jamais gardé.
 */
export function extrait(texte: string, max = LONGUEUR_EXTRAIT): string {
  const garde: string[] = [];
  for (const brute of texte.replace(/\r\n/g, "\n").split("\n")) {
    const ligne = brute.trimEnd();
    if (ligne === "--" || ligne === "-- ") break; // signature
    if (DEBUT_CITATION.some((re) => re.test(ligne.trim()))) break;
    if (/^\s*>/.test(ligne)) continue; // ligne citée
    garde.push(ligne);
    if (garde.join(" ").length > max * 3) break;
  }
  const net = garde.join(" ").replace(/\s+/g, " ").trim();
  if (net.length <= max) return net;
  const coupe = net.slice(0, max - 1);
  const espace = coupe.lastIndexOf(" ");
  return `${(espace > max * 0.6 ? coupe.slice(0, espace) : coupe).trimEnd()}…`;
}

/* -------------------------------------------------- « À répondre » : règle -- */

/** Les mots qui font passer un e-mail sans réponse en « urgent ». */
export const MOTS_URGENTS = ["urgent", "problème", "bug", "panne", "facture", "paiement", "devis", "rendez-vous", "rappeler"];

const sansAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Le premier mot d'urgence ou d'argent trouvé dans l'objet ou l'extrait (accents et pluriels compris). */
export function motUrgent(texte: string): string | null {
  const t = sansAccents(texte).replace(/[^a-z0-9]+/g, " ");
  for (const mot of MOTS_URGENTS) {
    const m = sansAccents(mot).replace(/[^a-z0-9]+/g, " ");
    if (new RegExp(`(^| )${m}(s|x)?( |$)`).test(` ${t} `)) return mot;
  }
  // « rendez vous », « rdv » : la même chose écrite autrement.
  if (/(^| )rdv( |$)/.test(` ${t} `)) return "rendez-vous";
  return null;
}

/* ------------------------------------------------------- mot de passe -- */

/** « abcd efgh ijkl mnop » → « abcdefghijklmnop ». Null si ce n'est pas 16 lettres. */
export function nettoyerMotDePasse(saisi: string): string | null {
  const net = saisi.replace(/\s+/g, "");
  return /^[a-z]{16}$/i.test(net) ? net : null;
}
