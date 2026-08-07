import { requireStaff } from "@/lib/auth";
import {
  directConversation,
  history,
  isMember,
  markRead,
  postMessage,
  teamConversation,
  threads,
  type ChatMessage,
} from "@/lib/chat";

export const dynamic = "force-dynamic";

/**
 * L'état de la messagerie, et l'envoi d'un message.
 *
 * Une route plutôt que des actions serveur : une conversation se rafraîchit
 * toutes les quelques secondes, et une action serveur recalcule la page
 * entière à chaque fois. Ici on ne transporte que les messages.
 */

type Payload = {
  conversationId: string;
  messages: ChatMessage[];
};

/**
 * Résout la conversation demandée.
 *
 * Une conversation directe peut ne pas encore exister : on la désigne alors
 * par la personne (`peer`), et elle naît à la première ouverture. Demander à
 * l'écran de créer d'abord puis d'écrire ensuite ferait deux allers-retours
 * pour un geste qui n'en vaut qu'un.
 */
async function resolve(
  userId: string,
  conversation: string | null,
  peer: string | null,
): Promise<string | null> {
  if (conversation) {
    return (await isMember(conversation, userId)) ? conversation : null;
  }
  if (peer) return directConversation(userId, peer);
  return null;
}

export async function GET(request: Request) {
  const user = await requireStaff();
  const url = new URL(request.url);

  // Garantit l'existence du fil d'équipe et l'adhésion de la personne, même
  // pour un compte créé après lui.
  await teamConversation(user.id);

  const id = await resolve(
    user.id,
    url.searchParams.get("conversation"),
    url.searchParams.get("peer"),
  );

  let payload: Payload | null = null;
  if (id) {
    // Ouvrir vaut lire. Le faire ici plutôt que dans un appel séparé évite
    // qu'un rafraîchissement pendant qu'on lit fasse repasser le fil en
    // non-lu sous les yeux de la personne.
    if (url.searchParams.get("read") !== "0") await markRead(id, user.id);
    payload = { conversationId: id, messages: await history(id) };
  }

  return Response.json({
    me: user.id,
    threads: await threads(user.id),
    open: payload,
  });
}

export async function POST(request: Request) {
  const user = await requireStaff();

  let input: { conversation?: string; peer?: string; body?: string };
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Requête illisible." }, { status: 400 });
  }

  const body = String(input.body ?? "").trim();
  if (!body) return Response.json({ error: "Message vide." }, { status: 400 });

  const id = await resolve(user.id, input.conversation ?? null, input.peer ?? null);
  if (!id) return Response.json({ error: "Conversation introuvable." }, { status: 404 });

  await postMessage(id, { id: user.id, name: user.name }, body);

  return Response.json({
    me: user.id,
    threads: await threads(user.id),
    open: { conversationId: id, messages: await history(id) },
  });
}
