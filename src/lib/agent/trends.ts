import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { brands, clients, db, trendReports, veilleAccounts } from "@/db";
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

function digest(p: CompetitorPost, role: string) {
  return {
    source: role,
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

/**
 * Les tendances actuelles du secteur, cherchées sur le web par Claude
 * (formats, accroches, sujets), avec leurs sources. Vide si la recherche
 * web n'est pas disponible : l'analyse continue avec les comptes suivis.
 */
async function tendancesDuSecteur(client: Anthropic, secteur: string): Promise<string> {
  const mois = new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "Indian/Reunion" });
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Secteur d'activité : ${secteur}.
Cherche sur le web les tendances de contenu sur les réseaux sociaux (Instagram, TikTok, Facebook, LinkedIn) qui fonctionnent en ce moment (${mois}) pour ce secteur, ou pour des secteurs voisins dont le format s'adapte : formats, accroches, types de vidéos, sujets, sons ou défis.
Réponds en 6 à 10 puces courtes en français. Chaque puce : la tendance, pourquoi elle marche, et l'URL de la source. N'invente rien : si tu ne trouves pas de source récente, dis-le.`,
    },
  ];
  try {
    for (let i = 0; i < 3; i++) {
      const r = await client.messages.create({
        model: "claude-opus-5-5",
        max_tokens: 8000,
        output_config: { effort: "low" },
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
        messages,
      } as Anthropic.MessageCreateParamsNonStreaming);
      if (r.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: r.content as Anthropic.ContentBlockParam[] });
        continue;
      }
      if (r.stop_reason === "refusal") return "";
      return r.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
    }
  } catch (e) {
    console.warn("[pilot] tendances du secteur", e);
  }
  return "";
}

export async function analyseTrends(clientId: string) {
  const [c] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!c) throw new Error("Client introuvable.");
  if (!c.metricoolBrandId) throw new Error("Ce client n'est pas relié à Metricool.");
  const { posts } = await competitorPosts(c.metricoolBrandId, 30);
  const roles = await db.select().from(veilleAccounts).where(eq(veilleAccounts.clientId, clientId));
  const roleMap = new Map(roles.map((r) => [`${r.network}:${r.handle}`, r.kind]));
  const roleOf = (p: CompetitorPost) =>
    roleMap.get(`${p.network}:${p.author.replace(/^@/, "").trim().toLowerCase()}`) === "inspiration" ? "inspiration du secteur" : "concurrent direct";
  const top = posts.slice(0, 40).map((p) => digest(p, roleOf(p)));
  const [b] = await db.select().from(brands).where(eq(brands.clientId, clientId)).limit(1);

  const client = await anthropicClient();
  const secteur = c.sector || "";
  const web = secteur ? await tendancesDuSecteur(client, secteur) : "";
  if (top.length < 3 && !web) {
    throw new Error(
      secteur
        ? "Pas encore assez de publications relevées (Metricool les collecte sous 24 h après l'ajout d'un compte), et la recherche des tendances du secteur n'a rien donné."
        : "Pas encore assez de publications relevées. Renseignez aussi le secteur d'activité du client (fiche client) pour que l'IA cherche les tendances du secteur sur le web.",
    );
  }
  const response = await client.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system:
      "Tu es le directeur de la stratégie de contenu de Taochy Agency (La Réunion). Tu analyses ce qui marche chez les concurrents directs d'un client, chez des comptes d'inspiration (même métier ailleurs, ou secteur voisin) et dans les tendances actuelles du secteur, puis tu proposes des idées à ADAPTER au client (jamais un plagiat : on reprend un mécanisme, un format, un angle, pas le texte). Une idée venue d'un autre secteur doit être transposée au métier du client. Tu ne cites que des chiffres présents dans les données fournies. Français, phrases courtes.",
    messages: [
      {
        role: "user",
        content: `Client : ${c.name}${secteur ? ` (${secteur})` : ""}.
Charte du client : ${b ? JSON.stringify({ ton: b.voice, mots_cles: b.tags, mots_interdits: b.bannedWords }) : "non renseignée"}.

Les publications les plus engageantes des comptes suivis sur 30 jours (triées ; « source » dit s'il s'agit d'un concurrent direct ou d'une inspiration du secteur) :
${top.length ? JSON.stringify(top) : "aucune pour l'instant"}

Tendances actuelles du secteur trouvées sur le web (avec leurs sources) :
${web || "non disponibles"}

Donne : un résumé, 3 à 5 tendances (avec les URL d'exemple ou de source), et 6 idées de contenus concrètes pour ce client, prêtes à produire. Dans « inspiration », mets l'URL de la publication ou de la source qui a inspiré l'idée.`,
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
