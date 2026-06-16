import {
  eventStaffAssignments,
  participantEventAccess,
  eventStaffRoles,
  eventStatuses,
  eventInvites,
  events,
  organizations,
  organizationMemberships,
  queueEvents,
  venueOrganizationAccess,
  venues,
  type DbClient,
  type EventJoinAccessMode,
  type EventStatus
} from "@poza-nuta/db"
import { randomBytes } from "node:crypto"
import { and, eq, inArray, ne, sql } from "drizzle-orm"
import { ApiHttpError } from "../../errors.ts"
import type { DomainEventBus, DomainEventType } from "../../plugins/eventBus.ts"
import {
  assertPublicEventContainerVisible,
  assertPublicEventDetailVisible,
  getPublicQueueState,
  getPublicSubmissionsState,
  isPublicOrganizationVisible,
  isPublicVenueVisible
} from "../publicVisibility.ts"

export type EventSummary = {
  id: string
  publicId: string
  venueId: string
  operatedByOrganizationId: string
  createdByUserId: string | null
  name: string
  slug: string
  status: string
  startsAt: Date | null
  endsAt: Date | null
  publicJoinEnabled: boolean
  publicQueueEnabled: boolean
  joinAccessMode: EventJoinAccessMode
}

export type DashboardEventSummary = EventSummary & {
  venue: {
    id: string
    name: string
    slug: string
  }
  operatedByOrganization: {
    id: string
    name: string
    slug: string
  }
  invite: {
    code: string
    urlPath: string
  } | null
}

export type EventStaffAssignmentSummary = {
  id: string
  eventId: string
  organizationId: string
  userId: string
  role: string
  status: string
}

export type PublicActiveEventLookup = {
  venue: {
    id: string
    slug: string
    name: string
    city: string | null
    timezone: string
  }
  activeEvent: EventSummary | null
}

export type PublicEventDetail = {
  event: {
    publicId: string
    name: string
    slug: string
    status: string
    startsAt: Date | null
    endsAt: Date | null
    publicJoinEnabled: boolean
    publicQueueEnabled: boolean
    joinAccessMode: EventJoinAccessMode
  }
  venue: {
    slug: string
    name: string
    city: string | null
    timezone: string
  }
  operatedByOrganization: {
    slug: string
    name: string
  }
  submissions: {
    enabled: boolean
    reason?: string
  }
  publicQueue: {
    visible: boolean
    reason?: string
  }
}

export type PublicEventResolution = {
  id: string
  publicId: string
  venueId: string
  status: string
  publicJoinEnabled: boolean
  publicQueueEnabled: boolean
  joinAccessMode: EventJoinAccessMode
}

export type PublicInviteClaim = {
  eventPublicId: string
  redirectTo: string
}

export type DashboardInviteLink = {
  code: string
  urlPath: string
}

export type DashboardInviteMutationResult = {
  invite: DashboardInviteLink | null
}

export type CreateEventInput = {
  venueId: string
  operatedByOrganizationId?: string
  createdByUserId: string
  name: string
  slug: string
  status: Extract<EventStatus, "draft" | "scheduled" | "active">
  startsAt?: string
  endsAt?: string
  publicJoinEnabled?: boolean
  publicQueueEnabled?: boolean
  joinAccessMode?: EventJoinAccessMode
}

export type PatchEventInput = {
  name?: string
  slug?: string
  startsAt?: string
  endsAt?: string
  publicJoinEnabled?: boolean
  publicQueueEnabled?: boolean
  joinAccessMode?: EventJoinAccessMode
}

export type AssignEventStaffInput = {
  eventId: string
  userId: string
  role: string
  assignedByUserId: string
}

export type PatchEventStaffInput = {
  role?: string
  status?: "active" | "removed"
}

export type LifecycleAction = "start" | "pause" | "resume" | "close" | "archive" | "cancel"

