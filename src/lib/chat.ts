import "server-only";

import { and, asc, desc, eq, isNull, ne, or, sql as raw } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers, conversations, messages, notifications, users } from "@/db/schema";
import { notify } from "./notify";

/**
 * La messagerie interne.
 *
 * Deux formes de conversation, et pas une de plus : le fil de l'équipe, et le
 * tête-à-tête. Des salons libres finissent en archives mortes où l'on cherche
 * ensuite dans lequel telle décision a été prise ; ici, on sait toujours où
 * une chose a été dite.
 *
 * Elle est réservée aux comptes internes. Un client a son portail, qui est un
 * autre lieu avec d'autres règles — un fil où l'agence parle de ses clients ne
 * peut pas avoir un client dedans.
 */

export type Peer = {
  id: string;
  name: string;
  initials: string;
  avatarPath: string | null;
};

/** Les comptes internes joignables, sauf soi-même. */
export async function chatPeers(selfId: string): Promise<Peer[]> {
  return db
    .select({
      id: users.id,
      name: users.name,
      initials: users.initials,
      avatarPath: users.avatarPath,
    })
    .from(users)
    .where(
      and(
        eq(users.active, true),
        ne(users.id, selfId),
        or(eq(users.role, "direction"), eq(users.role, "equipe")),
        // Un renfort dont l'accès a expiré n'est plus joignable ici : lui
        // écrire donnerait l'illusion d'avoir prévenu quelqu'un.
        or(isNull(users.accessExpiresAt), raw`${users.accessExpiresAt} > now()`),
        // Un compte encore en attente d'invitation n'a jamais ouvert l'outil.
        raw`${users.passwordHash} is not null`,
      ),
    )
    .orderBy(asc(users.name));
}

/**
 * Le fil de l'équipe, créé au premier usage.
 *
 * L'adhésion est rattrapée à chaque ouverture plutôt qu'au moment où un compte
 * est créé : une personne arrivée après la création du fil doit y être, et
 * accrocher cette mise à jour à la création d'un compte laisserait dehors tous
 * ceux d'avant.
 */
export async function teamConversation(userId: string): Promise<string> {
  const [existing] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.kind, "equipe"))
    .limit(1);

  const id =
    existing?.id ??
    (
      await db.insert(conversations).values({ kind: "equipe" }).returning({ id: conversations.id })
    )[0].id;

  await db
    .insert(conversationMembers)
    .values({ conversationId: id, userId })
    .onConflictDoNothing();

  return id;
}

/** Le tête-à-tête entre deux personnes, créé au premier message. */
export async function directConversation(a: string, b: string): Promise<string> {
  // Une conversation directe est identifiée par ses deux membres, pas par un
  // nom : sans cette recherche, réécrire à quelqu'un ouvrirait un second fil
  // à côté du premier et l'historique se couperait en deux.
  const [found] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.kind, "direct"),
        raw`exists (select 1 from conversation_members m where m.conversation_id = ${conversations.id} and m.user_id = ${a}::uuid)`,
        raw`exists (select 1 from conversation_members m where m.conversation_id = ${conversations.id} and m.user_id = ${b}::uuid)`,
      ),
    )
    .limit(1);

  if (found) return found.id;

  const [created] = await db
    .insert(conversations)
    .values({ kind: "direct" })
    .returning({ id: conversations.id });

  await db
    .insert(conversationMembers)
    .values([
      { conversationId: created.id, userId: a },
      { conversationId: created.id, userId: b },
    ])
    .onConflictDoNothing();

  return created.id;
}

export type Thread = {
  conversationId: string;
  kind: "equipe" | "direct";
  /** L'autre personne, pour un tête-à-tête. */
  peer: Peer | null;
  title: string;
  unread: number;
  lastAt: Date | null;
  lastPreview: string | null;
  lastAuthor: string | null;
};

/**
 * Toutes les conversations de quelqu'un, non-lus compris.
 *
 * Les personnes avec qui l'on n'a jamais parlé apparaissent quand même, sans
 * conversation derrière : une messagerie qui n'affiche que les fils existants
 * oblige à chercher ailleurs comment engager le premier message.
 */
