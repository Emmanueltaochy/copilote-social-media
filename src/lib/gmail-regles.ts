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

/* ------------------------------------------- domaines d'Emmanuel -- */

/**
 * Les domaines d'Emmanuel lui-même : sa marketplace Swap'Îles, l'agence, ses
 * sites. Un message qui en vient (ou qui y part) n'est JAMAIS l'échange avec
 * un client ou un prospect : ce sont ses propres notifications, ou ses propres
 * boîtes. Ces domaines ne servent donc jamais au rapprochement, ni par adresse
 * exacte, ni par « même domaine ». Les sous-domaines comptent aussi
 * (world.taochyagency.com, mail.swapiles.com…).
 *
 * À compléter ici si un nouveau domaine apparaît. Les adresses et domaines
 * des comptes de l'équipe dans Pilot s'y ajoutent d'eux-mêmes (lib/gmail.ts).
 */
export const DOMAINES_EMMANUEL = [
  "swapiles.com",
  "swapiles.re",
  "swapiles.fr",
  "swap-iles.com",
  "swap-iles.re",
  "swap-iles.fr",
  "taochyagency.com",
  "world.taochyagency.com",
  "taochyconsulting.fr",
  "taochy.re",
  "creationsiteweb.re",
] as const;

/** Toute variante de Swap'Îles utilisée par la plateforme (swapiles, swap-iles, swapîles…), quel que soit le suffixe. */
const VARIANTE_SWAPILES = /(^|\.)swap-?[iî]les?\.[a-z.]+$/i;

export function estDomaineEmmanuel(domaine: string | null | undefined): boolean {
  const d = (domaine ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!d) return false;
  return VARIANTE_SWAPILES.test(d) || DOMAINES_EMMANUEL.some((x) => d === x || d.endsWith(`.${x}`));
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
export const EN_TETES_UTILES = [
  "List-Unsubscribe",
  "List-Id",
  "Auto-Submitted",
  "Precedence",
  "References",
  "In-Reply-To",
  "X-Autoreply",
  "X-Autorespond",
  // Les services d'envoi de messages transactionnels (voir ENVOI_TRANSACTIONNEL).
  "Return-Path",
  "X-Mailer",
  "X-SES-Outgoing",
  "X-Mailgun-Sid",
  "X-Mailgun-Tag",
  "X-SG-EID",
  "X-SG-ID",
  "X-Mailin-EID",
  "X-Sib-Id",
  "X-PM-Message-Id",
  "X-Postmark-Message-Id",
  "X-Mailjet-Campaign",
  "X-MJ-Mid",
  "X-Mandrill-User",
  "X-MC-User",
];

const EXPEDITEUR_AUTOMATIQUE =
  /^(no-?reply|do-?not-?reply|donotreply|ne-?pas-?repondre|nepasrepondre|noreply-[\w-]+|mailer-daemon|mailer|postmaster|bounces?|bounce-[\w-]+|notifications?|notification-[\w-]+|notif|alerts?|newsletter|news)([+._-].*)?@/i;

/** Les en-têtes posés par un service d'envoi en masse ou transactionnel (Amazon SES, Mailgun, Sendgrid, Brevo, Postmark, Mailjet, Mandrill). */
const EN_TETES_SERVICE_ENVOI = ["x-ses-outgoing", "x-mailgun-sid", "x-mailgun-tag", "x-sg-eid", "x-sg-id", "x-mailin-eid", "x-sib-id", "x-pm-message-id", "x-postmark-message-id", "x-mailjet-campaign", "x-mj-mid", "x-mandrill-user", "x-mc-user"];
/** Un logiciel d'envoi de site ou de plateforme dans X-Mailer : jamais un humain qui écrit. */
const MAILER_TRANSACTIONNEL = /amazon ?ses|mailgun|sendgrid|brevo|sendinblue|postmark|mailjet|mandrill|mailchimp|phpmailer|swiftmailer|symfony mailer|wordpress|woocommerce/i;
/** « [Swap Îles] Remboursement à valider » : l'objet d'une notification de plateforme. */
const OBJET_DE_PLATEFORME = /^\s*\[[^\]]{2,60}\]/;

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

/**
 * Un message transactionnel (notification d'une plateforme, confirmation,
 * alerte), même écrit au nom d'une personne : on l'ignore et on ne le stocke
 * pas. Renvoie l'indice trouvé, ou null.
 *
 * Indices, chacun suffisant :
 *   - objet qui commence par « [Nom de plateforme] » ;
 *   - en-tête d'un service d'envoi (X-SES, X-Mailgun, Sendgrid, Brevo,
 *     Postmark, Mailjet, Mandrill) ou X-Mailer d'un logiciel de site ;
 *   - expéditeur noreply, no-reply, notifications, mailer, bounce… ;
 *   - Return-Path d'un autre domaine que l'expéditeur, avec Auto-Submitted
 *     ou Precedence ;
 *   - et tout ce que messageAutomatique() reconnaît déjà.
 */
