import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { revalidatePath } from "next/cache";
import { db, invoices } from "@/db";
import { currentDirection } from "@/lib/auth";
import { storeDocument, UploadError } from "@/lib/storage";

/** Un en-tête HTTP ne transporte pas les accents : ils voyagent encodés. */
function entete(request: Request, nom: string): string {
  const brut = request.headers.get(nom) ?? "";
  try {
    return decodeURIComponent(brut).trim();
  } catch {
    return brut.trim();
  }
}

/**
 * Dépôt d'une facture.
 *
 * Le fichier et ses informations arrivent ensemble : demander de créer une
 * ligne puis d'y attacher un PDF ferait deux gestes là où la facture est un
 * seul objet, et laisserait des lignes sans document si l'on s'interrompt.
 *
 * La facturation est une affaire de direction : elle porte des montants, et
 * une facture publiée par erreur part chez un client.
 */
export async function POST(request: Request) {
  const user = await currentDirection();
  if (!user) return Response.json({ error: "Non autorisé." }, { status: 403 });

  const clientId = new URL(request.url).searchParams.get("clientId") ?? "";
  if (!clientId) return Response.json({ error: "Client manquant." }, { status: 400 });

  const number = entete(request, "x-number");
  if (!number) return Response.json({ error: "Le numéro de facture est obligatoire." }, { status: 400 });

  const issuedOn = entete(request, "x-issued");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issuedOn)) {
    return Response.json({ error: "La date d'émission est obligatoire." }, { status: 400 });
  }
  const dueBrut = entete(request, "x-due");
  const dueOn = /^\d{4}-\d{2}-\d{2}$/.test(dueBrut) ? dueBrut : null;

  // Le montant arrive en euros, saisi à la main : on le passe en centimes,
  // parce que les flottants ne comptent pas juste — et une facture, si.
  const montant = Number(entete(request, "x-amount").replace(",", "."));
  const amountCents = Number.isFinite(montant) && montant >= 0 ? Math.round(montant * 100) : 0;

  const filename = entete(request, "x-filename") || "facture.pdf";
  const declared = Number(
    request.headers.get("x-filesize") ?? request.headers.get("content-length") ?? "",
  );
  if (!request.body) return Response.json({ error: "Fichier vide." }, { status: 400 });

  try {
    const stored = await storeDocument(
      {
        filename,
        mimeType: (request.headers.get("content-type") ?? "").split(";")[0].trim(),
        declaredBytes: Number.isFinite(declared) && declared > 0 ? declared : null,
        body: request.body as unknown as NodeReadableStream,
      },
      clientId,
    );

    await db.insert(invoices).values({
      clientId,
      number,
      label: entete(request, "x-label") || null,
      amountCents,
      issuedOn,
      dueOn,
      filename,
      storagePath: stored.storagePath,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      uploadedById: user.id,
    });

    revalidatePath(`/clients/${clientId}`);
    revalidatePath("/portail/factures");
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof UploadError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("[pilot] dépôt de facture", error);
    return Response.json({ error: "Enregistrement impossible." }, { status: 500 });
  }
}
