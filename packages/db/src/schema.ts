import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core"

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}

export const userStatuses = ["pending", "active", "disabled"] as const
export const organizationTypes = ["venue_owner", "karaoke_company", "agency", "independent_host", "platform"] as const
export const organizationStatuses = ["pending", "active", "suspended", "archived", "disabled"] as const
export const organizationMemberRoles = ["owner", "admin", "booking_manager", "host", "operator", "viewer"] as const
export const membershipStatuses = ["invited", "active", "suspended", "removed", "disabled"] as const
export const venueStatuses = ["draft", "active", "archived"] as const
export const venueVerificationStatuses = ["unclaimed", "pending", "verified", "rejected"] as const
export const venueAccessRoles = ["owner", "manager", "event_creator", "karaoke_operator", "viewer"] as const
export const venueAccessStatuses = ["pending", "active", "revoked", "expired", "rejected"] as const
export const eventStatuses = ["draft", "scheduled", "active", "paused", "closed", "archived", "cancelled"] as const
export const eventInviteStatuses = ["active", "revoked"] as const
export const eventJoinAccessModes = ["open", "invite_required"] as const
export const eventVisibilities = ["public", "unlisted", "private"] as const
export const eventStaffRoles = ["lead_host", "host", "queue_operator", "viewer"] as const
export const eventStaffStatuses = ["active", "removed"] as const
export const songRequestStatuses = ["pending", "approved", "now", "done", "skipped", "rejected"] as const
export const queueEventTypes = [
  "event.started",
  "event.paused",
  "event.resumed",
  "event.closed",
  "event.archived",
  "event.cancelled",
  "request.created",
  "request.approved",
  "request.rejected",
  "request.started",
  "request.done",
  "request.skipped",
  "request.moved"
] as const
export const catalogSourceStatuses = ["active", "disabled"] as const
export const catalogImportStatuses = ["queued", "running", "succeeded", "failed", "cancelled"] as const
export const catalogImportLogLevels = ["info", "warn", "error"] as const
export const accessRequestStatuses = ["pending", "approved", "rejected"] as const
export const jobStatuses = ["queued", "running", "succeeded", "failed", "cancelled"] as const
export const platformRoles = ["platform_owner", "platform_admin"] as const
export const platformMembershipStatuses = ["active", "disabled"] as const

export const defaultOrganizationMemberRole = "operator" satisfies (typeof organizationMemberRoles)[number]
export const defaultVenueAccessRole = "karaoke_operator" satisfies (typeof venueAccessRoles)[number]
export const defaultEventStaffRole = "queue_operator" satisfies (typeof eventStaffRoles)[number]

export type UserStatus = (typeof userStatuses)[number]
export type OrganizationType = (typeof organizationTypes)[number]
export type OrganizationStatus = (typeof organizationStatuses)[number]
export type OrganizationMemberRole = (typeof organizationMemberRoles)[number]
export type EventStatus = (typeof eventStatuses)[number]
export type EventJoinAccessMode = (typeof eventJoinAccessModes)[number]
export type EventVisibility = (typeof eventVisibilities)[number]
export type SongRequestStatus = (typeof songRequestStatuses)[number]
export type CatalogImportStatus = (typeof catalogImportStatuses)[number]
export type PlatformRole = (typeof platformRoles)[number]

export const authUsers = pgTable("auth_users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
})

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" })
  },
  (table) => [index("auth_sessions_user_id_idx").on(table.userId)]
)

export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("auth_accounts_user_id_idx").on(table.userId),
    unique("auth_accounts_provider_account_unique").on(table.providerId, table.accountId)
  ]
)

export const authVerifications = pgTable("auth_verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
})

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authUserId: text("auth_user_id")
      .unique()
      .references(() => authUsers.id, { onDelete: "set null" }),
    email: text("email").notNull().unique(),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    status: text("status").notNull().default("pending"),
    ...timestamps
  },
  (table) => [check("users_status_check", sql`${table.status} in ('pending', 'active', 'disabled')`)]
)

