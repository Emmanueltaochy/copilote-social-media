import "server-only";

import ICAL from "ical.js";
import { sql } from "drizzle-orm";
import { directoryEvents } from "@/db";
import { adresseIcalGoogle, adresseMasquee, cleNom, cleUtilisable, extraitDescription, lienVisio, titreContient, type Candidat } from "@/lib/etape3-regles";
import {
  DUREE_MAX_MS,
  ErreurService,
  adressesConnues,
  candidats,
  effacerLignes,
  estAdresseLocale,
  etatReleve,
  ficheDe,
  liensManuels,
  majReleve,
  oublierReleve,
  prendreBail,
  remplacerLignes,
  rendreBail,
  type LigneSource,
} from "@/lib/releves";
import { forgetSecret, getSecretChiffre, noterErreur, setSecretChiffre } from "@/lib/secrets";

/*
 * Google Agenda, sans OAuth : l'« adresse secrète au format iCal » de chaque
 * agenda (Google Agenda → Paramètres de l'agenda → Adresse secrète au format
 * iCal), collée dans Réglages. Avec un compte Google grand public, une
 * application OAuth non vérifiée perd son accès tous les 7 jours ; l'adresse
 * iCal, elle, reste valable tant qu'Emmanuel ne la réinitialise pas.
 *
 * Les adresses sont chiffrées dans `integrations` et jamais réaffichées en
 * entier (adresseMasquee). Seules les adresses https://calendar.google.com/
 * calendar/ical/…/private-…/basic.ics sont acceptées ; une adresse locale
 * (127.0.0.1, localhost) ne l'est que si AGENDA_ICAL_TEST=1, pour les tests.
 *
 * Lecture et analyse du fichier .ics avec ical.js (Mozilla, MPL-2.0) :
 * événements récurrents (RRULE, EXDATE, exceptions RECURRENCE-ID, annulés),
 * fuseaux horaires (VTIMEZONE du fichier, sinon le nom IANA du TZID, sinon
 * X-WR-TIMEZONE, sinon Indian/Reunion), journées entières.
 *
 * CONFIDENTIALITÉ : c'est l'agenda personnel d'Emmanuel. Seuls les
 * rendez-vous rattachés à une fiche sont gardés :
 *   - un invité (ou l'organisateur) dont l'e-mail est connu de l'annuaire ;
 *   - ou le nom d'un client ou d'un prospect dans le titre (même
 *     normalisation que Trello, mots entiers) ;
 *   - ou un mot choisi à la main sur la fiche (links.calendarQuery).
 * Tout le reste est ignoré et n'est stocké nulle part (le bilan ne garde que
 * des nombres). Pour un rendez-vous gardé : titre, début, fin, lieu, lien de
 * visio, lien vers l'événement s'il existe, et 280 caractères de description
 * au plus. Jamais la description entière, jamais la liste des invités.
 */

const ID = "agenda";
/** La fenêtre lue à chaque relevé : 90 jours en arrière, 120 jours devant. */
const JOURS_AVANT = 90;
const JOURS_APRES = 120;
const TAILLE_MAX = 15 * 1024 * 1024;
const FUSEAU_DEFAUT = "Indian/Reunion";

export type AgendaEnregistre = { url: string; nom: string };

