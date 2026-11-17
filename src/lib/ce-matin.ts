import "server-only";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  ceMatinArchives,
  clients,
  comments,
  contents,
  db,
  directoryEntries,
  directoryEvents,
  invoices,
  quoteRequests,
  users,
  webDeliverables,
  webProjects,
} from "@/db";
import { correspondances } from "@/db/annuaire-queries";
import { abbyRaccorde, devisSignesNonFactures, facturesEnAttente, type AbbyDoc } from "@/lib/abby";
import { cleEmail, cleTexte, jourRelatif } from "@/lib/annuaire";
import { canSeeEmails, canSeeMoney, departmentsOf } from "@/lib/auth";
import { etatGmail } from "@/lib/gmail";
import { motUrgent } from "@/lib/gmail-regles";
import type { User } from "@/db";

/*
 * « Ce matin » : ce qu'Emmanuel doit savoir en ouvrant Pilot.
 *
 * Trois questions, et seulement ce qu'on sait vraiment :
 *   1. À qui répondre ?      — prospects qui ont répondu, commentaires du
 *                              portail sans réponse, demandes de devis.
 *   2. Quel argent dort ?    — factures impayées ou en retard, devis signés
 *                              sans facture.
 *   3. Que faire, et pour qui ? — prochaines actions datées, validations qui
 *                              traînent, retours clients à reprendre.
 *
 * Les e-mails sans réponse (Gmail, étape 2) s'ajoutent à « À répondre » pour
 * la direction seulement. Trello (étape 3) n'est pas encore lu : le bloc le
 * dit, au lieu de laisser croire qu'il n'y a rien. Gmail non relié aussi.
 */

/* --------------------------------------------------- règles d'urgence -- */

/**
 * Les règles « urgent / peut attendre », volontairement simples pour être
 * expliquées en une phrase à côté de chaque ligne.
 *
 * - Un prospect qui a répondu est **urgent** si sa réponse a moins de 7 jours,
 *   ou si aucune suite n'est datée. Il **peut attendre** quand l'échange date
 *   de plus de 7 jours et qu'une prochaine étape est déjà prévue plus tard
 *   (« reprendre contact dans deux mois ») : on lui a déjà répondu.
 * - Une demande de devis non traitée devient **urgente** après 2 jours.
 * - Un commentaire de client sur le portail, sans réponse de l'équipe,
 *   devient **urgent** après 24 heures.
 * - Un e-mail sans réponse (Gmail) est **urgent** :
 *     · s'il vient d'un client sous contrat (compte client actif) ou d'un
 *       prospect qui a répondu (à un e-mail d'Emmanuel dans le même fil, ou
 *       fiche à l'étape « a répondu », « rendez-vous » ou « devis ») et
 *       attend depuis plus de 24 heures ;
 *     · ou si son objet ou son extrait contient un mot d'urgence ou d'argent
 *       (urgent, problème, bug, panne, facture, paiement, devis, rendez-vous,
 *       rappeler — voir MOTS_URGENTS dans gmail-regles.ts).
 *   Sinon il **peut attendre**. Pas d'IA : la règle tient en une phrase,
 *   affichée sur chaque ligne.
 */
export const REGLES = {
  reponseProspectFraicheJours: 7,
  devisUrgentApresHeures: 48,
  commentaireUrgentApresHeures: 24,
  validationRelanceApresJours: 3,
  devisEnCoursRelanceApresJours: 7,
  emailUrgentApresHeures: 24,
} as const;

export type Urgence = "urgent" | "attendre";

export type LigneMatin = {
  /** Clé stable : type + identifiant de l'objet (voir « Traité » plus bas). */
  key: string;
  /** L'empreinte de ce qui rendrait la ligne nouvelle (voir « Traité »). */
  etat: string;
  href: string;
  /** Le client ou le prospect concerné. */
  qui: string;
  titre: string;
  meta: string;
  urgence?: Urgence;
  /** La règle appliquée, en clair. */
  raison?: string;
  montantCents?: number;
  ton?: "alert" | "warn" | "info" | "neutral";
  clientId?: string | null;
  /** Archivée puis revenue d'elle-même : du nouveau depuis cet archivage. */
  retour?: Archivage;
  /** Archivée (liste « Voir les archivés ») : par qui, quand. */
  archive?: Archivage;
};

