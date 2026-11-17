import "server-only";

import { getSecret } from "@/lib/secrets";

/*
 * Abby (facturation) : lecture des devis signés et de leurs clients, pour que
 * l'assistant crée le projet web correspondant. API publique documentée sur
 * docs.abby.fr ; la clé se crée dans Abby → Paramètres → Intégrations.
 */

/**
 * L'adresse de l'API. Surchargée seulement en local (ABBY_API_URL), pour
 * tester les écrans contre un faux serveur aux données fictives : jamais de
 * vraie clé ni de vraies factures sur une machine de développement.
 */
const BASE = process.env.ABBY_API_URL?.replace(/\/+$/, "") || "https://api.app-abby.com";

async function call<T>(path: string, params: Record<string, string | string[]> = {}, timeoutMs = 30_000): Promise<T> {
  const key = await getSecret("abby");
  if (!key) throw new Error("Abby n'est pas raccordé (Réglages → Abby).");
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    for (const x of Array.isArray(v) ? v : [v]) url.searchParams.append(k, x);
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key.token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (res.status === 401) throw new Error("Abby refuse la clé d'API (401). Vérifiez la clé dans Réglages → Abby.");
  if (!res.ok) throw new Error(`Abby ${res.status} sur ${path}`);
  return (await res.json()) as T;
}

type Raw = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

export type AbbyEstimate = {
  id: string;
  number: string;
  title: string;
  state: string;
  amountHt: number | null;
  signedAt: string | null;
  customer: { id: string; kind: "contact" | "organization" | "inconnu"; name: string; email: string; contactName: string };
  lines: string[];
  /** Le contenu détaillé des lignes (descriptions sans balises), pour comprendre le projet. */
  details: string;
};

function mapEstimate(d: Raw): AbbyEstimate {
  const cust = (d.customer ?? {}) as Raw;
  const contact = (cust.contact ?? cust) as Raw;
  const org = (cust.organization ?? null) as Raw | null;
  const contactName = [s(contact.firstname), s(contact.lastname)].join(" ").trim();
  const emails = (contact.emails as unknown[]) ?? [];
  const email = s(contact.email) || s(emails[0]) || s(org?.email);
  const lines = ((d.lines as Raw[]) ?? []).map((l) => s(l.designation) || s(l.description)).filter(Boolean);
  const details = ((d.lines as Raw[]) ?? [])
    .map((l) => [s(l.designation), s(l.description).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()].filter(Boolean).join(" : "))
    .filter(Boolean)
    .join("\n")
    .slice(0, 3000);
  const cents = (v: unknown) => (typeof v === "number" ? v / 100 : null);
  return {
    id: s(d.id),
    number: s(d.number),
    title: s(d.title) || s(d.object) || lines[0] || "Devis",
    state: s(d.state),
    amountHt: cents(d.totalAmountWithoutTaxAfterDiscount ?? ((d.total ?? {}) as Raw).amountWithoutTaxAfterDiscount ?? d.totalAmountWithoutTax),
    signedAt: s(d.signedAt) || null,
    customer: {
      id: s(cust.id) || s(org?.id) || s(contact.id),
      kind: org ? "organization" : contact ? "contact" : "inconnu",
      name: s(org?.name) || contactName || s(cust.name),
      email,
      contactName,
    },
    lines,
    details,
  };
}

/** Les devis d'un client (recherche sur le nom, le numéro ou l'objet), tous états confondus. */
export async function searchEstimates(search: string, limit = 10): Promise<AbbyEstimate[]> {
  const r = await call<{ docs?: Raw[]; data?: Raw[]; billings?: Raw[] }>("/v2/billings", {
    page: "1",
    limit: String(limit),
    type: ["estimate"],
    search,
    test: "false",
  });
  return (r.docs ?? r.data ?? r.billings ?? []).map(mapEstimate);
}

