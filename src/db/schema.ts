import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Le modèle de données de Taochy Pilot.
 *
 * Un principe traverse le schéma : l'agence vend un *engagement mensuel* et
 * doit prouver qu'elle le tient. Tout ce qui se compte — contenus, tournages,
 * campagnes, heures — porte donc un client et une date, pour qu'on puisse
 * toujours répondre à « où en est-on, à cette date, sur ce compte ».
 *
 * L'argent est stocké en centimes (entiers) : les flottants ne comptent pas
 * juste. Les durées sont en minutes, pour la même raison.
 */

/* ------------------------------------------------------------------ accès -- */

export const userRole = pgEnum("user_role", [
  "direction", // voit tout, y compris coûts et marges
  "equipe", // production : ni marges ni coûts internes
  "client", // uniquement son portail
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash"),
    name: text("name").notNull(),
    /** Initiales affichées dans les pastilles et les cartes. */
    initials: text("initials").notNull(),
    role: userRole("role").notNull().default("equipe"),
    /** Renseigné pour les comptes clients : le portail auquel ils accèdent. */
    clientId: uuid("client_id"),
    /** Jeton d'invitation à usage unique, tant que le mot de passe n'est pas défini. */
    inviteToken: text("invite_token"),
    inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
    /**
     * Fin d'accès, pour les renforts ponctuels : un freelance engagé pour une
     * journée ne doit pas garder la clé six mois. Vide = accès permanent.
     * C'est une date, pas une case à décocher : personne ne pense à retirer
     * un accès dont on n'a plus besoin.
     */
    accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_key").on(t.email)],
);

/**
 * Sessions côté serveur plutôt que jetons signés : une session révoquée l'est
 * immédiatement, ce qui compte quand un compte donne accès aux marges de
 * l'agence.
 */
export const sessions = pgTable(
  "sessions",
  {
    /** Empreinte du jeton, jamais le jeton lui-même. */
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/* ---------------------------------------------------------------- clients -- */

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Nom complet, affiché dans le sélecteur de client. */
    name: text("name").notNull(),
    /** Nom court pour les tableaux denses. Vaut `name` si non renseigné. */
    shortName: text("short_name").notNull(),
    sector: text("sector"),
    /** Texte libre : « Client depuis mars 2024 · cheffe de projet Léa ». */
    since: text("since"),
    projectManagerId: uuid("project_manager_id").references(() => users.id, {
      onDelete: "set null",
    }),

    /* Contrat — ce que l'agence s'est engagée à livrer chaque mois. */
    monthlyFeeCents: integer("monthly_fee_cents").notNull().default(0),
    /** Nombre de contenus dus par mois. Zéro = pas d'engagement chiffré. */
    contentTarget: integer("content_target").notNull().default(0),
    shootsIncluded: integer("shoots_included").notNull().default(0),
    adsBudgetLabel: text("ads_budget_label"),
    /** Heures vendues dans le forfait, base du calcul de rentabilité. */
    hoursSold: integer("hours_sold").notNull().default(0),
    renewal: text("renewal"),

    active: boolean("active").notNull().default(true),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("clients_name_key").on(t.name)],
);

/**
 * Décomposition de l'engagement : 6 posts feed, 4 stories, 3 reels…
 * L'écran d'avancement compare ligne à ligne, pas seulement le total.
 */
export const contractLines = pgTable(
  "contract_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    monthlyTarget: integer("monthly_target").notNull().default(0),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("contract_lines_client_idx").on(t.clientId)],
);

/** Univers de marque : ce qu'un nouveau venu doit lire avant d'écrire un mot. */
export const brands = pgTable("brands", {
  clientId: uuid("client_id")
    .primaryKey()
    .references(() => clients.id, { onDelete: "cascade" }),
  fonts: text("fonts"),
  voice: text("voice"),
  /** ["#0F3B57", "#2E9BC4", …] */
  palette: jsonb("palette").$type<string[]>().notNull().default([]),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  /** [{ word, reason }] — la raison est la moitié utile. */
  bannedWords: jsonb("banned_words")
    .$type<{ word: string; reason: string }[]>()
    .notNull()
    .default([]),
});

export const contactAccess = pgEnum("contact_access", ["complet", "lecture", "aucun"]);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role"),
    /** E-mail ou téléphone, selon ce que le contact préfère. */
    reach: text("reach"),
    access: contactAccess("access").notNull().default("aucun"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("contacts_client_idx").on(t.clientId)],
);