export type EventsService = {
  listForUser(userId: string, options?: { includeAll?: boolean }): Promise<DashboardEventSummary[]>
  getById(eventId: string): Promise<EventSummary | null>
  getDashboardById(eventId: string): Promise<DashboardEventSummary | null>
  createEvent(input: CreateEventInput): Promise<EventSummary>
  patchEvent(eventId: string, input: PatchEventInput): Promise<EventSummary>
  changeLifecycle(eventId: string, action: LifecycleAction, actorUserId: string): Promise<EventSummary>
  listStaff(eventId: string): Promise<EventStaffAssignmentSummary[]>
  assignStaff(input: AssignEventStaffInput): Promise<EventStaffAssignmentSummary>
  patchStaffAssignment(
    eventId: string,
    assignmentId: string,
    input: PatchEventStaffInput
  ): Promise<EventStaffAssignmentSummary>
  removeStaffAssignment(eventId: string, assignmentId: string): Promise<EventStaffAssignmentSummary>
  organizationHasActiveVenueAccess(organizationId: string, venueId: string): Promise<boolean>
  userIsActiveOrganizationMember(userId: string, organizationId: string): Promise<boolean>
  getPublicActiveEventByVenueSlug(venueSlug: string): Promise<PublicActiveEventLookup | null>
  resolvePublicEventByPublicId(eventPublicId: string): Promise<PublicEventResolution | null>
  getPublicEventById(eventPublicId: string, participantTokenHash?: string): Promise<PublicEventDetail | null>
  claimPublicInvite(inviteCode: string, participantTokenHash: string): Promise<PublicInviteClaim>
  revokeEventInvite(eventId: string): Promise<DashboardInviteMutationResult>
  rotateEventInvite(eventId: string): Promise<DashboardInviteMutationResult>
}

const lifecycleTransitions = {
  start: { from: ["draft", "scheduled"], to: "active", queueEventType: "event.started" },
  pause: { from: ["active"], to: "paused", queueEventType: "event.paused" },
  resume: { from: ["paused"], to: "active", queueEventType: "event.resumed" },
  close: { from: ["active", "paused"], to: "closed", queueEventType: "event.closed" },
  archive: { from: ["closed", "cancelled"], to: "archived", queueEventType: "event.archived" },
  cancel: { from: ["draft", "scheduled"], to: "cancelled", queueEventType: "event.cancelled" }
} as const satisfies Record<LifecycleAction, { from: readonly string[]; to: EventStatus; queueEventType: string }>

const EVENT_PUBLIC_ID_BYTES = 8
const EVENT_INVITE_CODE_BYTES = 9
const MAX_PUBLIC_ID_GENERATION_ATTEMPTS = 5
const MAX_INVITE_CODE_GENERATION_ATTEMPTS = 5

// Public event IDs are case-sensitive base64url strings. Keep them separate from internal UUIDs.
export function generateEventPublicId(): string {
  return randomBytes(EVENT_PUBLIC_ID_BYTES).toString("base64url")
}

// Invite codes are case-sensitive base64url strings and can be rotated independently from event public IDs.
export function generateEventInviteCode(): string {
  return randomBytes(EVENT_INVITE_CODE_BYTES).toString("base64url")
}