export type Archivage = { par: string | null; le: string };

const HEURE = 3_600_000;
const JOUR = 24 * HEURE;

/** La date du jour à La Réunion (UTC+4), au format AAAA-MM-JJ. */
export function aujourdhuiReunion(now = new Date()): string {
  return new Date(now.getTime() + 4 * HEURE).toISOString().slice(0, 10);
}

const joursEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / JOUR);
const ilYa = (d: Date, now: Date) => {
  const h = Math.floor((now.getTime() - d.getTime()) / HEURE);
  if (h < 1) return "il y a moins d'une heure";
  if (h < 48) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} jours`;
};
const dateCourte = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

/** Le nom court des clients : une fiche reliée à un client s'affiche sous ce nom. */
async function nomsCourts(): Promise<Map<string, string>> {
  const rows = await db.select({ id: clients.id, short: clients.shortName }).from(clients);
  return new Map(rows.map((r) => [r.id, r.short]));
}

/* ------------------------------------------------------------ à répondre -- */

export async function aRepondre(now: Date, scopeId?: string, opts: { emails?: boolean } = {}): Promise<LigneMatin[]> {
  const today = aujourdhuiReunion(now);
  const [noms, repondu, devis, commentairesClients, emails] = await Promise.all([
    nomsCourts(),
    db.select().from(directoryEntries).where(eq(directoryEntries.status, "repondu")),
    db
      .select({
        id: quoteRequests.id,
        at: quoteRequests.createdAt,
        maj: quoteRequests.updatedAt,
        subject: quoteRequests.subject,
        clientId: quoteRequests.clientId,
        client: clients.shortName,
      })
      .from(quoteRequests)
      .innerJoin(clients, eq(clients.id, quoteRequests.clientId))
      .where(eq(quoteRequests.status, "nouvelle")),
    // Le dernier commentaire de chaque contenu, s'il vient d'un compte client
    // et n'est pas résolu : personne de l'équipe n'a écrit après lui.
    db
      .select({
        id: comments.id,
        at: comments.createdAt,
        body: comments.body,
        contentId: comments.contentId,
        title: contents.title,
        clientId: contents.clientId,
        client: clients.shortName,
        role: users.role,
      })
      .from(comments)
      .innerJoin(contents, eq(contents.id, comments.contentId))
      .innerJoin(clients, eq(clients.id, contents.clientId))
      .innerJoin(users, eq(users.id, comments.authorId))
      .where(
        and(
          isNull(comments.resolvedAt),
          eq(users.role, "client"),
          sql`not exists (select 1 from ${comments} c2 where c2.content_id = ${comments.contentId} and c2.created_at > ${comments.createdAt})`,
        ),
      ),
    opts.emails ? emailsSansReponse(now) : Promise.resolve([] as LigneMatin[]),
  ]);

  const lignes: LigneMatin[] = [...emails];

  for (const p of repondu) {
    const derniere = p.lastActivityAt;
    const fraiche = derniere !== null && now.getTime() - derniere.getTime() < REGLES.reponseProspectFraicheJours * JOUR;
    const suitePrevue = p.nextActionOn !== null && p.nextActionOn > today;
    const attendre = !fraiche && suitePrevue;
    lignes.push({
      key: `prospect-repondu:${p.id}`,
      etat: derniere?.toISOString() ?? "",
      href: `/contacts/${p.clientId ?? p.id}`,
      qui: (p.clientId && noms.get(p.clientId)) || p.name,
      titre: p.contactName ? `${p.contactName} a répondu à l'agent ventes` : "A répondu à l'agent ventes",
      meta: [p.city, derniere ? `dernier échange ${jourRelatif(derniere, now)}` : null].filter(Boolean).join(" · "),
      urgence: attendre ? "attendre" : "urgent",
      raison: attendre
        ? `Échange de plus de 7 jours, suite prévue le ${dateCourte(p.nextActionOn!)}`
        : fraiche
          ? "A répondu il y a moins de 7 jours"
          : "A répondu et aucune suite n'est datée",
      clientId: p.clientId,
    });
  }

  for (const d of devis) {
    const age = now.getTime() - d.at.getTime();
    const urgent = age >= REGLES.devisUrgentApresHeures * HEURE;
    lignes.push({
      key: `devis-demande:${d.id}`,
      etat: d.maj.toISOString(),
      href: `/contacts/${d.clientId}`,
      qui: d.client,
      titre: `Demande de devis : « ${d.subject} »`,
      meta: `Arrivée du portail ${ilYa(d.at, now)}`,
      urgence: urgent ? "urgent" : "attendre",
      raison: urgent ? "Non traitée depuis plus de 2 jours" : "Arrivée il y a moins de 2 jours",
      clientId: d.clientId,
    });
  }

  for (const c of commentairesClients) {
    const age = now.getTime() - c.at.getTime();
    const urgent = age >= REGLES.commentaireUrgentApresHeures * HEURE;
    // Une ligne par contenu : un nouveau commentaire du client la fait revenir.
    lignes.push({
      key: `commentaire:${c.contentId}`,
      etat: c.id,
      href: `/contenu/${c.contentId}`,
      qui: c.client,
      titre: `Commentaire sur « ${c.title} »`,
      meta: `« ${c.body.slice(0, 90)}${c.body.length > 90 ? "…" : ""} » · ${ilYa(c.at, now)}`,
      urgence: urgent ? "urgent" : "attendre",
      raison: urgent ? "Sans réponse de l'équipe depuis plus de 24 h" : "Posté il y a moins de 24 h",
      clientId: c.clientId,
    });
  }

  const visibles = scopeId ? lignes.filter((l) => l.clientId === scopeId) : lignes;
  return visibles.sort((a, b) => (a.urgence === b.urgence ? 0 : a.urgence === "urgent" ? -1 : 1));
}

