import "server-only";

import { metricoolConfig } from "@/lib/metricool";

/*
 * Boîte de réception : messages privés et commentaires, lus chez Metricool
 * au moment où l'on ouvre l'écran (pas en tâche de fond : Metricool note
 * chaque lecture comme « lu »). Un cache de quelques minutes évite de
 * relire tous les comptes à chaque clic.
 */

const BASE = "https://app.metricool.com/api";
const DM_PROVIDERS: Record<string, string> = {
  instagram: "INSTAGRAM",
  facebook: "FACEBOOK",
};
const COMMENT_PROVIDERS: Record<string, string> = {
  instagram: "INSTAGRAM",
  facebook: "FACEBOOK",
  linkedin: "LINKEDIN",
  youtube: "YOUTUBE",
};

export type InboxMessage = {
  id: string;
  author: string;
  mine: boolean;
  text: string;
  at: string;
};
export type InboxThread = {
  key: string;
  kind: "message" | "commentaire";
  provider: string;
  network: string;
  brandId: string;
  clientId: string;
  clientName: string;
  id: string;
  status: string;
  updatedAt: string;
  who: string;
  /** Pour répondre à un message privé : l'identifiant de l'interlocuteur. */
  recipient: string | null;
  /** Pour répondre à un commentaire : l'identifiant du commentaire. */
  objectId: string | null;
  link: string | null;
  postText: string | null;
  messages: InboxMessage[];
};

type Brand = {
  clientId: string;
  clientName: string;
  brandId: string;
  networks: string[];
};

const cache = new Map<
  string,
  { at: number; threads: InboxThread[]; errors: string[] }
>();
const TTL = 3 * 60_000;

async function get<T>(token: string, userId: string, path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(BASE + path);
  url.searchParams.set("userId", userId);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // Metricool renvoie parfois un 502 passager : un second essai suffit en général.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: { "X-Mc-Auth": token, Accept: "application/json" },
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
    if (res.ok) return (await res.json()) as T;
    if (res.status < 500 || attempt >= 1) throw new Error(`Metricool ${res.status}`);
    await new Promise((r) => setTimeout(r, 800));
  }
}

