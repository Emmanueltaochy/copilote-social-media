import "server-only";

import { createHash } from "node:crypto";
import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { ImapFlow, type FetchMessageObject, type MessageAddressObject, type MessageStructureObject } from "imapflow";
import { ceMatinArchives, clients, contacts, db, directoryEntries, directoryEvents, gmailSync, users, type GmailSync } from "@/db";
import { cleEmail } from "@/lib/annuaire";
import {
  EN_TETES_UTILES,
  cleDeFil,
  decoderPartie,
  domaineDe,
  emailHorsRegles,
  estDomaineEmmanuel,
  estDomainePublic,
  extrait,
  lienGmail,
  lireEnTetes,
  messageTransactionnel,
  sansChevrons,
  texteDuHtml,
} from "@/lib/gmail-regles";
import { forgetSecret, getSecretChiffre, noterErreur, secretStatus, setSecretChiffre } from "@/lib/secrets";

/*
 * La boîte Gmail de la direction, en lecture seule (IMAP + mot de passe
 * d'application).
 *
 * CE QUE CE MODULE NE FAIT JAMAIS : il n'écrit rien dans la boîte. Les dossiers
 * sont ouverts en mode examen (EXAMINE, « readOnly ») et les messages lus avec
 * BODY.PEEK (imapflow l'utilise pour tout ce qui touche au contenu) : aucun
 * message ne passe « lu ». Pas de STORE, MOVE, COPY, APPEND, EXPUNGE, ni de
 * changement de drapeau ou d'étiquette — scripts/test-gmail.mjs le vérifie
 * dans ce fichier et sur le fil de la connexion.
 *
 * CE QUI EST GARDÉ : seulement les échanges avec une adresse connue de
 * l'annuaire (e-mail d'une fiche, contact ou compte portail d'un client, ou
 * même domaine professionnel qu'une fiche), et par la vraie contrepartie :
 * l'adresse From d'un message reçu (jamais Reply-To, les autres destinataires
 * ni le corps), les adresses To et Cc d'un message envoyé. Les domaines
 * d'Emmanuel (Swap'Îles, l'agence, ses sites : DOMAINES_EMMANUEL dans
 * gmail-regles.ts) et ceux de l'équipe ne sont jamais des clients, et les
 * messages transactionnels (notifications de plateforme…) sont ignorés. Pour ces messages : sens, date,
 * expéditeur et destinataires, objet, extrait de 280 caractères, Message-ID,
 * fil, lien « Ouvrir dans Gmail », nombre et noms des pièces jointes. Jamais
 * le corps complet, jamais une pièce jointe. Tout le reste est ignoré sans
 * laisser de trace (le bilan ne garde que des nombres).
 */

const ID = "gmail";
const ETAT_ID = "compte";
/** Au premier passage : les 60 derniers jours. */
const JOURS_INITIAUX = 60;
/** Durée maximale d'un relevé ; au-delà il s'arrête proprement et le suivant reprend. */
const DUREE_MAX_MS = 4 * 60_000;
/** Coupure de secours si le serveur ne répond plus du tout. */
const COUPURE_MS = 5 * 60_000;
/** Le bail : plus long que la coupure, pour qu'aucun second relevé ne démarre avant. */
const BAIL_MS = 6 * 60_000;
const LOT = 100;
/** Version des règles appliquées au dossier des envois (voir la relecture dans releve()). */
const REGLES_ENVOYES = 2;
/** On ne lit que le début de la partie texte : de quoi faire un extrait. */
const OCTETS_TEXTE = 16_384;

/* ------------------------------------------------------------- serveur -- */

/**
 * imap.gmail.com:993 en TLS. GMAIL_IMAP_HOST / _PORT / _TLS ne servent qu'aux
 * tests (faux serveur local) : ils ne sont pris en compte que pour une adresse
 * de boucle locale, pour qu'un réglage égaré ne puisse jamais envoyer le mot
 * de passe ailleurs que chez Gmail.
 */
export function serveurImap(): { host: string; port: number; secure: boolean } {
  const host = process.env.GMAIL_IMAP_HOST?.trim();
  if (host && /^(127\.0\.0\.1|localhost|::1)$/.test(host)) {
    const port = Number(process.env.GMAIL_IMAP_PORT);
    return { host, port: Number.isInteger(port) && port > 0 ? port : 993, secure: !/^(0|false|non|no)$/i.test(process.env.GMAIL_IMAP_TLS ?? "") };
  }
  return { host: "imap.gmail.com", port: 993, secure: true };
}

function nouveauClient(adresse: string, motDePasse: string) {
  const s = serveurImap();
  return new ImapFlow({
    host: s.host,
    port: s.port,
    secure: s.secure,
    doSTARTTLS: s.secure ? undefined : false,
    auth: { user: adresse, pass: motDePasse },
    // Aucun journal : ni commandes, ni réponses, ni identifiants.
    logger: false,
    emitLogs: false,
    disableAutoIdle: true,
    disableAutoEnable: true,
    qresync: false,
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
    tls: { rejectUnauthorized: true },
    clientInfo: { name: "Taochy Pilot (lecture seule)" },
  });
}

/* ------------------------------------------------------------- erreurs -- */

