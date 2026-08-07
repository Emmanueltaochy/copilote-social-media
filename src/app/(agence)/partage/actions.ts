"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db, clientFiles, clients, contents, users } from "@/db";
import { requireStaff } from "@/lib/auth";
import { mailConfigured, sendMail } from "@/lib/mail";

export type ShareState = { error?: string; ok?: string };

async function origin(): Promise<string> {
  const head = await headers();
  const host = head.get("x-forwarded-host") ?? head.get("host") ?? "";
  if (!host) return "";
  const scheme =
    head.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${scheme}://${host}`;
}

/**
 * Envoie un lien par courriel.
 *
 * Le message porte un lien vers l'application, jamais le fichier lui-même en
 * pièce jointe : le lien reste soumis au contrôle d'accès, alors qu'une pièce
 * jointe transférée trois fois finit chez quelqu'un qui n'aurait pas dû
 * l'avoir. C'est aussi ce qui permet de retirer l'accès après coup.
 */
export async function shareByEmail(
  _prev: ShareState,
  formData: FormData,
): Promise<ShareState> {
  await requireStaff();

  if (!mailConfigured()) {
    return { error: "La messagerie n'est pas configurée sur le serveur." };
  }

  const to = String(formData.get("to") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const kind = String(formData.get("kind") ?? "");
  const id = String(formData.get("id") ?? "");

  if (!to.includes("@")) return { error: "Adresse électronique invalide." };
  if (!id) return { error: "Rien à envoyer." };

  const base = await origin();
  let subject = "";
  let text = "";
  let url = "";
  let label = "Ouvrir";

  if (kind === "fichier") {
    const [file] = await db
      .select({ file: clientFiles, clientName: clients.shortName })
      .from(clientFiles)
      .innerJoin(clients, eq(clients.id, clientFiles.clientId))
      .where(eq(clientFiles.id, id))
      .limit(1);
    if (!file) return { error: "Fichier introuvable." };

    subject = `${file.clientName} · ${file.file.label || file.file.filename}`;
    text = note || "Voici le document.";
    url = `${base}/api/client-files/${file.file.id}`;
    label = "Ouvrir le document";
  } else if (kind === "contenu") {
    const [row] = await db
      .select({ content: contents, clientName: clients.shortName })
      .from(contents)
      .innerJoin(clients, eq(clients.id, contents.clientId))
      .where(eq(contents.id, id))
      .limit(1);
    if (!row) return { error: "Contenu introuvable." };

    subject = `${row.clientName} · ${row.content.title}`;
    text = note || "Voici le contenu.";
    url = `${base}/contenu/${row.content.id}`;
    label = "Ouvrir le contenu";
  } else if (kind === "rapport") {
    const [client] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
    if (!client) return { error: "Client introuvable." };

    subject = `Rapport mensuel · ${client.shortName}`;
    text = note || "Voici le rapport du mois.";
    url = `${base}/rapports/${client.id}`;
    label = "Ouvrir le rapport";
  } else if (kind === "invitation") {
    const [invited] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!invited?.inviteToken) return { error: "Cette invitation n'est plus valable." };

    subject = "Votre accès à Taochy Pilot";
    text =
      note ||
      `Bonjour ${invited.name},\n\nVoici votre lien d'accès. Il est personnel, valable une seule fois, et vous choisirez vous-même votre mot de passe.`;
    url = `${base}/invitation/${invited.inviteToken}`;
    label = "Choisir mon mot de passe";
    // Le lien d'invitation ne va qu'à son destinataire : l'envoyer ailleurs
    // donnerait l'accès à qui reçoit le message.
    if (to.toLowerCase() !== invited.email.toLowerCase()) {
      return { error: `Ce lien ne peut être envoyé qu'à ${invited.email}.` };
    }
  } else {
    return { error: "Type d'envoi inconnu." };
  }

  const result = await sendMail({ to, subject, text, actionUrl: url, actionLabel: label });
  if (result.error) return { error: `Envoi impossible — ${result.error}` };
  return { ok: `Envoyé à ${to}.` };
}
