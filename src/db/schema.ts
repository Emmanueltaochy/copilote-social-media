import type { AnyPgColumn } from "drizzle-orm/pg-core";
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
    /**
     * Photo de profil, redimensionnée à l'enregistrement. Vide = les initiales
     * font l'affaire. Le chemin est relatif à MEDIA_ROOT, comme les médias :
     * une photo n'est pas plus publique qu'un visuel client.
     */
    avatarPath: text("avatar_path"),
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
    /**
     * Les pôles auxquels la personne appartient : « social », « web », ou les
     * deux. Vide = social, pour que les comptes créés avant l'arrivée du pôle
     * web gardent exactement l'outil qu'ils avaient.
     */
    departments: jsonb("departments").$type<string[]>().notNull().default([]),
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

/*
 * Format et réseau : déclarés avant les clients parce que la décomposition
 * de leur engagement s'en sert. Une ligne de contrat porte le format qu'elle
 * produit, ce qui permet de fabriquer le mois et non seulement de le compter.
 */
export const contentKind = pgEnum("content_kind", ["feed", "story", "reel", "carrousel", "autre"]);

export const network = pgEnum("network", ["instagram", "facebook", "linkedin", "tiktok", "google"]);

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

    /* Contrat social — ce que l'agence s'est engagée à livrer chaque mois. */
    monthlyFeeCents: integer("monthly_fee_cents").notNull().default(0),
    /** Nombre de contenus dus par mois. Zéro = pas d'engagement chiffré. */
    contentTarget: integer("content_target").notNull().default(0),
    shootsIncluded: integer("shoots_included").notNull().default(0),
    adsBudgetLabel: text("ads_budget_label"),
    /** Heures vendues dans le forfait, base du calcul de rentabilité. */
    hoursSold: integer("hours_sold").notNull().default(0),
    renewal: text("renewal"),

    /*
     * Contrat web. Le web ne se vend pas au mois mais au projet : le montant
     * vendu vit donc sur chaque projet, pas ici. Ne restent au niveau du
     * client que les deux engagements qui courent au-delà d'un projet — ce
     * qu'on facture tous les mois pour garder le site en vie, et le volume
     * d'heures vendu sur l'ensemble de la relation.
     */
    /**
     * Comment le web est facturé : « forfait » ou « heure ».
     *
     * Le forfait est le cas courant — un site se vend à un prix convenu
     * d'avance, et les heures passées ne servent qu'à savoir si on l'a bien
     * vendu. La régie existe quand même (TMA, retouches au fil de l'eau), et
     * elle change les chiffres à afficher : un taux horaire et une enveloppe
     * plutôt qu'un montant arrêté.
     */
    webBilling: text("web_billing").notNull().default("forfait"),
    /** Maintenance, hébergement, TMA : ce qui revient chaque mois. */
    webMaintenanceCents: integer("web_maintenance_cents").notNull().default(0),
    /** En régie : le tarif appliqué à chaque heure passée. */
    webHourlyRateCents: integer("web_hourly_rate_cents").notNull().default(0),
    /** En régie : l'enveloppe d'heures vendue. Zéro = sans plafond. */
    webHoursSold: integer("web_hours_sold").notNull().default(0),

    /**
     * Les pôles qui travaillent pour ce client : « social », « web », ou les
     * deux.
     *
     * Un client web n'a rien à faire dans les écrans du social — ni dans le
     * cockpit, ni dans le sélecteur, ni dans les listes déroulantes. Chacun ne
     * voit que son portefeuille, sans quoi les compteurs d'engagement mensuel
     * afficheraient « 0 / 0 » pour des comptes qui n'ont jamais rien commandé
     * au pôle social.
     */
    departments: jsonb("departments").$type<string[]>().notNull().default(["social"]),

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
    /*
     * Le format et le réseau de la ligne.
     *
     * Le libellé est écrit pour un humain — « Posts feed », « 3 reels
     * produits » — et deux agences ne l'écrivent pas pareil. Deviner le format
     * à partir de ce texte marcherait neuf fois sur dix, et la dixième
     * créerait un mois entier au mauvais format. Ces deux champs sont donc
     * renseignés une fois pour toutes, à la signature du contrat, et c'est eux
     * qui permettent de fabriquer le mois plutôt que de seulement le compter.
     */
    kind: contentKind("kind").notNull().default("feed"),
    network: network("network").notNull().default("instagram"),
    /** Réseaux visés par cette ligne. Vide = seulement `network`. */
    networks: jsonb("networks").$type<string[]>().notNull().default([]),
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