/** Un message d'erreur en français, sans jamais le mot de passe. */
export function erreurLisible(e: unknown, motDePasse?: string): string {
  const err = e as { authenticationFailed?: boolean; responseText?: string; serverResponseCode?: string; code?: string; message?: string };
  const texte = `${err?.responseText ?? ""} ${err?.serverResponseCode ?? ""} ${err?.message ?? ""}`;
  let lisible: string;
  if (/not enabled for IMAP|IMAP access is disabled|IMAP.*d[ée]sactiv/i.test(texte)) {
    lisible = "L'accès IMAP est désactivé sur ce compte. Dans Gmail : Paramètres → Voir tous les paramètres → Transfert et POP/IMAP → Activer IMAP, puis réessayez.";
  } else if (/Application-specific password required|web ?login required|WEBALERT/i.test(texte)) {
    lisible = "Google demande un mot de passe d'application : le mot de passe habituel du compte ne marche pas ici. Créez-en un dans Compte Google → Sécurité → Mots de passe des applications.";
  } else if (err?.authenticationFailed || /AUTHENTICATIONFAILED|Invalid credentials|authentication failed|LOGIN failed/i.test(texte)) {
    lisible =
      "Gmail a refusé l'adresse ou le mot de passe. Vérifiez l'adresse, puis recréez un mot de passe d'application (Compte Google → Sécurité → Mots de passe des applications) : le mot de passe habituel du compte ne marche pas ici.";
  } else if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH/i.test(`${err?.code ?? ""} ${texte}`)) {
    lisible = "Impossible de joindre le serveur de Gmail. Vérifiez la connexion du serveur Pilot, puis réessayez.";
  } else if (/ETIMEDOUT|ETIMEOUT|timeout|timed out/i.test(`${err?.code ?? ""} ${texte}`)) {
    lisible = "Gmail n'a pas répondu à temps. Réessayez dans quelques minutes.";
  } else if (/certificate|CERT_|SSL|TLS/i.test(`${err?.code ?? ""} ${texte}`)) {
    lisible = "La connexion sécurisée avec Gmail n'a pas pu s'établir.";
  } else if (/too many|Too many simultaneous|OVERQUOTA|THROTTLED/i.test(texte)) {
    lisible = "Gmail limite pour l'instant les connexions de ce compte. Réessayez dans quelques minutes.";
  } else {
    const brut = (err?.responseText || err?.message || "erreur inconnue").replace(/\s+/g, " ").slice(0, 160);
    lisible = `Gmail a refusé la connexion (${brut}).`;
  }
  return motDePasse ? masquer(lisible, motDePasse) : lisible;
}

function masquer(texte: string, motDePasse: string) {
  let t = texte;
  for (const v of [motDePasse, motDePasse.replace(/(.{4})(?=.)/g, "$1 ")]) if (v) t = t.split(v).join("•••");
  return t;
}

/* ------------------------------------------------------------ dossiers -- */

type Dossier = { role: "inbox" | "sent"; path: string };

/** La boîte de réception, et « Messages envoyés » trouvé par son attribut \Sent (quelle que soit la langue du compte). */
async function dossiers(client: ImapFlow): Promise<Dossier[]> {
  const liste = await client.list();
  const inbox = liste.find((m) => m.specialUse === "\\Inbox" || m.path.toUpperCase() === "INBOX");
  const sent =
    liste.find((m) => m.specialUse === "\\Sent" && m.specialUseSource !== "name") ??
    liste.find((m) => m.flags.has("\\Sent")) ??
    liste.find((m) => m.specialUse === "\\Sent");
  const out: Dossier[] = [{ role: "inbox", path: inbox?.path ?? "INBOX" }];
  if (sent) out.push({ role: "sent", path: sent.path });
  return out;
}

/* --------------------------------------------------------------- tester -- */

export type ResultatTest = { ok: true; envoyes: boolean } | { ok: false; erreur: string };

/**
 * Se connecte, ouvre la boîte de réception en mode examen, cherche le dossier
 * des messages envoyés, et se déconnecte. Rien n'est lu ni modifié.
 */
export async function testerConnexion(adresse: string, motDePasse: string): Promise<ResultatTest> {
  const client = nouveauClient(adresse, motDePasse);
  client.on("error", () => undefined);
  try {
    await client.connect();
    const ds = await dossiers(client);
    const lock = await client.getMailboxLock(ds[0].path, { readOnly: true });
    try {
      const mb = client.mailbox;
      if (mb && mb.readOnly === false) throw new Error("Le serveur a ouvert la boîte en écriture : connexion refusée par prudence.");
    } finally {
      lock.release();
    }
    return { ok: true, envoyes: ds.some((d) => d.role === "sent") };
  } catch (e) {
    return { ok: false, erreur: erreurLisible(e, motDePasse) };
  } finally {
    await client.logout().catch(() => client.close());
  }
}

/* ---------------------------------------------------------------- état -- */

export type EtatGmail = {
  relie: boolean;
  adresse: string | null;
  /** Le mot de passe enregistré ne se déchiffre plus (clé changée) : il faut le recoller. */
  illisible: boolean;
  derniereErreur: string | null;
  dernierReleve: Date | null;
  dernierSucces: Date | null;
  enCours: boolean;
  bilan: Bilan | null;
};