export function messageTransactionnel(enTetes: EnTetes, expediteur: string | null | undefined, objet: string | null | undefined): string | null {
  const auto = messageAutomatique(enTetes, expediteur);
  if (auto) return auto;
  if (OBJET_DE_PLATEFORME.test(objet ?? "")) return "Objet « [plateforme] »";
  const service = EN_TETES_SERVICE_ENVOI.find((h) => enTetes.has(h));
  if (service) return `En-tête ${service}`;
  if ((enTetes.get("x-mailer") ?? []).some((v) => MAILER_TRANSACTIONNEL.test(v))) return "X-Mailer de plateforme";
  const retour = domaineDe(sansChevrons((enTetes.get("return-path") ?? [])[0]));
  const de = domaineDe(expediteur);
  if (retour && de && retour !== de && !retour.endsWith(`.${de}`) && (enTetes.has("auto-submitted") || enTetes.has("precedence"))) return "Return-Path d'un autre domaine";
  return null;
}

/**
 * Le rapprochement d'un e-mail déjà enregistré respecte-t-il les règles ?
 * Sert au nettoyage (lib/gmail.ts) des e-mails gardés avant ces règles.
 *
 *   - reçu : la fiche doit avoir été trouvée par l'adresse From elle-même
 *     (jamais Reply-To, les autres destinataires ou le corps) ;
 *   - envoyé : par une adresse en To ou Cc ;
 *   - jamais une adresse d'un domaine d'Emmanuel ni de l'équipe ;
 *   - jamais un message transactionnel (objet « [plateforme] », expéditeur
 *     automatique).
 *
 * Renvoie la raison du retrait, ou null si l'e-mail peut rester.
 */
export function emailHorsRegles(
  e: {
    sens: "recu" | "envoye";
    de: string | null;
    a: string[];
    cc: string[];
    contact: string | null;
    objet: string;
  },
  interne: (domaine: string | null) => boolean = () => false,
): string | null {
  const contact = (e.contact ?? "").trim().toLowerCase();
  const de = (e.de ?? "").trim().toLowerCase();
  if (!contact) return "contrepartie inconnue";
  const dom = domaineDe(contact);
  if (estDomaineEmmanuel(dom) || interne(dom)) return "domaine d'Emmanuel ou de l'équipe";
  if (e.sens === "recu") {
    if (contact !== de) return "rattaché par une autre adresse que l'expéditeur";
    if (estDomaineEmmanuel(domaineDe(de)) || interne(domaineDe(de))) return "domaine d'Emmanuel ou de l'équipe";
    if (EXPEDITEUR_AUTOMATIQUE.test(de)) return "expéditeur automatique";
    if (OBJET_DE_PLATEFORME.test(e.objet)) return "objet « [plateforme] »";
  } else if (![...e.a, ...e.cc].map((x) => x.trim().toLowerCase()).includes(contact)) {
    // Envoyé (dossier « Messages envoyés ») : quel que soit le From (alias,
    // adresse @taochyagency.com de l'admin), seuls To et Cc relient.
    return "rattaché par une autre adresse que To ou Cc";
  }
  return null;
}

/* ------------------------------------- doublon avec l'agent ventes -- */

const motsDe = (s: string) =>
  new Set(
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/^\s*((re|tr|fwd?|fw)\s*:\s*)+/i, "")
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((m) => m.length > 2),
  );

/**
 * Le même envoi vu deux fois : une ligne d'historique de l'agent ventes
 * (« E-mail envoyé par Emmanuel : « Objet » ») et l'e-mail Gmail envoyé
 * (dossier « Messages envoyés »), sur la même fiche.
 *
 * Règle : moins de 24 h d'écart (l'agent ne date qu'au jour), et l'objet de
 * l'e-mail (sans « Re: », accents ni ponctuation) se retrouve dans la ligne de
 * l'agent : tous ses mots y sont, ou au moins 80 % d'entre eux s'il en a cinq
 * ou plus. Le destinataire, lui, est celui de la fiche (vérifié par
 * l'appelant). Masquage à l'affichage seulement : rien n'est supprimé.
 */