const iso = (s: string | undefined) =>
  s
    ? new Date(s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2")).toISOString()
    : new Date(0).toISOString();

type RawConv = {
  id: string;
  self: string;
  status: string;
  lastUpdateTime: string;
  participants: { id: string; name: string }[];
  messages?: {
    id: string;
    from: string;
    text?: string;
    publicationDateTime: string;
  }[];
};
type RawComment = {
  id: string;
  creationDate: string;
  owner: string;
  text?: string;
  comments?: RawComment[];
};
type RawThread = {
  id: string;
  self: string;
  status: string;
  lastUpdateTime: string;
  participants: { id: string; name: string }[];
  root: RawComment & { element?: { id: string; link?: string; text?: string } };
};

async function loadBrand(
  token: string,
  userId: string,
  b: Brand,
): Promise<{ threads: InboxThread[]; errors: string[] }> {
  const hit = cache.get(b.brandId);
  if (hit && Date.now() - hit.at < TTL) return hit;
  const threads: InboxThread[] = [];
  const errors: string[] = [];
  const jobs: Promise<void>[] = [];

  for (const net of b.networks) {
    const dm = DM_PROVIDERS[net];
    if (dm) {
      jobs.push(
        get<{ data?: RawConv[] }>(token, userId, "/v2/inbox/conversations", {
          blogId: b.brandId,
          provider: dm,
        })
          .then((r) => {
            for (const c of r.data ?? []) {
              const other = c.participants.find((p) => p.id !== c.self);
              const names = new Map(c.participants.map((p) => [p.id, p.name]));
              threads.push({
                key: `${b.brandId}:m:${c.id}`,
                kind: "message",
                provider: dm,
                network: net,
                brandId: b.brandId,
                clientId: b.clientId,
                clientName: b.clientName,
                id: c.id,
                status: c.status,
                updatedAt: iso(c.lastUpdateTime),
                who: other?.name ?? "Inconnu",
                recipient: other?.id ?? null,
                objectId: null,
                link: null,
                postText: null,
                messages: (c.messages ?? [])
                  .map((m) => ({
                    id: m.id,
                    author: names.get(m.from) ?? m.from,
                    mine: m.from === c.self,
                    text: m.text ?? "(pièce jointe)",
                    at: iso(m.publicationDateTime),
                  }))
                  .sort((x, y) => x.at.localeCompare(y.at)),
              });
            }
          })
          .catch(
            (e) =>
              void errors.push(
                `${b.clientName} · messages ${net} : ${(e as Error).message}`,
              ),
          ),
      );
    }
    const cp = COMMENT_PROVIDERS[net];
    if (cp) {
      jobs.push(
        get<{ data?: RawThread[] }>(token, userId, "/v2/inbox/post-comments", {
          blogId: b.brandId,
          provider: cp,
        })
          .then((r) => {
            for (const t of r.data ?? []) {
              const root = t.root;
              // Facebook donne l'identifiant de l'auteur, pas son nom : on le retrouve parmi les participants.
              const names = new Map(t.participants.map((p) => [p.id, p.name]));
              const name = (id: string) => names.get(id) ?? id;
              const own = new Set(
                t.participants
                  .filter((p) => p.id === t.self)
                  .map((p) => p.name),
              );
              const flat = [root, ...(root.comments ?? [])];
              threads.push({
                key: `${b.brandId}:c:${t.id}`,
                kind: "commentaire",
                provider: cp,
                network: net,
                brandId: b.brandId,
                clientId: b.clientId,
                clientName: b.clientName,
                id: t.id,
                status: t.status,
                updatedAt: iso(t.lastUpdateTime),
                who: name(root.owner),
                recipient: null,
                objectId: root.id,
                link: root.element?.link ?? null,
                postText: root.element?.text ?? null,
                messages: flat.map((m) => ({
                  id: m.id,
                  author: name(m.owner),
                  mine: own.has(m.owner) || m.owner === t.self,
                  text: m.text ?? "",
                  at: iso(m.creationDate),
                })),
              });
            }
          })
          .catch(
            (e) =>
              void errors.push(
                `${b.clientName} · commentaires ${net} : ${(e as Error).message}`,
              ),
          ),
      );
    }
  }
  await Promise.all(jobs);
  const out = { at: Date.now(), threads, errors };
  cache.set(b.brandId, out);
  return out;
}

export async function loadInbox(brands: Brand[], fresh = false) {
  const cfg = await metricoolConfig();
  if (!cfg)
    return {
      threads: [] as InboxThread[],
      errors: ["Metricool n'est pas raccordé."],
    };
  if (fresh) for (const b of brands) cache.delete(b.brandId);
  const threads: InboxThread[] = [];
  const errors: string[] = [];
  // Quatre comptes à la fois : assez pour aller vite, pas assez pour se faire limiter.
  for (let i = 0; i < brands.length; i += 4) {
    const batch = await Promise.all(
      brands.slice(i, i + 4).map((b) => loadBrand(cfg.token, cfg.userId, b)),
    );
    for (const r of batch) {
      threads.push(...r.threads);
      errors.push(...r.errors);
    }
  }
  threads.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { threads, errors };
}

export function forgetInboxCache(brandId: string) {
  cache.delete(brandId);
}

export async function sendReply(
  t: {
    kind: string;
    provider: string;
    brandId: string;
    id: string;
    recipient: string | null;
    objectId: string | null;
  },
  text: string,
) {
  const cfg = await metricoolConfig();
  if (!cfg) throw new Error("Metricool n'est pas raccordé.");
  const isDm = t.kind === "message";
  const url = new URL(
    BASE + (isDm ? "/v2/inbox/conversations" : "/v2/inbox/post-comments"),
  );
  url.searchParams.set("userId", cfg.userId);
  url.searchParams.set("blogId", t.brandId);
  const body = isDm
    ? {
        provider: t.provider,
        conversationId: t.id,
        recipient: t.recipient,
        text,
      }
    : { provider: t.provider, objectId: t.objectId, text };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-Mc-Auth": cfg.token,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Metricool ${res.status} : ${detail.slice(0, 160)}`);
  }
  forgetInboxCache(t.brandId);
}
