import "server-only";

import { and, asc, desc, eq, gte, isNull, lt, ne } from "drizzle-orm";
import { clients, contents, db } from "@/db";

/*
 * Le calendrier lit une plage de dates quelconque (semaine à cheval sur deux
 * mois, grille mensuelle de six semaines) : une requête par plage plutôt que
 * deux appels mensuels recollés.
 */

export async function contentsBetween(start: Date, end: Date, clientId?: string) {
  return db
    .select({ content: contents, clientName: clients.shortName })
    .from(contents)
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .where(
      and(
        gte(contents.scheduledAt, start),
        lt(contents.scheduledAt, end),
        clientId ? eq(contents.clientId, clientId) : undefined,
      ),
    )
    .orderBy(asc(contents.scheduledAt));
}

/** Les contenus sans date, encore en cours : ils attendent un créneau. */
export async function unscheduled(clientId?: string, limit = 6) {
  return db
    .select({
      id: contents.id,
      title: contents.title,
      status: contents.status,
      clientName: clients.shortName,
      createdAt: contents.createdAt,
    })
    .from(contents)
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .where(
      and(
        isNull(contents.scheduledAt),
        ne(contents.status, "publie"),
        eq(clients.active, true),
        clientId ? eq(contents.clientId, clientId) : undefined,
      ),
    )
    .orderBy(desc(contents.createdAt))
    .limit(limit);
}
