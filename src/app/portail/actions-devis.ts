"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, clients, quoteRequests } from "@/db";
import { requireUser } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { DEVIS_KIND } from "@/data/devis";

export type DevisState = { ok?: string; error?: string };

/**
 * Une demande de devis, déposée par un client depuis son portail.
 *
 * L'identité vient de la session et le client de son compte : ni l'un ni
 * l'autre ne se lisent dans le formulaire, sinon un contact pourrait demander
 * un devis au nom d'une autre entreprise.
 *
 * La direction est prévenue par notification et par courriel : une demande de
 * devis est le seul message d'un client qui rapporte de l'argent, et elle ne
 * doit pas attendre la prochaine connexion de quelqu'un.
 */
export async function demanderDevis(
  _prev: DevisState,
  formData: FormData,
): Promise<DevisState> {
  const user = await requireUser();
  if (user.role !== "client" || !user.clientId) {
    return { error: "Seuls les comptes clients peuvent demander un devis." };
  }

  const subject = String(formData.get("subject") ?? "").trim();
  if (!subject) return { error: "Dites en une ligne ce que vous souhaitez." };

  const kind = String(formData.get("kind") ?? "autre");
  if (!DEVIS_KIND[kind]) return { error: "Choisissez une nature de demande." };

  const deadlineBrut = String(formData.get("deadline") ?? "").trim();
  // Une date illisible ne devient pas « aujourd'hui » en silence : elle est
  // simplement absente, et le champ est facultatif.
  const deadline = /^\d{4}-\d{2}-\d{2}$/.test(deadlineBrut) ? deadlineBrut : null;

  const [client] = await db
    .select({ nom: clients.shortName })
    .from(clients)
    .where(eq(clients.id, user.clientId))
    .limit(1);

  const [ligne] = await db
    .insert(quoteRequests)
    .values({
      clientId: user.clientId,
      requestedById: user.id,
      subject,
      kind,
      details: String(formData.get("details") ?? "").trim() || null,
      budget: String(formData.get("budget") ?? "").trim() || null,
      deadline,
    })
    .returning({ id: quoteRequests.id });

  await notify({
    kind: "devis",
    title: `Demande de devis — ${client?.nom ?? "un client"}`,
    body: `${DEVIS_KIND[kind].label} · ${subject}`,
    href: "/devis",
    clientId: user.clientId,
    audience: "direction",
  });

  revalidatePath("/portail/devis");
  revalidatePath("/devis");
  return {
    ok: ligne
      ? "Votre demande est partie. Nous revenons vers vous rapidement."
      : "Votre demande est partie.",
  };
}
