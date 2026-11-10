import "server-only";

import { and, count, eq, isNull, sql as raw } from "drizzle-orm";
import { db } from "./index";
import { contents, quoteRequests } from "./schema";

/**
 * Les compteurs de la navigation : ce qui attend quelqu'un.
 *
 * « À valider » compte exactement ce que montre l'écran des approbations
 * (révision + validation), « À publier » ce que montre la file (prêt, pas
 * encore publié). Un badge qui ne correspond pas à l'écran qu'il annonce
 * apprend à ne plus le regarder.
 */
export async function shellCounts(clientId?: string): Promise<{ validation: number; publier: number; devis: number }> {
  const only = (col: typeof contents.clientId | typeof quoteRequests.clientId) => (clientId ? eq(col, clientId) : undefined);
  const [[v], [p], [d]] = await Promise.all([
    db
      .select({ n: count() })
      .from(contents)
      .where(and(raw`${contents.status} in ('revision','validation')`, only(contents.clientId))),
    db
      .select({ n: count() })
      .from(contents)
      .where(and(eq(contents.status, "pret"), isNull(contents.publishedAt), only(contents.clientId))),
    db.select({ n: count() }).from(quoteRequests).where(and(eq(quoteRequests.status, "nouvelle"), only(quoteRequests.clientId))),
  ]);
  return { validation: v?.n ?? 0, publier: p?.n ?? 0, devis: d?.n ?? 0 };
}
