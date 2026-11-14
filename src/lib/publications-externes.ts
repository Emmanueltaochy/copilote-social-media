import "server-only";

import { and, eq, gte, isNotNull, or } from "drizzle-orm";
import { activity, clients, contents, db, socialPosts } from "@/db";
import {
  groupExternal,
  mainOf,
  titleOf,
  toMarkPublished,
  type ExternalPost,
  type KnownContent,
} from "@/lib/publications-externes-core";

/*
 * Compte dans Pilot ce qui a été publié hors de Pilot.
 *
 * Le relevé Metricool (`social_posts`) contient toutes les publications d'un
 * compte, y compris celles postées directement dans Instagram. Ici, après
 * chaque relevé, on rapproche ce relevé des contenus de Pilot :
 * - un contenu prévu dans Pilot mais posté à la main passe « publié » ;
 * - une publication sans contenu dans Pilot en reçoit un, déjà publié.
 * L'engagement du mois, les listes et le portail du client la voient alors
 * comme n'importe quelle autre publication.
 *
 * On ne remonte pas avant le début du mois en cours : l'historique des mois
 * clos ne bouge pas.
 */

const NETWORK_ENUM = new Set(["instagram", "facebook", "linkedin", "tiktok", "google"]);
type Net = "instagram" | "facebook" | "linkedin" | "tiktok" | "google";
/** Au-delà, une publication retrouvée est du rattrapage : comptée, mais sans ligne d'activité. */
const RECENT_MS = 2 * 86_400_000 + 4 * 3_600_000;

let running: Promise<{ created: number; marked: number }> | null = null;

export function importExternalPublications(now: Date = new Date()) {
  running ??= run(now).finally(() => {
    running = null;
  });
  return running;
}

async function run(now: Date) {
  const since = new Date(now.getFullYear(), now.getMonth(), 1);
  const margin = new Date(since.getTime() - 3 * 86_400_000);
  const linked = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.active, true), isNotNull(clients.metricoolBrandId)));

  let created = 0;
  let marked = 0;
  for (const client of linked) {
    const rows = await db
      .select()
      .from(socialPosts)
      .where(and(eq(socialPosts.clientId, client.id), gte(socialPosts.publishedAt, since)));
    if (!rows.length) continue;
    const posts: ExternalPost[] = rows.map((r) => ({
      id: r.id,
      network: r.network,
      kind: r.kind,
      publishedAt: r.publishedAt,
      text: r.text,
      url: r.url,
    }));

    const existing = await db
      .select()
      .from(contents)
      .where(
        and(
          eq(contents.clientId, client.id),
          or(gte(contents.publishedAt, margin), gte(contents.scheduledAt, margin)),
        ),
      );
    const known: KnownContent[] = existing.map((c) => ({
      id: c.id,
      managed: Boolean(c.metricoolPostId) && c.metricoolState !== "externe",
      publishedAt: c.publishedAt,
      scheduledAt: c.scheduledAt,
      caption: c.caption,
      title: c.title,
      urls: [c.publishedUrl, ...c.metricoolNetworks.map((n) => n.url)].filter((u): u is string => Boolean(u)),
    }));

    // 1. Prévu dans Pilot, posté à la main : il devient « publié ».
    for (const [contentId, list] of toMarkPublished(posts, known)) {
      const c = existing.find((x) => x.id === contentId);
      if (!c) continue;
      const main = mainOf(list);
      await db
        .update(contents)
        .set({
          status: "publie",
          publishedAt: main.publishedAt,
          publishedUrl: main.url,
          metricoolState: "externe",
          metricoolNetworks: list.map((p) => ({ network: p.network, status: "PUBLISHED", url: p.url })),
          metricoolCheckedAt: now,
          publishBlocker: null,
          updatedAt: now,
        })
        .where(eq(contents.id, c.id));
      await db.insert(activity).values({
        clientId: client.id,
        contentId: c.id,
        actorLabel: "Metricool",
        text: `« ${c.title} » publié hors de Pilot, sur ${[...new Set(list.map((p) => p.network))].join(", ")}`,
      });
      marked++;
    }

    // 2. Aucun contenu dans Pilot : on en crée un, déjà publié.
    for (const g of groupExternal(posts, known)) {
      if (!NETWORK_ENUM.has(g.main.network)) continue;
      const title = titleOf(g);
      const [row] = await db
        .insert(contents)
        .values({
          clientId: client.id,
          title,
          kind: g.main.kind === "reel" || g.main.kind === "video" ? "reel" : "feed",
          network: g.main.network as Net,
          networks: g.networks.filter((n) => NETWORK_ENUM.has(n)),
          status: "publie",
          caption: g.main.text,
          publishedAt: g.main.publishedAt,
          publishedUrl: g.main.url,
          metricoolState: "externe",
          metricoolNetworks: g.posts.map((p) => ({ network: p.network, status: "PUBLISHED", url: p.url })),
          metricoolCheckedAt: now,
        })
        .returning({ id: contents.id });
      // Au premier passage, tout le mois arrive d'un coup : on ne note au fil
      // d'activité que ce qui vient d'être publié, pas le rattrapage.
      if (now.getTime() - g.main.publishedAt.getTime() < RECENT_MS) {
        await db.insert(activity).values({
          clientId: client.id,
          contentId: row.id,
          actorLabel: "Metricool",
          text: `« ${title} » publié hors de Pilot, sur ${g.networks.join(", ")} : ajouté au suivi`,
        });
      }
      created++;
    }
  }
  if (created || marked) console.log(`[pilot] publications hors Pilot : ${created} ajoutée(s), ${marked} marquée(s) publiée(s)`);
  return { created, marked };
}