export async function etatGmail(): Promise<EtatGmail> {
  const [statut, [etat], secret] = await Promise.all([
    secretStatus(ID),
    db.select().from(gmailSync).where(eq(gmailSync.id, ETAT_ID)).limit(1),
    getSecretChiffre(ID),
  ]);
  return {
    relie: statut.connected,
    adresse: statut.account,
    illisible: secret === "illisible",
    derniereErreur: statut.lastError,
    dernierReleve: etat?.lastRunAt ?? null,
    dernierSucces: etat?.lastSuccessAt ?? null,
    enCours: Boolean(etat?.leaseUntil && etat.leaseUntil.getTime() > Date.now()),
    bilan: etat && Object.keys(etat.lastResult ?? {}).length ? (etat.lastResult as unknown as Bilan) : null,
  };
}

export const gmailRelie = async () => (await secretStatus(ID)).connected;

/** Enregistre l'adresse et le mot de passe (chiffré). Un changement d'adresse repart de zéro. */
export async function enregistrerGmail(adresse: string, motDePasse: string) {
  const [etat] = await db.select({ account: gmailSync.account }).from(gmailSync).where(eq(gmailSync.id, ETAT_ID)).limit(1);
  await setSecretChiffre(ID, motDePasse, adresse);
  if (etat?.account !== adresse) {
    await db
      .insert(gmailSync)
      .values({ id: ETAT_ID, account: adresse, folders: {}, lastResult: {} })
      .onConflictDoUpdate({ target: gmailSync.id, set: { account: adresse, folders: {}, lastResult: {}, lastSuccessAt: null, updatedAt: new Date() } });
  }
}

/** « Déconnecter » : efface le mot de passe ; sur demande, les e-mails déjà retenus aussi. */
export async function deconnecterGmail(effacerEmails: boolean) {
  await forgetSecret(ID);
  await db
    .update(gmailSync)
    .set({ account: null, folders: {}, lastResult: {}, lastSuccessAt: null, leaseUntil: null, updatedAt: new Date() })
    .where(eq(gmailSync.id, ETAT_ID));
  if (effacerEmails) await db.delete(directoryEvents).where(eq(directoryEvents.source, "gmail"));
}

/* ----------------------------------------------------- annuaire connu -- */

type Cible = { entryId: string | null; clientId: string | null };

type Annuaire = {
  parAdresse: Map<string, Cible[]>;
  parDomaine: Map<string, Cible[]>;
  /** Une adresse d'Emmanuel ou de l'équipe : jamais une contrepartie. */
  estInterne: (adresse: string) => boolean;
};

/**
 * Les adresses qui ne sont jamais des clients : les domaines d'Emmanuel
 * (DOMAINES_EMMANUEL), les domaines professionnels des comptes de l'équipe,
 * et les adresses exactes de l'équipe et de la boîte relevée.
 */
async function adressesInternes(compte: string) {
  const equipe = await db.select({ email: users.email }).from(users).where(ne(users.role, "client"));
  const adresses = new Set([compte, ...equipe.map((u) => cleEmail(u.email))].filter((a): a is string => Boolean(a)));
  const domaines = new Set(
    [domaineDe(compte), ...equipe.map((u) => domaineDe(u.email))].filter((d): d is string => Boolean(d) && !estDomainePublic(d)),
  );
  const domaineInterne = (d: string | null) => Boolean(d) && (estDomaineEmmanuel(d) || domaines.has(d!));
  return {
    domaineInterne,
    estInterne: (adresse: string) => adresses.has(adresse.toLowerCase()) || domaineInterne(domaineDe(adresse)),
  };
}

const ajouter = (m: Map<string, Cible[]>, k: string, c: Cible) => {
  const l = m.get(k) ?? [];
  if (!l.some((x) => x.entryId === c.entryId && x.clientId === c.clientId)) l.push(c);
  m.set(k, l);
};

/**
 * Les adresses connues : e-mail d'une fiche (et adresses Gmail notées sur la
 * fiche), contacts des clients, comptes du portail. Les domaines
 * professionnels de ces adresses aussi — sauf les messageries grand public et
 * les domaines de l'équipe (l'agence n'est pas son propre contact).
 */
async function annuaireConnu(compte: string): Promise<Annuaire> {
  const [fiches, contactsClients, comptesPortail, internes] = await Promise.all([
    db.select({ id: directoryEntries.id, clientId: directoryEntries.clientId, email: directoryEntries.emailKey, links: directoryEntries.links }).from(directoryEntries),
    db.select({ clientId: contacts.clientId, reach: contacts.reach }).from(contacts),
    db.select({ clientId: users.clientId, email: users.email }).from(users).where(and(eq(users.role, "client"), isNotNull(users.clientId))),
    adressesInternes(compte),
  ]);
  const parAdresse = new Map<string, Cible[]>();
  const parDomaine = new Map<string, Cible[]>();
  const noter = (adresse: string | null | undefined, c: Cible) => {
    const a = cleEmail(adresse);
    // Une adresse d'Emmanuel (Swap'Îles, l'agence…) notée sur une fiche ne
    // relie jamais rien : ses propres notifications iraient sur cette fiche.
    if (!a || internes.estInterne(a)) return;
    ajouter(parAdresse, a, c);
    const d = domaineDe(a);
    if (d && !estDomainePublic(d)) ajouter(parDomaine, d, c);
  };
  for (const f of fiches) {
    const c = { entryId: f.id, clientId: f.clientId };
    noter(f.email, c);
    for (const g of f.links?.gmail ?? []) noter(g, c);
  }
  for (const c of contactsClients) {
    for (const m of (c.reach ?? "").match(/[^\s<>,;()]+@[^\s<>,;()]+\.[a-z]{2,}/gi) ?? []) noter(m, { entryId: null, clientId: c.clientId });
  }
  for (const u of comptesPortail) noter(u.email, { entryId: null, clientId: u.clientId });
  return { parAdresse, parDomaine, estInterne: internes.estInterne };
}