/* --------------------------------------------------------------- contenus -- */

export const contentStatus = pgEnum("content_status", [
  "idee",
  "brief",
  "tournage",
  "derush",
  "creation",
  "revision",
  "validation",
  "pret",
  "publie",
  "manque", // prévu, jamais publié
]);

export const contentKind = pgEnum("content_kind", ["feed", "story", "reel", "carrousel", "autre"]);

export const network = pgEnum("network", ["instagram", "facebook", "linkedin", "tiktok", "google"]);

export const contents = pgTable(
  "contents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: contentKind("kind").notNull().default("feed"),
    network: network("network").notNull().default("instagram"),
    status: contentStatus("status").notNull().default("idee"),
    caption: text("caption"),
    /**
     * Ce qu'on attend du post, pour celui qui le fabrique. Séparé de la
     * légende : l'une part en ligne, l'autre reste interne. Les confondre
     * finit toujours par publier une consigne de tournage.
     */
    instructions: text("instructions"),
    hashtags: jsonb("hashtags").$type<string[]>().notNull().default([]),

    /** Date et heure de publication prévues. Alimente le calendrier. */
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    /** Renseigné au moment où quelqu'un confirme la publication. */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /** Lien du post en ligne : la preuve que la publication a eu lieu. */
    publishedUrl: text("published_url"),
    publishedById: uuid("published_by_id").references(() => users.id, { onDelete: "set null" }),

    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    shootId: uuid("shoot_id"),
    /** Échéance de l'étape en cours, pour repérer les retards du pipeline. */
    dueAt: timestamp("due_at", { withTimezone: true }),
    /** Passage en validation client : sert à compter les jours d'attente. */
    submittedAt: timestamp("submitted_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("contents_client_idx").on(t.clientId),
    index("contents_status_idx").on(t.status),
    index("contents_scheduled_idx").on(t.scheduledAt),
  ],
);

export const contentVersions = pgTable(
  "content_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contentId: uuid("content_id")
      .notNull()
      .references(() => contents.id, { onDelete: "cascade" }),
    /** 1, 2, 3 — affiché « V1 », « V2 »… */
    number: integer("number").notNull(),
    note: text("note"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    /** Renseignés quand le client tranche. */
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("content_versions_unique").on(t.contentId, t.number)],
);

/**
 * Un commentaire peut être épinglé à un point du visuel : c'est ce qui évite
 * les « en haut à droite » ambigus dans les allers-retours de validation.
 */
export const comments = pgTable(
  "comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contentId: uuid("content_id")
      .notNull()
      .references(() => contents.id, { onDelete: "cascade" }),
    versionId: uuid("version_id").references(() => contentVersions.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    /** Position de la pastille en pourcentage du visuel. */
    pinX: integer("pin_x"),
    pinY: integer("pin_y"),
    pinNumber: integer("pin_number"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("comments_content_idx").on(t.contentId)],
);

/** Statistiques saisies à la main : v1 ne se connecte à aucune plateforme. */
export const contentStats = pgTable(
  "content_stats",
  {
    contentId: uuid("content_id")
      .primaryKey()
      .references(() => contents.id, { onDelete: "cascade" }),
    reach: integer("reach"),
    engagement: integer("engagement"),
    clicks: integer("clicks"),
    saves: integer("saves"),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    capturedById: uuid("captured_by_id").references(() => users.id, { onDelete: "set null" }),
  },
);

/* -------------------------------------------------------------- tournages -- */

export const shootStatus = pgEnum("shoot_status", [
  "preparation",
  "a_securiser",
  "confirme",
  "realise",
  "annule",
]);

export const shoots = pgTable(
  "shoots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    place: text("place"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    status: shootStatus("status").notNull().default("preparation"),
    note: text("note"),
    moodboard: jsonb("moodboard").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("shoots_client_idx").on(t.clientId), index("shoots_starts_idx").on(t.startsAt)],
);

