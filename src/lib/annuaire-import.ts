import "server-only";

import { createHash } from "node:crypto";
import { and, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import { clients, contacts, db, directoryEntries, directoryEvents, users, type DirectoryEntry } from "@/db";
import { cleEmail, cleNomVille, cleTexte, isStatut, type Source } from "@/lib/annuaire";

/*
 * L'import des fichiers de l'agent ventes dans l'annuaire.
 *
 * Deux fichiers, deux formes :
 *   - prospects.json : la prospection sortante (France, Réunion, international),
 *     avec statut, prochaine action et historique des e-mails ;
 *   - sans-site.json : les entreprises réunionnaises sans site, trouvées sur
 *     Google Maps, que Emmanuel contacte lui-même.
 *
 * Un même fichier peut être renvoyé autant de fois qu'on veut : chaque fiche
 * est retrouvée (identifiant d'origine, puis e-mail, puis nom et ville) et mise
 * à jour, jamais recréée.
 */

export type Fichier = "prospects" | "sans-site";

type EvenementImporte = { externalId: string; kind: string; occurredAt: Date; title: string };

type FicheImportee = {
  externalSource: Fichier;
  externalId: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  city: string | null;
  country: string | null;
  sector: string | null;
  status: string | null;
  owner: string | null;
  nextAction: string | null;
  nextActionOn: string | null;
  source: Source;
  lastActivityAt: Date | null;
  data: Record<string, unknown>;
  events: EvenementImporte[];
};

export type BilanImport = {
  fichier: Fichier;
  recues: number;
  creees: number;
  misesAJour: number;
  ignorees: number;
  relieesAUnClient: number;
  evenements: number;
  erreurs: string[];
};

type Brut = Record<string, unknown>;
const txt = (v: unknown): string | null => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).trim();
  return s ? s : null;
};
const jour = (v: unknown): string | null => {
  const s = txt(v);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
/** Une date sans heure, placée à midi heure de La Réunion (8 h UTC). */
const aMidi = (d: string, decalageSecondes = 0) => new Date(Date.parse(`${d}T08:00:00Z`) + decalageSecondes * 1000);
const plusRecente = (...dates: (Date | null)[]) =>
  dates.filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime())).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

/** Reconnaît le fichier à sa forme, quand l'appelant ne l'a pas dit. */
export function devinerFichier(corps: unknown): Fichier | null {
  const liste = (corps as Brut | null)?.prospects;
  if (!Array.isArray(liste) || liste.length === 0) return null;
  const premier = liste[0] as Brut;
  if ("entreprise" in premier) return "prospects";
  if ("nom" in premier && ("place" in premier || "fiche" in premier)) return "sans-site";
  return null;
}

/**
 * La source selon le pays : l'agent ventes prospecte la France, La Réunion,
 * et quelques marchés anglophones ou francophones (Canada, Belgique…).
 */
function sourceDuPays(pays: string | null): Source {
  const p = cleTexte(pays);
  if (p === "la reunion" || p === "reunion") return "agent_ventes_reunion";
  if (p === "france") return "agent_ventes_france";
  return "agent_ventes_international";
}

/**
 * Le genre d'une ligne d'historique, d'après les mots qu'emploie l'agent :
 * « E-mail envoyé… », « E-mail #4 (relance) envoyé par Emmanuel… »,
 * « Réponse reçue… ». Le reste est une étape de travail (repérage, décision).
 */
function genreHistorique(action: string): string {
  const a = cleTexte(action);
  if (a.startsWith("reponse recue") || a.includes("a repondu")) return "email_entrant";
  if (a.startsWith("e mail") && a.includes("envoye")) return "email_sortant";
  return "action";
}