/** La fiche d'un client, créée (vide) s'il n'en a pas encore : la frise a besoin d'une fiche. */
async function ficheDuClient(clientId: string, cache: Map<string, string>): Promise<string | null> {
  const deja = cache.get(clientId);
  if (deja) return deja;
  let [e] = await db.select({ id: directoryEntries.id }).from(directoryEntries).where(eq(directoryEntries.clientId, clientId)).limit(1);
  if (!e) {
    const [c] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, clientId)).limit(1);
    if (!c) return null;
    await db.insert(directoryEntries).values({ clientId, name: c.name, kind: "client", source: "agence" }).onConflictDoNothing();
    [e] = await db.select({ id: directoryEntries.id }).from(directoryEntries).where(eq(directoryEntries.clientId, clientId)).limit(1);
  }
  if (e) cache.set(clientId, e.id);
  return e?.id ?? null;
}

/* ------------------------------------------------------------- relevé -- */

export type Bilan = {
  le: string;
  dureeMs: number;
  /** Messages examinés (en-têtes seulement). */
  lus: number;
  /** Retenus : échange avec une adresse connue. */
  retenus: number;
  ignoresInconnus: number;
  ignoresAutomatiques: number;
  /** Le relevé s'est arrêté à la durée maximale : le suivant continue. */
  incomplet: boolean;
  premierPassage: boolean;
  dossiers: string[];
};

export type ResultatSync =
  | { etat: "fait"; bilan: Bilan }
  | { etat: "non_relie" }
  | { etat: "deja_en_cours" }
  | { etat: "erreur"; erreur: string };

let enCours: Promise<ResultatSync> | null = null;

/** Lance un relevé, ou rejoint celui qui tourne déjà dans ce processus. */
export function synchroniserGmail(): Promise<ResultatSync> {
  enCours ??= releve().finally(() => {
    enCours = null;
  });
  return enCours;
}

/** Prend le bail du relevé (aucun autre processus ne relève en même temps). */
async function prendreBail(): Promise<boolean> {
  const fin = new Date(Date.now() + BAIL_MS);
  const rows = await db
    .insert(gmailSync)
    .values({ id: ETAT_ID, leaseUntil: fin })
    .onConflictDoUpdate({
      target: gmailSync.id,
      set: { leaseUntil: fin },
      setWhere: sql`${gmailSync.leaseUntil} is null or ${gmailSync.leaseUntil} < now()`,
    })
    .returning({ id: gmailSync.id });
  return rows.length > 0;
}

async function rendreBail() {
  await db.update(gmailSync).set({ leaseUntil: null }).where(eq(gmailSync.id, ETAT_ID));
}

