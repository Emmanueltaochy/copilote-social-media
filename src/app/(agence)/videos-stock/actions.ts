"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { scheduleContent } from "@/lib/metricool-schedule";
import { importStockVideo } from "@/lib/stock-videos";

export type ImportState = { ok?: string; error?: string; contentId?: string };

/** « Importer » (et éventuellement programmer) une vidéo du stock de taochyagency.com. */
export async function importerVideo(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const user = await requireStaff();
  const stockId = String(formData.get("stockId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  const date = String(formData.get("date") ?? "").trim();
  const networks = formData.getAll("networks").map(String).filter(Boolean);
  const programmer = formData.get("programmer") === "on";
  if (!stockId || !clientId) return { error: "Choisissez le client." };
  if (programmer && !date) return { error: "Donnez une date pour programmer." };
  try {
    // L'heure saisie est celle de La Réunion, enregistrée telle quelle (convention de Pilot).
    const scheduledAt = date ? new Date(`${date}:00Z`) : null;
    const r = await importStockVideo({ stockId, clientId, scheduledAt, networks, actor: { userId: user.id } });
    let msg = r.already ? "Déjà importée : le contenu existe." : "Importée : le contenu Reel est créé avec la légende proposée.";
    if (programmer && !r.already) {
      const s = await scheduleContent(r.contentId, { userId: user.id });
      msg += s.ok ? ` ${s.message}` : ` Pas encore programmée : ${s.error}`;
    } else if (!r.already && r.status === "validation") {
      msg += " Elle attend la validation du client dans son portail ; elle partira toute seule ensuite.";
    }
    revalidatePath("/videos-stock");
    revalidatePath("/a-publier");
    return { ok: msg, contentId: r.contentId };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