function lireProspect(p: Brut): FicheImportee | null {
  const id = txt(p.id);
  const name = txt(p.entreprise);
  if (!id || !name) return null;
  const historique = Array.isArray(p.historique) ? (p.historique as Brut[]) : [];
  const events: EvenementImporte[] = [];
  historique.forEach((h, i) => {
    const d = jour(h.date);
    const action = txt(h.action);
    if (!d || !action) return;
    events.push({
      externalId: "h:" + createHash("sha1").update(`${d}|${action}`).digest("hex").slice(0, 20),
      kind: genreHistorique(action),
      // L'ordre du fichier départage les lignes d'un même jour.
      occurredAt: aMidi(d, i),
      title: action.slice(0, 2000),
    });
  });
  const dernier = jour(p.dernier_contact);
  const prochaine = txt(p.prochaine_action);
  const statut = txt(p.statut);
  return {
    externalSource: "prospects",
    externalId: id,
    name: name.slice(0, 200),
    contactName: txt(p.contact),
    email: txt(p.email),
    phone: null,
    website: txt(p.site),
    city: txt(p.ville),
    country: txt(p.pays),
    sector: txt(p.activite),
    status: isStatut(statut) ? statut : null,
    owner: txt(p.responsable),
    nextAction: prochaine && cleTexte(prochaine) !== "aucune" ? prochaine.slice(0, 1000) : null,
    nextActionOn: jour(p.prochaine_date),
    source: sourceDuPays(txt(p.pays)),
    lastActivityAt: plusRecente(
      dernier ? aMidi(dernier) : null,
      ...events.map((e) => e.occurredAt),
      jour(p.ajoute) ? aMidi(jour(p.ajoute)!) : null,
    ),
    data: {
      fichier: "prospects.json",
      ajoute: jour(p.ajoute),
      segment: txt(p.segment),
      langue: txt(p.langue),
      canal: txt(p.canal),
      campagne: txt(p.campagne),
      lien: txt(p.lien),
      score: typeof p.score === "number" ? p.score : null,
      signaux: Array.isArray(p.signaux) ? p.signaux.map(String) : txt(p.signaux),
      relances: typeof p.nb_relances === "number" ? p.nb_relances : null,
      noteAgent: txt(p.note),
      threadId: txt(p.thread_id),
      envois: Array.isArray(p.envois)
        ? (p.envois as Brut[]).map((e) => ({ type: txt(e.type), statut: txt(e.statut), envoye: txt(e.envoye), objet: txt(e.objet) }))
        : [],
    },
    events,
  };
}

function lireSansSite(p: Brut): FicheImportee | null {
  const id = txt(p.id);
  const name = txt(p.nom);
  if (!id || !name) return null;
  const ajoute = jour(p.ajoute);
  return {
    externalSource: "sans-site",
    externalId: id,
    name: name.slice(0, 200),
    contactName: null,
    email: null,
    phone: txt(p.tel),
    website: null,
    city: txt(p.ville),
    country: "La Réunion",
    sector: txt(p.metier),
    // Le fichier est la liste « à contacter par Emmanuel » : il ne porte pas
    // de statut. Celui posé ensuite dans Pilot n'est jamais écrasé (voir plus bas).
    status: "a_contacter",
    owner: "emmanuel",
    nextAction: null,
    nextActionOn: null,
    source: "google_maps",
    lastActivityAt: ajoute ? aMidi(ajoute) : null,
    data: {
      fichier: "sans-site.json",
      ajoute,
      placeId: txt(p.place),
      ficheGoogle: txt(p.fiche),
      avisGoogle: typeof p.avis === "number" ? p.avis : null,
      noteGoogle: typeof p.note === "number" ? p.note : null,
      presence: txt(p.presence),
      adresse: txt(p.adresse),
    },
    events: [],
  };
}

/* -------------------------------------------------------- rapprochement -- */

type Index = {
  clientsParNom: Map<string, string>;
  clientsParEmail: Map<string, string>;
};

/** Les clients de l'agence, par nom et par e-mail, pour relier un prospect qui l'est déjà. */
async function indexClients(): Promise<Index> {
  const [cl, comptes, cts] = await Promise.all([
    db.select({ id: clients.id, name: clients.name, shortName: clients.shortName }).from(clients),
    db.select({ email: users.email, clientId: users.clientId }).from(users).where(and(eq(users.role, "client"), isNotNull(users.clientId))),
    db.select({ reach: contacts.reach, clientId: contacts.clientId }).from(contacts).where(isNotNull(contacts.reach)),
  ]);
  const clientsParNom = new Map<string, string>();
  for (const c of cl) {
    for (const n of [c.name, c.shortName]) {
      const k = cleTexte(n);
      if (k.length >= 3) clientsParNom.set(k, c.id);
    }
  }
  const clientsParEmail = new Map<string, string>();
  for (const u of comptes) {
    const k = cleEmail(u.email);
    if (k && u.clientId) clientsParEmail.set(k, u.clientId);
  }
  for (const c of cts) {
    const k = cleEmail(c.reach);
    if (k) clientsParEmail.set(k, c.clientId);
  }
  return { clientsParNom, clientsParEmail };
}

