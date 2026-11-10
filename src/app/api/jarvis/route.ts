import { and, desc, eq } from "drizzle-orm";
import { agentThreads, db } from "@/db";
import { currentUser } from "@/lib/auth";
import { askJarvis } from "@/lib/agent/run";

/**
 * Jarvis : un message du PDG (texte ou dicté) → les agents agissent dans
 * Pilot → réponse + journal de ce qui a été fait. Réservé à l'équipe.
 */
export const maxDuration = 300;

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user || user.role === "client") return new Response("Non autorisé", { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  const rows = await db
    .select({ id: agentThreads.id, title: agentThreads.title, updatedAt: agentThreads.updatedAt, log: agentThreads.log, messages: agentThreads.messages })
    .from(agentThreads)
    .where(and(eq(agentThreads.userId, user.id), id ? eq(agentThreads.id, id) : undefined))
    .orderBy(desc(agentThreads.updatedAt))
    .limit(id ? 1 : 20);
  return Response.json(
    rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updatedAt, log: r.log, turns: id ? visibleTurns(r.messages) : undefined })),
  );
}

/** Les échanges lisibles (texte du PDG et réponses de Jarvis), sans les rouages des outils. */
function visibleTurns(messages: unknown[]) {
  const out: { role: "user" | "assistant"; text: string }[] = [];
  for (const m of messages as { role: string; content: unknown }[]) {
    const blocks = typeof m.content === "string" ? [{ type: "text", text: m.content }] : (m.content as { type: string; text?: string }[]);
    const text = blocks
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text!)
      .join("\n")
      .replace(/^\(Nous sommes le [^)]*\)\s*/, "")
      .trim();
    if (text && (m.role === "user" || m.role === "assistant")) out.push({ role: m.role as "user" | "assistant", text });
  }
  return out;
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user || user.role === "client") return new Response("Non autorisé", { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { threadId?: string; text?: string };
  const text = (body.text ?? "").trim();
  if (!text) return Response.json({ error: "Message vide." }, { status: 400 });

  let thread = body.threadId
    ? (await db.select().from(agentThreads).where(and(eq(agentThreads.id, body.threadId), eq(agentThreads.userId, user.id))).limit(1))[0]
    : undefined;
  if (!thread) {
    [thread] = await db.insert(agentThreads).values({ userId: user.id, title: text.slice(0, 70) }).returning();
  }

  try {
    const r = await askJarvis(user.id, thread.messages, text);
    const log = [...(thread.log ?? []), ...r.log];
    await db.update(agentThreads).set({ messages: r.messages, log, updatedAt: new Date() }).where(eq(agentThreads.id, thread.id));
    return Response.json({ threadId: thread.id, reply: r.reply, log: r.log });
  } catch (e) {
    return Response.json({ threadId: thread.id, error: (e as Error).message }, { status: 200 });
  }
}
