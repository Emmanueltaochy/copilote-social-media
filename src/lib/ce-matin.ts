import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import {
  clients,
  comments,
  contents,
  db,
  directoryEntries,
  invoices,
  quoteRequests,
  users,
  webDeliverables,
  webProjects,
} from "@/db";
import { correspondances } from "@/db/annuaire-queries";
import { abbyRaccorde, devisSignesNonFactures, facturesEnAttente, type AbbyDoc } from "@/lib/abby";
import { cleEmail, cleTexte, jourRelatif } from "@/lib/annuaire";

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
 * Les e-mails (étape 2) et Trello (étape 3) ne sont pas encore lus : le bloc
 * le dit, au lieu de laisser croire qu'il n'y a rien.
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
 */
export const REGLES = {
  reponseProspectFraicheJours: 7,
  devisUrgentApresHeures: 48,
  commentaireUrgentApresHeures: 24,
  validationRelanceApresJours: 3,
  devisEnCoursRelanceApresJours: 7,
} as const;

export type Urgence = "urgent" | "attendre";

export type LigneMatin = {
  key: string;
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
};

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

export async function aRepondre(now: Date, scopeId?: string): Promise<LigneMatin[]> {
  const today = aujourdhuiReunion(now);
  const [noms, repondu, devis, commentairesClients] = await Promise.all([
    nomsCourts(),
    db.select().from(directoryEntries).where(eq(directoryEntries.status, "repondu")),
    db
      .select({ id: quoteRequests.id, at: quoteRequests.createdAt, subject: quoteRequests.subject, clientId: quoteRequests.clientId, client: clients.shortName })
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
  ]);

  const lignes: LigneMatin[] = [];

  for (const p of repondu) {
    const derniere = p.lastActivityAt;
    const fraiche = derniere !== null && now.getTime() - derniere.getTime() < REGLES.reponseProspectFraicheJours * JOUR;
    const suitePrevue = p.nextActionOn !== null && p.nextActionOn > today;
    const attendre = !fraiche && suitePrevue;
    lignes.push({
      key: "p" + p.id,
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
      key: "d" + d.id,
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
    lignes.push({
      key: "c" + c.id,
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
      key: "fa" + f.id,
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
      key: "fp" + inv.id,
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
      key: "ds" + d.id,
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
      key: "na" + p.id,
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
      key: "va" + v.clientId,
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
      key: "lv" + r.id,
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
      key: "wp" + p.id,
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
      key: "dc" + d.id,
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