export function createEventsService(db: DbClient, eventBus?: DomainEventBus): EventsService {
  return {
    async listForUser(userId, options = {}) {
      if (options.includeAll) {
        const rows = await db
          .select(dashboardEventSelection)
          .from(events)
          .innerJoin(venues, eq(events.venueId, venues.id))
          .innerJoin(organizations, eq(events.operatedByOrganizationId, organizations.id))
          .leftJoin(eventInvites, and(eq(eventInvites.eventId, events.id), eq(eventInvites.status, "active")))
        return uniqueDashboardEvents(rows.map(mapDashboardEventRow))
      }

      const rows = await db
        .select(dashboardEventSelection)
        .from(organizationMemberships)
        .innerJoin(
          venueOrganizationAccess,
          and(
            eq(organizationMemberships.organizationId, venueOrganizationAccess.organizationId),
            eq(venueOrganizationAccess.status, "active")
          )
        )
        .innerJoin(
          events,
          and(
            eq(events.venueId, venueOrganizationAccess.venueId),
            eq(events.operatedByOrganizationId, organizationMemberships.organizationId)
          )
        )
        .innerJoin(venues, eq(events.venueId, venues.id))
        .innerJoin(organizations, eq(events.operatedByOrganizationId, organizations.id))
        .leftJoin(eventInvites, and(eq(eventInvites.eventId, events.id), eq(eventInvites.status, "active")))
        .where(and(eq(organizationMemberships.userId, userId), eq(organizationMemberships.status, "active")))

      return uniqueDashboardEvents(rows.map(mapDashboardEventRow))
    },

    async getById(eventId) {
      const rows = await db.select(eventSelection).from(events).where(eq(events.id, eventId)).limit(1)
      return rows[0] ?? null
    },

    async getDashboardById(eventId) {
      const rows = await db
        .select(dashboardEventSelection)
        .from(events)
        .innerJoin(venues, eq(events.venueId, venues.id))
        .innerJoin(organizations, eq(events.operatedByOrganizationId, organizations.id))
        .leftJoin(eventInvites, and(eq(eventInvites.eventId, events.id), eq(eventInvites.status, "active")))
        .where(eq(events.id, eventId))
        .limit(1)

      return rows[0] ? mapDashboardEventRow(rows[0]) : null
    },

    async createEvent(input) {
      const operatedByOrganizationId =
        input.operatedByOrganizationId ?? (await resolveDefaultOrganizationForVenue(db, input.venueId))
      if (!operatedByOrganizationId) {
        throw new ApiHttpError(400, "BAD_REQUEST", "Missing operatedByOrganizationId")
      }
      if (!(await this.organizationHasActiveVenueAccess(operatedByOrganizationId, input.venueId))) {
        throw new ApiHttpError(403, "FORBIDDEN", "Organization does not have active access to this venue")
      }
      validateEventDates(input.startsAt, input.endsAt)

      const rows = await inTransaction(db, async (tx) => {
        const inserted = await insertEventWithGeneratedPublicId(tx, {
          venueId: input.venueId,
          operatedByOrganizationId,
          createdByUserId: input.createdByUserId,
          name: input.name,
          slug: input.slug,
          status: input.status,
          startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
          endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
          publicJoinEnabled: input.publicJoinEnabled ?? false,
          publicQueueEnabled: input.publicQueueEnabled ?? false,
          joinAccessMode: input.joinAccessMode ?? "open"
        })
        if (inserted[0]) {
          await insertDefaultInviteWithGeneratedCode(tx, inserted[0].id)
        }
        return inserted
      })

      if (!rows[0]) {
        throw new Error("Failed to create event")
      }

      return rows[0]
    },

    async patchEvent(eventId, input) {
      const existing = await this.getById(eventId)
      if (!existing) {
        throw notFound("Missing event")
      }

      const update: Partial<typeof events.$inferInsert> = {}
      const mergedStartsAt = input.startsAt === undefined ? existing.startsAt : new Date(input.startsAt)
      const mergedEndsAt = input.endsAt === undefined ? existing.endsAt : new Date(input.endsAt)
      validateEventDateRange(mergedStartsAt, mergedEndsAt)

      if (input.name !== undefined) {
        update.name = input.name
      }
      if (input.slug !== undefined) {
        update.slug = input.slug
      }
      if (input.startsAt !== undefined) {
        update.startsAt = new Date(input.startsAt)
      }
      if (input.endsAt !== undefined) {
        update.endsAt = new Date(input.endsAt)
      }
      if (input.publicJoinEnabled !== undefined) {
        update.publicJoinEnabled = input.publicJoinEnabled
      }
      if (input.publicQueueEnabled !== undefined) {
        update.publicQueueEnabled = input.publicQueueEnabled
      }
      if (input.joinAccessMode !== undefined) {
        update.joinAccessMode = input.joinAccessMode
      }

      if (Object.keys(update).length === 0) {
        return existing
      }

      const rows = await db
        .update(events)
        .set({ ...update, updatedAt: sql`now()` })
        .where(eq(events.id, eventId))
        .returning(eventSelection)

      if (!rows[0]) {
        throw notFound("Missing event")
      }

      return rows[0]
    },

    async changeLifecycle(eventId, action, actorUserId) {
      let lifecycleEventType: string | undefined
      const change = async (tx: DbClient) => {
        const current = await getEventForUpdate(tx, eventId)
        const transition = lifecycleTransitions[action]
        lifecycleEventType = transition.queueEventType

        const allowedFrom: readonly string[] = transition.from
        if (!allowedFrom.includes(current.status)) {
          throw new ApiHttpError(409, "CONFLICT", `Cannot ${action} event from status ${current.status}`)
        }

        if ((action === "start" || action === "resume") && (await venueHasRunningEvent(tx, current.venueId, eventId))) {
          throw new ApiHttpError(409, "CONFLICT", "Venue already has an active or paused event")
        }

        const updated = (
          await tx
            .update(events)
            .set({ status: transition.to, updatedAt: sql`now()` })
            .where(eq(events.id, eventId))
            .returning(eventSelection)
        )[0]
        if (!updated) {
          throw notFound("Missing event")
        }

        await tx.insert(queueEvents).values({
          venueId: updated.venueId,
          eventId: updated.id,
          requestId: null,
          actorUserId,
          actorOrganizationId: updated.operatedByOrganizationId,
          actorKind: "operator",
          type: transition.queueEventType,
          payload: { from: current.status, to: updated.status }
        })

        return updated
      }

      const updated = await inTransaction(db, change)
      publishEventChange(eventBus, updated, lifecycleEventType as DomainEventType)
      return updated
    },

    async listStaff(eventId) {
      return db.select(staffSelection).from(eventStaffAssignments).where(eq(eventStaffAssignments.eventId, eventId))
    },

    async assignStaff(input) {
      const event = await this.getById(input.eventId)
      if (!event) {
        throw notFound("Missing event")
      }
      if (!(await this.userIsActiveOrganizationMember(input.userId, event.operatedByOrganizationId))) {
        throw new ApiHttpError(400, "BAD_REQUEST", "Assigned user must be an active member of the event organization")
      }

      const rows = await db
        .insert(eventStaffAssignments)
        .values({
          eventId: input.eventId,
          organizationId: event.operatedByOrganizationId,
          userId: input.userId,
          role: input.role,
          status: "active",
          assignedByUserId: input.assignedByUserId
        })
        .onConflictDoUpdate({
          target: [eventStaffAssignments.eventId, eventStaffAssignments.userId, eventStaffAssignments.role],
          set: {
            status: "active",
            assignedByUserId: input.assignedByUserId,
            updatedAt: sql`now()`
          }
        })
        .returning(staffSelection)

      if (!rows[0]) {
        throw new Error("Failed to assign event staff")
      }

      return rows[0]
    },

    async patchStaffAssignment(eventId, assignmentId, input) {
      const existing = await getStaffAssignmentById(db, assignmentId)
      if (!existing || existing.eventId !== eventId) {
        throw notFound("Missing event staff assignment")
      }

      const update: Partial<typeof eventStaffAssignments.$inferInsert> = {}
      if (input.role !== undefined) {
        update.role = input.role
      }
      if (input.status !== undefined) {
        update.status = input.status
      }

      const rows = await db
        .update(eventStaffAssignments)
        .set({ ...update, updatedAt: sql`now()` })
        .where(and(eq(eventStaffAssignments.id, assignmentId), eq(eventStaffAssignments.eventId, eventId)))
        .returning(staffSelection)

      if (!rows[0]) {
        throw notFound("Missing event staff assignment")
      }

      return rows[0]
    },

    async removeStaffAssignment(eventId, assignmentId) {
      return this.patchStaffAssignment(eventId, assignmentId, { status: "removed" })
    },

    async organizationHasActiveVenueAccess(organizationId, venueId) {
      const rows = await db
        .select({ id: venueOrganizationAccess.id })
        .from(venueOrganizationAccess)
        .where(
          and(
            eq(venueOrganizationAccess.organizationId, organizationId),
            eq(venueOrganizationAccess.venueId, venueId),
            eq(venueOrganizationAccess.status, "active")
          )
        )
        .limit(1)

      return rows.length > 0
    },

    async userIsActiveOrganizationMember(userId, organizationId) {
      const rows = await db
        .select({ id: organizationMemberships.id })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.userId, userId),
            eq(organizationMemberships.organizationId, organizationId),
            eq(organizationMemberships.status, "active")
          )
        )
        .limit(1)

      return rows.length > 0
    },

    async getPublicActiveEventByVenueSlug(venueSlug) {
      const venueRows = await db
        .select({
          id: venues.id,
          slug: venues.slug,
          name: venues.name,
          city: venues.city,
          timezone: venues.timezone,
          status: venues.status,
          verificationStatus: venues.verificationStatus
        })
        .from(venues)
        .where(eq(venues.slug, venueSlug))
        .limit(1)
      const venue = venueRows[0]
      if (!venue || !isPublicVenueVisible(venue)) {
        return null
      }

      const activeRows = await db
        .select({
          event: eventSelection,
          organization: {
            status: organizations.status
          }
        })
        .from(events)
        .innerJoin(organizations, eq(events.operatedByOrganizationId, organizations.id))
        .where(and(eq(events.venueId, venue.id), inArray(events.status, ["active", "paused"])))
        .limit(1)
      const active = activeRows[0]
      if (active && !isPublicOrganizationVisible(active.organization)) {
        return null
      }

      return {
        venue: {
          id: venue.id,
          slug: venue.slug,
          name: venue.name,
          city: venue.city,
          timezone: venue.timezone
        },
        activeEvent: active?.event ?? null
      }
    },

    async resolvePublicEventByPublicId(eventPublicId) {
      const rows = await db
        .select(publicEventResolutionSelection)
        .from(events)
        .innerJoin(venues, eq(events.venueId, venues.id))
        .innerJoin(organizations, eq(events.operatedByOrganizationId, organizations.id))
        .where(eq(events.publicId, eventPublicId))
        .limit(1)
      const row = rows[0]
      if (!row) {
        return null
      }

      assertPublicEventContainerVisible({
        venue: row.venue,
        organization: row.organization
      })

      return {
        id: row.event.id,
        publicId: row.event.publicId,
        venueId: row.event.venueId,
        status: row.event.status,
        publicJoinEnabled: row.event.publicJoinEnabled,
        publicQueueEnabled: row.event.publicQueueEnabled,
        joinAccessMode: row.event.joinAccessMode
      }
    },

    async getPublicEventById(eventPublicId, participantTokenHash) {
      const rows = await db
        .select(publicEventDetailSelection)
        .from(events)
        .innerJoin(venues, eq(events.venueId, venues.id))
        .innerJoin(organizations, eq(events.operatedByOrganizationId, organizations.id))
        .where(eq(events.publicId, eventPublicId))
        .limit(1)
      const row = rows[0]
      if (!row) {
        return null
      }

      assertPublicEventContainerVisible({
        venue: row.venue,
        organization: row.organization
      })
      assertPublicEventDetailVisible(row.event)

      const hasParticipantAccess =
        row.event.joinAccessMode === "open" ||
        (participantTokenHash !== undefined && (await hasParticipantEventAccess(db, row.event.id, participantTokenHash)))

      return {
        event: {
          publicId: row.event.publicId,
          name: row.event.name,
          slug: row.event.slug,
          status: row.event.status,
          startsAt: row.event.startsAt,
          endsAt: row.event.endsAt,
          publicJoinEnabled: row.event.publicJoinEnabled,
          publicQueueEnabled: row.event.publicQueueEnabled,
          joinAccessMode: row.event.joinAccessMode
        },
        venue: {
          slug: row.venue.slug,
          name: row.venue.name,
          city: row.venue.city,
          timezone: row.venue.timezone
        },
        operatedByOrganization: {
          slug: row.organization.slug,
          name: row.organization.name
        },
        submissions: getPublicSubmissionsState(row.event, { hasParticipantAccess }),
        publicQueue: getPublicQueueState(row.event)
      }
    },

    async claimPublicInvite(inviteCode, participantTokenHash) {
      return inTransaction(db, async (tx) => {
        const rows = await tx
          .select(publicInviteClaimSelection)
          .from(eventInvites)
          .innerJoin(events, eq(eventInvites.eventId, events.id))
          .innerJoin(venues, eq(events.venueId, venues.id))
          .innerJoin(organizations, eq(events.operatedByOrganizationId, organizations.id))
          .where(eq(eventInvites.code, inviteCode))
          .limit(1)
        const row = rows[0]
        if (!row || row.invite.status !== "active" || isExpired(row.invite.expiresAt)) {
          throw invalidInvite()
        }

        try {
          assertPublicEventContainerVisible({
            venue: row.venue,
            organization: row.organization
          })
          assertPublicEventDetailVisible(row.event)
        } catch (error) {
          if (error instanceof ApiHttpError && error.statusCode === 404) {
            throw invalidInvite()
          }
          throw error
        }

        if (row.event.joinAccessMode === "invite_required") {
          await tx
            .insert(participantEventAccess)
            .values({
              eventId: row.event.id,
              participantTokenHash,
              grantedByInviteId: row.invite.id
            })
            .onConflictDoNothing({
              target: [participantEventAccess.eventId, participantEventAccess.participantTokenHash]
            })
        }

        return {
          eventPublicId: row.event.publicId,
          redirectTo: `/event/${row.event.publicId}`
        }
      })
    },

    async revokeEventInvite(eventId) {
      await inTransaction(db, async (tx) => {
        await getEventForUpdate(tx, eventId)
        await tx
          .update(eventInvites)
          .set({ status: "revoked" })
          .where(and(eq(eventInvites.eventId, eventId), eq(eventInvites.status, "active")))
      })

      return { invite: null }
    },

    async rotateEventInvite(eventId) {
      return inTransaction(db, async (tx) => {
        await getEventForUpdate(tx, eventId)
        await tx
          .update(eventInvites)
          .set({ status: "revoked" })
          .where(and(eq(eventInvites.eventId, eventId), eq(eventInvites.status, "active")))

        return { invite: await insertActiveInviteWithGeneratedCode(tx, eventId) }
      })
    }
  }
}