export const contents = pgTable(
  "contents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: contentKind("kind").notNull().default("feed"),
    /**
     * Le réseau principal, gardé pour les tris et les regroupements.
     *
     * Un même post part souvent sur Instagram *et* Facebook : c'est une seule
     * production, avec un seul visuel et une seule légende, pas deux contenus à
     * suivre en double. La liste complète vit donc dans `networks`, et cette
     * colonne en garde la tête pour qu'un tri par réseau reste possible.
     */
    network: network("network").notNull().default("instagram"),
    /** Tous les réseaux visés. Vide = seulement `network`. */
    networks: jsonb("networks").$type<string[]>().notNull().default([]),
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

/**
 * Les dossiers de la bibliothèque.
 *
 * Une bibliothèque à plat ne tient pas : les carrousels finis s'y mélangent
 * aux photos brutes du même shooting, et il faut ouvrir chaque vignette pour
 * savoir laquelle est laquelle. Les dossiers sont propres à un client — on ne
 * range pas les médias de deux marques ensemble — et s'imbriquent, parce qu'un
 * « Shooting mars » contient un « Brut » et un « Retouché ».
 *
 * Supprimer un dossier ne supprime jamais un média : son contenu remonte d'un
 * cran. Une suppression en cascade ferait disparaître le travail de plusieurs
 * jours sur un clic.
 */
export const assetFolders = pgTable(
  "asset_folders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => assetFolders.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("asset_folders_client_idx").on(t.clientId),
    index("asset_folders_parent_idx").on(t.parentId),
  ],
);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    shootId: uuid("shoot_id").references(() => shoots.id, { onDelete: "set null" }),
    /** Le dossier où le média est rangé. Nul = à la racine du client. */
    folderId: uuid("folder_id").references(() => assetFolders.id, { onDelete: "set null" }),
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
    /**
     * Le pôle sous lequel l'heure a été saisie.
     *
     * Sans lui, dix heures d'intégration passées sur un client qui achète les
     * deux prestations viendraient manger la marge de son forfait social. Le
     * pôle actif au moment de la saisie tranche, et « social » reste la valeur
     * par défaut : c'est ce qu'étaient toutes les heures déjà enregistrées.
     */
    pole: text("pole").notNull().default("social"),
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
    /**
     * Qui voit ce document : « interne » (l'agence seule) ou « client »
     * (partagé, visible dans le portail).
     *
     * Le dossier d'un client contient les deux natures : le contrat signé et
     * la grille tarifaire n'ont rien à faire sous ses yeux, le devis validé et
     * la maquette livrée sont faits pour lui. Sans cette distinction, tout ce
     * que l'équipe déposait sur la fiche apparaissait dans le portail.
     *
     * Interne par défaut : un document qu'on n'a pas explicitement partagé ne
     * doit pas l'être par accident.
     */
    visibility: text("visibility").notNull().default("interne"),
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

/* ----------------------------------------------------- liens externes -- */

/**
 * Un visuel qui vit ailleurs : Drive, WeTransfer, Frame.io.
 *
 * Tout ne passe pas par la bibliothèque. Un montage de 3 Go rendu par un
 * prestataire n'a rien à faire sur ce serveur — il est déjà stocké quelque
 * part, et le recopier ne ferait que remplir le disque d'une seconde copie
 * qu'il faudrait ensuite garder à jour. Le lien suffit à savoir où regarder.
 */
export const contentLinks = pgTable(
  "content_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contentId: uuid("content_id")
      .notNull()
      .references(() => contents.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    label: text("label"),
    addedById: uuid("added_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("content_links_content_idx").on(t.contentId)],
);

/* ------------------------------------------------- matériel personnel -- */

/**
 * Le matériel habituel de quelqu'un.
 *
 * Chacun part avec à peu près le même sac d'un tournage à l'autre, et le
 * ressaisir ligne par ligne à chaque fiche est le genre de corvée qu'on finit
 * par sauter — laissant la liste vide, donc inutile. La liste est personnelle
 * et non partagée : le sac d'un cadreur n'est pas celui d'un photographe, et
 * une liste commune obligerait chacun à trier ce qui ne le concerne pas.
 */
export const gearPresets = pgTable(
  "gear_presets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("gear_presets_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------ messagerie -- */

/**
 * Une conversation : le fil de l'équipe, ou un tête-à-tête.
 *
 * Deux formes seulement, et c'est volontaire. Des salons thématiques créés
 * librement finissent en archives mortes qu'on ne relit pas et où l'on cherche
 * ensuite dans lequel telle décision a été prise. Ici on parle à tout le monde,
 * ou à une personne — et dans les deux cas on sait où retrouver l'échange.
 */
export const conversationKind = pgEnum("conversation_kind", ["equipe", "direct"]);

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  kind: conversationKind("kind").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Qui participe, et jusqu'où il a lu.
 *
 * La date de dernière lecture est portée par la personne, pas par le message :
 * c'est ce qui permet à chacun d'avoir son propre compteur de non-lus sans
 * marquer chaque message un par un.
 */
export const conversationMembers = pgTable(
  "conversation_members",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.userId] }),
    index("conversation_members_user_idx").on(t.userId),
  ],
);

