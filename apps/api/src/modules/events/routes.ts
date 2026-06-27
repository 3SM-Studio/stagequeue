import type { FastifyInstance } from "fastify"
import { ApiHttpError } from "../../errors.ts"
import {
  requireActiveCurrentUser,
  requireCurrentUser,
  requirePlatformPermissionForRequest
} from "../../permissions/request.ts"
import {
  readBody,
  readEnum,
  readOptionalEnum,
  readOptionalBoolean,
  readOptionalDateString,
  readOptionalString,
  readParamPublicId,
  readOptionalUuid,
  readParamSlug,
  readParamUuid,
  readRequiredString,
  readSlug
} from "../http/validation.ts"
import { allowedEventStaffRoles } from "./service.ts"
import type { CreateEventInput, DashboardInviteLink, PatchEventInput, PatchEventStaffInput } from "./service.ts"
import { PARTICIPANT_COOKIE_NAME, hashParticipantToken, isValidParticipantToken, resolveParticipantToken } from "../queue/participant.ts"

const lifecycleActions = ["start", "pause", "resume", "close", "archive", "cancel"] as const

export async function registerEventDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get("/dashboard/events", async (request) => {
    const user = await requireCurrentUser(request)
    const includeAll = await app.permissions.hasPlatformPermission(user.id, "platform.manage_venues")
    return { events: await app.events.listForUser(user.id, { includeAll }) }
  })

  app.post("/dashboard/events", async (request, reply) => {
    const user = await requireActiveCurrentUser(request)
    const body = readBody(request.body)
    const venueId = readOptionalUuid(body, "venueId")
    const operatedByOrganizationId = readOptionalUuid(body, "operatedByOrganizationId")

    if (!venueId) {
      throw new ApiHttpError(400, "BAD_REQUEST", "Missing venueId")
    }

    const isPlatformAllowed = await app.permissions.hasPlatformPermission(user.id, "platform.manage_venues")
    if (!isPlatformAllowed) {
      if (!operatedByOrganizationId) {
        throw new ApiHttpError(400, "BAD_REQUEST", "Missing operatedByOrganizationId")
      }
      await app.permissions.requireVenuePermission(user.id, venueId, "venue.create_event")
    }

    const createInput: CreateEventInput = {
      venueId,
      createdByUserId: user.id,
      name: readRequiredString(body, "name", { maxLength: 160 }),
      slug: readSlug(body),
      status: readEnum(body, "status", ["draft", "scheduled", "active"], "draft")
    }
    if (operatedByOrganizationId !== undefined) {
      createInput.operatedByOrganizationId = operatedByOrganizationId
    }
    const startsAt = readOptionalDateString(body, "startsAt")
    const endsAt = readOptionalDateString(body, "endsAt")
    const publicJoinEnabled = readOptionalBoolean(body, "publicJoinEnabled")
    const publicQueueEnabled = readOptionalBoolean(body, "publicQueueEnabled")
    const joinAccessMode = readOptionalEnum(body, "joinAccessMode", ["open", "invite_required"])
    const visibility = readOptionalEnum(body, "visibility", ["public", "unlisted", "private"])
    if (startsAt !== undefined) {
      createInput.startsAt = startsAt
    }
    if (endsAt !== undefined) {
      createInput.endsAt = endsAt
    }
    if (publicJoinEnabled !== undefined) {
      createInput.publicJoinEnabled = publicJoinEnabled
    }
    if (publicQueueEnabled !== undefined) {
      createInput.publicQueueEnabled = publicQueueEnabled
    }
    if (joinAccessMode !== undefined) {
      createInput.joinAccessMode = joinAccessMode
    }
    if (visibility !== undefined) {
      createInput.visibility = visibility
    }

    const created = await app.events.createEvent(createInput)
    const event = await app.events.getDashboardById(created.id)
    if (!event) {
      throw new ApiHttpError(404, "NOT_FOUND", "Missing event")
    }

    reply.code(201)
    return { event }
  })

  app.get("/dashboard/events/:eventId", async (request) => {
    const user = await requireCurrentUser(request)
    const eventId = readParamUuid(request.params, "eventId")
    const canView = await app.permissions.hasEventPermission(user.id, eventId, "event.view_stats")
    const canSupport =
      !canView &&
      (await app.permissions.hasPlatformOwnerEventSupportAccess(
        user.id,
        eventId,
        "event.view_stats",
        "dashboard.event.read"
      ))
    if (!canView && !canSupport) {
      throw forbidden()
    }

    const event = await app.events.getById(eventId)
    if (!event) {
      throw new ApiHttpError(404, "NOT_FOUND", "Missing event")
    }

    return { event }
  })

  app.patch("/dashboard/events/:eventId", async (request) => {
    const user = await requireActiveCurrentUser(request)
    const eventId = readParamUuid(request.params, "eventId")
    await requireEventManageOrSupport(app, user.id, eventId)

    const body = readBody(request.body)
    const patchInput: PatchEventInput = {}
    const name = readOptionalString(body, "name", { maxLength: 160 })
    const slug = readOptionalString(body, "slug")
    const startsAt = readOptionalDateString(body, "startsAt")
    const endsAt = readOptionalDateString(body, "endsAt")
    const publicJoinEnabled = readOptionalBoolean(body, "publicJoinEnabled")
    const publicQueueEnabled = readOptionalBoolean(body, "publicQueueEnabled")
    const joinAccessMode = readOptionalEnum(body, "joinAccessMode", ["open", "invite_required"])
    const visibility = readOptionalEnum(body, "visibility", ["public", "unlisted", "private"])
    if (name !== undefined) {
      patchInput.name = name
    }
    if (slug !== undefined) {
      patchInput.slug = readSlug(body)
    }
    if (startsAt !== undefined) {
      patchInput.startsAt = startsAt
    }
    if (endsAt !== undefined) {
      patchInput.endsAt = endsAt
    }
    if (publicJoinEnabled !== undefined) {
      patchInput.publicJoinEnabled = publicJoinEnabled
    }
    if (publicQueueEnabled !== undefined) {
      patchInput.publicQueueEnabled = publicQueueEnabled
    }
    if (joinAccessMode !== undefined) {
      patchInput.joinAccessMode = joinAccessMode
    }
    if (visibility !== undefined) {
      patchInput.visibility = visibility
    }

    const event = await app.events.patchEvent(eventId, patchInput)

    return { event }
  })

  app.get("/dashboard/events/:eventId/invite", async (request) => {
    const user = await requireActiveCurrentUser(request)
    const eventId = readParamUuid(request.params, "eventId")
    await requireEventManageOrSupport(app, user.id, eventId)

    const invite = await app.events.getActiveEventInvite(eventId)
    return { invite: mapDashboardInvite(invite, app.config.publicWebUrl) }
  })

  app.post("/dashboard/events/:eventId/invite/revoke", async (request) => {
    const user = await requireActiveCurrentUser(request)
    const eventId = readParamUuid(request.params, "eventId")
    await requireEventManageOrSupport(app, user.id, eventId)

    const result = await app.events.revokeEventInvite(eventId)
    return { invite: mapDashboardInvite(result.invite, app.config.publicWebUrl) }
  })

  app.post("/dashboard/events/:eventId/invite/rotate", async (request) => {
    const user = await requireActiveCurrentUser(request)
    const eventId = readParamUuid(request.params, "eventId")
    await requireEventManageOrSupport(app, user.id, eventId)

    const result = await app.events.rotateEventInvite(eventId)
    return { invite: mapDashboardInvite(result.invite, app.config.publicWebUrl) }
  })

  for (const action of lifecycleActions) {
    app.post(`/dashboard/events/:eventId/${action}`, async (request) => {
      const user = await requireActiveCurrentUser(request)
      const eventId = readParamUuid(request.params, "eventId")
      await requireEventManageOrSupport(app, user.id, eventId)

      return { event: await app.events.changeLifecycle(eventId, action, user.id) }
    })
  }

  app.get("/dashboard/events/:eventId/staff", async (request) => {
    const user = await requireCurrentUser(request)
    const eventId = readParamUuid(request.params, "eventId")
    const canView = await app.permissions.hasEventPermission(user.id, eventId, "event.view_stats")
    const canSupport =
      !canView &&
      (await app.permissions.hasPlatformOwnerEventSupportAccess(
        user.id,
        eventId,
        "event.view_stats",
        "dashboard.event.read"
      ))
    if (!canView && !canSupport) {
      throw forbidden()
    }

    return { staff: await app.events.listStaff(eventId) }
  })

  app.post("/dashboard/events/:eventId/staff", async (request, reply) => {
    const user = await requireActiveCurrentUser(request)
    const eventId = readParamUuid(request.params, "eventId")
    await requireEventManageOrSupport(app, user.id, eventId)

    const body = readBody(request.body)
    const staffUserId = readOptionalUuid(body, "userId")
    if (!staffUserId) {
      throw new ApiHttpError(400, "BAD_REQUEST", "Missing userId")
    }

    const assignment = await app.events.assignStaff({
      eventId,
      userId: staffUserId,
      role: readEnum(body, "role", allowedEventStaffRoles),
      assignedByUserId: user.id
    })

    reply.code(201)
    return { assignment }
  })

  app.patch("/dashboard/events/:eventId/staff/:assignmentId", async (request) => {
    const user = await requireActiveCurrentUser(request)
    const eventId = readParamUuid(request.params, "eventId")
    const assignmentId = readParamUuid(request.params, "assignmentId")
    await requireEventManageOrSupport(app, user.id, eventId)

    const body = readBody(request.body)
    const patchInput: PatchEventStaffInput = {}
    const role = readOptionalEnum(body, "role", allowedEventStaffRoles)
    const status = readOptionalEnum(body, "status", ["active", "removed"])
    if (role !== undefined) {
      patchInput.role = role
    }
    if (status !== undefined) {
      patchInput.status = status
    }
    const assignment = await app.events.patchStaffAssignment(eventId, assignmentId, patchInput)

    return { assignment }
  })

  app.delete("/dashboard/events/:eventId/staff/:assignmentId", async (request) => {
    const user = await requireActiveCurrentUser(request)
    const eventId = readParamUuid(request.params, "eventId")
    const assignmentId = readParamUuid(request.params, "assignmentId")
    await requireEventManageOrSupport(app, user.id, eventId)

    return { assignment: await app.events.removeStaffAssignment(eventId, assignmentId) }
  })
}