function publishEventChange(eventBus: DomainEventBus | undefined, event: EventSummary, type: DomainEventType): void {
  eventBus?.publish({
    type,
    eventId: event.id,
    venueId: event.venueId
  })
  eventBus?.publish({
    type: "queue.updated",
    eventId: event.id,
    venueId: event.venueId
  })
}

export const allowedEventStatuses = eventStatuses
export const allowedEventStaffRoles = eventStaffRoles

async function getEventForUpdate(db: DbClient, eventId: string): Promise<EventSummary> {
  const rows = await db.select(eventSelection).from(events).where(eq(events.id, eventId)).limit(1)
  if (!rows[0]) {
    throw notFound("Missing event")
  }

  return rows[0]
}

async function venueHasRunningEvent(db: DbClient, venueId: string, exceptEventId: string): Promise<boolean> {
  const rows = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.venueId, venueId), ne(events.id, exceptEventId), inArray(events.status, ["active", "paused"])))
    .limit(1)

  return rows.length > 0
}

async function resolveDefaultOrganizationForVenue(db: DbClient, venueId: string): Promise<string | null> {
  const rows = await db
    .select({ organizationId: venueOrganizationAccess.organizationId })
    .from(venueOrganizationAccess)
    .where(and(eq(venueOrganizationAccess.venueId, venueId), eq(venueOrganizationAccess.status, "active")))
    .limit(1)

  return rows[0]?.organizationId ?? null
}

