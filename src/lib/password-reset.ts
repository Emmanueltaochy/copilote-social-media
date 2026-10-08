import "server-only";

import { headers } from "next/headers";
import { and, count, eq, gt, isNull } from "drizzle-orm";
import { db, passwordResets, sessions, users, type User } from "@/db";
import { hashPassword } from "./auth";
import { sendMail } from "./mail";
import { hashToken, newToken } from "./tokens";

/**
 * Mot de passe oublié.
 *
 * Le principe est celui de l'invitation : un lien personnel, à usage unique et
 * daté, envoyé à l'adresse du compte. Celui qui le reçoit choisit un nouveau
 * mot de passe — le compte, ses contenus et son historique ne bougent pas.
 */

/** Une heure : de quoi ouvrir sa boîte, pas de quoi oublier le lien dedans. */
const VALIDITE_MS = 60 * 60_000;

/**
 * Au plus trois demandes par heure et par compte. Au-delà, on se tait : un
 * formulaire public qui envoie un courriel à chaque clic servirait à inonder
 * la boîte de quelqu'un.
 *
 * Compté en base plutôt qu'en mémoire : la table se borne d'elle-même au
 * nombre de comptes, alors qu'un compteur indexé par l'adresse saisie
 * grossirait au rythme de ce que tape un inconnu.
 */
const PLAFOND_PAR_HEURE = 3;

/**
 * L'adresse de l'application, pour fabriquer le lien.
 *
 * APP_DOMAIN d'abord : sur un formulaire public, l'en-tête Host est choisi par
 * qui envoie la requête. S'y fier permettrait d'expédier à un client un vrai
 * courriel de l'agence pointant vers un autre site — qui recevrait le jeton au
 * premier clic. Les en-têtes ne servent qu'à défaut, en développement.
 */
async function origine(): Promise<string> {
  const domaine = process.env.APP_DOMAIN?.trim();
  if (domaine) return domaine.startsWith("http") ? domaine : `https://${domaine}`;

  const head = await headers();
  const host = head.get("x-forwarded-host") ?? head.get("host") ?? "";
  const scheme =
    head.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${scheme}://${host}`;
}

const utilisable = (user: User) =>
  user.active && !(user.accessExpiresAt && user.accessExpiresAt <= new Date());

/**
 * Prépare la demande : vérifie le compte, enregistre le jeton, et renvoie le
 * courriel à expédier — ou null s'il n'y a rien à envoyer.
 *
 * La lecture des en-têtes et l'écriture en base se font ici, pendant la
 * requête ; l'envoi lui-même est laissé à l'appelant, qui le fait après la
 * réponse. Sans cela, la page répondrait plus lentement pour une adresse
 * connue que pour une inconnue, et le chronomètre trahirait qui est client.
 */
export async function prepareReset(email: string): Promise<(() => Promise<unknown>) | null> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !utilisable(user)) return null;

  const [{ recentes }] = await db
    .select({ recentes: count() })
    .from(passwordResets)
    .where(
      and(
        eq(passwordResets.userId, user.id),
        gt(passwordResets.createdAt, new Date(Date.now() - 60 * 60_000)),
      ),
    );
  if (recentes >= PLAFOND_PAR_HEURE) return null;

  const token = newToken();
  await db.insert(passwordResets).values({
    tokenHash: hashToken(token),
    userId: user.id,
    expiresAt: new Date(Date.now() + VALIDITE_MS),
  });

  const url = `${await origine()}/connexion/reinitialiser/${token}`;
  const pole = user.role !== "direction" && user.departments?.[0] === "web" ? "web" : "social";

  return () =>
    sendMail({
      to: user.email,
      subject: "Réinitialiser votre mot de passe",
      text:
        `Bonjour ${user.name},\n\n` +
        "Vous avez demandé à changer le mot de passe de votre espace. Le lien ci-dessous est personnel, " +
        "valable une heure et une seule fois. Votre compte et tout ce qu'il contient restent tels quels.\n\n" +
        "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe actuel reste valable.",
      actionUrl: url,
      actionLabel: "Choisir un nouveau mot de passe",
      pole,
    });
}

/** Le compte visé par un lien encore valable, ou null. */
export async function userForResetToken(token: string): Promise<User | null> {
  if (!token) return null;
  const rows = await db
    .select({ user: users })
    .from(passwordResets)
    .innerJoin(users, eq(users.id, passwordResets.userId))
    .where(
      and(
        eq(passwordResets.tokenHash, hashToken(token)),
        isNull(passwordResets.usedAt),
        gt(passwordResets.expiresAt, new Date()),
      ),
    )
    .limit(1);
  const user = rows[0]?.user;
  return user && utilisable(user) ? user : null;
}

/**
 * Consomme le lien et remplace le mot de passe.
 *
 * Toutes les sessions ouvertes sont fermées : si le mot de passe a été changé
 * parce qu'un autre le connaissait, cet autre doit perdre l'accès dans la
 * même seconde. Les autres liens encore en circulation tombent aussi — un
 * seul suffit à rentrer, les suivants ne seraient que des portes de plus.
 */
export async function consumeReset(token: string, password: string): Promise<User | null> {
  const tokenHash = hashToken(token);
  const passwordHash = await hashPassword(password);

  return db.transaction(async (tx) => {
    // La condition sur usedAt dans l'UPDATE même : deux envois simultanés du
    // formulaire ne peuvent pas consommer le même lien deux fois.
    const [reset] = await tx
      .update(passwordResets)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResets.tokenHash, tokenHash),
          isNull(passwordResets.usedAt),
          gt(passwordResets.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!reset) return null;

    const [user] = await tx.select().from(users).where(eq(users.id, reset.userId)).limit(1);
    if (!user || !utilisable(user)) return null;

    await tx
      .update(users)
      // Un mot de passe existe désormais : une invitation encore ouverte n'a
      // plus lieu d'être.
      .set({ passwordHash, inviteToken: null, inviteExpiresAt: null })
      .where(eq(users.id, user.id));
    await tx
      .update(passwordResets)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResets.userId, user.id), isNull(passwordResets.usedAt)));
    await tx.delete(sessions).where(eq(sessions.userId, user.id));

    return user;
  });
}
