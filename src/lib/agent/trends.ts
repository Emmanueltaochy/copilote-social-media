import "server-only";

import { eq } from "drizzle-orm";
import { brands, clients, db, trendReports } from "@/db";
import { competitorPosts, type CompetitorPost } from "@/lib/metricool-competitors";
import { anthropicClient } from "./run";

/*
 * L'analyse des tendances : les publications qui marchent le mieux chez les
 * concurrents d'un client, lues par Claude, transformées en idées à adapter
 * — jamais à recopier telles quelles — dans la charte du client.
 */

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["resume", "tendances", "idees"],
  properties: {
    resume: { type: "string", description: "3 à 4 phrases : ce qui marche chez les concurrents en ce moment." },
    tendances: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["titre", "pourquoi", "exemples"],
        properties: {
          titre: { type: "string" },
          pourquoi: { type: "string", description: "Pourquoi ça marche, chiffres à l'appui (repris des publications fournies)." },
          exemples: { type: "array", items: { type: "string" }, description: "URL des publications concernées." },
        },
      },
    },
    idees: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["titre", "format", "reseau", "accroche", "legende", "consignes", "inspiration"],
        properties: {
          titre: { type: "string" },
          format: { type: "string", enum: ["reel", "carrousel", "feed", "story"] },
          reseau: { type: "string", enum: ["instagram", "facebook", "tiktok", "linkedin"] },
          accroche: { type: "string", description: "La première phrase / le hook à l'écran." },
          legende: { type: "string", description: "Légende prête à publier, dans le ton du client." },
          consignes: { type: "string", description: "Ce qu'il faut tourner ou créer, concrètement." },
          inspiration: { type: "string", description: "URL de la publication concurrente qui a inspiré l'idée." },
        },
      },
    },
  },
} as const;

type Result = {
  resume: string;
  tendances: { titre: string; pourquoi: string; exemples: string[] }[];
  idees: { titre: string; format: string; reseau: string; accroche: string; legende: string; consignes: string; inspiration: string }[];
};

function digest(p: CompetitorPost) {
  return {
    auteur: p.author,
    reseau: p.network,
    type: p.type,
    date: p.publishedAt?.slice(0, 10),
    url: p.url,
    texte: p.text.slice(0, 500),
    likes: p.likes,
    commentaires: p.comments,
    partages: p.shares,
    vues: p.views,
    interactions: p.interactions,
  };
}

export async function analyseTrends(clientId: string) {
  const [c] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!c) throw new Error("Client introuvable.");
  if (!c.metricoolBrandId) throw new Error("Ce client n'est pas relié à Metricool.");
  const { posts } = await competitorPosts(c.metricoolBrandId, 30);
  if (posts.length < 3) throw new Error("Pas encore assez de publications concurrentes relevées (Metricool les collecte sous 24 h après l'ajout d'un concurrent).");
  const top = posts.slice(0, 40).map(digest);
  const [b] = await db.select().from(brands).where(eq(brands.clientId, clientId)).limit(1);

  const client = await anthropicClient();
  const response = await client.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system:
      "Tu es le directeur de la stratégie de contenu de Taochy Agency (La Réunion). Tu analyses les publications des concurrents d'un client pour repérer les tendances qui marchent, puis tu proposes des idées à ADAPTER au client (jamais un plagiat : on reprend un mécanisme, un format, un angle, pas le texte). Tu ne cites que des chiffres présents dans les données fournies. Français, phrases courtes.",
    messages: [
      {
        role: "user",
        content: `Client : ${c.name}${c.sector ? ` (${c.sector})` : ""}.
Charte du client : ${b ? JSON.stringify({ ton: b.voice, mots_cles: b.tags, mots_interdits: b.bannedWords }) : "non renseignée"}.

Les publications les plus engageantes de ses concurrents sur 30 jours (triées) :
${JSON.stringify(top)}

Donne : un résumé, 3 à 5 tendances (avec les URL d'exemple), et 6 idées de contenus concrètes pour ce client, prêtes à produire.`,
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("L'analyse a été refusée par le modèle.");
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("Réponse vide.");
  const r = JSON.parse(text.text) as Result;
  const [row] = await db
    .insert(trendReports)
    .values({ clientId, summary: r.resume, trends: r.tendances, ideas: r.idees, postsAnalysed: top.length })
    .returning({ id: trendReports.id });
  return row.id;
}
