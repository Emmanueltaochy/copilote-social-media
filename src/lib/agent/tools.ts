import "server-only";

import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
  activity,
  assets,
  assetUsages,
  brands,
  briefFields,
  briefs,
  clients,
  contents,
  contentVersions,
  db,
  shoots,
  users,
  webMilestones,
  webProjects,
} from "@/db";
import { listClientsWithPace, listAwaitingApproval } from "@/db/queries";
import { audience, topPostThisMonth } from "@/db/home-queries";
import { jalonsParDefaut, modeleBrief, PROJECT_TYPE, PROJECT_TYPES } from "@/data/web";
import { initialsFrom } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { sendMail } from "@/lib/mail";
import { scheduleContent } from "@/lib/metricool-schedule";
import { estimate as abbyEstimate, signedEstimates } from "@/lib/abby";
import { importDriveFile, newDriveFiles } from "@/lib/drive";

/*
 * Les gestes que l'assistant IA peut faire dans Pilot.
 *
 * Chaque outil passe par les mêmes règles que l'interface : un client
 * « validation » ne voit rien partir sans son accord, l'IA ne marque jamais
 * un contenu « publié » et ne valide jamais à la place d'un client. Tout ce
 * qu'elle fait est inscrit dans le fil d'activité, signé de son rôle.
 */

export type AgentRole = "directeur" | "community_manager" | "chef_de_projet_web";

export const ROLE_LABEL: Record<AgentRole, string> = {
  directeur: "Jarvis",
  community_manager: "Community manager IA",
  chef_de_projet_web: "Chef de projet web IA",
};

export type ToolCtx = {
  userId: string;
  role: AgentRole;
  log: (text: string, href?: string) => void;
  /** Pour l'outil de délégation : lance un autre agent et rend son compte rendu. */
  delegate?: (role: AgentRole, consigne: string) => Promise<string>;
};

type ToolDef = {
  name: string;
  description: string;
  schema: z.ZodObject;
  roles: AgentRole[];
  run: (input: never, ctx: ToolCtx) => Promise<unknown>;
};

const KINDS = ["feed", "story", "reel", "carrousel", "autre"] as const;
const NETS = ["instagram", "facebook", "linkedin", "tiktok", "google"] as const;
const EDITABLE_STATUS = ["idee", "brief", "tournage", "derush", "creation", "revision"] as const;

/** « 2026-11-12T18:00 » (heure de La Réunion) → Date. */
function reunion(local: string): Date {
  const m = local.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) throw new Error(`Date illisible : « ${local} ». Format attendu : AAAA-MM-JJTHH:MM (heure de La Réunion).`);
  // Convention de Pilot : l'heure saisie est l'heure de La Réunion, enregistrée
  // telle quelle (le serveur est en UTC et la réaffiche telle quelle).
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
}

function fmt(d: Date | null | undefined) {
  return d ? d.toLocaleString("fr-FR", { timeZone: "UTC", dateStyle: "short", timeStyle: "short" }) : null;
}

function origin() {
  const d = process.env.APP_DOMAIN?.trim();
  return d ? `https://${d}` : "";
}

async function clientOrThrow(id: string) {
  const [c] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!c) throw new Error(`Client ${id} introuvable. Utilisez lister_clients pour obtenir les identifiants.`);
  return c;
}

async function contentOrThrow(id: string) {
  const [c] = await db.select().from(contents).where(eq(contents.id, id)).limit(1);
  if (!c) throw new Error(`Contenu ${id} introuvable.`);
  return c;
}

async function journal(ctx: ToolCtx, clientId: string | null, text: string, contentId?: string | null) {
  await db.insert(activity).values({ clientId, contentId: contentId ?? null, actorId: null, actorLabel: ROLE_LABEL[ctx.role], text });
}

const rythmeItem = z.object({
  day: z.number().int().min(1).max(7).describe("Jour de la semaine, lundi = 1 … dimanche = 7"),
  time: z.string().regex(/^\d{2}:\d{2}$/).describe("Heure HH:MM, heure de La Réunion"),
  networks: z.array(z.enum(NETS)).min(1),
  kind: z.enum(KINDS),
  note: z.string().optional().describe("Thème ou rubrique de ce créneau"),
});

/* ================================================================ outils == */