async function trouverFiche(f: FicheImportee, index: Index): Promise<{ fiche: DirectoryEntry | null; clientId: string | null }> {
  const parRef = await db
    .select()
    .from(directoryEntries)
    .where(and(eq(directoryEntries.externalSource, f.externalSource), eq(directoryEntries.externalId, f.externalId)))
    .limit(1);
  if (parRef[0]) return { fiche: parRef[0], clientId: parRef[0].clientId };

  const email = cleEmail(f.email);
  if (email) {
    const [parEmail] = await db.select().from(directoryEntries).where(eq(directoryEntries.emailKey, email)).limit(1);
    if (parEmail) return { fiche: parEmail, clientId: parEmail.clientId };
  }
  const nomVille = cleNomVille(f.name, f.city);
  if (nomVille) {
    const [parNom] = await db.select().from(directoryEntries).where(eq(directoryEntries.nameKey, nomVille)).limit(1);
    if (parNom) return { fiche: parNom, clientId: parNom.clientId };
  }

  // Pas de fiche : c'est peut-être déjà un client de l'agence.
  const clientId = (email && index.clientsParEmail.get(email)) || index.clientsParNom.get(cleTexte(f.name)) || null;
  if (clientId) {
    const [duClient] = await db.select().from(directoryEntries).where(eq(directoryEntries.clientId, clientId)).limit(1);
    return { fiche: duClient ?? null, clientId };
  }
  return { fiche: null, clientId: null };
}

/** Une valeur importée ne remplace jamais une valeur connue par du vide. */
const garder = (nouvelle: string | null, ancienne: string | null) => nouvelle ?? ancienne;

async function ecrireFiche(f: FicheImportee, index: Index, maintenant: Date) {
  const { fiche, clientId } = await trouverFiche(f, index);
  const email = cleEmail(f.email);

  let entryId: string;
  let cree = false;
  if (!fiche) {
    const [row] = await db
      .insert(directoryEntries)
      .values({
        clientId,
        name: f.name,
        contactName: f.contactName,
        kind: clientId ? "client" : "prospect",
        source: f.source,
        activity: "agence",
        status: f.status,
        email: f.email,
        phone: f.phone,
        website: f.website,
        city: f.city,
        country: f.country,
        sector: f.sector,
        owner: f.owner,
        nextAction: f.nextAction,
        nextActionOn: f.nextActionOn,
        emailKey: email,
        nameKey: cleNomVille(f.name, f.city),
        externalSource: f.externalSource,
        externalId: f.externalId,
        data: f.data,
        lastActivityAt: f.lastActivityAt,
        importedAt: maintenant,
      })
      .returning({ id: directoryEntries.id });
    entryId = row.id;
    cree = true;
  } else {
    entryId = fiche.id;
    const relieeAuClient = Boolean(fiche.clientId || clientId);
    // Sans-site ne connaît que « à contacter » : un statut posé depuis (dans
    // Pilot ou par prospects.json) a plus d'information et reste.
    const status = f.externalSource === "sans-site" && fiche.status ? fiche.status : (f.status ?? fiche.status);
    const contactName = garder(f.contactName, fiche.contactName);
    const city = garder(f.city, fiche.city);
    const nouvelEmail = garder(f.email, fiche.email);
    await db
      .update(directoryEntries)
      .set({
        clientId: fiche.clientId ?? clientId,
        // Le nom d'un client est celui de son compte : l'import ne le renomme pas.
        name: relieeAuClient ? fiche.name : f.name,
        kind: relieeAuClient || fiche.kind !== "prospect" ? fiche.kind : "prospect",
        contactName,
        status,
        email: nouvelEmail,
        phone: garder(f.phone, fiche.phone),
        website: garder(f.website, fiche.website),
        city,
        country: garder(f.country, fiche.country),
        sector: garder(f.sector, fiche.sector),
        owner: garder(f.owner, fiche.owner),
        // La prochaine action vient du fichier tant que le fichier en donne une.
        nextAction: f.externalSource === "prospects" ? f.nextAction : fiche.nextAction,
        nextActionOn: f.externalSource === "prospects" ? f.nextActionOn : fiche.nextActionOn,
        emailKey: cleEmail(nouvelEmail),
        nameKey: cleNomVille(relieeAuClient ? fiche.name : f.name, city),
        externalSource: fiche.externalSource ?? f.externalSource,
        externalId: fiche.externalSource ? fiche.externalId : f.externalId,
        data: { ...(fiche.data ?? {}), ...f.data },
        lastActivityAt: plusRecente(fiche.lastActivityAt, f.lastActivityAt),
        importedAt: maintenant,
        updatedAt: maintenant,
      })
      .where(eq(directoryEntries.id, entryId));
  }

  // La frise : les lignes de l'historique, sans doublon, et celles retirées du
  // fichier disparaissent aussi (le fichier fait foi pour sa propre source).
  if (f.externalSource === "prospects") {
    const ids = f.events.map((e) => e.externalId);
    await db
      .delete(directoryEvents)
      .where(
        and(
          eq(directoryEvents.entryId, entryId),
          eq(directoryEvents.source, "agent_ventes"),
          ids.length ? notInArray(directoryEvents.externalId, ids) : sql`true`,
        ),
      );
    if (f.events.length) {
      await db
        .insert(directoryEvents)
        .values(
          f.events.map((e) => ({
            entryId,
            source: "agent_ventes",
            kind: e.kind,
            externalId: e.externalId,
            occurredAt: e.occurredAt,
            title: e.title,
          })),
        )
        .onConflictDoNothing();
    }
  }

  return { cree, relie: Boolean(clientId && !fiche?.clientId) };
}