export function memeEnvoi(gmail: { objet: string; at: Date }, agent: { titre: string; at: Date }): boolean {
  if (Math.abs(gmail.at.getTime() - agent.at.getTime()) >= 24 * 3_600_000) return false;
  const objet = motsDe(gmail.objet);
  if (objet.size === 0) return false;
  const ligne = motsDe(agent.titre);
  const communs = [...objet].filter((m) => ligne.has(m)).length;
  return communs === objet.size || (objet.size >= 5 && communs / objet.size >= 0.8);
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

/**
 * Les messages auxquels celui-ci répond : In-Reply-To d'abord, puis References
 * du plus récent au plus ancien. Sans chevrons, en minuscules, 20 au plus.
 * Gardé dans le méta d'un e-mail (reponseA) pour la règle des envois de
 * l'admin (envoiAnterieur, plus bas).
 */
export function identifiantsDeReponse(inReplyTo: string | null | undefined, references: string | null | undefined): string[] {
  const tous = [...identifiants(inReplyTo), ...identifiants(references).reverse()].map((i) => i.toLowerCase());
  return [...new Set(tous)].slice(0, 20);
}

/** « Ouvrir dans Gmail » : la recherche par Message-ID retrouve le message dans la boîte. */
export function lienGmail(messageId: string | null | undefined): string | null {
  const id = sansChevrons(messageId);
  return id ? `https://mail.google.com/mail/u/0/#search/rfc822msgid%3A${encodeURIComponent(id)}` : null;
}

/* ------------------------------ « sans réponse » : les envois de l'admin -- */

/**
 * Les e-mails qu'Emmanuel envoie aux prospects depuis l'admin du site
 * (taochyagency.com/admin/envois.php) n'arrivent plus dans son Gmail : la
 * copie cachée est supprimée (novembre 2026). Pilot les connaît autrement :
 * l'agent ventes reporte chaque envoi dans prospects.json (`envois[]` de la
 * fiche : statut « envoye », jour `envoye`, `message_id`), que l'import range
 * dans la fiche (`data.envois`, lib/annuaire-import.ts).
 *
 * Règle : un envoi de l'admin vaut réponse d'Emmanuel, comme un e-mail du
 * dossier « Messages envoyés ». Il lève « sans réponse » pour tout e-mail reçu
 * sur la MÊME FICHE qui lui est antérieur.
 *
 *   - Rapprochement par la fiche (l'admin écrit à l'adresse de la fiche). Pas
 *     par le fil : prospects.json ne garde pas l'In-Reply-To de l'envoi.
 *   - L'agent ne date qu'au jour (heure de La Réunion). Un envoi d'un jour
 *     postérieur au message reçu vaut réponse ; d'un jour antérieur, jamais.
 *     Le même jour, il vaut réponse, sauf si le message reçu répond lui-même
 *     à cet envoi (le message_id de l'envoi est dans son In-Reply-To ou ses
 *     References) : c'est alors le prospect qui répond à Emmanuel.
 *   - Un envoi dont le message_id est déjà dans Gmail (copie cachée d'avant
 *     sa suppression) ne compte pas ici : l'e-mail Gmail, daté à la minute,
 *     fait foi.
 *
 * Calcul en base : recalculerSansReponse (lib/gmail.ts) suit cette règle à
 * la lettre, après chaque relevé Gmail et chaque import de prospects.json.
 * envoiAnterieur() sert à « Ce matin » (prospect qui a répondu) et aux tests.
 */
export type EnvoiAdmin = { jour: string; messageId: string | null };

/** Le jour (AAAA-MM-JJ) à La Réunion : UTC+4 toute l'année, sans heure d'été. */
export function jourReunion(d: Date): string {
  return new Date(d.getTime() + 4 * 3_600_000).toISOString().slice(0, 10);
}

/** Les envois partis de l'admin d'après le `data` d'une fiche : statut « envoye » et jour lisible. */
export function envoisAdmin(data: unknown): EnvoiAdmin[] {
  const liste = (data as { envois?: unknown } | null)?.envois;
  if (!Array.isArray(liste)) return [];
  return liste.flatMap((e) => {
    const x = (e ?? {}) as Record<string, unknown>;
    const jour = typeof x.envoye === "string" ? x.envoye.trim() : "";
    if (x.statut !== "envoye" || !/^\d{4}-\d{2}-\d{2}$/.test(jour)) return [];
    const mid = typeof x.messageId === "string" ? sansChevrons(x.messageId).toLowerCase() : "";
    return [{ jour, messageId: mid || null }];
  });
}

/**
 * L'envoi est-il antérieur au message reçu (le contact écrit après lui) ?
 * Sinon, il vaut réponse d'Emmanuel à ce message (règle ci-dessus).
 */
export function envoiAnterieur(recu: { at: Date; reponseA?: string[] | null }, envoi: EnvoiAdmin): boolean {
  const jour = jourReunion(recu.at);
  if (envoi.jour !== jour) return envoi.jour < jour;
  const mid = sansChevrons(envoi.messageId).toLowerCase();
  return Boolean(mid) && (recu.reponseA ?? []).some((r) => sansChevrons(r).toLowerCase() === mid);
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