function validateEventDates(startsAt: string | undefined, endsAt: string | undefined): void {
  validateEventDateRange(startsAt ? new Date(startsAt) : null, endsAt ? new Date(endsAt) : null)
}

function validateEventDateRange(startsAt: Date | null, endsAt: Date | null): void {
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    throw new ApiHttpError(400, "BAD_REQUEST", "endsAt must be after startsAt")
  }
}

async function insertEventWithGeneratedPublicId(
  db: DbClient,
  input: Omit<typeof events.$inferInsert, "publicId">
): Promise<EventSummary[]> {
  let publicIdCollision: unknown
  for (let attempt = 0; attempt < MAX_PUBLIC_ID_GENERATION_ATTEMPTS; attempt += 1) {
    try {
      return await db
        .insert(events)
        .values({
          ...input,
          publicId: generateEventPublicId()
        })
        .returning(eventSelection)
    } catch (error) {
      if (isPgUniqueViolation(error) && error.constraint === "events_public_id_unique") {
        publicIdCollision = error
        continue
      }
      throw mapEventCreateError(error)
    }
  }

  throw mapEventCreateError(publicIdCollision)
}

async function insertDefaultInviteWithGeneratedCode(db: DbClient, eventId: string): Promise<void> {
  await insertActiveInviteWithGeneratedCode(db, eventId)
}

