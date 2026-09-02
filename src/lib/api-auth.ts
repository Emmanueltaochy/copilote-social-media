import "server-only";

import { and, eq, isNull, or, type SQL, sql as raw } from "drizzle-orm";
import { apiKeys, clients, db, type ApiKey } from "@/db";
import { checkRateLimit, type Cadence } from "./rate-limit";
import { hashToken } from "./tokens";

/**
 * L'authentification de l'API des agents.
 *
 * Séparée de `auth.ts` à dessein : celui-ci importe `cookies()` et
 * `redirect()`, dont une clé d'API n'a que faire — et dont elle ne doit
 * surtout pas hériter. Garder les deux chemins d'accès dans deux fichiers rend
 * structurellement impossible qu'une clé obtienne par accident les pouvoirs
 * d'une session de navigateur.
 *
 * Le découpage suit celui qui existe déjà pour les humains :
 * `currentUser()` authentifie, `hasDepartment()` autorise, `requireDepartment()`
 * compose. Ici, `currentKey()` authentifie, `hasScope()` autorise, `withApiKey()`
 * compose.
 */

/** Rend le secret repérable dans un journal ou par un détecteur de fuite. */
export const API_KEY_PREFIX = "tpk_";

export type ApiScope = "pipeline:read" | "pipeline:write";

export const API_SCOPES: ApiScope[] = ["pipeline:read", "pipeline:write"];

export const isApiScope = (v: string): v is ApiScope => API_SCOPES.includes(v as ApiScope);

/** Lire coûte peu et se répète sans dommage ; écrire engage l'agence. */
const CADENCE: Record<ApiScope, Cadence> = {
  "pipeline:read": "lecture",
  "pipeline:write": "ecriture",
};

/* ------------------------------------------------------- authentification -- */

/**
 * La clé présentée par la requête, ou null.
 *
 * Le jeton se lit **uniquement** dans l'en-tête `Authorization`. Aucun repli
 * sur le cookie de session : un navigateur déjà connecté pourrait sinon piloter
 * l'API à l'insu de son utilisateur, une requête inter-sites suffisant à
 * emporter le cookie.
 */
export async function currentKey(request: Request): Promise<ApiKey | null> {
  const entete = request.headers.get("authorization");
  if (!entete) return null;

  const [schema, jeton] = entete.split(/\s+/, 2);
  if (!schema || schema.toLowerCase() !== "bearer" || !jeton) return null;

  const [cle] = await db
    .select()
    .from(apiKeys)
    // La révocation est dans la requête, pas après : une clé révoquée ne doit
    // même pas remonter de la base.
    .where(and(eq(apiKeys.tokenHash, hashToken(jeton)), isNull(apiKeys.revokedAt)))
    .limit(1);

  if (!cle) return null;

  // Vérifiée à chaque requête et non à l'émission, comme `accessExpiresAt` pour
  // un compte humain : une clé délivrée pour un mois doit cesser d'ouvrir la
  // porte le jour dit, sans qu'on ait à y repenser.
  if (cle.expiresAt && cle.expiresAt <= new Date()) return null;

  return cle;
}

/* ---------------------------------------------------------- autorisation -- */

export const hasScope = (cle: ApiKey, scope: ApiScope): boolean =>
  (cle.scopes ?? []).includes(scope);

/**
 * Le périmètre d'une clé, à poser dans le `where` de **chaque** requête qui
 * touche aux clients.
 *
 * **Les conditions rendues portent sur la table `clients` : toute requête qui
 * l'utilise doit joindre `clients`, faute de quoi PostgreSQL refusera la
 * requête.** Rien dans la signature ne le signale — c'est une contrainte
 * implicite, et c'est ce qui la rend fragile.
 *
 * Deux bornes, toujours appliquées ensemble :
 *
 * - le pôle, lu comme `requireDepartment()` le lit pour un humain. Sans lui,
 *   « agent social » serait un nom, pas une frontière.
 * - le client, quand la clé est nominative. La colonne est branchée même
 *   lorsqu'elle est nulle : une colonne prévue mais jamais lue est une colonne
 *   qu'on oublie de brancher le jour où elle sert.
 *
 * L'opérateur jsonb `?` n'a pas d'équivalent typé dans Drizzle ; c'est déjà le
 * motif retenu par `duPole()` dans `db/queries.ts`, et en avoir deux serait
 * pire qu'en avoir un.
 */
