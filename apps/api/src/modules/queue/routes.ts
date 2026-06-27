import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { ApiHttpError } from "../../errors.ts"
import { requireActiveCurrentUser } from "../../permissions/request.ts"
import { startEventStream, toPublicStreamEventPayload } from "../streams/eventStreams.ts"
import { PARTICIPANT_COOKIE_NAME, hashParticipantToken, isValidParticipantToken, resolveParticipantToken } from "./participant.ts"
import { type QueueSongRequest, type SubmitPublicRequestInput } from "./service.ts"
import {
  readBody,
  readOptionalString,
  readParamSlug,
  readParamUuid,
  readPositiveInteger,
  readRequiredString
} from "../http/validation.ts"

export async function registerQueuePublicRoutes(app: FastifyInstance): Promise<void> {
  app.get("/public/venues/:venueSlug/stream", async (request, reply) => {
    const venueSlug = readParamSlug(request.params, "venueSlug")
    const activeEvent = await requireVenueActiveEvent(app, venueSlug)
    await app.queue.getPublicQueue(activeEvent.id)

    return startEventStream(app, reply, {
      channel: app.eventBus.eventChannel(activeEvent.id),
      connected: { scope: "public.venue", venueSlug },
      mapEventData: toPublicStreamEventPayload
    })
  })

  app.get("/public/venues/:venueSlug/queue", async (request) => {
    const venueSlug = readParamSlug(request.params, "venueSlug")
    const lookup = await requirePublicVenueLookup(app, venueSlug)

    if (!lookup.activeEvent) {
      return {
        venue: {
          id: lookup.venue.id,
          name: lookup.venue.name,
          slug: lookup.venue.slug
        },
        activeEvent: null,
        event: null,
        now: null,
        queue: [],
        submissions: {
          enabled: false,
          reason: "NO_ACTIVE_EVENT"
        }
      }
    }

    return {
      ...(await app.queue.getPublicQueue(lookup.activeEvent.id)),
      activeEvent: toPublicActiveEvent(lookup.activeEvent)
    }
  })

  app.get("/public/venues/:venueSlug/my-requests", async (request) => {
    const venueSlug = readParamSlug(request.params, "venueSlug")
    const lookup = await requirePublicVenueLookup(app, venueSlug)
    const participantToken = request.cookies[PARTICIPANT_COOKIE_NAME]

    if (!lookup.activeEvent || !isValidParticipantToken(participantToken)) {
      return { requests: [] }
    }

    const participantTokenHash = hashParticipantToken(participantToken, request.server.config.participantTokenSecret)
    const requests = await app.queue.listParticipantRequests(lookup.activeEvent.id, participantTokenHash)

    return {
      requests: requests.map((requestRecord) => ({
        id: requestRecord.id,
        status: requestRecord.status,
        singerName: requestRecord.singerName,
        artist: requestRecord.artist,
        title: requestRecord.title,
        position: requestRecord.position,
        createdAt: requestRecord.createdAt
      }))
    }
  })

  app.post(
    "/public/venues/:venueSlug/requests",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute",
          keyGenerator: (request) => `${request.ip}:venue:${readRateLimitVenueSlug(request.params)}`,
          errorResponseBuilder: () =>
            new ApiHttpError(429, "TOO_MANY_REQUESTS", "Too many public song requests. Please try again later.")
        }
      }
    },
    async (request, reply) => {
      const venueSlug = readParamSlug(request.params, "venueSlug")
      const activeEvent = await requireVenueActiveEvent(app, venueSlug)
      const requestRecord = await app.queue.submitPublicRequest(
        activeEvent.id,
        readSubmitPublicRequestInput(request, reply)
      )

      reply.code(201)
      return toPublicRequestResponse(requestRecord)
    }
  )

  app.get("/public/events/:eventPublicId/stream", async (request, reply) => {
    const event = await requirePublicEventByPublicId(app, readPublicEventId(request.params))
    await app.queue.getPublicQueue(event.id)

    return startEventStream(app, reply, {
      channel: app.eventBus.eventChannel(event.id),
      connected: { scope: "public.event", eventPublicId: event.publicId },
      mapEventData: toPublicStreamEventPayload
    })
  })

  app.get("/public/events/:eventPublicId/queue", async (request) => {
    const event = await requirePublicEventByPublicId(app, readPublicEventId(request.params))
    return app.queue.getPublicQueue(event.id)
  })

  app.get("/public/events/:eventPublicId/my-requests", async (request) => {
    const event = await requirePublicEventByPublicId(app, readPublicEventId(request.params))
    const participantToken = request.cookies[PARTICIPANT_COOKIE_NAME]

    if (!isValidParticipantToken(participantToken)) {
      return { requests: [] }
    }

    const participantTokenHash = hashParticipantToken(participantToken, request.server.config.participantTokenSecret)
    const requests = await app.queue.listParticipantRequests(event.id, participantTokenHash)

    return {
      requests: requests.map((requestRecord) => ({
        id: requestRecord.id,
        status: requestRecord.status,
        singerName: requestRecord.singerName,
        artist: requestRecord.artist,
        title: requestRecord.title,
        position: requestRecord.position,
        createdAt: requestRecord.createdAt
      }))
    }
  })

  app.post(
    "/public/events/:eventPublicId/requests",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute",
          keyGenerator: (request) => `${request.ip}:${readRateLimitEventId(request.params)}`,
          errorResponseBuilder: () =>
            new ApiHttpError(429, "TOO_MANY_REQUESTS", "Too many public song requests. Please try again later.")
        }
      }
    },
    async (request, reply) => {
      const event = await requirePublicEventByPublicId(app, readPublicEventId(request.params))
      const requestRecord = await app.queue.submitPublicRequest(event.id, readSubmitPublicRequestInput(request, reply))

      reply.code(201)
      return toPublicRequestResponse(requestRecord)
    }
  )
}