/**
 * Un message.
 *
 * L'auteur peut disparaître — un freelance dont le compte est supprimé — sans
 * emporter la conversation : ce qui a été dit reste, même sans nom en face.
 */
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

/* ============================================================== pôle web == */

/**
 * Le pôle auquel une personne appartient.
 *
 * L'agence fait deux métiers qui n'ont ni le même rythme ni les mêmes écrans :
 * le social se pilote au mois et se compte en contenus ; le web se pilote au
 * projet et se compte en jalons. Mélanger les deux dans une seule navigation
 * obligerait chacun à traverser le travail de l'autre pour trouver le sien.
 *
 * Ce n'est pas un niveau de droits — celui-là reste `users.role`. C'est le
 * métier qu'on exerce, et on peut en exercer deux.
 */
export const DEPARTMENTS = ["social", "web"] as const;
export type Department = (typeof DEPARTMENTS)[number];

/**
 * Ce que l'agence vend côté web.
 *
 * Le type n'est pas décoratif : il décide du brief proposé et des jalons
 * attendus. Une boutique demande des fiches produits et un moyen de paiement,
 * une landing page n'en demande aucun.
 */
export const webProjectType = pgEnum("web_project_type", [
  "vitrine",
  "ecommerce",
  "landing",
  "location",
  "refonte",
  "autre",
]);

/**
 * Les étapes d'un projet web, dans l'ordre où elles arrivent.
 *
 * Elles suivent la réalité d'une agence : on ne maquette pas sans brief, on
 * n'intègre pas sans maquette validée, et on ne met pas en ligne sans recette.
 * « Contenus » existe à part parce que c'est l'étape où l'on attend le client —
 * la confondre avec l'intégration fait croire que le retard vient de nous.
 */
export const webPhase = pgEnum("web_phase", [
  "cadrage",
  "brief",
  "maquette",
  "integration",
  "contenus",
  "recette",
  "en_ligne",
  "maintenance",
]);

export const webProjects = pgTable(
  "web_projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: webProjectType("type").notNull().default("vitrine"),
    phase: webPhase("phase").notNull().default("cadrage"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    /** Montant vendu, en centimes. Zéro = pas encore chiffré. */
    priceCents: integer("price_cents").notNull().default(0),
    /** Mise en ligne visée. C'est la date que le client retient. */
    dueAt: timestamp("due_at", { withTimezone: true }),
    launchedAt: timestamp("launched_at", { withTimezone: true }),
    domain: text("domain"),
    hosting: text("hosting"),
    stack: text("stack"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("web_projects_client_idx").on(t.clientId), index("web_projects_phase_idx").on(t.phase)],
);

/**
 * Les jalons d'un projet.
 *
 * Un projet web se tient par ses jalons, pas par un pourcentage : « maquette
 * accueil validée » se vérifie, « 60 % » ne se vérifie pas. Ceux marqués
 * `clientVisible` apparaissent dans le portail — le client voit où l'on en est
 * sans avoir à le demander.
 */
export const webMilestones = pgTable(
  "web_milestones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => webProjects.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    done: boolean("done").notNull().default(false),
    doneAt: timestamp("done_at", { withTimezone: true }),
    /** Le jalon attend une réponse du client, pas de l'agence. */
    waitingClient: boolean("waiting_client").notNull().default(false),
    clientVisible: boolean("client_visible").notNull().default(true),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("web_milestones_project_idx").on(t.projectId)],
);

/* ------------------------------------------------------------------ brief -- */

export const briefStatus = pgEnum("brief_status", ["brouillon", "envoye", "en_cours", "complete"]);

export const briefFieldKind = pgEnum("brief_field_kind", [
  "texte",
  "long",
  "choix",
  "oui_non",
  "url",
  "nombre",
]);