/**
 * Les e-mails sans réponse (Gmail), un par fil : le dernier message reçu, que
 * personne n'a suivi d'une réponse (calcul dans lib/gmail.ts). La clé est
 * `email:<fil>` et l'empreinte le Message-ID de ce dernier message reçu : un
 * nouveau message du contact dans le fil fait revenir une ligne archivée.
 */
async function emailsSansReponse(now: Date): Promise<LigneMatin[]> {
  const rows = await db
    .select({
      id: directoryEvents.id,
      at: directoryEvents.occurredAt,
      objet: directoryEvents.title,
      extrait: directoryEvents.body,
      externalId: directoryEvents.externalId,
      meta: directoryEvents.meta,
      entryId: directoryEntries.id,
      nom: directoryEntries.name,
      kind: directoryEntries.kind,
      status: directoryEntries.status,
      clientId: directoryEntries.clientId,
      client: clients.shortName,
      clientActif: clients.active,
      clientArchive: clients.archivedAt,
    })
    .from(directoryEvents)
    .innerJoin(directoryEntries, eq(directoryEntries.id, directoryEvents.entryId))
    .leftJoin(clients, eq(clients.id, directoryEntries.clientId))
    .where(and(eq(directoryEvents.source, "gmail"), eq(directoryEvents.kind, "email_entrant"), eq(directoryEvents.awaitingReply, true)))
    .orderBy(desc(directoryEvents.occurredAt));

  // Un fil, une ligne : le message reçu le plus récent.
  const parFil = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const fil = String((r.meta as Record<string, unknown>).fil ?? r.id);
    if (!parFil.has(fil)) parFil.set(fil, r);
  }
  const fils = [...parFil.keys()];
  // Les fils où Emmanuel avait écrit : le prospect y a répondu.
  const avecEnvoi = new Set(
    fils.length
      ? (
          await db
            .selectDistinct({ fil: sql<string>`${directoryEvents.meta}->>'fil'` })
            .from(directoryEvents)
            .where(and(eq(directoryEvents.source, "gmail"), eq(directoryEvents.kind, "email_sortant"), inArray(sql`${directoryEvents.meta}->>'fil'`, fils)))
        ).map((r) => r.fil)
      : [],
  );

  const lignes: LigneMatin[] = [];
  for (const [fil, r] of parFil) {
    const meta = r.meta as { de?: { nom?: string | null; email?: string } | null; messageId?: string | null };
    const age = now.getTime() - r.at.getTime();
    const vieux = age > REGLES.emailUrgentApresHeures * HEURE;
    const sousContrat = Boolean(r.clientId && r.clientActif && !r.clientArchive);
    const prospectRepondu = !r.clientId && r.kind === "prospect" && (avecEnvoi.has(fil) || ["repondu", "rdv", "devis"].includes(r.status ?? ""));
    const mot = motUrgent(`${r.objet} ${r.extrait ?? ""}`);
    const urgent = Boolean(mot) || ((sousContrat || prospectRepondu) && vieux);
    const qui = sousContrat ? "Client sous contrat" : prospectRepondu ? "Prospect qui a répondu" : null;
    const raison = mot
      ? `Contient « ${mot} »${qui && vieux ? ` · ${qui.toLowerCase()}, sans réponse depuis plus de 24\u00a0h` : ""}`
      : qui && vieux
        ? `${qui}, sans réponse depuis plus de 24\u00a0h`
        : qui
          ? `${qui}, reçu il y a moins de 24\u00a0h`
          : "Ni client sous contrat ni prospect ayant répondu, aucun mot d'urgence";
    const auteur = meta.de?.nom || meta.de?.email || "le contact";
    lignes.push({
      key: `email:${fil}`,
      etat: meta.messageId ?? r.externalId,
      href: `/contacts/${r.clientId ?? r.entryId}?emails=sans-reponse#emails`,
      qui: (r.clientId && r.client) || r.nom,
      titre: `E-mail : « ${r.objet} »`,
      meta: `Sans réponse depuis ${depuis(r.at, now)} · de ${auteur}`,
      urgence: urgent ? "urgent" : "attendre",
      raison,
      clientId: r.clientId,
    });
  }
  return lignes;
}

