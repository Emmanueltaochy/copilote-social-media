import "server-only";

import { headers } from "next/headers";
import { and, eq, isNull, or, sql as raw } from "drizzle-orm";
import { db, notifications, users } from "@/db";
import { sendMail } from "./mail";

/**
 * Qui est prévenu, et comment.
 *
 * Une règle gouverne tout : on prévient les gens que ça concerne, et personne
 * d'autre. Une notification qui arrive à tout le monde à chaque fois cesse
 * d'être lue au bout d'une semaine, et c'est alors celle qui comptait qu'on
 * rate.
 *
 * Quand un contenu a un responsable, il est seul prévenu. Sans responsable,
 * c'est toute l'équipe — l'absence de nom veut dire « à nous », pas
 * « à personne ». La direction reçoit en plus ce qui engage l'agence :
 * publications et refus client.
 */
export type NotifyKind =
  | "assignation"
  | "validation_attendue"
  | "valide"
  | "modification_demandee"
  | "publie"
  | "tournage"
  | "message";

export type NotifyInput = {
  kind: NotifyKind;
  title: string;
  body?: string;
  href?: string;
  clientId?: string | null;
  contentId?: string | null;
  /** Destinataires explicites. Sinon, `audience` décide. */
  userIds?: string[];
  /**
   * « owner » : le responsable, ou toute l'équipe s'il n'y en a pas.
   * « equipe » : tous les comptes internes.
   * « direction » : la direction seule.
   * « client » : les contacts du client concerné.
   */
  audience?: "owner" | "equipe" | "direction" | "client";
  ownerId?: string | null;
  /** L'auteur de l'action ne se prévient pas lui-même. */
  exceptUserId?: string | null;
};

/**
 * L'adresse publique du site, pour que les liens des courriels mènent quelque
 * part. Derrière nginx, c'est l'en-tête transmis qui porte le vrai domaine.
 */
async function origin(): Promise<string> {
  try {
    const head = await headers();
    const host = head.get("x-forwarded-host") ?? head.get("host") ?? "";
    if (!host) return "";
    const scheme =
      head.get("x-forwarded-proto") ??
      (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
    return `${scheme}://${host}`;
  } catch {
    return "";
  }
}

/* Petits fragments SQL, isolés pour rester lisibles au milieu des conditions. */
const inList = (ids: string[]) =>
  raw`${users.id} in (${raw.join(
    ids.map((i) => raw`${i}::uuid`),
    raw`, `,
  )})`;
const gtNow = () => raw`${users.accessExpiresAt} > now()`;

async function recipients(input: NotifyInput) {
  if (input.userIds?.length) {
    return db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(and(eq(users.active, true), inList(input.userIds)));
  }

  if (input.audience === "client" && input.clientId) {
    return db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(and(eq(users.active, true), eq(users.role, "client"), eq(users.clientId, input.clientId)));
  }

  if (input.audience === "direction") {
    return db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(and(eq(users.active, true), eq(users.role, "direction")));
  }

  // « owner » avec un responsable désigné : lui seul.
  if (input.audience === "owner" && input.ownerId) {
    return db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(and(eq(users.active, true), eq(users.id, input.ownerId)));
  }

  // Toute l'équipe : « owner » sans responsable, ou « equipe ».
  return db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(
      and(
        eq(users.active, true),
        or(eq(users.role, "direction"), eq(users.role, "equipe")),
        // Un accès expiré n'a plus à être notifié : le renfort est parti.
        or(isNull(users.accessExpiresAt), gtNow()),
      ),
    );
}

/**
 * Crée les notifications et envoie les courriels.
 *
 * Ne lève jamais : prévenir est un effet de bord de l'action, pas sa raison
 * d'être. Valider un contenu doit rester valide même si la messagerie est
 * injoignable — l'échec est alors inscrit à côté de la notification, où il
 * reste consultable, plutôt que perdu.
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    const people = (await recipients(input)).filter((p) => p.id !== input.exceptUserId);
    if (people.length === 0) return;

    const base = await origin();
    const url = input.href && base ? `${base}${input.href}` : undefined;

    const rows = await db
      .insert(notifications)
      .values(
        people.map((p) => ({
          userId: p.id,
          kind: input.kind,
          title: input.title,
          body: input.body ?? null,
          href: input.href ?? null,
          clientId: input.clientId ?? null,
          contentId: input.contentId ?? null,
        })),
      )
      .returning({ id: notifications.id, userId: notifications.userId });

    const byUser = new Map(rows.map((r) => [r.userId, r.id]));

    // Les envois se font en parallèle : la boîte de l'agence répond en
    // quelques centaines de millisecondes, et enchaîner cinq destinataires
    // ferait attendre l'écran pour rien.
    await Promise.all(
      people.map(async (p) => {
        const result = await sendMail({
          to: p.email,
          subject: input.title,
          text: input.body ? `Bonjour ${p.name},\n\n${input.body}` : `Bonjour ${p.name},`,
          actionUrl: url,
          actionLabel: "Ouvrir dans Taochy Pilot",
        });

        const id = byUser.get(p.id);
        if (!id) return;
        await db
          .update(notifications)
          .set(
            result.error
              ? { emailError: result.error }
              : { emailedAt: new Date(), emailError: null },
          )
          .where(eq(notifications.id, id));
      }),
    );
  } catch (error) {
    console.error("[pilot] notification impossible", error);
  }
}

/** Notifications non lues d'une personne, pour la cloche. */
export async function unread(userId: string, limit = 12) {
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .orderBy(raw`${notifications.createdAt} desc`)
    .limit(limit);
}

export async function recent(userId: string, limit = 30) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(raw`${notifications.createdAt} desc`)
    .limit(limit);
}

export async function countUnread(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: raw<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.n ?? 0;
}