export async function threads(userId: string): Promise<Thread[]> {
  const teamId = await teamConversation(userId);

  const rows = await db
    .select({
      conversationId: conversations.id,
      kind: conversations.kind,
      lastReadAt: conversationMembers.lastReadAt,
      unread: raw<number>`(
        select count(*) from messages m
        where m.conversation_id = ${conversations.id}
          and m.author_id is distinct from ${userId}::uuid
          and (${conversationMembers.lastReadAt} is null or m.created_at > ${conversationMembers.lastReadAt})
      )::int`,
      lastAt: raw<Date | null>`(
        select max(m.created_at) from messages m where m.conversation_id = ${conversations.id}
      )`,
      lastPreview: raw<string | null>`(
        select m.body from messages m
        where m.conversation_id = ${conversations.id}
        order by m.created_at desc limit 1
      )`,
      lastAuthor: raw<string | null>`(
        select u.name from messages m left join users u on u.id = m.author_id
        where m.conversation_id = ${conversations.id}
        order by m.created_at desc limit 1
      )`,
    })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(eq(conversationMembers.userId, userId));

  // L'autre membre de chaque tête-à-tête, en une requête plutôt qu'une par fil.
  const directIds = rows.filter((r) => r.kind === "direct").map((r) => r.conversationId);
  const peers = new Map<string, Peer>();
  if (directIds.length > 0) {
    const found = await db
      .select({
        conversationId: conversationMembers.conversationId,
        id: users.id,
        name: users.name,
        initials: users.initials,
        avatarPath: users.avatarPath,
      })
      .from(conversationMembers)
      .innerJoin(users, eq(users.id, conversationMembers.userId))
      .where(
        and(
          ne(conversationMembers.userId, userId),
          raw`${conversationMembers.conversationId} in (${raw.join(
            directIds.map((i) => raw`${i}::uuid`),
            raw`, `,
          )})`,
        ),
      );
    for (const f of found) {
      peers.set(f.conversationId, {
        id: f.id,
        name: f.name,
        initials: f.initials,
        avatarPath: f.avatarPath,
      });
    }
  }

  const list: Thread[] = rows.map((r) => {
    const peer = peers.get(r.conversationId) ?? null;
    return {
      conversationId: r.conversationId,
      kind: r.kind,
      peer,
      title: r.kind === "equipe" ? "Toute l'équipe" : (peer?.name ?? "Compte supprimé"),
      unread: Number(r.unread ?? 0),
      lastAt: r.lastAt ? new Date(r.lastAt) : null,
      lastPreview: r.lastPreview,
      lastAuthor: r.lastAuthor,
    };
  });

  // Les collègues à qui l'on n'a encore jamais écrit.
  const known = new Set(list.map((t) => t.peer?.id).filter(Boolean));
  for (const p of await chatPeers(userId)) {
    if (known.has(p.id)) continue;
    list.push({
      conversationId: "",
      kind: "direct",
      peer: p,
      title: p.name,
      unread: 0,
      lastAt: null,
      lastPreview: null,
      lastAuthor: null,
    });
  }

  // Le fil de l'équipe d'abord — c'est le lieu par défaut. Ensuite les
  // conversations les plus récentes, puis celles qui n'ont jamais servi.
  return list.sort((a, b) => {
    if (a.conversationId === teamId) return -1;
    if (b.conversationId === teamId) return 1;
    if (a.lastAt && b.lastAt) return b.lastAt.getTime() - a.lastAt.getTime();
    if (a.lastAt) return -1;
    if (b.lastAt) return 1;
    return a.title.localeCompare(b.title, "fr");
  });
}

export type ChatMessage = {
  id: string;
  body: string;
  createdAt: Date;
  authorId: string | null;
  authorName: string;
  authorInitials: string;
  authorAvatar: string | null;
};

/** Vérifie l'appartenance avant de rendre quoi que ce soit. */
export async function isMember(conversationId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function history(conversationId: string, limit = 60): Promise<ChatMessage[]> {
  const rows = await db
    .select({
      id: messages.id,
      body: messages.body,
      createdAt: messages.createdAt,
      authorId: messages.authorId,
      authorName: users.name,
      authorInitials: users.initials,
      authorAvatar: users.avatarPath,
    })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.authorId))
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  return rows
    .map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.createdAt,
      authorId: r.authorId,
      authorName: r.authorName ?? "Compte supprimé",
      authorInitials: r.authorInitials ?? "?",
      authorAvatar: r.authorAvatar,
    }))
    .reverse();
}

/**
 * Marque une conversation lue, et éteint les notifications qui en venaient.
 *
 * Sans le second geste, la cloche continuerait d'annoncer des messages qu'on
 * vient de lire sous ses yeux — et une cloche qui se trompe cesse d'être
 * regardée.
 */
export async function markRead(conversationId: string, userId: string): Promise<void> {
  await db
    .update(conversationMembers)
    .set({ lastReadAt: new Date() })
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    );

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.kind, "message"),
        isNull(notifications.readAt),
        raw`${notifications.href} like ${`%chat=${conversationId}%`}`,
      ),
    );
}

/** Écrit un message et prévient les autres membres. */
export async function postMessage(
  conversationId: string,
  author: { id: string; name: string },
  body: string,
): Promise<void> {
  const texte = body.trim();
  if (!texte) return;

  await db
    .insert(messages)
    .values({ conversationId, authorId: author.id, body: texte.slice(0, 4000) });

  // Écrire vaut lecture : sans cela, son propre message compterait comme
  // non-lu au prochain calcul.
  await markRead(conversationId, author.id);

  const [conversation] = await db
    .select({ kind: conversations.kind })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  const others = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        ne(conversationMembers.userId, author.id),
      ),
    );

  if (others.length > 0) {
    await notify({
      kind: "message",
      title:
        conversation?.kind === "equipe"
          ? `${author.name} a écrit à l'équipe`
          : `Message de ${author.name}`,
      body: texte.length > 140 ? `${texte.slice(0, 140)}…` : texte,
      href: `/?chat=${conversationId}`,
      userIds: others.map((o) => o.userId),
      // La cloche suffit : un courriel par réplique ferait fuir l'expéditeur.
      email: false,
    });
  }
}

/** Le total de messages non lus, pour la pastille de la bulle. */
export async function unreadTotal(userId: string): Promise<number> {
  const rows = await db
    .select({
      n: raw<number>`(
        select count(*) from messages m
        where m.conversation_id = ${conversationMembers.conversationId}
          and m.author_id is distinct from ${userId}::uuid
          and (${conversationMembers.lastReadAt} is null or m.created_at > ${conversationMembers.lastReadAt})
      )::int`,
    })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId));

  return rows.reduce((total, r) => total + Number(r.n ?? 0), 0);
}