export const shootCrew = pgTable(
  "shoot_crew",
  {
    shootId: uuid("shoot_id")
      .notNull()
      .references(() => shoots.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleLabel: text("role_label"),
    /** « Confirmé », « En option », « À confirmer ». */
    state: text("state").notNull().default("À confirmer"),
  },
  (t) => [primaryKey({ columns: [t.shootId, t.userId] })],
);

export const shootGear = pgTable(
  "shoot_gear",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shootId: uuid("shoot_id")
      .notNull()
      .references(() => shoots.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    state: text("state").notNull().default("Non réservé"),
    /** Le matériel non réservé bloque le départ : d'où un booléen explicite. */
    reserved: boolean("reserved").notNull().default(false),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("shoot_gear_shoot_idx").on(t.shootId)],
);

/**
 * Droit à l'image. Séparé du reste parce que c'est ce qui fait retirer une
 * publication après coup, et que ça se vérifie avant le tournage, pas après.
 */
export const shootRights = pgTable(
  "shoot_rights",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shootId: uuid("shoot_id")
      .notNull()
      .references(() => shoots.id, { onDelete: "cascade" }),
    person: text("person").notNull(),
    signed: boolean("signed").notNull().default(false),
    state: text("state").notNull().default("Non envoyée"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("shoot_rights_shoot_idx").on(t.shootId)],
);

export const shots = pgTable(
  "shots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shootId: uuid("shoot_id")
      .notNull()
      .references(() => shoots.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    kind: text("kind"),
    /** Coché depuis le mobile pendant le tournage. */
    done: boolean("done").notNull().default(false),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("shots_shoot_idx").on(t.shootId)],
);

export const shootDeliverables = pgTable(
  "shoot_deliverables",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shootId: uuid("shoot_id")
      .notNull()
      .references(() => shoots.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    dueOn: date("due_on"),
    delivered: boolean("delivered").notNull().default(false),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("shoot_deliverables_shoot_idx").on(t.shootId)],
);

/* ----------------------------------------------------------------- assets -- */

export const assetRights = pgEnum("asset_rights", ["illimites", "a_renouveler", "expires"]);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    shootId: uuid("shoot_id").references(() => shoots.id, { onDelete: "set null" }),
    filename: text("filename").notNull(),
    /** Chemin sur le volume du VPS, jamais une URL publique. */
    storagePath: text("storage_path").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes"),
    width: integer("width"),
    height: integer("height"),
    rights: assetRights("rights").notNull().default("illimites"),
    /** Date au-delà de laquelle le média ne doit plus être publié. */
    rightsUntil: date("rights_until"),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("assets_client_idx").on(t.clientId), index("assets_rights_idx").on(t.rights)],
);