const TOOLS: ToolDef[] = [
  /* --------------------------------------------------------- lecture -- */
  {
    name: "lister_clients",
    description:
      "Liste les clients actifs : identifiant, nom, pôles (social/web), mode de publication (validation ou confiance), rythme convenu, raccordements (Metricool, Drive) et avancement du mois. À appeler avant tout geste sur un client.",
    schema: z.object({ pole: z.enum(["social", "web"]).optional() }),
    roles: ["directeur", "community_manager", "chef_de_projet_web"],
    run: async ({ pole }: { pole?: "social" | "web" }) => {
      const paced = await listClientsWithPace(new Date(), pole);
      const rows = await db
        .select({
          id: clients.id,
          publishMode: clients.publishMode,
          postingPlan: clients.postingPlan,
          brand: clients.metricoolBrandId,
          drive: clients.driveFolderId,
          departments: clients.departments,
        })
        .from(clients)
        .where(eq(clients.active, true));
      const extra = new Map(rows.map((r) => [r.id, r]));
      return paced.map((c) => {
        const e = extra.get(c.id);
        return {
          id: c.id,
          nom: c.name,
          nom_court: c.shortName,
          poles: e?.departments,
          mode_publication: e?.publishMode,
          rythme: e?.postingPlan,
          metricool: Boolean(e?.brand),
          drive: Boolean(e?.drive),
          contenus_du_mois: `${c.done} publiés sur ${c.contentTarget} vendus (${c.pace.label ?? c.pace.key})`,
        };
      });
    },
  },
  {
    name: "fiche_client",
    description: "Tout sur un client : charte (ton, couleurs, mots interdits), mode de publication, rythme, contenus récents et à venir, tournages prévus.",
    schema: z.object({ client_id: z.string() }),
    roles: ["directeur", "community_manager", "chef_de_projet_web"],
    run: async ({ client_id }: { client_id: string }) => {
      const c = await clientOrThrow(client_id);
      const [b] = await db.select().from(brands).where(eq(brands.clientId, client_id)).limit(1);
      const since = new Date(Date.now() - 30 * 86_400_000);
      const recent = await db
        .select({ id: contents.id, titre: contents.title, type: contents.kind, statut: contents.status, date: contents.scheduledAt, reseaux: contents.networks })
        .from(contents)
        .where(and(eq(contents.clientId, client_id), gte(sql`coalesce(${contents.scheduledAt}, ${contents.createdAt})`, since)))
        .orderBy(asc(contents.scheduledAt))
        .limit(40);
      const nextShoots = await db
        .select({ id: shoots.id, titre: shoots.title, debut: shoots.startsAt, lieu: shoots.place, statut: shoots.status })
        .from(shoots)
        .where(and(eq(shoots.clientId, client_id), gte(shoots.startsAt, new Date())))
        .orderBy(asc(shoots.startsAt))
        .limit(10);
      return {
        id: c.id,
        nom: c.name,
        secteur: c.sector,
        engagement_mensuel: `${c.contentTarget} contenus, ${c.shootsIncluded} tournages`,
        mode_publication: c.publishMode,
        rythme: c.postingPlan,
        metricool: Boolean(c.metricoolBrandId),
        drive: Boolean(c.driveFolderId),
        charte: b ? { ton: b.voice, polices: b.fonts, palette: b.palette, mots_cles: b.tags, mots_interdits: b.bannedWords } : null,
        contenus: recent.map((r) => ({ ...r, date: fmt(r.date) })),
        tournages: nextShoots.map((s) => ({ ...s, debut: fmt(s.debut) })),
      };
    },
  },
  {
    name: "vue_ensemble",
    description: "Le tableau de bord du PDG : clients en retard sur leur engagement, contenus non partis, validations en attente chez les clients, tournages des 14 jours.",
    schema: z.object({}),
    roles: ["directeur"],
    run: async () => {
      const now = new Date();
      const paced = await listClientsWithPace(now, "social");
      const waiting = await listAwaitingApproval();
      const missed = await db
        .select({ id: contents.id, titre: contents.title, client: clients.shortName, date: contents.scheduledAt })
        .from(contents)
        .innerJoin(clients, eq(clients.id, contents.clientId))
        .where(and(lt(contents.scheduledAt, now), gte(contents.scheduledAt, new Date(now.getTime() - 14 * 86_400_000)), isNull(contents.publishedAt)));
      const nextShoots = await db
        .select({ titre: shoots.title, client: clients.shortName, debut: shoots.startsAt, statut: shoots.status })
        .from(shoots)
        .innerJoin(clients, eq(clients.id, shoots.clientId))
        .where(and(gte(shoots.startsAt, now), lt(shoots.startsAt, new Date(now.getTime() + 14 * 86_400_000)), ne(shoots.status, "annule")));
      return {
        engagements: paced
          .filter((c) => c.contentTarget > 0)
          .map((c) => ({ client: c.shortName, publies: c.done, vendus: c.contentTarget, etat: c.pace.key })),
        non_partis: missed.map((m) => ({ ...m, date: fmt(m.date) })),
        attendent_validation: waiting.map((w) => ({ contenu: w.content.title, client: w.clientName, depuis_jours: w.waitingDays })),
        tournages: nextShoots.map((s) => ({ ...s, debut: fmt(s.debut) })),
      };
    },
  },
  {
    name: "statistiques",
    description: "Audience réelle (relevés Metricool) : abonnés, nouveaux abonnés sur 30 jours par réseau, meilleure publication du mois. Pour un client ou pour tous.",
    schema: z.object({ client_id: z.string().optional() }),
    roles: ["directeur", "community_manager"],
    run: async ({ client_id }: { client_id?: string }) => {
      const a = await audience(30, client_id);
      const top = await topPostThisMonth(new Date(), client_id);
      if (!a) return { info: "Aucun relevé Metricool pour ce périmètre (client non relié ou pas encore relevé)." };
      return {
        abonnes: a.current,
        nouveaux_30j: a.current - a.current30ago,
        par_reseau: a.networks.map((n) => ({ reseau: n.network, abonnes: n.current, nouveaux_30j: n.gained30 })),
        meilleure_publication: top
          ? { client: top.clientName, reseau: top.network, texte: top.text?.slice(0, 140), portee: Math.max(top.reach, top.views), interactions: top.interactions, url: top.url }
          : null,
      };
    },
  },
  {
    name: "lister_contenus",
    description: "Contenus d'un client ou de tous, filtrables par période (dates AAAA-MM-JJ) et statut.",
    schema: z.object({
      client_id: z.string().optional(),
      du: z.string().optional(),
      au: z.string().optional(),
      statut: z.string().optional(),
    }),
    roles: ["directeur", "community_manager"],
    run: async (i: { client_id?: string; du?: string; au?: string; statut?: string }) => {
      const conds = [
        i.client_id ? eq(contents.clientId, i.client_id) : undefined,
        i.du ? gte(contents.scheduledAt, reunion(`${i.du}T00:00`)) : undefined,
        i.au ? lt(contents.scheduledAt, reunion(`${i.au}T23:59`)) : undefined,
        i.statut ? eq(contents.status, i.statut as "idee") : undefined,
      ].filter(Boolean);
      const rows = await db
        .select({ id: contents.id, client: clients.shortName, titre: contents.title, type: contents.kind, statut: contents.status, date: contents.scheduledAt, reseaux: contents.networks, legende: contents.caption, metricool: contents.metricoolSentAt })
        .from(contents)
        .innerJoin(clients, eq(clients.id, contents.clientId))
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(asc(contents.scheduledAt))
        .limit(60);
      const ids = rows.map((r) => r.id);
      const media = ids.length
        ? await db.select({ id: assetUsages.contentId, n: sql<number>`count(*)::int` }).from(assetUsages).where(inArray(assetUsages.contentId, ids)).groupBy(assetUsages.contentId)
        : [];
      const nm = new Map(media.map((m) => [m.id, m.n]));
      return rows.map((r) => ({ ...r, date: fmt(r.date), legende: r.legende?.slice(0, 120) ?? null, medias: nm.get(r.id) ?? 0, metricool: Boolean(r.metricool) }));
    },
  },

  /* -------------------------------------------------- direction -- */
  {
    name: "definir_rythme",
    description:
      "Enregistre le rythme de publication convenu pour un client (ex. « mardi 18h reel Instagram, vendredi 12h carrousel Instagram+Facebook »). Remplace le rythme précédent.",
    schema: z.object({ client_id: z.string(), rythme: z.array(rythmeItem) }),
    roles: ["directeur"],
    run: async ({ client_id, rythme }: { client_id: string; rythme: z.infer<typeof rythmeItem>[] }, ctx: ToolCtx) => {
      const c = await clientOrThrow(client_id);
      await db.update(clients).set({ postingPlan: rythme }).where(eq(clients.id, client_id));
      const txt = `Rythme de ${c.shortName} : ${rythme.length} publication${rythme.length > 1 ? "s" : ""} par semaine`;
      await journal(ctx, client_id, txt);
      ctx.log(txt, `/clients/${client_id}`);
      return { ok: true, client: c.shortName, rythme };
    },
  },
  {
    name: "definir_mode_publication",
    description: "« validation » : le client valide chaque publication dans son portail avant qu'elle parte. « confiance » : on publie sans validation. Ne changer que sur instruction explicite du PDG.",
    schema: z.object({ client_id: z.string(), mode: z.enum(["validation", "confiance"]) }),
    roles: ["directeur"],
    run: async ({ client_id, mode }: { client_id: string; mode: string }, ctx: ToolCtx) => {
      const c = await clientOrThrow(client_id);
      await db.update(clients).set({ publishMode: mode }).where(eq(clients.id, client_id));
      const txt = `${c.shortName} passe en mode « ${mode} »`;
      await journal(ctx, client_id, txt);
      ctx.log(txt, `/clients/${client_id}`);
      return { ok: true };
    },
  },
  {
    name: "deleguer",
    description:
      "Confie une mission opérationnelle à un membre de ton équipe IA et rend son compte rendu. « community_manager » : contenus, planning, médias Drive, validation client, programmation Metricool. « chef_de_projet_web » : devis signés Abby, création de client/projet web, cahier des charges, invitation du client. Donne une consigne précise et complète (client, dates, fréquence, attentes).",
    schema: z.object({ agent: z.enum(["community_manager", "chef_de_projet_web"]), consigne: z.string().min(10) }),
    roles: ["directeur"],
    run: async ({ agent, consigne }: { agent: AgentRole; consigne: string }, ctx: ToolCtx) => {
      if (!ctx.delegate) throw new Error("Délégation indisponible.");
      return { compte_rendu: await ctx.delegate(agent, consigne) };
    },
  },

  /* ------------------------------------------- community manager -- */
  {
    name: "creer_contenu",
    description:
      "Crée un contenu dans le planning d'un client. Date au format AAAA-MM-JJTHH:MM, heure de La Réunion. Écris une légende prête à publier dans le ton de la charte du client quand tu en as assez d'éléments ; sinon laisse-la vide et mets les consignes de tournage/création dans « consignes ».",
    schema: z.object({
      client_id: z.string(),
      titre: z.string().min(2),
      type: z.enum(KINDS),
      reseaux: z.array(z.enum(NETS)).min(1),
      date: z.string().optional(),
      legende: z.string().optional(),
      consignes: z.string().optional().describe("Brief pour le vidéaste ou le graphiste : quoi tourner, quel message"),
      statut: z.enum(EDITABLE_STATUS).optional().describe("idee par défaut ; tournage si une vidéo reste à tourner ; creation si un visuel est à produire"),
    }),
    roles: ["community_manager"],
    run: async (i: { client_id: string; titre: string; type: (typeof KINDS)[number]; reseaux: (typeof NETS)[number][]; date?: string; legende?: string; consignes?: string; statut?: (typeof EDITABLE_STATUS)[number] }, ctx: ToolCtx) => {
      const c = await clientOrThrow(i.client_id);
      const [row] = await db
        .insert(contents)
        .values({
          clientId: i.client_id,
          title: i.titre,
          kind: i.type,
          network: i.reseaux[0],
          networks: i.reseaux,
          status: i.statut ?? "idee",
          caption: i.legende || null,
          instructions: i.consignes || null,
          scheduledAt: i.date ? reunion(i.date) : null,
        })
        .returning({ id: contents.id });
      await db.insert(contentVersions).values({ contentId: row.id, number: 1, note: "Première proposition", createdById: ctx.userId });
      await journal(ctx, i.client_id, `Contenu « ${i.titre} » créé`, row.id);
      ctx.log(`${c.shortName} · « ${i.titre} » créé${i.date ? ` pour le ${fmt(reunion(i.date))}` : ""}`, `/contenu/${row.id}`);
      return { ok: true, contenu_id: row.id, lien: `/contenu/${row.id}` };
    },
  },
  {
    name: "modifier_contenu",
    description: "Modifie un contenu existant (titre, légende, date AAAA-MM-JJTHH:MM heure Réunion, réseaux, type, statut de production, consignes). Ne peut pas le marquer publié ni validé.",
    schema: z.object({
      contenu_id: z.string(),
      titre: z.string().optional(),
      legende: z.string().optional(),
      date: z.string().optional(),
      reseaux: z.array(z.enum(NETS)).optional(),
      type: z.enum(KINDS).optional(),
      statut: z.enum(EDITABLE_STATUS).optional(),
      consignes: z.string().optional(),
    }),
    roles: ["community_manager"],
    run: async (i: { contenu_id: string; titre?: string; legende?: string; date?: string; reseaux?: (typeof NETS)[number][]; type?: (typeof KINDS)[number]; statut?: (typeof EDITABLE_STATUS)[number]; consignes?: string }, ctx: ToolCtx) => {
      const before = await contentOrThrow(i.contenu_id);
      if (before.publishedAt) throw new Error("Contenu déjà publié : on n'y touche plus.");
      await db
        .update(contents)
        .set({
          ...(i.titre ? { title: i.titre } : {}),
          ...(i.legende !== undefined ? { caption: i.legende } : {}),
          ...(i.date ? { scheduledAt: reunion(i.date) } : {}),
          ...(i.reseaux?.length ? { networks: i.reseaux, network: i.reseaux[0] } : {}),
          ...(i.type ? { kind: i.type } : {}),
          ...(i.statut ? { status: i.statut } : {}),
          ...(i.consignes !== undefined ? { instructions: i.consignes } : {}),
          updatedAt: new Date(),
        })
        .where(eq(contents.id, i.contenu_id));
      await journal(ctx, before.clientId, `« ${i.titre ?? before.title} » modifié`, before.id);
      ctx.log(`« ${i.titre ?? before.title} » mis à jour`, `/contenu/${before.id}`);
      return { ok: true };
    },
  },
  {
    name: "planifier_selon_rythme",
    description:
      "Crée d'un coup les contenus d'un mois (AAAA-MM) à partir du rythme convenu du client : un contenu par créneau, en statut « idée », sans doublon avec ce qui existe déjà ce jour-là. Rend la liste créée pour que tu complètes titres et légendes.",
    schema: z.object({ client_id: z.string(), mois: z.string().regex(/^\d{4}-\d{2}$/) }),
    roles: ["community_manager"],
    run: async ({ client_id, mois }: { client_id: string; mois: string }, ctx: ToolCtx) => {
      const c = await clientOrThrow(client_id);
      const plan = c.postingPlan ?? [];
      if (!plan.length) throw new Error(`${c.shortName} n'a pas de rythme enregistré : demande au directeur de le définir.`);
      const [y, m] = mois.split("-").map(Number);
      const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const existing = await db
        .select({ d: contents.scheduledAt })
        .from(contents)
        .where(and(eq(contents.clientId, client_id), gte(contents.scheduledAt, reunion(`${mois}-01T00:00`)), lt(contents.scheduledAt, reunion(`${mois}-${String(days).padStart(2, "0")}T23:59`))));
      const taken = new Set(existing.map((e) => e.d?.toISOString().slice(0, 10)));
      const created: { id: string; date: string; type: string; note?: string }[] = [];
      for (let d = 1; d <= days; d++) {
        const iso = `${mois}-${String(d).padStart(2, "0")}`;
        const dow = ((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
        for (const slot of plan.filter((p) => p.day === dow)) {
          const when = reunion(`${iso}T${slot.time}`);
          if (when.getTime() - 4 * 3_600_000 < Date.now() || taken.has(iso)) continue;
          const [row] = await db
            .insert(contents)
            .values({
              clientId: client_id,
              title: slot.note ? `${slot.note}` : `${slot.kind === "reel" ? "Reel" : slot.kind === "carrousel" ? "Carrousel" : "Publication"} du ${when.toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })}`,
              kind: slot.kind as (typeof KINDS)[number],
              network: slot.networks[0] as (typeof NETS)[number],
              networks: slot.networks as (typeof NETS)[number][],
              status: "idee",
              scheduledAt: when,
            })
            .returning({ id: contents.id });
          await db.insert(contentVersions).values({ contentId: row.id, number: 1, note: "Première proposition", createdById: ctx.userId });
          created.push({ id: row.id, date: fmt(when)!, type: slot.kind, note: slot.note });
        }
      }
      await journal(ctx, client_id, `Planning de ${mois} préparé : ${created.length} contenus`);
      ctx.log(`${c.shortName} · planning ${mois} : ${created.length} contenus créés`, `/calendrier`);
      return { crees: created };
    },
  },
  {
    name: "creer_tournage",
    description: "Planifie un tournage pour un client (début AAAA-MM-JJTHH:MM heure Réunion).",
    schema: z.object({ client_id: z.string(), titre: z.string(), debut: z.string(), lieu: z.string().optional(), note: z.string().optional() }),
    roles: ["community_manager"],
    run: async (i: { client_id: string; titre: string; debut: string; lieu?: string; note?: string }, ctx: ToolCtx) => {
      const c = await clientOrThrow(i.client_id);
      const [row] = await db
        .insert(shoots)
        .values({ clientId: i.client_id, title: i.titre, startsAt: reunion(i.debut), place: i.lieu ?? null, note: i.note ?? null })
        .returning({ id: shoots.id });
      await journal(ctx, i.client_id, `Tournage « ${i.titre} » planifié`);
      ctx.log(`${c.shortName} · tournage « ${i.titre} » le ${fmt(reunion(i.debut))}`, `/tournages/${row.id}`);
      return { ok: true, tournage_id: row.id };
    },
  },
  {
    name: "chercher_rushs_drive",
    description: "Cherche dans le dossier Google Drive du client les images et vidéos déposées par les vidéastes et pas encore importées dans Pilot.",
    schema: z.object({ client_id: z.string() }),
    roles: ["community_manager"],
    run: async ({ client_id }: { client_id: string }) => {
      const c = await clientOrThrow(client_id);
      if (!c.driveFolderId) throw new Error(`Aucun dossier Drive renseigné pour ${c.shortName} (fiche client).`);
      const files = await newDriveFiles(c.driveFolderId);
      return files.slice(0, 80).map((f) => ({ fichier_id: f.id, nom: f.name, dossier: f.folder || "(racine)", type: f.mimeType, depose_le: fmt(new Date(f.createdTime)), taille_mo: f.size ? Math.round(f.size / 1e6) : null }));
    },
  },
  {
    name: "importer_rushs_drive",
    description: "Importe des fichiers Drive dans la bibliothèque du client et, si contenu_id est donné, les joint à ce contenu dans l'ordre donné.",
    schema: z.object({ client_id: z.string(), fichiers: z.array(z.string()).min(1).max(20), contenu_id: z.string().optional() }),
    roles: ["community_manager"],
    run: async ({ client_id, fichiers, contenu_id }: { client_id: string; fichiers: string[]; contenu_id?: string }, ctx: ToolCtx) => {
      const c = await clientOrThrow(client_id);
      const ids: string[] = [];
      for (const f of fichiers) ids.push(await importDriveFile(f, client_id, contenu_id));
      await journal(ctx, client_id, `${ids.length} média(s) importé(s) depuis Drive`, contenu_id);
      ctx.log(`${c.shortName} · ${ids.length} média(s) importé(s) de Drive`, contenu_id ? `/contenu/${contenu_id}` : `/assets?client=${client_id}`);
      return { ok: true, medias: ids };
    },
  },
  {
    name: "lister_medias",
    description: "Les derniers médias de la bibliothèque d'un client (photos, vidéos), avec leur identifiant.",
    schema: z.object({ client_id: z.string(), limite: z.number().int().min(1).max(60).optional() }),
    roles: ["community_manager"],
    run: async ({ client_id, limite }: { client_id: string; limite?: number }) => {
      const rows = await db
        .select({ id: assets.id, nom: assets.filename, type: assets.mimeType, ajoute: assets.createdAt })
        .from(assets)
        .where(eq(assets.clientId, client_id))
        .orderBy(desc(assets.createdAt))
        .limit(limite ?? 30);
      return rows.map((r) => ({ ...r, ajoute: fmt(r.ajoute) }));
    },
  },
  {
    name: "joindre_media",
    description: "Joint un média de la bibliothèque à un contenu (ajouté à la fin du carrousel).",
    schema: z.object({ contenu_id: z.string(), media_id: z.string() }),
    roles: ["community_manager"],
    run: async ({ contenu_id, media_id }: { contenu_id: string; media_id: string }, ctx: ToolCtx) => {
      const c = await contentOrThrow(contenu_id);
      const [last] = await db.select({ n: sql<number>`coalesce(max(${assetUsages.position}), -1)::int` }).from(assetUsages).where(eq(assetUsages.contentId, contenu_id));
      await db.insert(assetUsages).values({ contentId: contenu_id, assetId: media_id, position: (last?.n ?? -1) + 1 }).onConflictDoNothing();
      ctx.log(`Média joint à « ${c.title} »`, `/contenu/${contenu_id}`);
      return { ok: true };
    },
  },
  {
    name: "envoyer_en_validation",
    description:
      "Le contenu est prêt (légende + média + date) : pour un client « validation », il part dans son portail pour accord (le client est prévenu) ; pour un client « confiance », il passe directement « prêt ».",
    schema: z.object({ contenu_id: z.string() }),
    roles: ["community_manager"],
    run: async ({ contenu_id }: { contenu_id: string }, ctx: ToolCtx) => {
      const c = await contentOrThrow(contenu_id);
      const cl = await clientOrThrow(c.clientId);
      const [m] = await db.select({ n: sql<number>`count(*)::int` }).from(assetUsages).where(eq(assetUsages.contentId, contenu_id));
      if (!c.caption?.trim()) throw new Error("Légende vide : écris-la avant d'envoyer.");
      if (!m?.n && c.kind !== "autre") throw new Error("Aucun média joint : importe ou joins le visuel/la vidéo avant d'envoyer.");
      if (cl.publishMode === "confiance") {
        await db.update(contents).set({ status: "pret", updatedAt: new Date() }).where(eq(contents.id, contenu_id));
        await journal(ctx, c.clientId, `« ${c.title} » prêt à publier (client en confiance)`, contenu_id);
        ctx.log(`« ${c.title} » prêt (client en confiance)`, `/contenu/${contenu_id}`);
        return { ok: true, statut: "pret", suite: "Tu peux le programmer avec programmer_publication." };
      }
      await db.update(contents).set({ status: "validation", submittedAt: new Date(), updatedAt: new Date() }).where(eq(contents.id, contenu_id));
      await journal(ctx, c.clientId, `« ${c.title} » envoyé au client pour validation`, contenu_id);
      await notify({ kind: "validation_attendue", title: `À valider : ${c.title}`, body: "Un nouveau contenu attend votre validation.", href: "/portail/valider", clientId: c.clientId, contentId: contenu_id, audience: "client" });
      ctx.log(`« ${c.title} » envoyé à ${cl.shortName} pour validation`, `/contenu/${contenu_id}`);
      return { ok: true, statut: "validation", suite: "Dès que le client valide, la publication part automatiquement chez Metricool." };
    },
  },
  {
    name: "programmer_publication",
    description: "Programme le contenu chez Metricool, qui publiera à l'heure prévue. Refusé si le client exige une validation qu'il n'a pas encore donnée.",
    schema: z.object({ contenu_id: z.string() }),
    roles: ["community_manager"],
    run: async ({ contenu_id }: { contenu_id: string }, ctx: ToolCtx) => {
      const r = await scheduleContent(contenu_id, { label: ROLE_LABEL[ctx.role] });
      if (!r.ok) throw new Error(r.error);
      ctx.log(r.message, `/contenu/${contenu_id}`);
      return { ok: true, message: r.message };
    },
  },

  /* ------------------------------------------- chef de projet web -- */
  {
    name: "devis_signes_abby",
    description: "Les devis signés dans Abby (facturation), avec leur client, et s'ils ont déjà donné lieu à un projet dans Pilot.",
    schema: z.object({}),
    roles: ["chef_de_projet_web", "directeur"],
    run: async () => {
      const list = await signedEstimates(20);
      const known = list.length
        ? await db.select({ id: webProjects.abbyEstimateId, projet: webProjects.id }).from(webProjects).where(inArray(webProjects.abbyEstimateId, list.map((e) => e.id)))
        : [];
      const km = new Map(known.map((k) => [k.id, k.projet]));
      return list.map((e) => ({ devis_id: e.id, numero: e.number, objet: e.title, client: e.customer.name, contact: e.customer.contactName, email: e.customer.email, montant_ht: e.amountHt, signe_le: e.signedAt, lignes: e.lines.slice(0, 8), projet_pilot: km.get(e.id) ?? null }));
    },
  },
  {
    name: "lancer_projet_depuis_devis",
    description:
      "Depuis un devis signé Abby, fait tout d'un coup : crée (ou retrouve) le client web, crée le projet avec ses jalons, crée le cahier des charges adapté au type de projet, crée l'accès portail du contact et lui envoie l'invitation par e-mail (création du compte, puis cahier des charges à remplir et suivi d'avancement). Ne refait rien si le devis a déjà un projet.",
    schema: z.object({
      devis_id: z.string(),
      type_projet: z.enum(PROJECT_TYPES as [string, ...string[]]),
      nom_projet: z.string().optional(),
      echeance: z.string().optional().describe("AAAA-MM-JJ"),
      contact_nom: z.string().optional().describe("Si absent du devis"),
      contact_email: z.string().email().optional().describe("Si absent du devis"),
    }),
    roles: ["chef_de_projet_web"],
    run: async (i: { devis_id: string; type_projet: string; nom_projet?: string; echeance?: string; contact_nom?: string; contact_email?: string }, ctx: ToolCtx) => {
      const [exists] = await db.select({ id: webProjects.id }).from(webProjects).where(eq(webProjects.abbyEstimateId, i.devis_id)).limit(1);
      if (exists) return { deja_fait: true, projet_id: exists.id, lien: `/web/${exists.id}` };
      const e = await abbyEstimate(i.devis_id);
      const nom = e.customer.name || i.contact_nom;
      if (!nom) throw new Error("Le devis n'indique pas de client : précise contact_nom.");
      const email = (i.contact_email || e.customer.email || "").toLowerCase();
      const contactNom = i.contact_nom || e.customer.contactName || nom;

      // 1. Client
      let [client] = await db.select().from(clients).where(eq(clients.name, nom)).limit(1);
      if (!client) {
        [client] = await db.insert(clients).values({ name: nom, shortName: nom.slice(0, 24), departments: ["web"], abbyCustomerId: e.customer.id || null }).returning();
        await db.insert(brands).values({ clientId: client.id }).onConflictDoNothing();
      } else if (!client.departments.includes("web")) {
        await db.update(clients).set({ departments: [...client.departments, "web"] }).where(eq(clients.id, client.id));
      }

      // 2. Projet + jalons
      const [projet] = await db
        .insert(webProjects)
        .values({
          clientId: client.id,
          name: i.nom_projet || `${PROJECT_TYPE[i.type_projet]?.label ?? "Projet web"} — ${nom}`,
          type: i.type_projet as "vitrine",
          dueAt: i.echeance ? new Date(`${i.echeance}T12:00:00Z`) : null,
          priceCents: e.amountHt ? Math.round(e.amountHt * 100) : 0,
          abbyEstimateId: e.id,
        })
        .returning();
      const jalons = jalonsParDefaut(i.type_projet);
      await db.insert(webMilestones).values(jalons.map((j, k) => ({ projectId: projet.id, label: j.label, waitingClient: j.attendClient, position: k })));

      // 3. Cahier des charges
      const [brief] = await db
        .insert(briefs)
        .values({
          clientId: client.id,
          projectId: projet.id,
          title: `Cahier des charges — ${projet.name}`,
          intro: "Quelques questions pour cadrer votre projet. Répondez à votre rythme : tout est enregistré au fur et à mesure.",
          createdById: ctx.userId,
          status: "envoye",
          sentAt: new Date(),
        })
        .returning();
      const modele = modeleBrief(i.type_projet);
      await db.insert(briefFields).values(
        modele.map((f, k) => ({ briefId: brief.id, section: f.section, label: f.label, help: f.help ?? null, kind: f.kind, options: f.options ?? [], required: f.required ?? false, position: k })),
      );

      // 4. Accès portail + invitation
      let invitation = "aucun e-mail sur le devis : accès à créer depuis la fiche client";
      if (email) {
        const [already] = await db.select({ id: users.id, clientId: users.clientId }).from(users).where(eq(users.email, email)).limit(1);
        if (already) {
          invitation = already.clientId === client.id ? "le contact a déjà un compte : il retrouve le projet dans son espace" : "cette adresse sert déjà à un autre compte : à vérifier";
        } else {
          const token = randomBytes(32).toString("base64url");
          await db.insert(users).values({ name: contactNom, email, initials: initialsFrom(contactNom), role: "client", clientId: client.id, inviteToken: token, inviteExpiresAt: new Date(Date.now() + 14 * 86_400_000) });
          const mail = await sendMail({
            pole: "web",
            to: email,
            subject: `Votre espace projet — ${projet.name}`,
            text:
              `Bonjour ${contactNom},\n\n` +
              `Merci pour votre confiance. Votre projet « ${projet.name} » est lancé.\n\n` +
              "Votre espace client est prêt : créez votre mot de passe avec le lien ci-dessous. Vous y trouverez le cahier des charges à remplir (à votre rythme, tout est enregistré au fur et à mesure), puis l'avancement de votre projet étape par étape.",
            actionUrl: `${origin()}/invitation/${token}`,
            actionLabel: "Créer mon accès",
          });
          invitation = mail.error ? `accès créé, mais l'e-mail n'est pas parti (${mail.error}) : renvoyez le lien depuis la fiche client` : `invitation envoyée à ${email}`;
        }
      }

      await journal(ctx, client.id, `Projet web « ${projet.name} » lancé depuis le devis Abby ${e.number}`);
      ctx.log(`${nom} · projet « ${projet.name} » lancé (devis ${e.number}) — ${invitation}`, `/web/${projet.id}`);
      return { ok: true, client_id: client.id, projet_id: projet.id, cahier_des_charges_id: brief.id, invitation, lien: `/web/${projet.id}` };
    },
  },
  {
    name: "etat_projets_web",
    description: "Les projets web en cours : client, échéance, jalons faits / restants, ce qui attend le client, état du cahier des charges.",
    schema: z.object({ client_id: z.string().optional() }),
    roles: ["chef_de_projet_web", "directeur"],
    run: async ({ client_id }: { client_id?: string }) => {
      const rows = await db
        .select({ id: webProjects.id, nom: webProjects.name, client: clients.shortName, echeance: webProjects.dueAt })
        .from(webProjects)
        .innerJoin(clients, eq(clients.id, webProjects.clientId))
        .where(client_id ? eq(webProjects.clientId, client_id) : undefined)
        .orderBy(asc(webProjects.dueAt))
        .limit(30);
      const out = [];
      for (const p of rows) {
        const ms = await db.select().from(webMilestones).where(eq(webMilestones.projectId, p.id)).orderBy(asc(webMilestones.position));
        const [b] = await db.select({ statut: briefs.status }).from(briefs).where(eq(briefs.projectId, p.id)).limit(1);
        out.push({
          ...p,
          echeance: p.echeance?.toLocaleDateString("fr-FR"),
          jalons_faits: ms.filter((m) => m.doneAt).length,
          jalons_total: ms.length,
          prochain_jalon: ms.find((m) => !m.doneAt)?.label ?? null,
          cahier_des_charges: b?.statut ?? "aucun",
        });
      }
      return out;
    },
  },
];

/* ============================================================ exécution == */

export function toolsFor(role: AgentRole) {
  return TOOLS.filter((t) => t.roles.includes(role)).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: z.toJSONSchema(t.schema) as { type: "object"; [k: string]: unknown },
  }));
}