async function releve(): Promise<ResultatSync> {
  const secret = await getSecretChiffre(ID);
  if (!secret) return { etat: "non_relie" };
  if (secret === "illisible") {
    const erreur = "Le mot de passe enregistré ne peut plus être lu (clé de chiffrement changée). Recollez le mot de passe d'application dans Réglages → Gmail.";
    await noterErreur(ID, erreur);
    return { etat: "erreur", erreur };
  }
  const compte = (secret.account ?? "").toLowerCase();
  if (!compte) return { etat: "non_relie" };
  if (!(await prendreBail())) return { etat: "deja_en_cours" };
  // Les e-mails gardés avant les règles actuelles sortent d'abord (idempotent).
  await nettoyerEmailsHorsRegles().catch((e) => console.warn("[pilot] Gmail : nettoyage interrompu,", (e as Error).message));

  const debut = Date.now();
  const client = nouveauClient(compte, secret.token);
  client.on("error", () => undefined);
  // Coupure de secours : un serveur muet ne bloque jamais le relevé suivant.
  const coupure = setTimeout(() => client.close(), COUPURE_MS);
  coupure.unref?.();

  try {
    const [etatLu] = await db.select().from(gmailSync).where(eq(gmailSync.id, ETAT_ID)).limit(1);
    const memeCompte = etatLu?.account === compte;
    const positions: GmailSync["folders"] = memeCompte ? { ...(etatLu?.folders ?? {}) } : {};
    const annuaire = await annuaireConnu(compte);
    const fichesClients = new Map<string, string>();
    const bilan: Bilan = {
      le: new Date().toISOString(),
      dureeMs: 0,
      lus: 0,
      retenus: 0,
      ignoresInconnus: 0,
      ignoresAutomatiques: 0,
      incomplet: false,
      premierPassage: false,
      dossiers: [],
    };

    await client.connect();
    for (const dossier of await dossiers(client)) {
      if (Date.now() - debut > DUREE_MAX_MS) {
        bilan.incomplet = true;
        break;
      }
      bilan.dossiers.push(dossier.role);
      const lock = await client.getMailboxLock(dossier.path, { readOnly: true });
      try {
        const mb = client.mailbox;
        if (!mb || mb.readOnly === false) throw new Error("Le serveur a ouvert la boîte en écriture : relevé interrompu par prudence.");
        const validite = String(mb.uidValidity);
        let pos = positions[dossier.role];
        // Les envois relus une fois selon les règles actuelles : avant elles,
        // un envoi parti de l'admin du site (logiciel d'envoi, lien de
        // désinscription) pouvait être écarté comme « automatique ». Relire
        // ne double rien (identifiant unique par message).
        const relire = dossier.role === "sent" && pos?.regles !== REGLES_ENVOYES;
        if (!pos || relire || pos.uidValidity !== validite || pos.path !== dossier.path) {
          pos = { path: dossier.path, uidValidity: validite, lastUid: 0, initialDone: false, ...(dossier.role === "sent" ? { regles: REGLES_ENVOYES } : {}) };
        }
        if (!pos.initialDone) bilan.premierPassage = true;

        const depuis = new Date(Date.now() - JOURS_INITIAUX * 86_400_000);
        const trouves = pos.initialDone
          ? await client.search({ uid: `${pos.lastUid + 1}:*` }, { uid: true })
          : await client.search({ since: depuis }, { uid: true });
        const uids = (trouves || []).filter((u) => u > pos!.lastUid).sort((a, b) => a - b);

        let interrompu = false;
        for (let i = 0; i < uids.length; i += LOT) {
          if (Date.now() - debut > DUREE_MAX_MS) {
            interrompu = true;
            break;
          }
          const lot = uids.slice(i, i + LOT);
          const messages: FetchMessageObject[] = [];
          for await (const m of client.fetch(
            lot.join(","),
            { uid: true, envelope: true, bodyStructure: true, internalDate: true, threadId: true, headers: EN_TETES_UTILES },
            { uid: true },
          )) {
            messages.push(m);
          }
          messages.sort((a, b) => a.uid - b.uid);
          for (const m of messages) {
            bilan.lus += 1;
            const r = await traiter(client, m, dossier.role, compte, annuaire, fichesClients);
            if (r === "retenu") bilan.retenus += 1;
            else if (r === "automatique") bilan.ignoresAutomatiques += 1;
            else bilan.ignoresInconnus += 1;
          }
          pos.lastUid = Math.max(pos.lastUid, ...lot);
          positions[dossier.role] = { ...pos };
          await db.update(gmailSync).set({ folders: positions, account: compte, updatedAt: new Date() }).where(eq(gmailSync.id, ETAT_ID));
        }
        if (interrompu) bilan.incomplet = true;
        else {
          pos.initialDone = true;
          if (uids.length) pos.lastUid = Math.max(pos.lastUid, ...uids);
        }
        positions[dossier.role] = { ...pos };
      } finally {
        lock.release();
      }
      await db.update(gmailSync).set({ folders: positions, account: compte, updatedAt: new Date() }).where(eq(gmailSync.id, ETAT_ID));
    }

    await recalculerSansReponse();
    bilan.dureeMs = Date.now() - debut;
    const maintenant = new Date();
    await db
      .update(gmailSync)
      .set({ lastRunAt: maintenant, lastSuccessAt: maintenant, lastResult: bilan as unknown as Record<string, unknown>, updatedAt: maintenant })
      .where(eq(gmailSync.id, ETAT_ID));
    await noterErreur(ID, null, maintenant);
    return { etat: "fait", bilan };
  } catch (e) {
    const erreur = erreurLisible(e, secret.token);
    console.warn("[pilot] relevé Gmail :", erreur);
    await noterErreur(ID, erreur, new Date()).catch(() => undefined);
    await db.update(gmailSync).set({ lastRunAt: new Date() }).where(eq(gmailSync.id, ETAT_ID)).catch(() => undefined);
    return { etat: "erreur", erreur };
  } finally {
    clearTimeout(coupure);
    await client.logout().catch(() => client.close());
    await rendreBail().catch(() => undefined);
  }
}

const adresse = (a: MessageAddressObject | undefined) => cleEmail(a?.address);
const personne = (a: MessageAddressObject) => ({ nom: (a.name ?? "").slice(0, 120) || null, email: (a.address ?? "").toLowerCase() });

/** Les pièces jointes : seulement leur nombre et leurs noms. */
function piecesJointes(s: MessageStructureObject | undefined): string[] {
  const noms: string[] = [];
  const parcourir = (n: MessageStructureObject | undefined) => {
    if (!n) return;
    if (n.childNodes?.length) return n.childNodes.forEach(parcourir);
    const nom = n.dispositionParameters?.filename ?? n.parameters?.name;
    // Une pièce jointe déclarée, ou un fichier nommé qui n'est ni le texte du
    // message ni une image glissée dans le corps (logo de signature).
    const joint =
      n.disposition === "attachment" || (Boolean(nom) && !n.type.startsWith("text/") && !(n.disposition === "inline" && n.type.startsWith("image/")));
    if (joint) noms.push((nom ?? "sans nom").slice(0, 120));
  };
  parcourir(s);
  return noms;
}