async function insertActiveInviteWithGeneratedCode(db: DbClient, eventId: string): Promise<DashboardInviteLink> {
  let inviteCodeCollision: unknown
  for (let attempt = 0; attempt < MAX_INVITE_CODE_GENERATION_ATTEMPTS; attempt += 1) {
    const code = generateEventInviteCode()
    try {
      await db.insert(eventInvites).values({
        eventId,
        code,
        status: "active"
      })
      return { code, urlPath: `/invite/${code}` }
    } catch (error) {
      if (isPgUniqueViolation(error) && error.constraint === "event_invites_code_unique") {
        inviteCodeCollision = error
        continue
      }
      throw mapEventCreateError(error)
    }
  }

  throw mapEventCreateError(inviteCodeCollision)
}

export function mapEventCreateError(error: unknown): unknown {
  if (isPgUniqueViolation(error)) {
    if (error.constraint === "events_venue_slug_unique") {
      return new ApiHttpError(409, "EVENT_SLUG_CONFLICT", "Event slug already exists for this venue")
    }
    if (error.constraint === "events_one_active_or_paused_per_venue_unique") {
      return new ApiHttpError(409, "VENUE_HAS_ACTIVE_EVENT", "Venue already has an active or paused event")
    }
    if (error.constraint === "events_public_id_unique") {
      return new ApiHttpError(409, "PUBLIC_EVENT_ID_CONFLICT", "Could not allocate a public event id")
    }
    if (error.constraint === "event_invites_code_unique") {
      return new ApiHttpError(409, "INVITE_CODE_CONFLICT", "Could not allocate an invite code")
    }
  }

  return error
}