export async function registerEventPublicRoutes(app: FastifyInstance): Promise<void> {
  app.get("/public/discovery", async () => app.events.getPublicDiscovery())

  app.post("/public/invites/:inviteCode/claim", async (request, reply) => {
    const inviteCode = readParamPublicId(request.params, "inviteCode")
    const participantToken = resolveParticipantToken(request, reply)
    const participantTokenHash = hashParticipantToken(participantToken, request.server.config.participantTokenSecret)

    return app.events.claimPublicInvite(inviteCode, participantTokenHash)
  })

  app.get("/public/events/:eventPublicId", async (request) => {
    const eventPublicId = readParamPublicId(request.params, "eventPublicId")
    const participantToken = request.cookies[PARTICIPANT_COOKIE_NAME]
    const participantTokenHash = isValidParticipantToken(participantToken)
      ? hashParticipantToken(participantToken, request.server.config.participantTokenSecret)
      : undefined
    const detail = await app.events.getPublicEventById(eventPublicId, participantTokenHash)
    if (!detail) {
      throw new ApiHttpError(404, "NOT_FOUND", "Missing event")
    }

    return detail
  })

  app.get("/public/venues/:venueSlug/active-event", async (request) => {
    const venueSlug = readParamSlug(request.params, "venueSlug")
    const lookup = await app.events.getPublicActiveEventByVenueSlug(venueSlug)
    if (!lookup) {
      throw new ApiHttpError(404, "NOT_FOUND", "Missing venue")
    }

    return lookup
  })
}

async function requireEventManageOrSupport(app: FastifyInstance, userId: string, eventId: string): Promise<void> {
  if (await app.permissions.hasEventPermission(userId, eventId, "event.manage")) {
    return
  }

  if (await app.permissions.hasPlatformOwnerEventSupportAccess(userId, eventId, "event.manage", "dashboard.event.manage")) {
    return
  }

  throw forbidden()
}

function forbidden(): ApiHttpError {
  return new ApiHttpError(403, "FORBIDDEN", "Forbidden")
}

function mapDashboardInvite(invite: DashboardInviteLink | null, publicWebUrl: string) {
  if (!invite) {
    return null
  }

  return {
    code: invite.code,
    status: invite.status,
    expiresAt: invite.expiresAt,
    inviteUrl: new URL(invite.urlPath, publicWebUrl).toString(),
    urlPath: invite.urlPath
  }
}