/** « 3 j », « 5 h », « moins d'une heure ». */
export function depuis(d: Date, now: Date): string {
  const h = Math.floor((now.getTime() - d.getTime()) / HEURE);
  if (h < 1) return "moins d'une heure";
  if (h < 24) return `${h}\u00a0h`;
  return `${Math.floor(h / 24)}\u00a0j`;
}

/* ------------------------------------------------------ argent qui dort -- */

export type ArgentQuiDort = {
  abby: "raccorde" | "non_raccorde" | "erreur";
  erreurAbby: string | null;
  retardCents: number;
  impayesCents: number;
  devisCents: number;
  totalCents: number;
  lignes: LigneMatin[];
};

/** Relie un client Abby (identifiant, e-mail, nom) à une fiche de l'annuaire. */
async function relierAbby() {
  const { clients: cl, fiches, comptes } = await correspondances();
  type Cible = { href: string; clientId: string | null; nom: string | null };
  const parAbby = new Map<string, Cible>();
  const parEmail = new Map<string, Cible>();
  const parNom = new Map<string, Cible>();
  const nomDuClient = new Map(cl.map((c) => [c.id, c.shortName]));
  for (const f of fiches) {
    const cible = { href: `/contacts/${f.clientId ?? f.id}`, clientId: f.clientId, nom: f.clientId ? (nomDuClient.get(f.clientId) ?? f.name) : f.name };
    if (f.abby) parAbby.set(f.abby, cible);
    if (f.emailKey) parEmail.set(f.emailKey, cible);
    if (!f.clientId) parNom.set(cleTexte(f.name), cible);
  }
  for (const c of comptes) {
    const k = cleEmail(c.email);
    if (k && c.clientId) parEmail.set(k, { href: `/contacts/${c.clientId}`, clientId: c.clientId, nom: nomDuClient.get(c.clientId) ?? null });
  }
  for (const c of cl) {
    const cible = { href: `/contacts/${c.id}`, clientId: c.id, nom: c.shortName };
    if (c.abby) parAbby.set(c.abby, cible);
    parNom.set(cleTexte(c.name), cible);
    parNom.set(cleTexte(c.shortName), cible);
  }
  return (d: AbbyDoc): Cible =>
    parAbby.get(d.customerId) ??
    (cleEmail(d.customerEmail) ? parEmail.get(cleEmail(d.customerEmail)!) : undefined) ??
    parNom.get(cleTexte(d.customerName)) ?? {
      href: `/contacts?q=${encodeURIComponent(d.customerName)}`,
      clientId: null,
      nom: null,
    };
}