/** Les devis signés, du plus récent au plus ancien. */
export async function signedEstimates(limit = 15): Promise<AbbyEstimate[]> {
  const r = await call<{ docs?: Raw[]; data?: Raw[] }>("/v2/billings", {
    page: "1",
    limit: String(limit),
    type: ["estimate"],
    state: ["signed"],
    test: "false",
  });
  return (r.docs ?? r.data ?? []).map(mapEstimate);
}

export async function estimate(id: string): Promise<AbbyEstimate> {
  return mapEstimate(await call<Raw>(`/v2/billing/${encodeURIComponent(id)}`));
}

/* ------------------------------------------------- factures et encaissé -- */

/*
 * Lecture des factures et des devis pour l'annuaire et l'accueil.
 *
 * Abby reste la source : rien n'est recopié en base. Les réponses sont gardées
 * dix minutes en mémoire, parce que l'accueil se recharge souvent et qu'Abby
 * n'a pas à être interrogée à chaque fois ; une erreur, elle, n'est jamais
 * gardée, pour qu'un réseau revenu se voie tout de suite.
 */

export type AbbyDoc = {
  id: string;
  type: string;
  number: string;
  /** draft, finalized (en attente de paiement), paid, signed, refused… */
  state: string;
  title: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  /** TTC, en centimes. */
  amountCents: number;
  /** Reste à payer pour une facture (centimes), quand Abby le donne. */
  remainingCents: number | null;
  emittedAt: Date | null;
  dueAt: Date | null;
  signedAt: Date | null;
  paidAt: Date | null;
  /** Pour un devis : la facture finale émise, s'il y en a une. */
  finalInvoice: { id: string; number: string } | null;
  /** Pour un devis : la somme des acomptes déjà facturés (centimes). */
  advancesCents: number;
};

function quand(v: unknown): Date | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return new Date(v < 1e12 ? v * 1000 : v);
  if (typeof v === "string" && v) {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : new Date(t);
  }
  return null;
}
const entier = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);

function mapDoc(d: Raw): AbbyDoc {
  const cust = (d.customer ?? {}) as Raw;
  const contact = (cust.contact ?? cust) as Raw;
  const org = (cust.organization ?? null) as Raw | null;
  const nomContact = [s(contact.firstname), s(contact.lastname)].join(" ").trim();
  const emails = (contact.emails as unknown[]) ?? [];
  const total = (d.total ?? {}) as Raw;
  const fin = (d.finalInvoice ?? null) as Raw | null;
  const acomptes = Array.isArray(d.advances) ? (d.advances as Raw[]) : [];
  return {
    id: s(d.id),
    type: s(d.type),
    number: s(d.number),
    state: s(d.state),
    title: s(d.title) || s(d.object) || "",
    customerId: s(cust.id) || s(org?.id) || s(contact.id),
    customerName: s(org?.name) || s(cust.name) || nomContact,
    customerEmail: s(contact.email) || s(emails[0]) || s(cust.email) || s(org?.email),
    amountCents:
      entier(d.totalAmountWithTax) ?? entier(total.amountWithTaxAfterDiscount) ?? entier(d.totalAmountWithoutTax) ?? 0,
    remainingCents: entier(total.remainingAmountWithTax) ?? entier(d.remainingAmountWithTax),
    emittedAt: quand(d.emittedAt),
    dueAt: quand(d.dueAt ?? d.dueDate),
    signedAt: quand(d.signedAt),
    paidAt: quand(d.paidAt),
    finalInvoice: fin && s(fin.id) ? { id: s(fin.id), number: s(fin.number) } : null,
    advancesCents: acomptes.reduce((t, a) => t + (entier(a.totalAmountWithTax) ?? 0), 0),
  };
}

const CACHE_MS = 10 * 60_000;
const cache = new Map<string, { at: number; value: unknown }>();
async function memo<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