const adresseAcceptee = (url: string) => adresseIcalGoogle(url) || (process.env.AGENDA_ICAL_TEST === "1" && estAdresseLocale(url) && /^https?:\/\//.test(url));

async function agendas(): Promise<AgendaEnregistre[] | "illisible"> {
  const s = await getSecretChiffre(ID);
  if (!s) return [];
  if (s === "illisible") return "illisible";
  try {
    const l = JSON.parse(s.token) as AgendaEnregistre[];
    return Array.isArray(l) ? l.filter((a) => a && typeof a.url === "string") : [];
  } catch {
    return [];
  }
}

/** Les agendas enregistrés, sans leur adresse : un nom et une forme masquée. */
export async function agendasMasques(): Promise<{ nom: string; adresse: string }[] | "illisible"> {
  const l = await agendas();
  return l === "illisible" ? l : l.map((a) => ({ nom: a.nom, adresse: adresseMasquee(a.url) }));
}

/* ------------------------------------------------------------ lecture -- */

async function lireIcs(url: string): Promise<string> {
  let r: Response;
  try {
    r = await fetch(url, { method: "GET", headers: { Accept: "text/calendar" }, signal: AbortSignal.timeout(30_000), cache: "no-store", redirect: "error" });
  } catch (e) {
    const nom = (e as Error).name;
    throw new ErreurService(nom === "TimeoutError" || nom === "AbortError" ? "Google Agenda n'a pas répondu à temps." : "Impossible de joindre Google Agenda.");
  }
  if (r.status === 404 || r.status === 403 || r.status === 401) {
    throw new ErreurService("Google Agenda refuse cette adresse : elle a peut-être été réinitialisée. Recopiez l'adresse secrète au format iCal.", r.status);
  }
  if (!r.ok) throw new ErreurService(`Google Agenda répond ${r.status}.`, r.status);
  const texte = await r.text();
  if (texte.length > TAILLE_MAX) throw new ErreurService("Agenda trop volumineux pour être lu.");
  if (!/BEGIN:VCALENDAR/.test(texte)) throw new ErreurService("Cette adresse ne renvoie pas un agenda au format iCal.");
  return texte;
}

/** Décalage (ms) d'un fuseau IANA à un instant donné, d'après Intl. */
function decalage(ms: number, fuseau: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: fuseau, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  );
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) - ms;
}

const fuseauConnu = (f: string | null | undefined): f is string => {
  if (!f) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: f });
    return true;
  } catch {
    return false;
  }
};

/** Une heure murale dans un fuseau → l'instant UTC (changements d'heure compris). */
function murEnUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, fuseau: string): number {
  const mur = Date.UTC(y, mo - 1, d, h, mi, s);
  let t = mur - decalage(mur, fuseau);
  t = mur - decalage(t, fuseau);
  return t;
}

type Instant = { ms: number; journee: boolean };

/** Un ICAL.Time → l'instant UTC, selon la règle de fuseau décrite en tête de fichier. */
function instant(t: ICAL.Time, fuseauAgenda: string): Instant {
  if (t.isDate) return { ms: murEnUtc(t.year, t.month, t.day, 0, 0, 0, fuseauAgenda), journee: true };
  const zone = t.zone as ICAL.Timezone | undefined;
  if (zone && zone.tzid === "UTC") return { ms: Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second), journee: false };
  const tzid = zone && zone.tzid && zone.tzid !== "floating" ? zone.tzid : ((t as unknown as { timezone?: string }).timezone ?? null);
  if (fuseauConnu(tzid)) return { ms: murEnUtc(t.year, t.month, t.day, t.hour, t.minute, t.second, tzid), journee: false };
  if (zone && zone.component) return { ms: t.toUnixTime() * 1000, journee: false };
  return { ms: murEnUtc(t.year, t.month, t.day, t.hour, t.minute, t.second, fuseauAgenda), journee: false };
}

export type Occurrence = {
  uid: string;
  cle: string;
  titre: string;
  debut: Date;
  fin: Date;
  journee: boolean;
  lieu: string | null;
  description: string | null;
  conference: string | null;
  url: string | null;
  invites: string[];
};