export async function argentQuiDort(now: Date, scopeId?: string): Promise<ArgentQuiDort> {
  const today = aujourdhuiReunion(now);
  const pilot = await db
    .select({ inv: invoices, client: clients.shortName })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .where(isNull(invoices.paidOn))
    .orderBy(asc(invoices.dueOn));

  let abby: ArgentQuiDort["abby"] = "non_raccorde";
  let erreurAbby: string | null = null;
  let factures: AbbyDoc[] = [];
  let devis: AbbyDoc[] = [];
  if (await abbyRaccorde()) {
    try {
      [factures, devis] = await Promise.all([facturesEnAttente(), devisSignesNonFactures()]);
      abby = "raccorde";
    } catch (e) {
      abby = "erreur";
      erreurAbby = (e as Error).message;
    }
  }
  const cible = abby === "raccorde" ? await relierAbby() : null;

  const lignes: LigneMatin[] = [];
  const numerosAbby = new Set(factures.map((f) => f.number));

  for (const f of factures) {
    const c = cible!(f);
    const montant = f.remainingCents ?? f.amountCents;
    const enRetard = f.dueAt ? f.dueAt.getTime() < now.getTime() : false;
    lignes.push({
      key: `facture:${f.number}`,
      etat: `${montant}|${f.dueAt?.toISOString().slice(0, 10) ?? ""}`,
      href: c.href,
      qui: c.nom ?? (f.customerName || "Client Abby"),
      titre: `Facture ${f.number}${f.title ? ` · ${f.title}` : ""}`,
      meta: enRetard
        ? `En retard depuis le ${f.dueAt!.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`
        : f.dueAt
          ? `Échéance le ${f.dueAt.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`
          : "Impayée (échéance non précisée)",
      montantCents: montant,
      ton: enRetard ? "alert" : "warn",
      clientId: c.clientId,
    });
  }
  // Les factures déposées dans Pilot, sauf celles qu'Abby connaît déjà sous le
  // même numéro : une facture ne compte qu'une fois.
  for (const { inv, client } of pilot) {
    if (numerosAbby.has(inv.number)) continue;
    const enRetard = inv.dueOn !== null && inv.dueOn < today;
    lignes.push({
      key: `facture-pilot:${inv.id}`,
      etat: `${inv.amountCents}|${inv.dueOn ?? ""}`,
      href: `/contacts/${inv.clientId}`,
      qui: client,
      titre: `Facture ${inv.number}${inv.label ? ` · ${inv.label}` : ""}`,
      meta: enRetard
        ? `En retard de ${joursEntre(inv.dueOn!, today)} j (échéance ${dateCourte(inv.dueOn!)})`
        : inv.dueOn
          ? `Échéance le ${dateCourte(inv.dueOn)}`
          : `Émise le ${dateCourte(inv.issuedOn)}, sans échéance`,
      montantCents: inv.amountCents,
      ton: enRetard ? "alert" : "warn",
      clientId: inv.clientId,
    });
  }
  for (const d of devis) {
    const c = cible!(d);
    const reste = d.amountCents - d.advancesCents;
    lignes.push({
      key: `devis-signe:${d.number}`,
      etat: String(reste),
      href: c.href,
      qui: c.nom ?? (d.customerName || "Client Abby"),
      titre: `Devis ${d.number} signé, pas encore facturé`,
      meta: [
        d.signedAt ? `Signé le ${d.signedAt.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}` : "Signé",
        d.advancesCents > 0 ? "acompte déjà facturé" : null,
      ]
        .filter(Boolean)
        .join(" · "),
      montantCents: reste,
      ton: "info",
      clientId: c.clientId,
    });
  }

  const visibles = scopeId ? lignes.filter((l) => l.clientId === scopeId) : lignes;
  const somme = (pred: (l: LigneMatin) => boolean) => visibles.filter(pred).reduce((t, l) => t + (l.montantCents ?? 0), 0);
  const retardCents = somme((l) => l.ton === "alert");
  const impayesCents = somme((l) => l.ton === "warn");
  const devisCents = somme((l) => l.ton === "info");
  const ordre = { alert: 0, warn: 1, info: 2, neutral: 3 };
  return {
    abby,
    erreurAbby,
    retardCents,
    impayesCents,
    devisCents,
    totalCents: retardCents + impayesCents + devisCents,
    lignes: visibles.sort((a, b) => ordre[a.ton ?? "neutral"] - ordre[b.ton ?? "neutral"] || (b.montantCents ?? 0) - (a.montantCents ?? 0)),
  };
}

/* --------------------------------------------------------------- actions -- */

