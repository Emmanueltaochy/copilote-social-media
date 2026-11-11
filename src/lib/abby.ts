import "server-only";

import { getSecret } from "@/lib/secrets";

/*
 * Abby (facturation) : lecture des devis signés et de leurs clients, pour que
 * l'assistant crée le projet web correspondant. API publique documentée sur
 * docs.abby.fr ; la clé se crée dans Abby → Paramètres → Intégrations.
 */

const BASE = "https://api.app-abby.com";

async function call<T>(path: string, params: Record<string, string | string[]> = {}): Promise<T> {
  const key = await getSecret("abby");
  if (!key) throw new Error("Abby n'est pas raccordé (Réglages → Abby).");
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    for (const x of Array.isArray(v) ? v : [v]) url.searchParams.append(k, x);
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key.token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
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
