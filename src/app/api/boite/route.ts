import { and, eq, isNotNull } from "drizzle-orm";
import { clients, db } from "@/db";
import { currentUser } from "@/lib/auth";
import { listBrands } from "@/lib/metricool";
import { forgetInboxCache, loadInbox } from "@/lib/metricool-inbox";

/**
 * Les conversations d'UN client (messages privés + commentaires), lues chez
 * Metricool. L'écran Réception appelle cette route client par client, en
 * parallèle : chaque compte s'affiche dès qu'il a répondu.
 */
export const maxDuration = 120;

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user || user.role === "client") return new Response("Non autorisé", { status: 401 });
  const q = new URL(request.url).searchParams;
  const clientId = q.get("client") ?? "";
  const [c] = await db
    .select({ id: clients.id, name: clients.shortName, brandId: clients.metricoolBrandId })
    .from(clients)
    .where(and(eq(clients.id, clientId), isNotNull(clients.metricoolBrandId)))
    .limit(1);
  if (!c?.brandId) return Response.json({ threads: [], errors: ["Client non relié à Metricool."] });
  try {
    const brand = (await listBrands()).find((b) => b.id === c.brandId);
    if (!brand) return Response.json({ threads: [], errors: [`${c.name} : marque Metricool introuvable.`] });
    if (q.get("fresh") === "1") forgetInboxCache(brand.id);
    const r = await loadInbox([{ clientId: c.id, clientName: c.name, brandId: brand.id, networks: brand.networks }]);
    return Response.json(r);
  } catch (e) {
    return Response.json({ threads: [], errors: [`${c.name} : ${(e as Error).message}`] });
  }
}