/** Un même média peut servir plusieurs fois : c'est justement ce qu'on veut voir. */
export const assetUsages = pgTable(
  "asset_usages",
  {
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    contentId: uuid("content_id")
      .notNull()
      .references(() => contents.id, { onDelete: "cascade" }),
    /**
     * Rang de la vue dans un carrousel. L'ordre est porteur de sens — la
     * première image arrête le défilement, la dernière appelle à l'action —
     * et se classer par date d'ajout donnerait l'ordre de l'import, pas
     * celui du post.
     */
    position: integer("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.assetId, t.contentId] })],
);

/* -------------------------------------------------------------- campagnes -- */

export const campaignStatus = pgEnum("campaign_status", ["brouillon", "active", "pause", "arretee"]);

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    platform: text("platform").notNull().default("Meta"),
    status: campaignStatus("status").notNull().default("brouillon"),
    startsOn: date("starts_on"),
    endsOn: date("ends_on"),
    budgetCents: integer("budget_cents").notNull().default(0),
    /** Objectif de coût par lead, pour situer le CPL constaté. */
    targetCplCents: integer("target_cpl_cents"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("campaigns_client_idx").on(t.clientId)],
);

export const adSets = pgTable(
  "ad_sets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    state: text("state").notNull().default("Active"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("ad_sets_campaign_idx").on(t.campaignId)],
);

/**
 * Chiffres saisis chaque semaine. Une ligne par ensemble et par semaine :
 * on garde l'historique au lieu d'écraser, pour pouvoir comparer les périodes.
 */
export const adMetrics = pgTable(
  "ad_metrics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adSetId: uuid("ad_set_id")
      .notNull()
      .references(() => adSets.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(),
    spendCents: integer("spend_cents").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    leads: integer("leads").notNull().default(0),
    conversions: integer("conversions").notNull().default(0),
    revenueCents: integer("revenue_cents").notNull().default(0),
    capturedById: uuid("captured_by_id").references(() => users.id, { onDelete: "set null" }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ad_metrics_unique").on(t.adSetId, t.weekStart)],
);

export const creatives = pgTable(
  "creatives",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    kind: text("kind"),
    note: text("note"),
    spendCents: integer("spend_cents").notNull().default(0),
    leads: integer("leads").notNull().default(0),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("creatives_campaign_idx").on(t.campaignId)],
);

/* ------------------------------------------------------------ rentabilité -- */

/**
 * Heures passées, saisies par semaine. C'est la seule source du coût interne :
 * sans elles, la marge affichée serait une fiction.
 */
export const timeEntries = pgTable(
  "time_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(),
    minutes: integer("minutes").notNull().default(0),
    /** « Création graphique », « Media buying »… */
    activity: text("activity"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("time_entries_client_idx").on(t.clientId),
    index("time_entries_week_idx").on(t.weekStart),
  ],
);

/** Coût horaire par personne, historisé : un tarif change, l'historique reste juste. */
export const hourlyRates = pgTable(
  "hourly_rates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    costPerHourCents: integer("cost_per_hour_cents").notNull(),
    effectiveFrom: date("effective_from").notNull(),
  },
  (t) => [index("hourly_rates_user_idx").on(t.userId)],
);

/* ---------------------------------------------------------------- journal -- */

export const activity = pgTable(
  "activity",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    contentId: uuid("content_id").references(() => contents.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    /** Vide quand l'action vient du système (relance automatique, etc.). */
    actorLabel: text("actor_label"),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_client_idx").on(t.clientId, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Content = typeof contents.$inferSelect;
export type Shoot = typeof shoots.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;

/* --------------------------------------------------- pièces jointes client -- */

/**
 * Documents rattachés à un client : contrat, charte de marque, brief annuel,
 * devis. Séparés des médias — un contrat n'est pas un visuel, il ne se
 * recompresse pas, ne s'affiche pas en grille et n'a rien à faire dans la
 * bibliothèque où l'on cherche une photo à publier.
 */
export const clientFiles = pgTable(
  "client_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    storagePath: text("storage_path").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    label: text("label"),
    uploadedById: uuid("uploaded_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("client_files_client_idx").on(t.clientId)],
);

/* --------------------------------------------------------- notifications -- */

export const notificationKind = pgEnum("notification_kind", [
  "assignation",
  "validation_attendue",
  "valide",
  "modification_demandee",
  "publie",
  "tournage",
  "message",
]);

/**
 * Une notification par destinataire.
 *
 * Dupliquer la ligne pour chaque personne concernée plutôt que de tenir une
 * liste de lecteurs : c'est ce qui permet de savoir qui a lu quoi, et
 * l'agence compte quelques personnes, pas des milliers.
 *
 * Le courriel est envoyé dans la foulée, et son sort est inscrit ici :
 * `emailedAt` s'il est parti, `emailError` sinon. Un envoi perdu en silence
 * est pire que pas d'envoi du tout — on croit avoir prévenu.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: notificationKind("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    /** Où aller pour agir. Une notification sans destination est un constat. */
    href: text("href"),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    contentId: uuid("content_id").references(() => contents.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    emailError: text("email_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
);
