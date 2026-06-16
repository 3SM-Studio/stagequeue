import {
  events,
  organizations,
  participantEventAccess,
  queueEvents,
  songRequests,
  songSources,
  venues,
  type DbClient
} from "@poza-nuta/db"
import { and, asc, desc, eq, sql } from "drizzle-orm"
import { ApiHttpError } from "../../errors.ts"
import type { DomainEventBus } from "../../plugins/eventBus.ts"
import { assertPublicEventContainerVisible, assertPublicQueueVisible } from "../publicVisibility.ts"

export type QueueSongRequest = {
  id: string
  venueId: string
  eventId: string
  singerName: string
  displayName: string
  sourceId: string
  sourceTrackId: string
  songTitle: string
  songArtist: string
  songUrl: string | null
  note: string | null
  participantTokenHash: string | null
  status: string
  position: number | null
  requestedAt: Date
  approvedAt: Date | null
  startedAt: Date | null
  finishedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type PublicQueueResponse = {
  event: {
    publicId: string
    name: string
    status: string
  } | null
  activeEvent?: {
    id: string
    venueId: string
    operatedByOrganizationId: string
    name: string
    slug: string
    status: string
    startsAt: Date | null
    endsAt: Date | null
    publicJoinEnabled: boolean
    publicQueueEnabled: boolean
    joinAccessMode: string
  } | null
  venue: {
    id: string
    name: string
    slug: string
  }
  now: PublicQueueItem | null
  queue: PublicQueueItem[]
  submissions: {
    enabled: boolean
    reason?: string
  }
}

export type PublicQueueItem = {
  id: string
  singerName: string
  songTitle: string
  songArtist: string
  position?: number | null
}

export type PublicParticipantRequest = {
  id: string
  status: string
  singerName: string
  artist: string
  title: string
  position: number | null
  createdAt: Date
}

export type OperatorQueueResponse = {
  event: {
    id: string
    name: string
    status: string
  }
  venue: {
    id: string
    name: string
    slug: string
  }
  pending: OperatorQueueItem[]
  approved: OperatorQueueItem[]
  now: OperatorQueueItem | null
  done: OperatorQueueItem[]
  rejected: OperatorQueueItem[]
  skipped: OperatorQueueItem[]
}

export type OperatorQueueItem = {
  id: string
  singerName: string
  displayName: string
  sourceId: string
  sourceTrackId: string
  songTitle: string
  songArtist: string
  songUrl: string | null
  note: string | null
  status: string
  position: number | null
  requestedAt: Date
  approvedAt: Date | null
  startedAt: Date | null
  finishedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type SubmitPublicRequestInput = {
  singerName: string
  participantTokenHash: string
  sourceId: string
  sourceTrackId?: string
  songTitle: string
  songArtist: string
  songUrl?: string
  note?: string
}

export type QueueService = {
  getPublicQueue(eventId: string): Promise<PublicQueueResponse>
  listParticipantRequests(eventId: string, participantTokenHash: string): Promise<PublicParticipantRequest[]>
  submitPublicRequest(eventId: string, input: SubmitPublicRequestInput): Promise<QueueSongRequest>
  getOperatorQueue(eventId: string): Promise<OperatorQueueResponse>
  approveRequest(eventId: string, requestId: string, actorUserId: string): Promise<QueueSongRequest>
  rejectRequest(eventId: string, requestId: string, actorUserId: string, reason?: string): Promise<QueueSongRequest>
  startRequest(eventId: string, requestId: string, actorUserId: string): Promise<QueueSongRequest>
  completeRequest(eventId: string, requestId: string, actorUserId: string): Promise<QueueSongRequest>
  skipRequest(eventId: string, requestId: string, actorUserId: string): Promise<QueueSongRequest>
  moveRequest(eventId: string, requestId: string, position: number, actorUserId: string): Promise<QueueSongRequest>
}

export type QueueAntiSpamConfig = {
  maxActivePerParticipant: number
  cooldownSeconds: number
  now?: () => Date
}

type QueueEventType =
  | "request.created"
  | "request.approved"
  | "request.rejected"
  | "request.started"
  | "request.done"
  | "request.skipped"
  | "request.moved"

const mutableQueueStatuses = ["active", "paused"] as const
const activeParticipantRequestStatuses = ["pending", "approved", "now"] as const

export function createQueueService(db: DbClient, eventBus?: DomainEventBus, antiSpamConfig: QueueAntiSpamConfig = {
  maxActivePerParticipant: 3,
  cooldownSeconds: 20
}): QueueService {
  const config = {
    ...antiSpamConfig,
    now: antiSpamConfig.now ?? (() => new Date())
  }

  return {
    async getPublicQueue(eventId) {
      const context = await getPublicEventContext(db, eventId)
      assertPublicQueueVisible(context.event)

      const now = await getCurrentRequest(db, eventId)
      const approved = await listApprovedRequests(db, eventId)

      return {
        event: publicEvent(context),
        venue: publicVenue(context),
        now: now ? toPublicItem(now) : null,
        queue: approved.map(toPublicItem),
        submissions: {
          enabled: context.event.status === "active" && context.event.publicJoinEnabled
        }
      }
    },

    async listParticipantRequests(eventId, participantTokenHash) {
      await getPublicEventContext(db, eventId)
      const rows = await db
        .select(songRequestSelection)
        .from(songRequests)
        .where(and(eq(songRequests.eventId, eventId), eq(songRequests.participantTokenHash, participantTokenHash)))
        .orderBy(desc(songRequests.createdAt))

      return rows.map(toPublicParticipantRequest)
    },

    async submitPublicRequest(eventId, input) {
      const request = await inTransaction(db, async (tx) => {
        await lockQueueForEvent(tx, eventId)
        const context = await getPublicEventContext(tx, eventId)
        if (context.event.status !== "active" || !context.event.publicJoinEnabled) {
          throw new ApiHttpError(409, "CONFLICT", "Event is not accepting public song requests")
        }
        if (
          context.event.joinAccessMode === "invite_required" &&
          !(await hasParticipantEventAccess(tx, eventId, input.participantTokenHash))
        ) {
          throw new ApiHttpError(403, "ACCESS_REQUIRED", "Invite access is required to submit to this event")
        }

        await requireActiveSongSource(tx, input.sourceId)
        await enforceParticipantAntiSpam(tx, eventId, input.participantTokenHash, config)

        const request = await insertRequest(tx, {
          venueId: context.event.venueId,
          eventId: context.event.id,
          singerName: input.singerName,
          displayName: input.singerName,
          participantTokenHash: input.participantTokenHash,
          sourceId: input.sourceId,
          sourceTrackId: input.sourceTrackId ?? "",
          songTitle: input.songTitle,
          songArtist: input.songArtist,
          songUrl: input.songUrl,
          note: input.note,
          status: "pending",
          position: null
        })

        await insertQueueEvent(tx, context, {
          requestId: request.id,
          actorKind: "participant",
          type: "request.created",
          payload: { newStatus: "pending" }
        })

        return request
      })
      publishRequestChange(eventBus, request, "request.created")
      return request
    },

    async getOperatorQueue(eventId) {
      const context = await getEventContext(db, eventId)
      const rows = await db
        .select(songRequestSelection)
        .from(songRequests)
        .where(eq(songRequests.eventId, eventId))
        .orderBy(asc(songRequests.position), desc(songRequests.requestedAt))

      return {
        event: operatorEvent(context),
        venue: publicVenue(context),
        pending: rows.filter((request) => request.status === "pending").map(toOperatorItem),
        approved: rows.filter((request) => request.status === "approved").sort(compareQueuePosition).map(toOperatorItem),
        now: rows.find((request) => request.status === "now") ? toOperatorItem(rows.find((request) => request.status === "now")!) : null,
        done: rows.filter((request) => request.status === "done").sort(compareNewestFirst).slice(0, 20).map(toOperatorItem),
        rejected: rows.filter((request) => request.status === "rejected").sort(compareNewestFirst).slice(0, 20).map(toOperatorItem),
        skipped: rows.filter((request) => request.status === "skipped").sort(compareNewestFirst).slice(0, 20).map(toOperatorItem)
      }
    },

    async approveRequest(eventId, requestId, actorUserId) {
      const request = await inTransaction(db, async (tx) => {
        await lockQueueForEvent(tx, eventId)
        const context = await requireMutableEvent(tx, eventId)
        const request = await requireRequest(tx, eventId, requestId)
        if (request.status !== "pending") {
          throw new ApiHttpError(409, "CONFLICT", "Only pending requests can be approved")
        }

        await updateRequest(tx, requestId, {
          status: "approved",
          position: null,
          approvedAt: new Date()
        })
        await renumberApprovedQueue(tx, eventId)
        const updated = await requireRequest(tx, eventId, requestId)

        await insertQueueEvent(tx, context, {
          requestId,
          actorUserId,
          actorKind: "operator",
          type: "request.approved",
          payload: { previousStatus: request.status, newStatus: "approved", newPosition: updated.position }
        })

        return updated
      })
      publishRequestChange(eventBus, request, "request.approved")
      return request
    },

    async rejectRequest(eventId, requestId, actorUserId, reason) {
      const request = await inTransaction(db, async (tx) => {
        await lockQueueForEvent(tx, eventId)
        const context = await requireMutableEvent(tx, eventId)
        const request = await requireRequest(tx, eventId, requestId)
        if (!["pending", "approved"].includes(request.status)) {
          throw new ApiHttpError(409, "CONFLICT", "Only pending or approved requests can be rejected")
        }

        const updated = await updateRequest(tx, requestId, {
          status: "rejected",
          position: null,
          finishedAt: new Date()
        })
        if (request.status === "approved") {
          await renumberApprovedQueue(tx, eventId)
        }

        await insertQueueEvent(tx, context, {
          requestId,
          actorUserId,
          actorKind: "operator",
          type: "request.rejected",
          payload: { previousStatus: request.status, newStatus: "rejected", previousPosition: request.position, reason }
        })

        return updated
      })
      publishRequestChange(eventBus, request, "request.rejected")
      return request
    },

    async startRequest(eventId, requestId, actorUserId) {
      const request = await inTransaction(db, async (tx) => {
        await lockQueueForEvent(tx, eventId)
        const context = await requireMutableEvent(tx, eventId)
        const request = await requireRequest(tx, eventId, requestId)
        if (request.status !== "approved") {
          throw new ApiHttpError(409, "CONFLICT", "Only approved requests can be started")
        }
        const current = await getCurrentRequest(tx, eventId)
        if (current) {
          throw new ApiHttpError(409, "CONFLICT", "There is already a request marked as now")
        }

        const updated = await updateRequest(tx, requestId, {
          status: "now",
          position: null,
          startedAt: new Date()
        })
        await renumberApprovedQueue(tx, eventId)

        await insertQueueEvent(tx, context, {
          requestId,
          actorUserId,
          actorKind: "operator",
          type: "request.started",
          payload: { previousStatus: request.status, newStatus: "now", previousPosition: request.position }
        })

        return updated
      })
      publishRequestChange(eventBus, request, "request.started")
      return request
    },

    async completeRequest(eventId, requestId, actorUserId) {
      const request = await inTransaction(db, async (tx) => {
        await lockQueueForEvent(tx, eventId)
        const context = await requireMutableEvent(tx, eventId)
        const request = await requireRequest(tx, eventId, requestId)
        if (request.status !== "now") {
          throw new ApiHttpError(409, "CONFLICT", "Only the current request can be completed")
        }

        const updated = await updateRequest(tx, requestId, {
          status: "done",
          finishedAt: new Date()
        })

        await insertQueueEvent(tx, context, {
          requestId,
          actorUserId,
          actorKind: "operator",
          type: "request.done",
          payload: { previousStatus: request.status, newStatus: "done" }
        })

        return updated
      })
      publishRequestChange(eventBus, request, "request.done")
      return request
    },

    async skipRequest(eventId, requestId, actorUserId) {
      const request = await inTransaction(db, async (tx) => {
        await lockQueueForEvent(tx, eventId)
        const context = await requireMutableEvent(tx, eventId)
        const request = await requireRequest(tx, eventId, requestId)
        if (!["approved", "now"].includes(request.status)) {
          throw new ApiHttpError(409, "CONFLICT", "Only approved or current requests can be skipped")
        }

        const updated = await updateRequest(tx, requestId, {
          status: "skipped",
          position: null,
          finishedAt: new Date()
        })
        if (request.status === "approved") {
          await renumberApprovedQueue(tx, eventId)
        }

        await insertQueueEvent(tx, context, {
          requestId,
          actorUserId,
          actorKind: "operator",
          type: "request.skipped",
          payload: { previousStatus: request.status, newStatus: "skipped", previousPosition: request.position }
        })

        return updated
      })
      publishRequestChange(eventBus, request, "request.skipped")
      return request
    },

    async moveRequest(eventId, requestId, position, actorUserId) {
      if (!Number.isInteger(position) || position < 1) {
        throw new ApiHttpError(400, "BAD_REQUEST", "Position must be a positive integer")
      }

      const request = await inTransaction(db, async (tx) => {
        await lockQueueForEvent(tx, eventId)
        const context = await requireMutableEvent(tx, eventId)
        const request = await requireRequest(tx, eventId, requestId)
        if (request.status !== "approved") {
          throw new ApiHttpError(409, "CONFLICT", "Only approved requests can be moved")
        }

        const approved = await listApprovedRequests(tx, eventId)
        const target = approved.find((candidate) => candidate.id === requestId)
        if (!target) {
          throw new ApiHttpError(409, "CONFLICT", "Request is not in the approved queue")
        }

        const next = approved.filter((candidate) => candidate.id !== requestId)
        const boundedPosition = Math.min(Math.max(position, 1), approved.length)
        next.splice(boundedPosition - 1, 0, target)
        await writeQueuePositions(tx, next)
        const updated = await requireRequest(tx, eventId, requestId)

        await insertQueueEvent(tx, context, {
          requestId,
          actorUserId,
          actorKind: "operator",
          type: "request.moved",
          payload: { previousPosition: request.position, newPosition: updated.position }
        })

        return updated
      })
      publishRequestChange(eventBus, request, "request.moved")
      return request
    }
  }
}

function publishRequestChange(eventBus: DomainEventBus | undefined, request: QueueSongRequest, type: QueueEventType): void {
  eventBus?.publish({
    type,
    eventId: request.eventId,
    venueId: request.venueId,
    requestId: request.id
  })
  eventBus?.publish({
    type: "queue.updated",
    eventId: request.eventId,
    venueId: request.venueId,
    requestId: request.id
  })
}

async function getEventContext(db: DbClient, eventId: string) {
  const rows = await db
    .select({
            event: {
              id: events.id,
              publicId: events.publicId,
              venueId: events.venueId,
        operatedByOrganizationId: events.operatedByOrganizationId,
        name: events.name,
        status: events.status,
        publicJoinEnabled: events.publicJoinEnabled,
        publicQueueEnabled: events.publicQueueEnabled,
        joinAccessMode: events.joinAccessMode
      },
      venue: {
        id: venues.id,
        name: venues.name,
        slug: venues.slug,
        status: venues.status,
        verificationStatus: venues.verificationStatus
      },
      organization: {
        id: organizations.id,
        status: organizations.status
      }
    })
    .from(events)
    .innerJoin(venues, eq(events.venueId, venues.id))
    .innerJoin(organizations, eq(events.operatedByOrganizationId, organizations.id))
    .where(eq(events.id, eventId))
    .limit(1)

  const context = rows[0]
  if (!context) {
    throw new ApiHttpError(404, "NOT_FOUND", "Missing event")
  }

  return context
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

async function getPublicEventContext(db: DbClient, eventId: string): Promise<Awaited<ReturnType<typeof getEventContext>>> {
  const context = await getEventContext(db, eventId)
  assertPublicEventContextVisible(context)
  return context
}

function assertPublicEventContextVisible(context: Awaited<ReturnType<typeof getEventContext>>): void {
  assertPublicEventContainerVisible(context)
}

async function requireMutableEvent(db: DbClient, eventId: string): Promise<Awaited<ReturnType<typeof getEventContext>>> {
  const context = await getEventContext(db, eventId)
  if (!mutableQueueStatuses.includes(context.event.status as (typeof mutableQueueStatuses)[number])) {
    throw new ApiHttpError(409, "CONFLICT", "Queue mutations are allowed only for active or paused events")
  }

  return context
}

async function requireActiveSongSource(db: DbClient, sourceId: string): Promise<void> {
  const rows = await db
    .select({ id: songSources.id })
    .from(songSources)
    .where(and(eq(songSources.id, sourceId), eq(songSources.status, "active")))
    .limit(1)
  if (!rows[0]) {
    throw new ApiHttpError(400, "BAD_REQUEST", "Unknown or inactive song source")
  }
}

async function insertRequest(db: DbClient, input: typeof songRequests.$inferInsert): Promise<QueueSongRequest> {
  const rows = await db.insert(songRequests).values(input).returning(songRequestSelection)
  if (!rows[0]) {
    throw new Error("Failed to create song request")
  }

  return rows[0]
}

async function requireRequest(db: DbClient, eventId: string, requestId: string): Promise<QueueSongRequest> {
  const rows = await db
    .select(songRequestSelection)
    .from(songRequests)
    .where(and(eq(songRequests.id, requestId), eq(songRequests.eventId, eventId)))
    .limit(1)
  if (!rows[0]) {
    throw new ApiHttpError(404, "NOT_FOUND", "Missing song request")
  }

  return rows[0]
}

async function updateRequest(
  db: DbClient,
  requestId: string,
  input: Partial<typeof songRequests.$inferInsert>
): Promise<QueueSongRequest> {
  const rows = await db
    .update(songRequests)
    .set({ ...input, updatedAt: sql`now()` })
    .where(eq(songRequests.id, requestId))
    .returning(songRequestSelection)
  if (!rows[0]) {
    throw new ApiHttpError(404, "NOT_FOUND", "Missing song request")
  }

  return rows[0]
}

async function getCurrentRequest(db: DbClient, eventId: string): Promise<QueueSongRequest | null> {
  const rows = await db
    .select(songRequestSelection)
    .from(songRequests)
    .where(and(eq(songRequests.eventId, eventId), eq(songRequests.status, "now")))
    .limit(1)

  return rows[0] ?? null
}

async function listApprovedRequests(db: DbClient, eventId: string): Promise<QueueSongRequest[]> {
  return db
    .select(songRequestSelection)
    .from(songRequests)
    .where(and(eq(songRequests.eventId, eventId), eq(songRequests.status, "approved")))
    .orderBy(asc(songRequests.position), asc(songRequests.approvedAt), asc(songRequests.createdAt))
}

async function enforceParticipantAntiSpam(
  db: DbClient,
  eventId: string,
  participantTokenHash: string,
  config: Required<QueueAntiSpamConfig>
): Promise<void> {
  const rows = await db
    .select({
      id: songRequests.id,
      status: songRequests.status,
      requestedAt: songRequests.requestedAt
    })
    .from(songRequests)
    .where(and(eq(songRequests.eventId, eventId), eq(songRequests.participantTokenHash, participantTokenHash)))
    .orderBy(desc(songRequests.requestedAt))

  const activeCount = rows.filter((request) =>
    activeParticipantRequestStatuses.includes(request.status as (typeof activeParticipantRequestStatuses)[number])
  ).length
  if (activeCount >= config.maxActivePerParticipant) {
    throw new ApiHttpError(429, "TOO_MANY_REQUESTS", "Too many active requests for this event.")
  }

  const previous = rows[0]
  if (previous) {
    const secondsSincePrevious = (config.now().getTime() - previous.requestedAt.getTime()) / 1000
    if (secondsSincePrevious < config.cooldownSeconds) {
      throw new ApiHttpError(429, "TOO_MANY_REQUESTS", "Please wait before submitting another request.")
    }
  }
}

async function renumberApprovedQueue(db: DbClient, eventId: string): Promise<void> {
  await writeQueuePositions(db, await listApprovedRequests(db, eventId))
}

async function writeQueuePositions(db: DbClient, requests: QueueSongRequest[]): Promise<void> {
  for (const [index, request] of requests.entries()) {
    await db.update(songRequests).set({ position: -(index + 1), updatedAt: sql`now()` }).where(eq(songRequests.id, request.id))
  }

  for (const [index, request] of requests.entries()) {
    await db.update(songRequests).set({ position: index + 1, updatedAt: sql`now()` }).where(eq(songRequests.id, request.id))
  }
}

export async function lockQueueForEvent(db: DbClient, eventId: string): Promise<void> {
  await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${eventId}, 0))`)
}

async function insertQueueEvent(
  db: DbClient,
  context: Awaited<ReturnType<typeof getEventContext>>,
  input: {
    requestId: string
    actorUserId?: string
    actorKind: "participant" | "operator" | "system"
    type: QueueEventType
    payload: Record<string, unknown>
  }
): Promise<void> {
  await db.insert(queueEvents).values({
    venueId: context.event.venueId,
    eventId: context.event.id,
    requestId: input.requestId,
    actorUserId: input.actorUserId,
    actorOrganizationId: input.actorKind === "operator" ? context.event.operatedByOrganizationId : null,
    actorKind: input.actorKind,
    type: input.type,
    payload: input.payload
  })
}

async function inTransaction<T>(db: DbClient, action: (tx: DbClient) => Promise<T>): Promise<T> {
  try {
    return await (hasTransaction(db) ? db.transaction(action) : action(db))
  } catch (error) {
    throw mapQueueMutationError(error)
  }
}

export function mapQueueMutationError(error: unknown): unknown {
  if (isPgUniqueViolation(error)) {
    if (error.constraint === "song_requests_one_now_per_event_unique") {
      return new ApiHttpError(409, "REQUEST_ALREADY_NOW", "There is already a request marked as now")
    }
    if (error.constraint === "song_requests_one_approved_position_per_event_unique") {
      return new ApiHttpError(409, "QUEUE_POSITION_CONFLICT", "Approved queue position conflict")
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
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  )
}

type TransactionCapableDb = DbClient & {
  transaction: <T>(action: (tx: DbClient) => Promise<T>) => Promise<T>
}

function hasTransaction(db: DbClient): db is TransactionCapableDb {
  return typeof (db as { transaction?: unknown }).transaction === "function"
}

function publicEvent(context: Awaited<ReturnType<typeof getEventContext>>) {
  return {
    publicId: context.event.publicId,
    name: context.event.name,
    status: context.event.status
  }
}

function operatorEvent(context: Awaited<ReturnType<typeof getEventContext>>) {
  return {
    id: context.event.id,
    name: context.event.name,
    status: context.event.status
  }
}

function publicVenue(context: Awaited<ReturnType<typeof getEventContext>>) {
  return {
    id: context.venue.id,
    name: context.venue.name,
    slug: context.venue.slug
  }
}

function toPublicItem(request: QueueSongRequest): PublicQueueItem {
  return {
    id: request.id,
    singerName: request.displayName,
    songTitle: request.songTitle,
    songArtist: request.songArtist,
    position: request.position
  }
}

function toPublicParticipantRequest(request: QueueSongRequest): PublicParticipantRequest {
  return {
    id: request.id,
    status: request.status,
    singerName: request.displayName,
    artist: request.songArtist,
    title: request.songTitle,
    position: request.position,
    createdAt: request.createdAt
  }
}

function toOperatorItem(request: QueueSongRequest): OperatorQueueItem {
  return request
}

function compareQueuePosition(a: QueueSongRequest, b: QueueSongRequest): number {
  return (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER)
}

function compareNewestFirst(a: QueueSongRequest, b: QueueSongRequest): number {
  return b.updatedAt.getTime() - a.updatedAt.getTime()
}

const songRequestSelection = {
  id: songRequests.id,
  venueId: songRequests.venueId,
  eventId: songRequests.eventId,
  singerName: songRequests.singerName,
  displayName: songRequests.displayName,
  sourceId: songRequests.sourceId,
  sourceTrackId: songRequests.sourceTrackId,
  songTitle: songRequests.songTitle,
  songArtist: songRequests.songArtist,
  songUrl: songRequests.songUrl,
  note: songRequests.note,
  participantTokenHash: songRequests.participantTokenHash,
  status: songRequests.status,
  position: songRequests.position,
  requestedAt: songRequests.requestedAt,
  approvedAt: songRequests.approvedAt,
  startedAt: songRequests.startedAt,
  finishedAt: songRequests.finishedAt,
  createdAt: songRequests.createdAt,
  updatedAt: songRequests.updatedAt
}