/** La partie texte à extraire : text/plain d'abord, sinon text/html (hors pièces jointes). */
function partieTexte(s: MessageStructureObject | undefined): MessageStructureObject | null {
  let plain: MessageStructureObject | null = null;
  let html: MessageStructureObject | null = null;
  const parcourir = (n: MessageStructureObject | undefined) => {
    if (!n || (plain && html)) return;
    if (n.childNodes?.length) return n.childNodes.forEach(parcourir);
    if (n.disposition === "attachment") return;
    if (n.type === "text/plain" && !plain) plain = n;
    if (n.type === "text/html" && !html) html = n;
  };
  parcourir(s);
  return plain ?? html;
}

type Issue = "retenu" | "automatique" | "inconnu";

async function traiter(
  client: ImapFlow,
  m: FetchMessageObject,
  dossier: Dossier["role"],
  compte: string,
  annuaire: Annuaire,
  fichesClients: Map<string, string>,
): Promise<Issue> {
  const env = m.envelope ?? {};
  const de = adresse(env.from?.[0]);
  const dests = [...(env.to ?? []), ...(env.cc ?? []), ...(env.bcc ?? [])];
  // Tout message du dossier « Messages envoyés » est envoyé par Emmanuel,
  // quel que soit son From : son adresse Gmail, un alias, ou une adresse
  // @taochyagency.com (e-mails de prospection partis de l'admin du site).
  const envoye = dossier === "sent" || de === compte;
  const enTetes = lireEnTetes(m.headers);
  // Reçu : notification de plateforme, confirmation, lettre d'information… :
  // ignoré, rien n'est stocké. Un envoi d'Emmanuel n'est jamais écarté ainsi,
  // même parti d'un logiciel de site (l'admin envoie avec PHPMailer).
  if (!envoye && messageTransactionnel(enTetes, de, env.subject)) return "automatique";

  // La vraie contrepartie, et elle seule : l'adresse From d'un message reçu
  // (jamais Reply-To, les autres destinataires ni une adresse du corps), les
  // adresses To et Cc d'un message envoyé. Une adresse d'Emmanuel ou de
  // l'équipe n'est jamais une contrepartie.
  const autres = (
    envoye ? [...(env.to ?? []), ...(env.cc ?? [])].map(adresse).filter((a): a is string => Boolean(a)) : de ? [de] : []
  ).filter((a) => a !== compte && !annuaire.estInterne(a));
  const cibles: (Cible & { par: "adresse" | "domaine"; contact: string })[] = [];
  for (const a of autres) {
    const exact = annuaire.parAdresse.get(a);
    const parDomaine = exact ? null : annuaire.parDomaine.get(domaineDe(a) ?? "");
    for (const c of exact ?? parDomaine ?? []) cibles.push({ ...c, par: exact ? "adresse" : "domaine", contact: a });
  }
  if (!cibles.length) return "inconnu";

  // Les fiches concernées (un client sans fiche en reçoit une, vide).
  const fiches = new Map<string, { par: "adresse" | "domaine"; contact: string }>();
  for (const c of cibles) {
    const entryId = c.entryId ?? (c.clientId ? await ficheDuClient(c.clientId, fichesClients) : null);
    if (entryId && (!fiches.has(entryId) || c.par === "adresse")) fiches.set(entryId, { par: c.par, contact: c.contact });
  }
  if (!fiches.size) return "inconnu";

  // L'extrait : le début de la partie texte, lu avec BODY.PEEK (rien ne passe « lu »).
  let resume = "";
  const partie = partieTexte(m.bodyStructure);
  if (partie) {
    const cle = partie.part ?? "1";
    const lu = await client.fetchOne(String(m.uid), { uid: true, bodyParts: [{ key: cle, maxLength: OCTETS_TEXTE }] }, { uid: true });
    const k = cle.toLowerCase();
    const brut = [...(lu ? (lu.bodyParts ?? new Map<string, Buffer>()) : new Map<string, Buffer>()).entries()].find(([n]) => n === k || n.startsWith(`${k}<`))?.[1];
    if (brut) {
      const texte = decoderPartie(brut, partie.encoding, partie.parameters?.charset);
      resume = extrait(partie.type === "text/html" ? texteDuHtml(texte) : texte);
    }
  }

  const messageId = sansChevrons(env.messageId) || null;
  const references = (enTetes.get("references") ?? []).join(" ");
  const fil = cleDeFil({
    gmailThreadId: m.threadId ?? null,
    references,
    inReplyTo: env.inReplyTo ?? (enTetes.get("in-reply-to") ?? [])[0] ?? null,
    messageId: messageId ?? `${dossier}-${m.uid}`,
    empreinte: (s) => createHash("sha256").update(s).digest("hex"),
  });
  const pj = piecesJointes(m.bodyStructure);
  const quand = env.date ? new Date(env.date) : m.internalDate ? new Date(m.internalDate) : new Date();
  const date = Number.isNaN(quand.getTime()) ? new Date() : quand;
  const objet = (env.subject ?? "").replace(/\s+/g, " ").trim().slice(0, 300) || "(sans objet)";
  const destinataires = dests.map(adresse).filter((a): a is string => Boolean(a));

  for (const [entryId, f] of fiches) {
    await db
      .insert(directoryEvents)
      .values({
        entryId,
        source: "gmail",
        kind: envoye ? "email_sortant" : "email_entrant",
        externalId: messageId ?? `uid:${dossier}:${m.uid}`,
        occurredAt: date,
        title: objet,
        body: resume || null,
        meta: {
          sens: envoye ? "envoye" : "recu",
          de: env.from?.[0] ? personne(env.from[0]) : null,
          a: (env.to ?? []).map(personne).slice(0, 20),
          cc: (env.cc ?? []).map(personne).slice(0, 20),
          destinataires: destinataires.slice(0, 50),
          messageId,
          fil,
          lien: lienGmail(messageId),
          pj: { n: pj.length, noms: pj.slice(0, 10) },
          dossier,
          contact: f.contact,
          par: f.par,
        },
      })
      .onConflictDoNothing();
  }
  return "retenu";
}

