import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { db, directoryEvents, type DirectoryEntry } from "@/db";
import { agendaRelie } from "@/lib/agenda";
import { etatPaiement } from "@/lib/etape3-regles";
import { etatGoCardless, goCardlessRelie } from "@/lib/gocardless";
import { cartesTrello, trelloRelie } from "@/lib/trello";

/*
 * Ce que la fiche montre de Trello, GoCardless et Google Agenda (direction
 * seulement, vérifié par l'appelant), lu dans directory_events.
 */

export type CarteFiche = { id: string; titre: string; carte: string; colonne: string; colonneCle: string; url: string; echeance: string | null; echeanceFaite: boolean; activite: Date; par: string | null };
export type RdvFiche = { id: string; titre: string; debut: Date; fin: Date | null; journee: boolean; lieu: string | null; visio: string | null; lien: string | null; extrait: string | null };
export type MandatFiche = { id: string; reference: string; statut: string; depuis: Date };
export type AbonnementFiche = { id: string; nom: string; statut: string; montantCents: number; devise: string; intervalle: number; unite: string; prochaine: string | null };
export type PaiementFiche = { id: string; libelle: string; statut: string; etat: ReturnType<typeof etatPaiement>; montantCents: number; devise: string; date: string | null; reference: string | null; description: string | null };

export type Etape3Fiche = {
  trello: { relie: boolean; ouvertes: CarteFiche[]; terminees: CarteFiche[]; aRelier: { id: string; nom: string; colonne: string }[] };
  gocardless: { relie: boolean; mandats: MandatFiche[]; abonnements: AbonnementFiche[]; paiements: PaiementFiche[]; aRelier: { id: string; nom: string }[]; relies: string[] };
  agenda: { relie: boolean; prochains: RdvFiche[]; passes: RdvFiche[]; mots: string };
};

const ORDRE_COLONNES = ["semaine", "attente", "argent", "a_faire", "a_trier", "objectifs", "plus_tard", "autre", "termine"];

export async function etape3DeLaFiche(entry: DirectoryEntry | null): Promise<Etape3Fiche> {
  const [tr, gc, ag] = await Promise.all([trelloRelie(), goCardlessRelie(), agendaRelie()]);
  const lignes = entry
    ? await db
        .select()
        .from(directoryEvents)
        .where(and(eq(directoryEvents.entryId, entry.id), inArray(directoryEvents.source, ["trello", "gocardless", "agenda"])))
    : [];
  const m = (r: (typeof lignes)[number]) => r.meta as Record<string, unknown>;

  const cartes: CarteFiche[] = lignes
    .filter((r) => r.source === "trello")
    .map((r) => ({
      id: r.externalId,
      titre: r.title,
      carte: String(m(r).carte ?? r.title),
      colonne: String(m(r).colonne ?? ""),
      colonneCle: String(m(r).colonneCle ?? "autre"),
      url: String(m(r).url ?? ""),
      echeance: (m(r).echeance as string | null) ?? null,
      echeanceFaite: Boolean(m(r).echeanceFaite),
      activite: r.occurredAt,
      par: (m(r).par as string | null) ?? null,
    }));
  const rang = (c: CarteFiche) => ORDRE_COLONNES.indexOf(c.colonneCle);
  const ouvertes = cartes.filter((c) => c.colonneCle !== "termine").sort((a, b) => rang(a) - rang(b) || (a.echeance ?? "9").localeCompare(b.echeance ?? "9"));
  const terminees = cartes.filter((c) => c.colonneCle === "termine").sort((a, b) => b.activite.getTime() - a.activite.getTime()).slice(0, 10);
  const aRelier = tr
    ? (await cartesTrello())
        .filter((c) => !c.entryId && !c.clientId && !c.agence)
        .map((c) => ({ id: c.id, nom: c.nom, colonne: c.colonne }))
    : [];

  const maintenant = Date.now();
  const rdv: RdvFiche[] = lignes
    .filter((r) => r.source === "agenda")
    .map((r) => ({
      id: r.id,
      titre: r.title,
      debut: r.occurredAt,
      fin: m(r).fin ? new Date(String(m(r).fin)) : null,
      journee: Boolean(m(r).journee),
      lieu: (m(r).lieu as string | null) ?? null,
      visio: (m(r).visio as string | null) ?? null,
      lien: (m(r).lien as string | null) ?? null,
      extrait: r.body,
    }));
  const finDe = (x: RdvFiche) => (x.fin ?? x.debut).getTime();

  const gcLignes = lignes.filter((r) => r.source === "gocardless");
  const etatGc = gc ? await etatGoCardless() : null;
  return {
    trello: { relie: tr, ouvertes, terminees, aRelier },
    gocardless: {
      relie: gc,
      mandats: gcLignes
        .filter((r) => r.kind === "mandat")
        .map((r) => ({ id: r.externalId, reference: String(m(r).reference ?? r.externalId), statut: String(m(r).statut ?? ""), depuis: r.occurredAt }))
        .sort((a, b) => b.depuis.getTime() - a.depuis.getTime()),
      abonnements: gcLignes
        .filter((r) => r.kind === "abonnement")
        .map((r) => ({
          id: r.externalId,
          nom: r.title,
          statut: String(m(r).statut ?? ""),
          montantCents: Number(m(r).montantCents ?? 0),
          devise: String(m(r).devise ?? "EUR"),
          intervalle: Number(m(r).intervalle ?? 1),
          unite: String(m(r).unite ?? "monthly"),
          prochaine: (m(r).prochaine as string | null) ?? null,
        })),
      paiements: gcLignes
        .filter((r) => r.kind === "paiement")
        .map((r) => ({
          id: r.externalId,
          libelle: r.title,
          statut: String(m(r).statut ?? ""),
          etat: etatPaiement(String(m(r).statut ?? "")),
          montantCents: Number(m(r).montantCents ?? 0),
          devise: String(m(r).devise ?? "EUR"),
          date: (m(r).dateDePrelevement as string | null) ?? null,
          reference: (m(r).reference as string | null) ?? null,
          description: (m(r).description as string | null) ?? null,
        }))
        .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
      aRelier: (etatGc?.sansFiche ?? []).map((c) => ({ id: c.id, nom: c.email ? `${c.nom} · ${c.email}` : c.nom })),
      // Les clients GoCardless reliés à cette fiche (par e-mail, par nom ou à la main).
      relies: [...new Set([...gcLignes.filter((r) => r.kind === "mandat").map((r) => String(m(r).client ?? "")), entry?.links?.gocardlessCustomerId ?? ""].filter(Boolean))],
    },
    agenda: {
      relie: ag,
      prochains: rdv.filter((x) => finDe(x) >= maintenant).sort((a, b) => a.debut.getTime() - b.debut.getTime()),
      passes: rdv.filter((x) => finDe(x) < maintenant).sort((a, b) => b.debut.getTime() - a.debut.getTime()),
      mots: entry?.links?.calendarQuery ?? "",
    },
  };
}