export const platformMemberships = pgTable(
  "platform_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    status: text("status").notNull().default("active"),
    grantedByUserId: uuid("granted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps
  },
  (table) => [
    unique("platform_memberships_user_role_unique").on(table.userId, table.role),
    index("platform_memberships_user_id_idx").on(table.userId),
    check("platform_memberships_role_check", sql`${table.role} in ('platform_owner', 'platform_admin')`),
    check("platform_memberships_status_check", sql`${table.status} in ('active', 'disabled')`)
  ]
)

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    type: text("type").notNull().default("karaoke_company"),
    status: text("status").notNull().default("pending"),
    ...timestamps
  },
  (table) => [
    check(
      "organizations_type_check",
      sql`${table.type} in ('venue_owner', 'karaoke_company', 'agency', 'independent_host', 'platform')`
    ),
    check(
      "organizations_status_check",
      sql`${table.status} in ('pending', 'active', 'suspended', 'archived', 'disabled')`
    )
  ]
)

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default(defaultOrganizationMemberRole),
    status: text("status").notNull().default("invited"),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps
  },
  (table) => [
    unique("organization_memberships_organization_user_unique").on(table.organizationId, table.userId),
    index("organization_memberships_user_id_idx").on(table.userId),
    check(
      "organization_memberships_role_check",
      sql`${table.role} in ('owner', 'admin', 'booking_manager', 'host', 'operator', 'viewer')`
    ),
    check(
      "organization_memberships_status_check",
      sql`${table.status} in ('invited', 'active', 'suspended', 'removed', 'disabled')`
    )
  ]
)

export const venues = pgTable(
  "venues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    address: text("address"),
    city: text("city"),
    country: text("country").notNull().default("PL"),
    timezone: text("timezone").notNull().default("Europe/Warsaw"),
    status: text("status").notNull().default("draft"),
    verificationStatus: text("verification_status").notNull().default("unclaimed"),
    claimedByOrganizationId: uuid("claimed_by_organization_id").references(() => organizations.id, {
      onDelete: "set null"
    }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps
  },
  (table) => [
    check("venues_status_check", sql`${table.status} in ('draft', 'active', 'archived')`),
    check(
      "venues_verification_status_check",
      sql`${table.verificationStatus} in ('unclaimed', 'pending', 'verified', 'rejected')`
    )
  ]
)

export const venueOrganizationAccess = pgTable(
  "venue_organization_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: text("role").notNull().default(defaultVenueAccessRole),
    status: text("status").notNull().default("pending"),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, { onDelete: "set null" }),
    grantedByUserId: uuid("granted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    unique("venue_organization_access_venue_organization_role_unique").on(
      table.venueId,
      table.organizationId,
      table.role
    ),
    index("venue_organization_access_organization_id_idx").on(table.organizationId),
    check(
      "venue_organization_access_role_check",
      sql`${table.role} in ('owner', 'manager', 'event_creator', 'karaoke_operator', 'viewer')`
    ),
    check(
      "venue_organization_access_status_check",
      sql`${table.status} in ('pending', 'active', 'revoked', 'expired', 'rejected')`
    )
  ]
)

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    operatedByOrganizationId: uuid("operated_by_organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    publicId: text("public_id").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: text("status").notNull().default("draft"),
    visibility: text("visibility", { enum: eventVisibilities }).notNull().default("public"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    publicJoinEnabled: boolean("public_join_enabled").notNull().default(true),
    publicQueueEnabled: boolean("public_queue_enabled").notNull().default(true),
    joinAccessMode: text("join_access_mode", { enum: eventJoinAccessModes }).notNull().default("open"),
    ...timestamps
  },
  (table) => [
    unique("events_venue_slug_unique").on(table.venueId, table.slug),
    unique("events_public_id_unique").on(table.publicId),
    uniqueIndex("events_one_active_or_paused_per_venue_unique")
      .on(table.venueId)
      .where(sql`${table.status} in ('active', 'paused')`),
    index("events_operated_by_organization_id_idx").on(table.operatedByOrganizationId),
    check(
      "events_status_check",
      sql`${table.status} in ('draft', 'scheduled', 'active', 'paused', 'closed', 'archived', 'cancelled')`
    ),
    check("events_visibility_check", sql`${table.visibility} in ('public', 'unlisted', 'private')`),
    check("events_join_access_mode_check", sql`${table.joinAccessMode} in ('open', 'invite_required')`)
  ]
)