/**
 * Les prochaines actions qu'on peut déduire des données, par client :
 * prochaine étape datée (aujourd'hui ou en retard), contenus qui attendent la
 * validation du client depuis 3 jours, retours de maquette à reprendre, mise
 * en ligne dépassée, devis « en cours » depuis une semaine.
 */
export async function actions(now: Date, scopeId?: string): Promise<LigneMatin[]> {
  const today = aujourdhuiReunion(now);
  const [noms, prochaines, validations, retours, retards, devisEnCours] = await Promise.all([
    nomsCourts(),
    db
      .select()
      .from(directoryEntries)
      .where(
        and(
          sql`${directoryEntries.nextActionOn} <= ${today}`,
          sql`coalesce(${directoryEntries.status}, '') not in ('perdu', 'gagne')`,
        ),
      ),
    db
      .select({
        clientId: contents.clientId,
        client: clients.shortName,
        n: sql<number>`count(*)::int`,
        depuis: sql<string>`min(${contents.submittedAt})::text`,
        dernier: sql<string>`max(${contents.submittedAt})::text`,
      })
      .from(contents)
      .innerJoin(clients, eq(clients.id, contents.clientId))
      .where(
        and(
          eq(contents.status, "validation"),
          sql`${contents.submittedAt} < now() - interval '${sql.raw(String(REGLES.validationRelanceApresJours))} days'`,
        ),
      )
      .groupBy(contents.clientId, clients.shortName),
    db
      .select({ id: webDeliverables.id, label: webDeliverables.label, projectId: webProjects.id, clientId: webProjects.clientId, client: clients.shortName, at: webDeliverables.respondedAt })
      .from(webDeliverables)
      .innerJoin(webProjects, eq(webProjects.id, webDeliverables.projectId))
      .innerJoin(clients, eq(clients.id, webProjects.clientId))
      .where(eq(webDeliverables.status, "modifications")),
    db
      .select({ id: webProjects.id, name: webProjects.name, dueAt: webProjects.dueAt, clientId: webProjects.clientId, client: clients.shortName })
      .from(webProjects)
      .innerJoin(clients, eq(clients.id, webProjects.clientId))
      .where(
        and(
          isNull(webProjects.launchedAt),
          sql`${webProjects.dueAt} < now()`,
          sql`${webProjects.phase} not in ('en_ligne', 'maintenance')`,
        ),
      ),
    db
      .select({ id: quoteRequests.id, subject: quoteRequests.subject, clientId: quoteRequests.clientId, client: clients.shortName, at: quoteRequests.updatedAt })
      .from(quoteRequests)
      .innerJoin(clients, eq(clients.id, quoteRequests.clientId))
      .where(
        and(
          eq(quoteRequests.status, "en_cours"),
          sql`${quoteRequests.updatedAt} < now() - interval '${sql.raw(String(REGLES.devisEnCoursRelanceApresJours))} days'`,
        ),
      ),
  ]);

  const lignes: LigneMatin[] = [];
  for (const p of prochaines) {
    const retard = joursEntre(p.nextActionOn!, today);
    lignes.push({
      key: `action:prochaine-etape:${p.id}`,
      etat: `${p.nextActionOn}|${p.nextAction ?? ""}`,
      href: `/contacts/${p.clientId ?? p.id}`,
      qui: (p.clientId && noms.get(p.clientId)) || p.name,
      titre: p.nextAction ?? "Prochaine étape à définir",
      meta: retard === 0 ? "Prévu aujourd'hui" : `Prévu le ${dateCourte(p.nextActionOn!)} · en retard de ${retard} j`,
      ton: retard > 0 ? "warn" : "info",
      clientId: p.clientId,
    });
  }
  for (const v of validations) {
    const jours = Math.floor((now.getTime() - Date.parse(v.depuis)) / JOUR);
    lignes.push({
      key: `action:validation:${v.clientId}`,
      etat: v.dernier,
      href: `/contacts/${v.clientId}`,
      qui: v.client,
      titre: `Relancer pour ${v.n > 1 ? `${v.n} contenus` : "1 contenu"} en attente de validation`,
      meta: `Le plus ancien attend depuis ${jours} jours`,
      ton: "warn",
      clientId: v.clientId,
    });
  }
  for (const r of retours) {
    lignes.push({
      key: `action:retour-livrable:${r.id}`,
      etat: r.at?.toISOString() ?? "",
      href: `/web/${r.projectId}`,
      qui: r.client,
      titre: `Reprendre « ${r.label} » : modifications demandées`,
      meta: r.at ? `Retour du client ${ilYa(r.at, now)}` : "Retour du client",
      ton: "warn",
      clientId: r.clientId,
    });
  }
  for (const p of retards) {
    lignes.push({
      key: `action:mise-en-ligne:${p.id}`,
      etat: p.dueAt?.toISOString() ?? "",
      href: `/web/${p.id}`,
      qui: p.client,
      titre: `Mise en ligne de « ${p.name} » dépassée`,
      meta: p.dueAt ? `Prévue le ${p.dueAt.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : "",
      ton: "alert",
      clientId: p.clientId,
    });
  }
  for (const d of devisEnCours) {
    lignes.push({
      key: `action:devis-en-cours:${d.id}`,
      etat: d.at.toISOString(),
      href: `/contacts/${d.clientId}`,
      qui: d.client,
      titre: `Envoyer le devis « ${d.subject} »`,
      meta: `En cours depuis ${ilYa(d.at, now).replace("il y a ", "")}`,
      ton: "info",
      clientId: d.clientId,
    });
  }

  const visibles = scopeId ? lignes.filter((l) => l.clientId === scopeId) : lignes;
  const ordre = { alert: 0, warn: 1, info: 2, neutral: 3 };
  // Ce qui est bloquant d'abord, puis les clients de l'agence avant les
  // prospects (ils paient déjà), puis le retard ; regroupées par nom à l'écran.
  const rang = (l: LigneMatin) => (l.ton === "alert" ? 0 : l.clientId ? 1 : 2);
  return visibles.sort(
    (a, b) => rang(a) - rang(b) || ordre[a.ton ?? "neutral"] - ordre[b.ton ?? "neutral"] || a.qui.localeCompare(b.qui, "fr"),
  );
}

/* ---------------------------------------------------------------- traité -- */

/**
 * « Traité » : archiver une ligne du bloc, pour toute l'équipe.
 *
 * Chaque ligne a une clé stable (type + identifiant de l'objet) et une
 * empreinte (`etat`) : ce qui, en changeant, ferait d'elle une nouvelle chose
 * à traiter. L'archivage enregistre la clé et l'empreinte du moment.
 *
 * LA RÈGLE : une ligne archivée reste cachée tant que son empreinte est la
 * même qu'au moment de l'archivage. Dès qu'elle change, la ligne revient
 * d'elle-même, marquée « Du nouveau depuis l'archivage », sans que personne
 * n'ait à la rétablir. Une ligne qui sort des données (facture payée,
 * prospect passé à « gagné », devis traité) sort aussi des archivés.
 *
 * Ce qui fait revenir chaque ligne :
 *   - prospect-repondu:<fiche>          une nouvelle réponse (date du dernier échange) ;
 *   - devis-demande:<demande>           la demande modifiée (date de mise à jour) ;
 *   - commentaire:<contenu>             un nouveau commentaire du client sur ce contenu ;
 *   - facture:<numéro Abby>             le montant restant ou l'échéance qui change ;
 *   - facture-pilot:<facture>           le montant ou l'échéance qui change ;
 *   - devis-signe:<numéro Abby>         le reste à facturer qui change (nouvel acompte…) ;
 *   - action:prochaine-etape:<fiche>    une nouvelle prochaine étape ou une nouvelle date ;
 *   - action:validation:<client>        un nouveau contenu envoyé en validation ;
 *   - action:retour-livrable:<livrable> un nouveau retour du client ;
 *   - action:mise-en-ligne:<projet>     une nouvelle date de mise en ligne ;
 *   - action:devis-en-cours:<demande>   la demande modifiée ;
 *   - email:<fil>                       un nouveau message reçu dans le fil (Message-ID).
 *
 * Qui peut archiver : un compte de l'agence qui voit l'accueil (pôle social),
 * et seulement les lignes qu'il voit déjà — mêmes requêtes, même filtrage par
 * pôle. « Argent qui dort » et les e-mails restent réservés à la direction. Rien n'est jamais
 * écrit dans Abby : la facture reste due, elle ne s'affiche plus ici.
 */
export type ColonneMatin = "repondre" | "argent" | "actions";

export const colonneDe = (key: string): ColonneMatin | null =>
  /^(prospect-repondu|devis-demande|commentaire|email):/.test(key)
    ? "repondre"
    : /^(facture|facture-pilot|devis-signe):/.test(key)
      ? "argent"
      : key.startsWith("action:")
        ? "actions"
        : null;

export type Partage = { lignes: LigneMatin[]; archivees: LigneMatin[] };

export type CeMatin = {
  repondre: Partage;
  /**
   * Gmail, pour la direction : relié (et lu), pas relié, ou en erreur. null :
   * cette personne ne voit pas les e-mails.
   */
  gmail: { etat: "relie" | "non_relie" | "erreur"; erreur: string | null } | null;
  /** null : l'argent n'est pas montré à cette personne. */
  argent: (Partage & Pick<ArgentQuiDort, "abby" | "erreurAbby">) | null;
  actions: Partage;
};

/** Les clients qu'un membre de l'équipe voit (même règle que l'annuaire). */
async function clientsVisibles(user: Pick<User, "role" | "departments">): Promise<Set<string>> {
  const poles = departmentsOf(user);
  const rows = await db.select({ id: clients.id, departments: clients.departments }).from(clients);
  return new Set(
    rows.filter((c) => (c.departments?.length ? c.departments : ["social"]).some((d) => poles.includes(d as "social" | "web"))).map((c) => c.id),
  );
}

/**
 * Le bloc tel que cette personne le voit : les lignes à traiter et les lignes
 * archivées, colonne par colonne. L'affichage et les boutons « Traité » /
 * « Rétablir » passent tous par ici : on ne peut agir que sur ce qu'on voit.
 */
export async function ceMatin(
  user: Pick<User, "role" | "departments">,
  now: Date,
  scopeId?: string,
  colonnes: ColonneMatin[] = ["repondre", "argent", "actions"],
): Promise<CeMatin> {
  const voirArgent = canSeeMoney(user) && colonnes.includes("argent");
  const voirEmails = canSeeEmails(user) && colonnes.includes("repondre");
  const vide = Promise.resolve([] as LigneMatin[]);
  const [visibles, archives, repondre, argent, aFaire, gmail] = await Promise.all([
    clientsVisibles(user),
    db
      .select({ key: ceMatinArchives.key, state: ceMatinArchives.state, at: ceMatinArchives.archivedAt, par: users.name })
      .from(ceMatinArchives)
      .leftJoin(users, eq(users.id, ceMatinArchives.archivedBy)),
    colonnes.includes("repondre") ? aRepondre(now, scopeId, { emails: voirEmails }) : vide,
    voirArgent ? argentQuiDort(now, scopeId) : Promise.resolve(null),
    colonnes.includes("actions") ? actions(now, scopeId) : vide,
    voirEmails ? etatGmail() : Promise.resolve(null),
  ]);
  const parCle = new Map(archives.map((a) => [a.key, a]));

  const partager = (lignes: LigneMatin[]): Partage => {
    const out: Partage = { lignes: [], archivees: [] };
    for (const l of lignes) {
      if (l.clientId && !visibles.has(l.clientId)) continue;
      const a = parCle.get(l.key);
      if (!a) out.lignes.push(l);
      else if (a.state === l.etat) out.archivees.push({ ...l, archive: { par: a.par, le: a.at.toISOString() } });
      else out.lignes.push({ ...l, retour: { par: a.par, le: a.at.toISOString() } });
    }
    // Le dernier archivé en premier.
    out.archivees.sort((x, y) => y.archive!.le.localeCompare(x.archive!.le));
    return out;
  };

  return {
    repondre: partager(repondre),
    gmail: gmail
      ? {
          etat: !gmail.relie ? "non_relie" : gmail.derniereErreur || gmail.illisible ? "erreur" : "relie",
          erreur: gmail.illisible ? "mot de passe à recoller dans Réglages" : gmail.derniereErreur,
        }
      : null,
    argent: argent ? { ...partager(argent.lignes), abby: argent.abby, erreurAbby: argent.erreurAbby } : null,
    actions: partager(aFaire),
  };
}

/** Le libellé gardé avec l'archive, pour la trace. */
export const libelle = (l: LigneMatin) => `${l.qui} · ${l.titre}`.slice(0, 300);