/** Les noms que sans-site.json demande d'écarter (clients, partenaires). */
function exclusions(corps: Brut): Set<string> {
  const liste = Array.isArray(corps.exclure) ? corps.exclure : [];
  return new Set(liste.map((n) => cleTexte(String(n))).filter((n) => n.length >= 2));
}

export async function importer(corps: unknown, fichier: Fichier): Promise<BilanImport> {
  const brut = (corps ?? {}) as Brut;
  const liste = Array.isArray(brut.prospects) ? (brut.prospects as Brut[]) : [];
  const bilan: BilanImport = {
    fichier,
    recues: liste.length,
    creees: 0,
    misesAJour: 0,
    ignorees: 0,
    relieesAUnClient: 0,
    evenements: 0,
    erreurs: [],
  };
  const exclus = fichier === "sans-site" ? exclusions(brut) : new Set<string>();
  const index = await indexClients();
  const maintenant = new Date();
  const vus = new Set<string>();

  for (const p of liste) {
    const f = fichier === "prospects" ? lireProspect(p) : lireSansSite(p);
    if (!f || vus.has(f.externalId) || exclus.has(cleTexte(f.name))) {
      bilan.ignorees += 1;
      continue;
    }
    vus.add(f.externalId);
    try {
      const r = await ecrireFiche(f, index, maintenant);
      if (r.cree) bilan.creees += 1;
      else bilan.misesAJour += 1;
      if (r.relie) bilan.relieesAUnClient += 1;
      bilan.evenements += f.events.length;
    } catch (e) {
      // Une fiche en erreur n'arrête pas les autres ; l'identifiant suffit à la retrouver.
      console.error("[pilot] import annuaire", f.externalId, e);
      bilan.erreurs.push(f.externalId);
    }
  }
  return bilan;
}

/** Combien de fiches chaque fichier a déjà alimentées, pour Réglages. */
export async function etatImports() {
  const rows = await db
    .select({
      source: directoryEntries.externalSource,
      n: sql<number>`count(*)::int`,
      dernier: sql<string | null>`max(${directoryEntries.importedAt})::text`,
    })
    .from(directoryEntries)
    .where(inArray(directoryEntries.externalSource, ["prospects", "sans-site"]))
    .groupBy(directoryEntries.externalSource);
  return rows;
}