export const eventInvites = pgTable(
  "event_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    status: text("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("event_invites_code_unique").on(table.code),
    index("event_invites_event_id_idx").on(table.eventId),
    check("event_invites_status_check", sql`${table.status} in ('active', 'revoked')`)
  ]
)

export const participantEventAccess = pgTable(
  "participant_event_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    participantTokenHash: text("participant_token_hash").notNull(),
    grantedByInviteId: uuid("granted_by_invite_id").references(() => eventInvites.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("participant_event_access_event_token_unique").on(table.eventId, table.participantTokenHash),
    index("participant_event_access_event_id_idx").on(table.eventId),
    index("participant_event_access_invite_id_idx").on(table.grantedByInviteId)
  ]
)

export const platformSupportAuditEvents = pgTable(
  "platform_support_audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    targetEventId: uuid("target_event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    operation: text("operation").notNull(),
    permission: text("permission").notNull(),
    accessType: text("access_type").notNull().default("platform_owner_support"),
    outcome: text("outcome").notNull().default("allowed"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("platform_support_audit_events_actor_created_at_idx").on(table.actorUserId, table.createdAt),
    index("platform_support_audit_events_event_created_at_idx").on(table.targetEventId, table.createdAt),
    index("platform_support_audit_events_access_type_idx").on(table.accessType)
  ]
)

export const eventStaffAssignments = pgTable(
  "event_staff_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default(defaultEventStaffRole),
    status: text("status").notNull().default("active"),
    assignedByUserId: uuid("assigned_by_user_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps
  },
  (table) => [
    unique("event_staff_assignments_event_user_role_unique").on(table.eventId, table.userId, table.role),
    index("event_staff_assignments_user_id_idx").on(table.userId),
    check(
      "event_staff_assignments_role_check",
      sql`${table.role} in ('lead_host', 'host', 'queue_operator', 'viewer')`
    ),
    check("event_staff_assignments_status_check", sql`${table.status} in ('active', 'removed')`)
  ]
)

export const songSources = pgTable(
  "song_sources",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    ...timestamps
  },
  (table) => [check("song_sources_status_check", sql`${table.status} in ('active', 'disabled')`)]
)

export const songSourceTracks = pgTable(
  "song_source_tracks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: text("source_id")
      .notNull()
      .references(() => songSources.id, { onDelete: "cascade" }),
    sourceTrackId: text("source_track_id").notNull(),
    canonicalSongId: uuid("canonical_song_id"),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    artist: text("artist").notNull(),
    artistSourceId: text("artist_source_id"),
    normalizedTitle: text("normalized_title").notNull(),
    normalizedArtist: text("normalized_artist").notNull(),
    searchText: text("search_text").notNull(),
    durationSeconds: integer("duration_seconds"),
    genres: text("genres").array().notNull().default(sql`'{}'::text[]`),
    isPlus: boolean("is_plus").notNull().default(false),
    isHit: boolean("is_hit").notNull().default(false),
    isBuyAvailable: boolean("is_buy_available").notNull().default(false),
    sourceUrl: text("source_url"),
    sourceSelflink: text("source_selflink"),
    sourceDateAdded: timestamp("source_date_added", { withTimezone: true }),
    availabilityStatus: text("availability_status").notNull().default("available"),
    rawPublicMetadata: jsonb("raw_public_metadata"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps
  },
  (table) => [
    unique("song_source_tracks_source_track_unique").on(table.sourceId, table.sourceTrackId),
    index("song_source_tracks_search_text_idx").on(table.searchText),
    index("song_source_tracks_source_id_idx").on(table.sourceId)
  ]
)

