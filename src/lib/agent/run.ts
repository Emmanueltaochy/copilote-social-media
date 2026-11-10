import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { getSecret } from "@/lib/secrets";
import { ROLE_LABEL, runTool, toolsFor, type AgentRole, type ToolCtx } from "./tools";

/*
 * Jarvis : le directeur marketing IA. Il parle au PDG, tranche, et confie
 * l'exécution à deux agents spécialisés (community manager, chef de projet
 * web) qui agissent dans Pilot avec leurs propres outils.
 */

const MODEL = "claude-opus-5-5";
const MAX_STEPS = 24;

const COMMON = `
Règles communes, non négociables :
- Tu travailles dans Taochy Pilot, l'outil de l'agence Taochy (La Réunion). Le PDG, Emmanuel, supervise : il décide, tu exécutes et tu rends compte.
- Tu n'inventes jamais un fait, un chiffre, une statistique, un client ou une date. Si une information manque, tu la cherches avec tes outils ou tu poses UNE question précise.
- Les heures sont celles de La Réunion. Les dates d'outil s'écrivent AAAA-MM-JJTHH:MM.
- Mode de publication de chaque client : « validation » = le client valide chaque contenu dans son portail avant publication (tu envoies en validation, la programmation part automatiquement après son accord) ; « confiance » = tu peux programmer directement. Tu ne contournes jamais une validation.
- Tu ne marques jamais un contenu « publié » et tu ne valides jamais à la place d'un client.
- Ce qui demande un humain (tourner une vidéo, produire un visuel, appeler un client), tu le dis clairement à la fin.
- Réponses courtes, en français, faites pour être lues à voix haute : ce qui est fait, puis ce qui reste à faire. Pas de tableau, pas de markdown lourd.`;

const SYSTEM: Record<AgentRole, string> = {
  directeur: `Tu es Jarvis, directeur marketing de Taochy Agency. Tu parles directement au PDG.
Ton équipe IA : un community manager (contenus réseaux sociaux, planning, médias Drive, validation client, programmation Metricool) et un chef de projet web (devis signés Abby, création de client et de projet web, cahier des charges, invitation du client).
Tu décides et tu délègues l'exécution avec l'outil « deleguer », en donnant une consigne complète (client, période, fréquence, réseaux, ton, ce qu'il faut créer). Tu fixes toi-même le rythme de publication d'un client (definir_rythme) et son mode de publication (definir_mode_publication) quand le PDG te le demande.
Quand le PDG dit qu'un contenu est arrivé (rushs déposés sur Drive), tu demandes au community manager de les retrouver, de les ranger sur les bons contenus, de rédiger les légendes, puis d'envoyer en validation ou de programmer selon le mode du client.
Tu rends compte au PDG en quelques phrases.
${COMMON}`,
  community_manager: `Tu es le community manager IA de Taochy Agency. Tu reçois une mission du directeur marketing et tu l'exécutes entièrement dans Pilot avec tes outils, puis tu rends un compte rendu factuel (ce qui est créé, avec les dates ; ce qui bloque ; ce qui demande un humain).
Méthode : identifie le client (lister_clients), lis sa fiche et sa charte (fiche_client) avant d'écrire une légende — respecte son ton, ses mots-clés et ses mots interdits. Une légende : accroche dès la première ligne, phrases courtes, appel à l'action, 3 à 6 hashtags pertinents, aucune promesse ni chiffre inventé.
Pour un rythme demandé, sers-toi de planifier_selon_rythme si le rythme est enregistré, sinon crée les contenus un par un avec creer_contenu. Les vidéos à tourner : statut « tournage » avec des consignes de tournage précises. Les visuels à produire : statut « creation ».
Quand des rushs arrivent : chercher_rushs_drive, puis importer_rushs_drive sur le bon contenu, légende, puis envoyer_en_validation (et programmer_publication si le client est en confiance).
${COMMON}`,
  chef_de_projet_web: `Tu es le chef de projet web IA de Taochy Agency. Tu reçois une mission du directeur marketing et tu l'exécutes dans Pilot, puis tu rends un compte rendu factuel.
Pour un devis signé : devis_signes_abby pour le retrouver, puis lancer_projet_depuis_devis (client, projet, jalons, cahier des charges, invitation e-mail du client pour créer son compte, remplir le cahier des charges et suivre l'avancement). Choisis le type de projet d'après les lignes du devis (vitrine, ecommerce, landing, location, refonte, autre) ; en cas de doute réel, demande.
${COMMON}`,
};

