import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Connexion à PostgreSQL, ouverte au premier usage seulement.
 *
 * Next évalue les modules pendant la construction de l'image, où aucune base
 * n'est joignable. Se connecter à l'import ferait donc échouer le build alors
 * que rien n'a besoin de la base à ce moment-là. La connexion s'établit à la
 * première requête réelle.
 *
 * L'instance est mise en cache sur globalThis : en développement, Next
 * recharge les modules à chaque modification et ouvrirait sinon une nouvelle
 * réserve de connexions à chaque fois, jusqu'à saturer la base.
 */
type Database = ReturnType<typeof createDatabase>;

const globalForDb = globalThis as unknown as {
  pilotDb?: Database;
  pilotSql?: ReturnType<typeof postgres>;
};

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL manquant. En local : docker compose up -d db. " +
        "Sur le VPS, la variable est écrite par scripts/setup-vps.sh.",
    );
  }
  return url;
}

function createDatabase() {
  // Le VPS héberge d'autres services : une réserve de connexions trop large
  // consomme de la mémoire côté PostgreSQL sans rien apporter à cette échelle.
  const max = Number(process.env.DB_POOL_MAX ?? 10);
  const client = postgres(connectionString(), {
    max: Number.isFinite(max) && max > 0 ? max : 10,
    idle_timeout: 20,
  });
  if (process.env.NODE_ENV !== "production") globalForDb.pilotSql = client;
  return drizzle(client, { schema });
}

function database(): Database {
  if (process.env.NODE_ENV !== "production") {
    return (globalForDb.pilotDb ??= createDatabase());
  }
  cached ??= createDatabase();
  return cached;
}

let cached: Database | undefined;

/**
 * Se comporte comme une instance drizzle, mais n'ouvre la connexion qu'au
 * moment où une propriété est réellement lue.
 */
export const db = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    return Reflect.get(database() as object, prop, receiver);
  },
});

export * from "./schema";