type Page = { docs?: Raw[]; data?: Raw[]; billings?: Raw[]; hasNextPage?: boolean; totalPages?: number };

/** Toutes les pages d'une recherche, dans la limite de `maxPages` × 100 documents. */
async function billings(params: Record<string, string | string[]>, maxPages = 5): Promise<AbbyDoc[]> {
  const out: AbbyDoc[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const r = await call<Page>("/v2/billings", { page: String(page), limit: "100", test: "false", ...params }, 12_000);
    const docs = r.docs ?? r.data ?? r.billings ?? [];
    out.push(...docs.map(mapDoc));
    const encore = r.hasNextPage ?? (r.totalPages ? page < r.totalPages : docs.length === 100);
    if (!encore) break;
  }
  return out;
}

/** Abby est-il raccordé (clé dans Réglages ou variable du serveur) ? */
export async function abbyRaccorde(): Promise<boolean> {
  return Boolean(await getSecret("abby"));
}

/** Les factures finalisées et pas encore payées, en retard ou non. */
export async function facturesEnAttente(): Promise<AbbyDoc[]> {
  return memo("factures-attente", () => billings({ type: ["invoice"], state: ["finalized"] }));
}

/**
 * Les devis signés depuis un an qui n'ont pas encore de facture finale.
 *
 * La liste d'Abby ne dit pas si un devis a été facturé : il faut ouvrir chaque
 * devis. On se limite donc aux douze derniers mois — au-delà, un devis signé
 * sans facture relève du ménage dans Abby, pas de l'argent qui dort.
 */
export async function devisSignesNonFactures(): Promise<AbbyDoc[]> {
  return memo("devis-signes-non-factures", async () => {
    const depuis = Date.now() - 365 * 86_400_000;
    // Les 25 plus récents : au-delà, l'ouverture une à une ralentirait l'accueil.
    const signes = (await billings({ type: ["estimate"], state: ["signed"] }, 3))
      .filter((d) => !d.signedAt || d.signedAt.getTime() >= depuis)
      .sort((a, b) => (b.signedAt?.getTime() ?? 0) - (a.signedAt?.getTime() ?? 0))
      .slice(0, 25);
    const details: AbbyDoc[] = [];
    // Cinq à la fois : Abby n'aime pas les rafales, et l'accueil n'attend pas.
    for (let i = 0; i < signes.length; i += 5) {
      const lot = await Promise.all(
        signes.slice(i, i + 5).map((d) =>
          call<Raw>(`/v2/billing/${encodeURIComponent(d.id)}`, {}, 12_000)
            .then(mapDoc)
            .catch(() => d),
        ),
      );
      details.push(...lot);
    }
    return details.filter((d) => !d.finalInvoice && d.amountCents - d.advancesCents > 0);
  });
}

/** Tous les documents d'un client Abby (factures, devis, acomptes, avoirs). */
export async function documentsDuClient(customerId: string): Promise<AbbyDoc[]> {
  // Le filtre est refait ici : si Abby ignorait le paramètre, la fiche
  // afficherait les factures de tout le monde.
  return memo(`client:${customerId}`, async () =>
    (await billings({ customerId }, 3)).filter((d) => d.customerId === customerId),
  );
}

/** Les clients Abby dont le nom ou l'e-mail ressemble à la recherche, pour relier une fiche. */
export async function chercherClientsAbby(recherche: string): Promise<{ id: string; name: string; email: string }[]> {
  const q = recherche.trim();
  if (q.length < 2) return [];
  return memo(`recherche:${q.toLowerCase()}`, async () => {
    const docs = await billings({ search: q }, 1);
    const vus = new Map<string, { id: string; name: string; email: string }>();
    for (const d of docs) {
      if (d.customerId && !vus.has(d.customerId)) {
        vus.set(d.customerId, { id: d.customerId, name: d.customerName, email: d.customerEmail });
      }
    }
    return [...vus.values()].slice(0, 5);
  });
}
