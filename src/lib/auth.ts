import "server-only";

import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { db, sessions, users, type User } from "@/db";

const scryptAsync = promisify(scrypt);

export { SESSION_COOKIE } from "./auth.shared";
import { SESSION_COOKIE } from "./auth.shared";

const SESSION_DAYS = 30;

/* --------------------------------------------------------- mots de passe -- */

/**
 * scrypt plutôt qu'un simple hachage : il est volontairement lent et gourmand
 * en mémoire, ce qui rend une attaque par dictionnaire coûteuse même si la
 * base venait à fuiter. Le sel est propre à chaque mot de passe.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  const expected = Buffer.from(key, "hex");
  // Comparaison à durée constante : une comparaison naïve laisserait deviner
  // le hachage caractère par caractère en mesurant le temps de réponse.
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}

/* -------------------------------------------------------------- sessions -- */

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Sessions en base plutôt que jetons signés : révoquer un accès doit être
 * immédiat, et un jeton signé reste valable jusqu'à son expiration.
 * Seule l'empreinte est stockée — un vol de base ne donne pas les sessions.
 */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);

  await db.insert(sessions).values({ tokenHash: hashToken(token), userId, expiresAt });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true, // inaccessible au JavaScript de la page
    sameSite: "lax", // bloque l'essentiel des requêtes inter-sites
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  jar.delete(SESSION_COOKIE);
}

/** L'utilisateur connecté, ou null. Ne redirige pas. */
export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const user = rows[0]?.user;
  if (!user || !user.active) return null;

  // Un accès à durée limitée s'arrête de lui-même. Le vérifier à chaque
  // requête plutôt qu'au moment de la connexion : un renfort engagé pour la
  // journée resterait sinon connecté tant qu'il ne ferme pas son onglet.
  if (user.accessExpiresAt && user.accessExpiresAt <= new Date()) return null;

  return user;
}

/* ------------------------------------------------------------------ rôles -- */

export type Role = "direction" | "equipe" | "client";

/** Exige une session valide. Renvoie vers la connexion sinon. */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/connexion");
  return user;
}

/**
 * Exige un accès interne. Un compte client qui tenterait d'ouvrir l'outil de
 * l'agence est renvoyé vers son portail, pas vers une page d'erreur.
 */
export async function requireStaff(): Promise<User> {
  const user = await requireUser();
  if (user.role === "client") redirect("/portail");
  return user;
}

/* ------------------------------------------------------------------ pôles -- */

export type Department = "social" | "web";

/**
 * Les pôles auxquels quelqu'un a accès.
 *
 * La direction a les deux, toujours : c'est elle qui arbitre entre les deux
 * métiers, et lui retirer un pôle reviendrait à lui cacher la moitié de
 * l'agence. Un compte sans pôle renseigné retombe sur le social — c'est ce
 * qu'avaient tous les comptes avant que le web n'existe.
 */
export function departmentsOf(user: Pick<User, "role" | "departments">): Department[] {
  if (user.role === "direction") return ["social", "web"];
  const liste = (user.departments ?? []).filter(
    (d): d is Department => d === "social" || d === "web",
  );
  return liste.length > 0 ? liste : ["social"];
}

export const hasDepartment = (
  user: Pick<User, "role" | "departments">,
  pole: Department,
): boolean => departmentsOf(user).includes(pole);

/**
 * Exige l'accès à un pôle.
 *
 * Renvoyer vers l'autre pôle plutôt que vers une page d'erreur : quelqu'un du
 * web qui ouvre un lien social s'est trompé de lien, il n'a pas commis de
 * faute.
 */
export async function requireDepartment(pole: Department): Promise<User> {
  const user = await requireStaff();
  if (!hasDepartment(user, pole)) redirect(pole === "web" ? "/" : "/web");
  return user;
}

/** Réservé à la direction : coûts internes, marges, arbitrages. */
export async function requireDirection(): Promise<User> {
  const user = await requireStaff();
  if (user.role !== "direction") redirect("/");
  return user;
}

/**
 * La direction, pour une route d'API.
 *
 * `requireDirection` redirige, ce qui convient à une page — le navigateur suit
 * et affiche l'accueil — mais trompe un appel programmé : `fetch` suit la
 * redirection, reçoit une page en 200, et le code appelant la lit comme un
 * succès alors que rien n'a été fait. Une route répond, elle ne renvoie pas
 * ailleurs.
 */
export async function currentDirection(): Promise<User | null> {
  const user = await currentUser();
  return user && user.role === "direction" ? user : null;
}

/** Les montants et les marges ne s'affichent pas pour toute l'équipe. */
export const canSeeMoney = (user: Pick<User, "role">) => user.role === "direction";

/* ------------------------------------------------- premier démarrage ------ */

/**
 * Tant qu'aucun compte n'existe, l'application ouvre sur la création du
 * premier administrateur. Cela évite de transporter un mot de passe initial
 * dans une variable d'environnement.
 */
export async function hasAnyUser(): Promise<boolean> {
  const rows = await db.select({ id: users.id }).from(users).limit(1);
  return rows.length > 0;
}

/** Initiales par défaut : « Jean-Yves Lauret » → « JL ». */
export function initialsFrom(name: string): string {
  const parts = name.trim().split(/[\s-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