export function perimetreDeLaCle(cle: ApiKey): SQL {
  const poles = cle.departments ?? [];

  // Une clé sans pôle ne voit rien. Le cas ne devrait pas exister — le script
  // de création en exige un — mais le défaut doit fermer, pas ouvrir.
  if (poles.length === 0) return raw`false`;

  const surLePole = poles.map((pole) => raw`${clients.departments} ? ${pole}`);
  const bornes: SQL[] = [or(...surLePole) as SQL];

  if (cle.clientId) bornes.push(eq(clients.id, cle.clientId));

  return and(...bornes) as SQL;
}

/* -------------------------------------------------------------- assemblage -- */

type Handler<Ctx> = (request: Request, cle: ApiKey, ctx: Ctx) => Promise<Response>;

/**
 * L'enveloppe de toute route d'API des agents.
 *
 * La vérification du scope et le plafond de débit vivent ici, et non dans
 * chaque route : un contrôle qu'il faut penser à écrire finit par manquer dans
 * l'une d'elles, et ce sera celle qui écrit.
 *
 * Toutes les sorties sont des réponses. Aucune redirection : `requireDirection()`
 * redirige, ce qui convient à une page mais trompe un appel programmé — `fetch`
 * suit, reçoit une page en 200, et l'appelant lit un succès alors que rien n'a
 * été fait.
 */
export function withApiKey<Ctx = unknown>(scope: ApiScope, handler: Handler<Ctx>) {
  return async (request: Request, ctx: Ctx): Promise<Response> => {
    const cle = await currentKey(request);
    if (!cle) {
      return Response.json(
        { error: "Clé d'API absente, inconnue, révoquée ou expirée." },
        { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
      );
    }

    if (!hasScope(cle, scope)) {
      // Nommer le droit manquant : un agent qui reçoit « non autorisé » sans
      // rien d'autre ne peut ni corriger son appel ni le signaler utilement.
      return Response.json(
        { error: `Cette clé ne porte pas le droit « ${scope} ».` },
        { status: 403 },
      );
    }

    const verdict = checkRateLimit(cle.id, CADENCE[scope]);
    if (verdict.limite) {
      return Response.json(
        { error: `Trop d'appels. Réessaie dans ${verdict.retryAfter} s.` },
        {
          status: 429,
          headers: {
            "Retry-After": String(verdict.retryAfter),
            "X-RateLimit-Limit": String(verdict.plafond),
            "X-RateLimit-Remaining": "0",
          },
        },
      );
    }

    await toucher(cle);

    try {
      const reponse = await handler(request, cle, ctx);
      reponse.headers.set("X-RateLimit-Limit", String(verdict.plafond));
      reponse.headers.set("X-RateLimit-Remaining", String(verdict.restant));
      return reponse;
    } catch (error) {
      // Le détail part au journal, jamais au client : un message d'erreur de
      // base de données décrit le schéma à qui sait le lire.
      console.error("[pilot] api agent", scope, error);
      return Response.json({ error: "Erreur interne." }, { status: 500 });
    }
  };
}

/** Cinq minutes : assez fin pour repérer une clé morte, assez grossier pour
 *  qu'une rafale de lectures ne se paie pas en écritures. */
const FRAICHEUR_USAGE_MS = 5 * 60_000;

async function toucher(cle: ApiKey): Promise<void> {
  const maintenant = new Date();
  if (cle.lastUsedAt && maintenant.getTime() - cle.lastUsedAt.getTime() < FRAICHEUR_USAGE_MS) {
    return;
  }
  // Une date de dernier usage perdue ne vaut pas de refuser l'appel : la trace
  // est un confort d'exploitation, pas une garantie.
  await db
    .update(apiKeys)
    .set({ lastUsedAt: maintenant })
    .where(eq(apiKeys.id, cle.id))
    .catch((error) => {
      console.error("[pilot] api agent : lastUsedAt", error);
    });
}