export const songRequests = pgTable(
  "song_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    singerName: text("singer_name").notNull(),
    displayName: text("display_name").notNull(),
    participantTokenHash: text("participant_token_hash"),
    sourceId: text("source_id")
      .notNull()
      .references(() => songSources.id, { onDelete: "restrict" }),
    sourceTrackId: text("source_track_id").notNull(),
    songTitle: text("song_title").notNull(),
    songArtist: text("song_artist").notNull(),
    songUrl: text("song_url"),
    note: text("note"),
    status: text("status").notNull().default("pending"),
    position: integer("position"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    uniqueIndex("song_requests_one_now_per_event_unique")
      .on(table.eventId)
      .where(sql`${table.status} = 'now'`),
    uniqueIndex("song_requests_one_approved_position_per_event_unique")
      .on(table.eventId, table.position)
      .where(sql`${table.status} = 'approved' and ${table.position} is not null`),
    index("song_requests_event_status_position_idx").on(table.eventId, table.status, table.position),
    index("song_requests_source_track_idx").on(table.sourceId, table.sourceTrackId),
    check(
      "song_requests_status_check",
      sql`${table.status} in ('pending', 'approved', 'now', 'done', 'skipped', 'rejected')`
    )
  ]
)

export const queueEvents = pgTable(
  "queue_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    requestId: uuid("request_id").references(() => songRequests.id, { onDelete: "set null" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorOrganizationId: uuid("actor_organization_id").references(() => organizations.id, { onDelete: "set null" }),
    actorKind: text("actor_kind").notNull().default("system"),
    type: text("type").notNull(),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("queue_events_event_created_at_idx").on(table.eventId, table.createdAt),
    index("queue_events_request_id_idx").on(table.requestId)
  ]
)

export const catalogImportRuns = pgTable(
  "catalog_import_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: text("source_id")
      .notNull()
      .references(() => songSources.id, { onDelete: "cascade" }),
    triggeredByUserId: uuid("triggered_by_user_id").references(() => users.id, { onDelete: "set null" }),
    status: text("status").notNull().default("queued"),
    totalFoundFromSource: integer("total_found_from_source"),
    importedCount: integer("imported_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    failedAtUrl: text("failed_at_url"),
    errorMessage: text("error_message"),
    ...timestamps
  },
  (table) => [
    uniqueIndex("catalog_import_runs_one_queued_or_running_per_source_unique")
      .on(table.sourceId)
      .where(sql`${table.status} in ('queued', 'running')`),
    index("catalog_import_runs_source_status_idx").on(table.sourceId, table.status),
    check(
      "catalog_import_runs_status_check",
      sql`${table.status} in ('queued', 'running', 'succeeded', 'failed', 'cancelled')`
    )
  ]
)

export const catalogImportLogs = pgTable(
  "catalog_import_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importRunId: uuid("import_run_id")
      .notNull()
      .references(() => catalogImportRuns.id, { onDelete: "cascade" }),
    level: text("level").notNull().default("info"),
    message: text("message").notNull(),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("catalog_import_logs_import_run_created_at_idx").on(table.importRunId, table.createdAt),
    check("catalog_import_logs_level_check", sql`${table.level} in ('info', 'warn', 'error')`)
  ]
)

export const accessRequests = pgTable(
  "access_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name"),
    organizationName: text("organization_name"),
    venueName: text("venue_name"),
    venueId: uuid("venue_id").references(() => venues.id, { onDelete: "set null" }),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
    venueAccessRole: text("venue_access_role").notNull().default("karaoke_operator"),
    status: text("status").notNull().default("pending"),
    message: text("message"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    index("access_requests_status_created_at_idx").on(table.status, table.createdAt),
    index("access_requests_email_idx").on(table.email),
    check("access_requests_status_check", sql`${table.status} in ('pending', 'approved', 'rejected')`),
    check(
      "access_requests_venue_access_role_check",
      sql`${table.venueAccessRole} in ('owner', 'manager', 'event_creator', 'karaoke_operator', 'viewer')`
    )
  ]
)

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    status: text("status").notNull().default("queued"),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    lastError: text("last_error"),
    ...timestamps
  },
  (table) => [
    index("jobs_status_run_at_idx").on(table.status, table.runAt),
    index("jobs_type_status_idx").on(table.type, table.status),
    check(
      "jobs_status_check",
      sql`${table.status} in ('queued', 'running', 'succeeded', 'failed', 'cancelled')`
    )
  ]
)