/**
 * Un brief : les questions qu'on pose avant de commencer.
 *
 * Il vit à part du projet parce qu'il a sa propre vie : on l'écrit, on
 * l'envoie, le client le remplit à son rythme, et l'agence complète ce qu'il a
 * laissé de côté. Les deux écrivent au même endroit — un brief recopié d'un
 * e-mail dans un document devient faux dès la première précision.
 */
export const briefs = pgTable(
  "briefs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => webProjects.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    intro: text("intro"),
    /**
     * L'avancement se déduit des réponses, mais « complet » se déclare.
     *
     * Le brief s'enregistre au fil de l'eau — l'agence lit les réponses sans
     * attendre — et le client dit lui-même quand il a terminé. Sans ce geste,
     * personne ne sait si un champ vide est une question oubliée ou une
     * question à laquelle il n'y a rien à répondre.
     */
    status: briefStatus("status").notNull().default("brouillon"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("briefs_client_idx").on(t.clientId)],
);

export const briefFields = pgTable(
  "brief_fields",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    briefId: uuid("brief_id")
      .notNull()
      .references(() => briefs.id, { onDelete: "cascade" }),
    section: text("section").notNull(),
    label: text("label").notNull(),
    /** Une phrase d'aide : c'est elle qui fait la différence entre une réponse utile et « oui ». */
    help: text("help"),
    kind: briefFieldKind("kind").notNull().default("texte"),
    /** Pour les questions à choix : les options, dans l'ordre. */
    options: jsonb("options").$type<string[]>().notNull().default([]),
    required: boolean("required").notNull().default(false),
    position: integer("position").notNull().default(0),
    /** La réponse. Vide tant que personne n'a répondu. */
    answer: text("answer"),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    /** Qui a répondu : un compte interne, ou le client (vide). */
    answeredById: uuid("answered_by_id").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("brief_fields_brief_idx").on(t.briefId)],
);

/* -------------------------------------------------- réglages de l'agence -- */

/**
 * Les réglages de l'agence, en une seule ligne.
 *
 * Une table à une ligne plutôt qu'un fichier de configuration : le portail
 * client porte les couleurs de l'agence, et ces couleurs doivent pouvoir
 * changer sans redéployer. La clé fixe garantit qu'il n'y en aura jamais deux.
 */
export const settings = pgTable("settings", {
  id: text("id").primaryKey().default("agence"),
  agencyName: text("agency_name").notNull().default("Taochy Consulting"),
  /** Couleur d'accent du portail client, en hexadécimal. */
  primaryColor: text("primary_color").notNull().default("#B08D3F"),
  /** Fond des bandeaux du portail. */
  darkColor: text("dark_color").notNull().default("#121212"),
  logoPath: text("logo_path"),
  /**
   * Le visuel des pages de connexion : colonne de droite sur un écran, fond
   * derrière le formulaire sur un téléphone. Vide = un dégradé construit à
   * partir des deux couleurs ci-dessus, qui reste aux couleurs de l'agence
   * sans rien demander à personne.
   */
  coverPath: text("cover_path"),
  portalWelcome: text("portal_welcome"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------ livrables -- */

export const deliverableStatus = pgEnum("deliverable_status", [
  "en_attente",
  "valide",
  "modifications",
]);

/**
 * Ce qu'on soumet au client : une maquette, une page de démo, un document.
 *
 * Un livrable vit sous deux formes et pas une : un lien — maquette Figma, site
 * de préproduction — ou un fichier déposé, PDF ou image. Obliger l'un ou
 * l'autre ferait bricoler l'équipe, qui collerait l'adresse d'un PDF dans un
 * champ prévu pour une capture d'écran.
 *
 * La réponse du client vit ici aussi : sans le motif d'un refus, la reprise
 * repart à l'aveugle et le même aller-retour se reproduit.
 */
export const webDeliverables = pgTable(
  "web_deliverables",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => webProjects.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    /** Une phrase de contexte : ce qu'on demande de regarder. */
    note: text("note"),
    /** Lien externe — Figma, préproduction, Drive. */
    url: text("url"),
    /** Fichier déposé dans le dossier du client. */
    fileId: uuid("file_id").references(() => clientFiles.id, { onDelete: "set null" }),
    status: deliverableStatus("status").notNull().default("en_attente"),
    /** Ce que le client a répondu quand il demande une reprise. */
    clientNote: text("client_note"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    position: integer("position").notNull().default(0),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("web_deliverables_project_idx").on(t.projectId)],
);
