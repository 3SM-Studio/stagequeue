import {
  eventStaffAssignments,
  eventStaffRoles,
  eventStatuses,
  events,
  organizations,
  organizationMemberships,
  queueEvents,
  venueOrganizationAccess,
  venues,
  type DbClient,
  type EventStatus
} from "@poza-nuta/db"
import { and, eq, inArray, ne, sql } from "drizzle-orm"
import { ApiHttpError } from "../../errors.ts"
import type { DomainEventBus, DomainEventType } from "../../plugins/eventBus.ts"
import { isVenuePubliclyVisible } from "../venues/service.ts"

export type EventSummary = {
  id: string
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
}

export type PatchEventInput = {
  name?: string
  slug?: string
  startsAt?: string
  endsAt?: string
  publicJoinEnabled?: boolean
  publicQueueEnabled?: boolean
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
}

const lifecycleTransitions = {
  start: { from: ["draft", "scheduled"], to: "active", queueEventType: "event.started" },
  pause: { from: ["active"], to: "paused", queueEventType: "event.paused" },
  resume: { from: ["paused"], to: "active", queueEventType: "event.resumed" },
  close: { from: ["active", "paused"], to: "closed", queueEventType: "event.closed" },
  archive: { from: ["closed", "cancelled"], to: "archived", queueEventType: "event.archived" },
  cancel: { from: ["draft", "scheduled"], to: "cancelled", queueEventType: "event.cancelled" }
} as const satisfies Record<LifecycleAction, { from: readonly string[]; to: EventStatus; queueEventType: string }>

export function createEventsService(db: DbClient, eventBus?: DomainEventBus): EventsService {
  return {
    async listForUser(userId, options = {}) {
      if (options.includeAll) {
        const rows = await db
          .select(dashboardEventSelection)
          .from(events)
          .innerJoin(venues, eq(events.venueId, venues.id))
          .innerJoin(organizations, eq(events.operatedByOrganizationId, organizations.id))
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

      const rows = await mapCreateEventError(async () =>
        db
          .insert(events)
          .values({
            venueId: input.venueId,
            operatedByOrganizationId,
            createdByUserId: input.createdByUserId,
            name: input.name,
            slug: input.slug,
            status: input.status,
            startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
            endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
            publicJoinEnabled: input.publicJoinEnabled ?? false,
            publicQueueEnabled: input.publicQueueEnabled ?? false
          })
          .returning(eventSelection)
      )

      if (!rows[0]) {
        throw new Error("Failed to create event")
      }

      return rows[0]
    },

    async patchEvent(eventId, input) {
      const update: Partial<typeof events.$inferInsert> = {}
      validateEventDates(input.startsAt, input.endsAt)
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

      if (Object.keys(update).length === 0) {
        const existing = await this.getById(eventId)
        if (!existing) {
          throw notFound("Missing event")
        }
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
      if (!venue || !isVenuePubliclyVisible(venue)) {
        return null
      }

      const activeRows = await db
        .select(eventSelection)
        .from(events)
        .where(and(eq(events.venueId, venue.id), inArray(events.status, ["active", "paused"])))
        .limit(1)

      return {
        venue: {
          id: venue.id,
          slug: venue.slug,
          name: venue.name,
          city: venue.city,
          timezone: venue.timezone
        },
        activeEvent: activeRows[0] ?? null
      }
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
  if (!startsAt || !endsAt) {
    return
  }

  if (Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new ApiHttpError(400, "BAD_REQUEST", "endsAt must be after startsAt")
  }
}

async function mapCreateEventError<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action()
  } catch (error) {
    throw mapEventCreateError(error)
  }
}

export function mapEventCreateError(error: unknown): unknown {
  if (isPgUniqueViolation(error)) {
    if (error.constraint === "events_venue_slug_unique") {
      return new ApiHttpError(409, "EVENT_SLUG_CONFLICT", "Event slug already exists for this venue")
    }
    if (error.constraint === "events_one_active_or_paused_per_venue_unique") {
      return new ApiHttpError(409, "VENUE_HAS_ACTIVE_EVENT", "Venue already has an active or paused event")
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
  venueId: events.venueId,
  operatedByOrganizationId: events.operatedByOrganizationId,
  createdByUserId: events.createdByUserId,
  name: events.name,
  slug: events.slug,
  status: events.status,
  startsAt: events.startsAt,
  endsAt: events.endsAt,
  publicJoinEnabled: events.publicJoinEnabled,
  publicQueueEnabled: events.publicQueueEnabled
}

const dashboardEventSelection = {
  ...eventSelection,
  venueName: venues.name,
  venueSlug: venues.slug,
  organizationName: organizations.name,
  organizationSlug: organizations.slug
}

type DashboardEventRow = EventSummary & {
  venueName: string
  venueSlug: string
  organizationName: string
  organizationSlug: string
}

function mapDashboardEventRow(row: DashboardEventRow): DashboardEventSummary {
  return {
    id: row.id,
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
    venue: {
      id: row.venueId,
      name: row.venueName,
      slug: row.venueSlug
    },
    operatedByOrganization: {
      id: row.operatedByOrganizationId,
      name: row.organizationName,
      slug: row.organizationSlug
    }
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
  return hasTransaction(db) ? db.transaction(action) : action(db)
}

function notFound(message: string): ApiHttpError {
  return new ApiHttpError(404, "NOT_FOUND", message)
}
