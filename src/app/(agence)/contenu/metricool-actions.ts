"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { cancelSchedule, scheduleContent, syncPublications } from "@/lib/metricool-schedule";

export type ProgState = { ok?: string; error?: string };

function refresh(id?: string) {
  for (const p of ["/", "/a-publier", "/calendrier", "/production"]) revalidatePath(p);
  if (id) revalidatePath(`/contenu/${id}`);
}

/**
 * Le bloc « Publication » : programmer (ou mettre à jour), publier
 * maintenant, annuler, vérifier l'état chez Metricool.
 */
export async function publicationAction(_prev: ProgState, formData: FormData): Promise<ProgState> {
  const user = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const op = String(formData.get("op") ?? "programmer");
  if (!id) return { error: "Contenu introuvable." };

  if (op === "verifier") {
    const r = await syncPublications({ contentIds: [id] }).catch((e: Error) => ({ error: e.message }));
    refresh(id);
    if ("error" in r) return { error: r.error };
    return { ok: r.published ? "Publié : le lien du post est enregistré." : "État relevé chez Metricool." };
  }
  const r =
    op === "annuler"
      ? await cancelSchedule(id, { userId: user.id })
      : await scheduleContent(id, { userId: user.id }, { now: op === "maintenant" });
  refresh(id);
  return r.ok ? { ok: r.message } : { error: r.error };
}

/** Compatibilité : l'ancien bouton « Programmer dans Metricool ». */
export async function programmerMetricool(prev: ProgState, formData: FormData): Promise<ProgState> {
  return publicationAction(prev, formData);
}

/** « À publier » : programme d'un coup tout ce qui est prêt et complet. */
export async function programmerTout(_prev: ProgState, formData: FormData): Promise<ProgState> {
  const user = await requireStaff();
  const ids = formData.getAll("id").map(String).filter(Boolean);
  if (!ids.length) return { error: "Rien à programmer." };
  let ok = 0;
  const errors: string[] = [];
  for (const id of ids) {
    const r = await scheduleContent(id, { userId: user.id });
    if (r.ok) ok++;
    else errors.push(r.error);
  }
  refresh();
  if (!ok) return { error: errors[0] ?? "Rien n'a pu partir." };
  return {
    ok: `${ok} publication${ok > 1 ? "s" : ""} programmée${ok > 1 ? "s" : ""}.${errors.length ? ` ${errors.length} bloquée(s) : voir la liste.` : ""}`,
  };
}

/** « À publier » : relève l'état de toutes les publications programmées. */
export async function verifierPublications(): Promise<ProgState> {
  await requireStaff();
  try {
    const r = await syncPublications();
    refresh();
    return {
      ok: r.checked
        ? `${r.checked} vérifiée${r.checked > 1 ? "s" : ""} chez Metricool · ${r.published} publiée${r.published > 1 ? "s" : ""}${r.errors ? ` · ${r.errors} en échec` : ""}.`
        : "Aucune publication à vérifier pour l'instant.",
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