export async function registerQueueDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get("/dashboard/events/:eventId/stream", async (request, reply) => {
    const user = await requireActiveCurrentUser(request)
    const eventId = readParamUuid(request.params, "eventId")
    await requireQueueStreamPermission(app, user.id, eventId)

    return startEventStream(app, reply, {
      channel: app.eventBus.eventChannel(eventId),
      connected: { scope: "dashboard.event", eventId }
    })
  })

  app.get("/dashboard/events/:eventId/operator-queue", async (request) => {
    const user = await requireActiveCurrentUser(request)
    const eventId = readParamUuid(request.params, "eventId")
    await requireQueueViewPermission(app, user.id, eventId)

    return app.queue.getOperatorQueue(eventId)
  })

  app.post("/dashboard/events/:eventId/requests/:requestId/approve", async (request) => {
    const { userId, eventId, requestId } = await readOperatorActionContext(app, request)
    return { request: await app.queue.approveRequest(eventId, requestId, userId) }
  })

  app.post("/dashboard/events/:eventId/requests/:requestId/reject", async (request) => {
    const { userId, eventId, requestId } = await readOperatorActionContext(app, request)
    const body = request.body === undefined ? {} : readBody(request.body)
    return { request: await app.queue.rejectRequest(eventId, requestId, userId, readOptionalString(body, "reason", { maxLength: 500 })) }
  })

  app.post("/dashboard/events/:eventId/requests/:requestId/start", async (request) => {
    const { userId, eventId, requestId } = await readOperatorActionContext(app, request)
    return { request: await app.queue.startRequest(eventId, requestId, userId) }
  })

  app.post("/dashboard/events/:eventId/requests/:requestId/done", async (request) => {
    const { userId, eventId, requestId } = await readOperatorActionContext(app, request)
    return { request: await app.queue.completeRequest(eventId, requestId, userId) }
  })

  app.post("/dashboard/events/:eventId/requests/:requestId/skip", async (request) => {
    const { userId, eventId, requestId } = await readOperatorActionContext(app, request)
    return { request: await app.queue.skipRequest(eventId, requestId, userId) }
  })

  app.post("/dashboard/events/:eventId/requests/:requestId/move", async (request) => {
    const { userId, eventId, requestId } = await readOperatorActionContext(app, request)
    const body = readBody(request.body)
    return { request: await app.queue.moveRequest(eventId, requestId, readPositiveInteger(body, "position"), userId) }
  })
}

async function readOperatorActionContext(app: FastifyInstance, request: FastifyRequest) {
  const user = await requireActiveCurrentUser(request)
  const eventId = readParamUuid(request.params, "eventId")
  const requestId = readParamUuid(request.params, "requestId")
  await requireQueueOperatorPermission(app, user.id, eventId)

  return { userId: user.id, eventId, requestId }
}

async function requireQueueViewPermission(app: FastifyInstance, userId: string, eventId: string): Promise<void> {
  const canOperate = await app.permissions.hasEventPermission(userId, eventId, "event.operate_queue")
  const canManage = await app.permissions.hasEventPermission(userId, eventId, "event.manage")
  const canSupport = await app.permissions.hasPlatformOwnerEventSupportAccess(
    userId,
    eventId,
    "event.operate_queue",
    "dashboard.queue.view"
  )
  if (!canOperate && !canManage && !canSupport) {
    throw new ApiHttpError(403, "FORBIDDEN", "Forbidden")
  }
}

async function requireQueueOperatorPermission(app: FastifyInstance, userId: string, eventId: string): Promise<void> {
  const canOperate = await app.permissions.hasEventPermission(userId, eventId, "event.operate_queue")
  const canManage = await app.permissions.hasEventPermission(userId, eventId, "event.manage")
  const canSupport = await app.permissions.hasPlatformOwnerEventSupportAccess(
    userId,
    eventId,
    "event.operate_queue",
    "dashboard.queue.operate"
  )
  if (!canOperate && !canManage && !canSupport) {
    throw new ApiHttpError(403, "FORBIDDEN", "Forbidden")
  }
}