export async function runTool(name: string, input: unknown, ctx: ToolCtx): Promise<{ ok: boolean; content: string }> {
  const t = TOOLS.find((x) => x.name === name && x.roles.includes(ctx.role));
  if (!t) return { ok: false, content: `Outil inconnu pour ce rôle : ${name}` };
  const parsed = t.schema.safeParse(input);
  if (!parsed.success) return { ok: false, content: `Paramètres invalides : ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}` };
  try {
    const out = await t.run(parsed.data as never, ctx);
    return { ok: true, content: JSON.stringify(out ?? { ok: true }) };
  } catch (e) {
    return { ok: false, content: (e as Error).message };
  }
}

/** Les outils exposés à Claude.ai (MCP) : ceux du community manager et du chef de projet web, plus le rythme. */
export const MCP_ROLES: AgentRole[] = ["community_manager", "chef_de_projet_web"];
export function mcpTools() {
  const seen = new Set<string>();
  return TOOLS.filter((t) => (t.roles.some((r) => MCP_ROLES.includes(r)) || t.name === "definir_rythme" || t.name === "vue_ensemble") && !seen.has(t.name) && seen.add(t.name)).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: z.toJSONSchema(t.schema),
    role: (t.roles.find((r) => MCP_ROLES.includes(r)) ?? "directeur") as AgentRole,
  }));
}
