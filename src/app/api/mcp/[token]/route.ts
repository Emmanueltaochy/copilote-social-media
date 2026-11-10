import { timingSafeEqual } from "node:crypto";
import { getSecret } from "@/lib/secrets";
import { mcpTools, runTool } from "@/lib/agent/tools";

/**
 * Pilot comme connecteur MCP pour Claude.ai (transport HTTP, sans état).
 *
 * Une conversation Claude reliée à Canva peut ainsi créer les visuels dans la
 * charte d'un client, puis créer, envoyer en validation et programmer les
 * publications dans Pilot — avec exactement les mêmes outils et les mêmes
 * règles que Jarvis (validation client respectée, jamais « publié »).
 * L'adresse contient un jeton secret, généré dans Réglages.
 */

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

async function authorized(token: string): Promise<{ userId: string } | null> {
  const s = await getSecret("mcp");
  if (!s || !s.account) return null;
  const a = Buffer.from(s.token);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b) ? { userId: s.account } : null;
}

async function handle(msg: Rpc, userId: string) {
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id ?? null, result });
  switch (msg.method) {
    case "initialize":
      return ok({
        protocolVersion: (msg.params?.protocolVersion as string) ?? "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "taochy-pilot", version: "1.0.0" },
        instructions:
          "Outils de Taochy Pilot (agence Taochy, La Réunion). Heures : La Réunion, format AAAA-MM-JJTHH:MM. Commencez par lister_clients puis fiche_client (charte : ton, couleurs, mots interdits) avant de créer. Un client « validation » valide dans son portail avant toute publication : utilisez envoyer_en_validation ; un client « confiance » peut être programmé directement. Pour joindre un visuel créé ailleurs (Canva), exportez-le dans le dossier Drive du client puis utilisez chercher_rushs_drive et importer_rushs_drive.",
      });
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: mcpTools().map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const tool = mcpTools().find((t) => t.name === name);
      if (!tool) return ok({ content: [{ type: "text", text: `Outil inconnu : ${name}` }], isError: true });
      const r = await runTool(name, msg.params?.arguments ?? {}, { userId, role: tool.role, log: () => {} });
      return ok({ content: [{ type: "text", text: r.content }], isError: !r.ok });
    }
    default:
      return { jsonrpc: "2.0", id: msg.id ?? null, error: { code: -32601, message: `Méthode inconnue : ${msg.method}` } };
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const auth = await authorized((await params).token);
  if (!auth) return new Response("Non autorisé", { status: 401 });
  const body = (await request.json().catch(() => null)) as Rpc | Rpc[] | null;
  if (!body) return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON invalide" } }, { status: 400 });
  const list = Array.isArray(body) ? body : [body];
  const out = [];
  for (const m of list) {
    if (m.id === undefined || m.method.startsWith("notifications/")) continue; // notification : pas de réponse
    out.push(await handle(m, auth.userId));
  }
  if (!out.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? out : out[0]);
}

export async function GET() {
  return new Response("Méthode non prise en charge", { status: 405, headers: { Allow: "POST" } });
}

export async function DELETE() {
  return new Response(null, { status: 405 });
}