/**
 * « Sans réponse », par fil : le dernier message reçu d'un fil attend une
 * réponse tant qu'aucun message envoyé n'est plus récent, ni dans le même fil,
 * ni à cette adresse. Quand une réponse part, `done_at` prend sa date.
 */
export async function recalculerSansReponse() {
  await db.execute(sql`
    with calc as (
      select e.id,
        (e.kind = 'email_entrant'
          and not exists (
            select 1 from ${directoryEvents} r
            where r.source = 'gmail' and r.kind = 'email_entrant'
              and r.meta->>'fil' = e.meta->>'fil' and r.occurred_at > e.occurred_at)
          and not exists (
            select 1 from ${directoryEvents} s
            where s.source = 'gmail' and s.kind = 'email_sortant' and s.occurred_at > e.occurred_at
              and (s.meta->>'fil' = e.meta->>'fil' or (s.meta->'destinataires') ? (e.meta->'de'->>'email')))
        ) as attend,
        case when e.kind = 'email_entrant' then (
          select min(s.occurred_at) from ${directoryEvents} s
          where s.source = 'gmail' and s.kind = 'email_sortant' and s.occurred_at > e.occurred_at
            and (s.meta->>'fil' = e.meta->>'fil' or (s.meta->'destinataires') ? (e.meta->'de'->>'email'))
        ) end as repondu
      from ${directoryEvents} e
      where e.source = 'gmail'
    )
    update ${directoryEvents} d
    set awaiting_reply = calc.attend, done_at = calc.repondu
    from calc
    where d.id = calc.id
      and (d.awaiting_reply is distinct from calc.attend or d.done_at is distinct from calc.repondu)
  `);
}

/* ------------------------------------------------------------ nettoyage -- */

export type BilanNettoyage = { retires: number; parDomaine: number; parAdresse: number; archives: number; fiches: number };

/**
 * Retire les e-mails gardés avant les règles de rapprochement actuelles (voir
 * emailHorsRegles dans gmail-regles.ts) : une notification Swap'Îles rangée
 * sur la fiche d'un client, un message rattaché par une autre adresse que la
 * vraie contrepartie, un message d'un domaine d'Emmanuel ou de l'équipe.
 *
 * Avec eux partent :
 *   - les « Traité » de « Ce matin » de leurs fils (clé email:<fil>), quand
 *     plus aucun e-mail gardé n'appartient au fil ;
 *   - les fiches VIDES que le relevé avait créées pour eux seuls (fiche d'un
 *     client, sans aucune saisie, jamais modifiée, sans plus aucune ligne de
 *     frise). Une fiche qui porte quoi que ce soit d'autre n'est pas touchée.
 *
 * Idempotent (une seconde exécution ne trouve plus rien). Appelé au démarrage
 * et au début de chaque relevé. Le journal ne contient que des nombres.
 */