type PgUniqueViolation = {
  code: "23505"
  constraint?: string
}

function isPgUniqueViolation(error: unknown): error is PgUniqueViolation {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "23505"
  )
}

async function getStaffAssignmentById(
  db: DbClient,
  assignmentId: string
): Promise<EventStaffAssignmentSummary | null> {
  const rows = await db
    .select(staffSelection)
    .from(eventStaffAssignments)
    .where(eq(eventStaffAssignments.id, assignmentId))
    .limit(1)

  return rows[0] ?? null
}

const eventSelection = {
  id: events.id,
  publicId: events.publicId,
  venueId: events.venueId,
  operatedByOrganizationId: events.operatedByOrganizationId,
  createdByUserId: events.createdByUserId,
  name: events.name,
  slug: events.slug,
  status: events.status,
  startsAt: events.startsAt,
  endsAt: events.endsAt,
  publicJoinEnabled: events.publicJoinEnabled,
  publicQueueEnabled: events.publicQueueEnabled,
  joinAccessMode: events.joinAccessMode
}

const dashboardEventSelection = {
  ...eventSelection,
  venueName: venues.name,
  venueSlug: venues.slug,
  organizationName: organizations.name,
  organizationSlug: organizations.slug,
  inviteCode: eventInvites.code
}

const publicEventDetailSelection = {
  event: {
    id: events.id,
    publicId: events.publicId,
    name: events.name,
    slug: events.slug,
    status: events.status,
    startsAt: events.startsAt,
    endsAt: events.endsAt,
    publicJoinEnabled: events.publicJoinEnabled,
    publicQueueEnabled: events.publicQueueEnabled,
    joinAccessMode: events.joinAccessMode
  },
  venue: {
    slug: venues.slug,
    name: venues.name,
    city: venues.city,
    timezone: venues.timezone,
    status: venues.status,
    verificationStatus: venues.verificationStatus
  },
  organization: {
    slug: organizations.slug,
    name: organizations.name,
    status: organizations.status
  }
}