async function requireQueueStreamPermission(app: FastifyInstance, userId: string, eventId: string): Promise<void> {
  const canView = await app.permissions.hasEventPermission(userId, eventId, "event.view_stats")
  const canOperate = await app.permissions.hasEventPermission(userId, eventId, "event.operate_queue")
  const canManage = await app.permissions.hasEventPermission(userId, eventId, "event.manage")
  const canSupport = await app.permissions.hasPlatformOwnerEventSupportAccess(
    userId,
    eventId,
    "event.view_stats",
    "dashboard.queue.stream"
  )
  if (!canView && !canOperate && !canManage && !canSupport) {
    throw new ApiHttpError(403, "FORBIDDEN", "Forbidden")
  }
}

function readSourceId(body: Record<string, unknown>): string {
  const sourceId = readRequiredString(body, "sourceId", { maxLength: 40 })
  if (!/^[a-z0-9_-]+$/i.test(sourceId)) {
    throw new ApiHttpError(400, "BAD_REQUEST", "Invalid sourceId")
  }

  return sourceId
}

function readSubmitPublicRequestInput(request: FastifyRequest, reply: FastifyReply) {
  const body = readBody(request.body)
  const participantToken = resolveParticipantToken(request, reply)
  const input: SubmitPublicRequestInput = {
    singerName: readRequiredString(body, "singerName", { maxLength: 80 }),
    participantTokenHash: hashParticipantToken(participantToken, request.server.config.participantTokenSecret),
    sourceId: readSourceId(body),
    songTitle: readRequiredString(body, "songTitle", { maxLength: 200 }),
    songArtist: readRequiredString(body, "songArtist", { maxLength: 200 })
  }
  const sourceTrackId = readOptionalString(body, "sourceTrackId", { maxLength: 120 })
  const songUrl = readOptionalString(body, "songUrl", { maxLength: 1000 })
  const note = readOptionalString(body, "note", { maxLength: 500 })
  if (sourceTrackId !== undefined) {
    input.sourceTrackId = sourceTrackId
  }
  if (songUrl !== undefined) {
    input.songUrl = songUrl
  }
  if (note !== undefined) {
    input.note = note
  }

  return input
}

function toPublicRequestResponse(requestRecord: QueueSongRequest) {
  return {
    request: {
      id: requestRecord.id,
      status: requestRecord.status,
      singerName: requestRecord.singerName,
      songTitle: requestRecord.songTitle,
      songArtist: requestRecord.songArtist,
      sourceId: requestRecord.sourceId,
      sourceTrackId: requestRecord.sourceTrackId
    }
  }
}

function toPublicActiveEvent(event: Awaited<ReturnType<typeof requireVenueActiveEvent>>) {
  return {
    publicId: event.publicId,
    name: event.name,
    slug: event.slug,
    status: event.status,
    visibility: event.visibility,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    publicJoinEnabled: event.publicJoinEnabled,
    publicQueueEnabled: event.publicQueueEnabled,
    joinAccessMode: event.joinAccessMode
  }
}

async function requirePublicVenueLookup(app: FastifyInstance, venueSlug: string) {
  const lookup = await app.events.getPublicActiveEventByVenueSlug(venueSlug)
  if (!lookup) {
    throw new ApiHttpError(404, "NOT_FOUND", "Missing venue")
  }

  return lookup
}

async function requireVenueActiveEvent(app: FastifyInstance, venueSlug: string) {
  const lookup = await requirePublicVenueLookup(app, venueSlug)
  if (!lookup.activeEvent) {
    throw new ApiHttpError(409, "EVENT_NOT_ACTIVE", "No active event for this venue")
  }

  return lookup.activeEvent
}

async function requirePublicEventByPublicId(app: FastifyInstance, eventPublicId: string) {
  const event = await app.events.resolvePublicEventByPublicId(eventPublicId)
  if (!event) {
    throw new ApiHttpError(404, "NOT_FOUND", "Missing event")
  }

  return event
}

function readPublicEventId(params: unknown): string {
  if (typeof params !== "object" || params === null || !("eventPublicId" in params)) {
    throw new ApiHttpError(400, "BAD_REQUEST", "Missing eventPublicId")
  }

  const eventPublicId = (params as { eventPublicId?: unknown }).eventPublicId
  if (typeof eventPublicId !== "string" || eventPublicId.length === 0 || eventPublicId.length > 120) {
    throw new ApiHttpError(400, "BAD_REQUEST", "Invalid eventPublicId")
  }

  return eventPublicId
}

function readRateLimitEventId(params: unknown): string {
  if (typeof params !== "object" || params === null || !("eventPublicId" in params)) {
    return "unknown-event"
  }

  const eventPublicId = (params as { eventPublicId?: unknown }).eventPublicId
  return typeof eventPublicId === "string" ? eventPublicId : "unknown-event"
}

function readRateLimitVenueSlug(params: unknown): string {
  if (typeof params !== "object" || params === null || !("venueSlug" in params)) {
    return "unknown-venue"
  }

  const venueSlug = (params as { venueSlug?: unknown }).venueSlug
  return typeof venueSlug === "string" ? venueSlug : "unknown-venue"
}