/** Toutes les occurrences d'un fichier .ics dans la fenêtre [debut, fin]. Rien n'est gardé ici : c'est l'appelant qui trie. */
export function occurrences(texte: string, debut: Date, fin: Date): Occurrence[] {
  const cal = new ICAL.Component(ICAL.parse(texte));
  const fuseauAgenda = String(cal.getFirstPropertyValue("x-wr-timezone") ?? "") || FUSEAU_DEFAUT;
  const fuseau = fuseauConnu(fuseauAgenda) ? fuseauAgenda : FUSEAU_DEFAUT;
  const vevents = cal.getAllSubcomponents("vevent");
  const exceptions = new Map<string, ICAL.Component[]>();
  const maitres: ICAL.Component[] = [];
  for (const v of vevents) {
    const uid = String(v.getFirstPropertyValue("uid") ?? "");
    if (v.hasProperty("recurrence-id")) exceptions.set(uid, [...(exceptions.get(uid) ?? []), v]);
    else maitres.push(v);
  }
  const out: Occurrence[] = [];
  const texteDe = (c: ICAL.Component, nom: string) => {
    const v = c.getFirstPropertyValue(nom);
    return v === null || v === undefined ? null : String(v);
  };
  const invitesDe = (c: ICAL.Component) =>
    [...c.getAllProperties("attendee"), ...c.getAllProperties("organizer")]
      .map((p) => String(p.getFirstValue() ?? "").replace(/^mailto:/i, "").trim().toLowerCase())
      .filter((a) => a.includes("@"));
  const ajouter = (c: ICAL.Component, uid: string, d: ICAL.Time, f: ICAL.Time | null) => {
    if (String(c.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED") return;
    const a = instant(d, fuseau);
    const b = f ? instant(f, fuseau) : { ms: a.ms + (a.journee ? 86_400_000 : 3_600_000), journee: a.journee };
    if (b.ms < debut.getTime() || a.ms > fin.getTime()) return;
    out.push({
      uid,
      cle: `${uid}|${new Date(a.ms).toISOString()}`.slice(0, 500),
      titre: (texteDe(c, "summary") ?? "(sans titre)").replace(/\s+/g, " ").trim().slice(0, 300),
      debut: new Date(a.ms),
      fin: new Date(b.ms),
      journee: a.journee,
      lieu: texteDe(c, "location")?.slice(0, 300) ?? null,
      description: texteDe(c, "description"),
      conference: texteDe(c, "x-google-conference"),
      url: texteDe(c, "url"),
      invites: invitesDe(c),
    });
  };

  for (const v of maitres) {
    const uid = String(v.getFirstPropertyValue("uid") ?? "");
    const ev = new ICAL.Event(v);
    for (const ex of exceptions.get(uid) ?? []) ev.relateException(ex);
    if (!ev.isRecurring()) {
      ajouter(v, uid, ev.startDate, ev.endDate);
      continue;
    }
    const it = ev.iterator();
    for (let n = 0, prochain = it.next(); prochain && n < 5000; n++, prochain = it.next()) {
      if (instant(prochain, fuseau).ms > fin.getTime()) break;
      const det = ev.getOccurrenceDetails(prochain);
      ajouter(det.item.component, uid, det.startDate, det.endDate);
    }
  }
  // Une exception dont la série n'est pas dans le fichier : un événement isolé.
  for (const [uid, liste] of exceptions) {
    if (maitres.some((m) => String(m.getFirstPropertyValue("uid") ?? "") === uid)) continue;
    for (const ex of liste) {
      const ev = new ICAL.Event(ex);
      ajouter(ex, uid, ev.startDate, ev.endDate);
    }
  }
  return out;
}

/* ---------------------------------------------------- raccordement -- */

/** « Tester et enregistrer » : lit l'agenda et compte ses rendez-vous (rien n'est gardé). */
export async function testerAgenda(url: string): Promise<{ ok: true; evenements: number } | { ok: false; erreur: string }> {
  const propre = url.trim();
  if (!adresseAcceptee(propre)) {
    return {
      ok: false,
      erreur:
        "Ce n'est pas une adresse secrète iCal de Google Agenda. Elle commence par https://calendar.google.com/calendar/ical/ et se termine par /basic.ics (Paramètres de l'agenda → « Adresse secrète au format iCal »).",
    };
  }
  try {
    const maintenant = Date.now();
    const n = occurrences(await lireIcs(propre), new Date(maintenant - JOURS_AVANT * 86_400_000), new Date(maintenant + JOURS_APRES * 86_400_000)).length;
    return { ok: true, evenements: n };
  } catch (e) {
    return { ok: false, erreur: e instanceof ErreurService ? e.message : "Fichier iCal illisible." };
  }
}

export async function ajouterAgenda(url: string, nom: string) {
  const l = await agendas();
  const actuels = l === "illisible" ? [] : l;
  if (actuels.some((a) => a.url === url.trim())) return;
  await setSecretChiffre(ID, JSON.stringify([...actuels, { url: url.trim(), nom: nom.trim().slice(0, 80) || `Agenda ${actuels.length + 1}` }]), null);
}

/** Retire un agenda (par sa position) ; le dernier retiré, c'est « Déconnecter ». */
export async function retirerAgenda(position: number) {
  const l = await agendas();
  if (l === "illisible") return;
  const reste = l.filter((_, i) => i !== position);
  if (reste.length) await setSecretChiffre(ID, JSON.stringify(reste), null);
  else await forgetSecret(ID);
}

export async function deconnecterAgenda(effacer: boolean) {
  await forgetSecret(ID);
  await oublierReleve(ID);
  if (effacer) await effacerLignes(ID);
}

export const agendaRelie = async () => (await getSecretChiffre(ID)) !== null;

/* --------------------------------------------------------------- relevé -- */

export type BilanAgenda = { le: string; dureeMs: number; agendas: number; lus: number; gardes: number; ignores: number; erreurs: number };

export async function releverAgenda(): Promise<{ etat: "fait"; bilan: BilanAgenda } | { etat: "non_relie" | "deja_en_cours" } | { etat: "erreur"; erreur: string }> {
  const liste = await agendas();
  if (liste === "illisible") {
    const erreur = "Les adresses d'agenda enregistrées ne peuvent plus être lues (clé de chiffrement changée) : recollez-les dans Réglages → Google Agenda.";
    await noterErreur(ID, erreur);
    return { etat: "erreur", erreur };
  }
  if (!liste.length) return { etat: "non_relie" };
  if (!(await prendreBail(ID))) return { etat: "deja_en_cours" };
  const debut = Date.now();
  const fenetre = { de: new Date(debut - JOURS_AVANT * 86_400_000), a: new Date(debut + JOURS_APRES * 86_400_000) };
  try {
    const [adresses, noms, liens] = await Promise.all([adressesConnues(), candidats(), liensManuels()]);
    // Noms des clients et des fiches (clés normalisées), et mots choisis à la main.
    const parNom = new Map<string, Candidat>();
    for (const c of noms) {
      const k = cleNom(c.nom);
      if (cleUtilisable(k) && !parNom.has(k)) parNom.set(k, c);
    }
    const motsManuels: { cle: string; cible: Candidat }[] = [];
    for (const l of liens) {
      for (const mot of (l.links?.calendarQuery ?? "").split(",")) {
        const k = cleNom(mot);
        if (cleUtilisable(k)) motsManuels.push({ cle: k, cible: { entryId: l.clientId ? null : l.id, clientId: l.clientId, nom: l.name } });
      }
    }

    const fiches = new Map<string, string>();
    const lignes: LigneSource[] = [];
    const bilan: BilanAgenda = { le: new Date().toISOString(), dureeMs: 0, agendas: liste.length, lus: 0, gardes: 0, ignores: 0, erreurs: 0 };
    let erreur: string | null = null;
    for (const ag of liste) {
      if (Date.now() - debut > DUREE_MAX_MS) break;
      let occs: Occurrence[];
      try {
        occs = occurrences(await lireIcs(ag.url), fenetre.de, fenetre.a);
      } catch (e) {
        bilan.erreurs += 1;
        erreur = `${ag.nom} : ${e instanceof ErreurService ? e.message : "fichier iCal illisible"}`;
        continue;
      }
      for (const o of occs) {
        bilan.lus += 1;
        const cibles = new Map<string, { cible: Candidat; par: "invite" | "titre" | "manuel" }>();
        const cleCible = (c: Candidat) => c.clientId ?? c.entryId ?? "";
        for (const a of o.invites) {
          const c = adresses.get(a);
          if (c && !cibles.has(cleCible(c))) cibles.set(cleCible(c), { cible: c, par: "invite" });
        }
        // Noms dans le titre : quand deux noms trouvés s'emboîtent (« Garage Sud »
        // et « Garage Sud Auto »), seul le plus précis compte.
        const trouves = [...parNom].filter(([k]) => titreContient(o.titre, k));
        for (const [k, c] of trouves) {
          if (trouves.some(([k2]) => k2 !== k && ` ${k2} `.includes(` ${k} `))) continue;
          if (!cibles.has(cleCible(c))) cibles.set(cleCible(c), { cible: c, par: "titre" });
        }
        for (const m of motsManuels) if (titreContient(o.titre, m.cle) && !cibles.has(cleCible(m.cible))) cibles.set(cleCible(m.cible), { cible: m.cible, par: "manuel" });
        if (!cibles.size) {
          // Rien à voir avec un client ou un prospect : ignoré, rien n'est gardé.
          bilan.ignores += 1;
          continue;
        }
        bilan.gardes += 1;
        for (const { cible, par } of cibles.values()) {
          const entryId = await ficheDe(cible, fiches);
          if (!entryId) continue;
          lignes.push({
            entryId,
            source: ID,
            kind: "rdv",
            externalId: o.cle,
            occurredAt: o.debut,
            title: o.titre,
            body: extraitDescription(o.description),
            meta: {
              fin: o.fin.toISOString(),
              journee: o.journee,
              lieu: o.lieu,
              visio: lienVisio(o.conference, o.lieu, o.description),
              lien: o.url && /^https:\/\//.test(o.url) ? o.url : null,
              par,
              agenda: ag.nom,
            },
          });
        }
      }
    }
    // Les rendez-vous de la fenêtre lue sont remplacés (un rendez-vous annulé
    // ou renommé disparaît) ; ceux d'avant la fenêtre restent.
    if (!bilan.erreurs) {
      await remplacerLignes(ID, lignes, sql`${directoryEvents.occurredAt} < ${fenetre.de.toISOString()}::timestamptz`);
    }
    bilan.dureeMs = Date.now() - debut;
    const maintenant = new Date();
    await majReleve(ID, { lastRunAt: maintenant, ...(erreur ? {} : { lastSuccessAt: maintenant }), lastError: erreur, lastResult: bilan as unknown as Record<string, unknown> });
    await noterErreur(ID, erreur, maintenant);
    return erreur ? { etat: "erreur", erreur } : { etat: "fait", bilan };
  } catch (e) {
    const erreur = e instanceof ErreurService ? e.message : "Fichier iCal illisible.";
    console.warn("[pilot] relevé de l'agenda :", erreur);
    await noterErreur(ID, erreur, new Date()).catch(() => undefined);
    await majReleve(ID, { lastRunAt: new Date(), lastError: erreur }).catch(() => undefined);
    return { etat: "erreur", erreur };
  } finally {
    await rendreBail(ID).catch(() => undefined);
  }
}

export async function etatAgenda() {
  const [liste, etat] = await Promise.all([agendasMasques(), etatReleve(ID)]);
  return {
    relie: liste === "illisible" || liste.length > 0,
    illisible: liste === "illisible",
    agendas: liste === "illisible" ? [] : liste,
    erreur: etat?.lastError ?? null,
    dernierReleve: etat?.lastRunAt ?? null,
    enCours: Boolean(etat?.leaseUntil && etat.leaseUntil.getTime() > Date.now()),
    bilan: (etat && Object.keys(etat.lastResult ?? {}).length ? etat.lastResult : null) as BilanAgenda | null,
  };
}