const publicEventResolutionSelection = {
  event: {
    id: events.id,
    publicId: events.publicId,
    venueId: events.venueId,
    status: events.status,
    publicJoinEnabled: events.publicJoinEnabled,
    publicQueueEnabled: events.publicQueueEnabled,
    joinAccessMode: events.joinAccessMode
  },
  venue: {
    status: venues.status,
    verificationStatus: venues.verificationStatus
  },
  organization: {
    status: organizations.status
  }
}

const publicInviteClaimSelection = {
  invite: {
    id: eventInvites.id,
    status: eventInvites.status,
    expiresAt: eventInvites.expiresAt
  },
  event: {
    id: events.id,
    publicId: events.publicId,
    status: events.status,
    publicJoinEnabled: events.publicJoinEnabled,
    publicQueueEnabled: events.publicQueueEnabled,
    joinAccessMode: events.joinAccessMode
  },
  venue: {
    status: venues.status,
    verificationStatus: venues.verificationStatus
  },
  organization: {
    status: organizations.status
  }
}

async function hasParticipantEventAccess(
  db: DbClient,
  eventId: string,
  participantTokenHash: string
): Promise<boolean> {
  const rows = await db
    .select({ id: participantEventAccess.id })
    .from(participantEventAccess)
    .where(
      and(
        eq(participantEventAccess.eventId, eventId),
        eq(participantEventAccess.participantTokenHash, participantTokenHash)
      )
    )
    .limit(1)

  return rows.length > 0
}

type DashboardEventRow = EventSummary & {
  venueName: string
  venueSlug: string
  organizationName: string
  organizationSlug: string
  inviteCode: string | null
}

function mapDashboardEventRow(row: DashboardEventRow): DashboardEventSummary {
  return {
    id: row.id,
    publicId: row.publicId,
    venueId: row.venueId,
    operatedByOrganizationId: row.operatedByOrganizationId,
    createdByUserId: row.createdByUserId,
    name: row.name,
    slug: row.slug,
    status: row.status,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    publicJoinEnabled: row.publicJoinEnabled,
    publicQueueEnabled: row.publicQueueEnabled,
    joinAccessMode: row.joinAccessMode,
    venue: {
      id: row.venueId,
      name: row.venueName,
      slug: row.venueSlug
    },
    operatedByOrganization: {
      id: row.operatedByOrganizationId,
      name: row.organizationName,
      slug: row.organizationSlug
    },
    invite: row.inviteCode ? { code: row.inviteCode, urlPath: `/invite/${row.inviteCode}` } : null
  }
}

function uniqueDashboardEvents(eventsList: DashboardEventSummary[]): DashboardEventSummary[] {
  return [...new Map(eventsList.map((event) => [event.id, event])).values()]
}

const staffSelection = {
  id: eventStaffAssignments.id,
  eventId: eventStaffAssignments.eventId,
  organizationId: eventStaffAssignments.organizationId,
  userId: eventStaffAssignments.userId,
  role: eventStaffAssignments.role,
  status: eventStaffAssignments.status
}

type TransactionCapableDb = DbClient & {
  transaction: <T>(action: (tx: DbClient) => Promise<T>) => Promise<T>
}

function hasTransaction(db: DbClient): db is TransactionCapableDb {
  return typeof (db as { transaction?: unknown }).transaction === "function"
}

async function inTransaction<T>(db: DbClient, action: (tx: DbClient) => Promise<T>): Promise<T> {
  try {
    return await (hasTransaction(db) ? db.transaction(action) : action(db))
  } catch (error) {
    throw mapEventLifecycleError(error)
  }
}

export function mapEventLifecycleError(error: unknown): unknown {
  if (isPgUniqueViolation(error) && error.constraint === "events_one_active_or_paused_per_venue_unique") {
    return new ApiHttpError(409, "VENUE_HAS_ACTIVE_EVENT", "Venue already has an active or paused event")
  }

  return error
}

function notFound(message: string): ApiHttpError {
  return new ApiHttpError(404, "NOT_FOUND", message)
}

function invalidInvite(): ApiHttpError {
  return new ApiHttpError(404, "NOT_FOUND", "Invalid or expired invite")
}

function isExpired(expiresAt: Date | null): boolean {
  return expiresAt !== null && expiresAt.getTime() <= Date.now()
}
