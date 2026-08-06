/**
 * Constantes partagées entre le serveur et le proxy.
 *
 * Le proxy ne peut pas importer lib/auth.ts : ce module utilise node:crypto et
 * la base de données, indisponibles dans son environnement d'exécution.
 */
export const SESSION_COOKIE = "pilot_session";