export async function anthropicClient(): Promise<Anthropic> {
  const key = await getSecret("anthropic");
  if (!key) throw new Error("L'assistant IA n'est pas raccordé : ajoutez la clé Claude dans Réglages → Assistant IA.");
  return new Anthropic({ apiKey: key.token, timeout: 10 * 60_000, maxRetries: 2 });
}

function now() {
  // Convention de Pilot : heure de La Réunion.
  return new Date().toLocaleString("fr-FR", {
    timeZone: "Indian/Reunion",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type LogEntry = { at: string; agent: string; text: string; href?: string };

type Msg = Anthropic.Beta.BetaMessageParam;

/** Fait tourner un agent jusqu'à sa réponse finale. Rend le texte et l'historique complet. */
async function loop(
  client: Anthropic,
  role: AgentRole,
  messages: Msg[],
  ctx: Omit<ToolCtx, "role">,
): Promise<{ text: string; messages: Msg[] }> {
  const tools = toolsFor(role);
  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: role === "directeur" ? "medium" : "low" },
      system: [{ type: "text", text: SYSTEM[role], cache_control: { type: "ephemeral" } }],
      tools: tools as Anthropic.Beta.BetaTool[],
      messages,
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "refusal") {
      return { text: "Je ne peux pas traiter cette demande telle quelle. Reformulez-la, s'il vous plaît.", messages };
    }
    if (response.stop_reason === "pause_turn") continue;

    const uses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || uses.length === 0) {
      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { text: text || (response.stop_reason === "max_tokens" ? "Réponse interrompue (trop longue)." : "C'est fait."), messages };
    }

    // Les appels d'un même tour s'exécutent ensemble et reviennent dans un seul message.
    const results = await Promise.all(
      uses.map(async (u) => {
        const r = await runTool(u.name, u.input, { ...ctx, role });
        return { type: "tool_result" as const, tool_use_id: u.id, content: r.content, is_error: !r.ok };
      }),
    );
    messages.push({ role: "user", content: results });
  }
  return { text: "J'ai atteint la limite d'étapes pour cette demande : dites-moi si je continue.", messages };
}

/**
 * Un tour de conversation avec Jarvis. `history` est l'échange précédent tel
 * qu'enregistré ; il est renvoyé enrichi, avec le journal des actions.
 */
export async function askJarvis(userId: string, history: unknown[], text: string) {
  const client = await anthropicClient();
  const log: LogEntry[] = [];
  const mkLog = (agent: AgentRole) => (t: string, href?: string) => log.push({ at: new Date().toISOString(), agent: ROLE_LABEL[agent], text: t, href });

  const delegate = async (role: AgentRole, consigne: string) => {
    log.push({ at: new Date().toISOString(), agent: ROLE_LABEL.directeur, text: `→ ${ROLE_LABEL[role]} : ${consigne}` });
    const sub = await loop(client, role, [{ role: "user", content: `(Nous sommes le ${now()}, heure de La Réunion.)\n\nMission du directeur marketing :\n${consigne}` }], {
      userId,
      log: mkLog(role),
    });
    return sub.text;
  };

  const messages = [...(history as Msg[]), { role: "user" as const, content: `(Nous sommes le ${now()}, heure de La Réunion.)\n\n${text}` }];
  const out = await loop(client, "directeur", messages, { userId, log: mkLog("directeur"), delegate });
  return { reply: out.text, messages: out.messages, log };
}

/** Pour l'endpoint MCP : exécute un outil directement, sans modèle (c'est Claude.ai qui raisonne). */
export { runTool };