export async function nettoyerEmailsHorsRegles(): Promise<BilanNettoyage> {
  const bilan: BilanNettoyage = { retires: 0, parDomaine: 0, parAdresse: 0, archives: 0, fiches: 0 };
  const rows = await db
    .select({ id: directoryEvents.id, entryId: directoryEvents.entryId, kind: directoryEvents.kind, title: directoryEvents.title, meta: directoryEvents.meta })
    .from(directoryEvents)
    .where(and(eq(directoryEvents.source, "gmail"), inArray(directoryEvents.kind, ["email_entrant", "email_sortant"])));
  if (!rows.length) return bilan;

  const [etat] = await db.select({ account: gmailSync.account }).from(gmailSync).where(eq(gmailSync.id, ETAT_ID)).limit(1);
  const { domaineInterne } = await adressesInternes((etat?.account ?? "").toLowerCase());
  const emails = (l: unknown) => (Array.isArray(l) ? l : []).map((p) => String((p as { email?: string })?.email ?? "")).filter(Boolean);

  const aRetirer = rows.filter((r) => {
    const m = r.meta as Record<string, unknown>;
    const raison = emailHorsRegles(
      {
        sens: r.kind === "email_sortant" ? "envoye" : "recu",
        de: (m.de as { email?: string } | null)?.email ?? null,
        a: emails(m.a),
        cc: emails(m.cc),
        contact: typeof m.contact === "string" ? m.contact : null,
        objet: r.title,
      },
      domaineInterne,
    );
    return raison !== null;
  });
  if (!aRetirer.length) return bilan;

  const ids = aRetirer.map((r) => r.id);
  const fils = [...new Set(aRetirer.map((r) => String((r.meta as Record<string, unknown>).fil ?? "")).filter(Boolean))];
  const fichesTouchees = [...new Set(aRetirer.map((r) => r.entryId))];
  bilan.parDomaine = aRetirer.filter((r) => (r.meta as Record<string, unknown>).par === "domaine").length;
  bilan.parAdresse = aRetirer.length - bilan.parDomaine;

  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i += 500) {
      bilan.retires += (await tx.delete(directoryEvents).where(inArray(directoryEvents.id, ids.slice(i, i + 500))).returning({ id: directoryEvents.id })).length;
    }
    // Les « Traité » des fils qui n'ont plus aucun e-mail gardé.
    for (const fil of fils) {
      const [reste] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(directoryEvents)
        .where(and(eq(directoryEvents.source, "gmail"), sql`${directoryEvents.meta}->>'fil' = ${fil}`));
      if (!reste?.n) bilan.archives += (await tx.delete(ceMatinArchives).where(eq(ceMatinArchives.key, `email:${fil}`)).returning({ k: ceMatinArchives.key })).length;
    }
    // Les fiches vides créées par le relevé pour ces seuls e-mails.
    const vides = await tx
      .delete(directoryEntries)
      .where(
        and(
          inArray(directoryEntries.id, fichesTouchees),
          isNotNull(directoryEntries.clientId),
          eq(directoryEntries.kind, "client"),
          eq(directoryEntries.source, "agence"),
          sql`${directoryEntries.contactName} is null and ${directoryEntries.email} is null and ${directoryEntries.phone} is null
            and ${directoryEntries.website} is null and ${directoryEntries.city} is null and ${directoryEntries.country} is null
            and ${directoryEntries.sector} is null and ${directoryEntries.owner} is null and ${directoryEntries.status} is null
            and ${directoryEntries.nextAction} is null and ${directoryEntries.nextActionOn} is null and ${directoryEntries.note} is null
            and ${directoryEntries.abbyCustomerId} is null and ${directoryEntries.externalId} is null and ${directoryEntries.importedAt} is null
            and ${directoryEntries.lastActivityAt} is null
            and ${directoryEntries.tags} = '[]'::jsonb and ${directoryEntries.links} = '{}'::jsonb and ${directoryEntries.data} = '{}'::jsonb
            and ${directoryEntries.updatedAt} - ${directoryEntries.createdAt} < interval '1 second'`,
          sql`not exists (select 1 from ${directoryEvents} e where e.entry_id = ${directoryEntries.id})`,
        ),
      )
      .returning({ id: directoryEntries.id });
    bilan.fiches = vides.length;
  });
  await recalculerSansReponse();
  console.log(
    `[pilot] Gmail : nettoyage, ${bilan.retires} e-mail(s) retiré(s) (${bilan.parDomaine} rattaché(s) par domaine, ${bilan.parAdresse} par adresse), ${bilan.archives} « Traité » et ${bilan.fiches} fiche(s) vide(s) retirés.`,
  );
  return bilan;
}

/* --------------------------------------------------------- planification -- */

/** Toutes les 12 minutes (instrumentation) : relève si Gmail est relié, sinon ne fait rien. */
export async function releveRegulier() {
  if (!(await gmailRelie())) return;
  const r = await synchroniserGmail();
  if (r.etat === "erreur") console.warn("[pilot] Gmail :", r.erreur);
}

/* ---------------------------------------------------------- lectures -- */

export type EmailFiche = {
  id: string;
  sens: "recu" | "envoye";
  at: Date;
  objet: string;
  extrait: string | null;
  de: { nom: string | null; email: string } | null;
  a: { nom: string | null; email: string }[];
  lien: string | null;
  pj: { n: number; noms: string[] };
  fil: string;
  sansReponse: boolean;
};

export type FilFiche = { fil: string; messages: EmailFiche[]; dernier: EmailFiche; sansReponseDepuis: Date | null };

/** Les fils d'une fiche, du plus récent au plus ancien. Réservé à la direction (vérifié par l'appelant). */
export async function filsDeLaFiche(entryId: string, limite = 200): Promise<FilFiche[]> {
  const rows = await db
    .select()
    .from(directoryEvents)
    .where(and(eq(directoryEvents.entryId, entryId), eq(directoryEvents.source, "gmail"), inArray(directoryEvents.kind, ["email_entrant", "email_sortant"])))
    .orderBy(sql`${directoryEvents.occurredAt} desc`)
    .limit(limite);
  const parFil = new Map<string, EmailFiche[]>();
  for (const r of rows) {
    const meta = r.meta as Record<string, unknown>;
    const e: EmailFiche = {
      id: r.id,
      sens: r.kind === "email_sortant" ? "envoye" : "recu",
      at: r.occurredAt,
      objet: r.title,
      extrait: r.body,
      de: (meta.de as EmailFiche["de"]) ?? null,
      a: (meta.a as EmailFiche["a"]) ?? [],
      lien: (meta.lien as string) ?? null,
      pj: (meta.pj as EmailFiche["pj"]) ?? { n: 0, noms: [] },
      fil: String(meta.fil ?? r.id),
      sansReponse: r.awaitingReply,
    };
    parFil.set(e.fil, [...(parFil.get(e.fil) ?? []), e]);
  }
  return [...parFil.entries()].map(([fil, messages]) => ({
    fil,
    messages,
    dernier: messages[0],
    sansReponseDepuis: messages.find((m) => m.sansReponse)?.at ?? null,
  }));
}
