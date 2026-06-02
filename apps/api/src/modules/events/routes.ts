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
  readOptionalUuid,
  readParamSlug,
  readParamUuid,
  readRequiredString,
  readSlug
} from "../http/validation.ts"
import { allowedEventStaffRoles } from "./service.ts"
import type { CreateEventInput, PatchEventInput, PatchEventStaffInput } from "./service.ts"

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
    if (!operatedByOrganizationId) {
      throw new ApiHttpError(400, "BAD_REQUEST", "Missing operatedByOrganizationId")
    }

    const isPlatformAllowed = await app.permissions.hasPlatformPermission(user.id, "platform.manage_venues")
    if (!isPlatformAllowed) {
      await app.permissions.requireVenuePermission(user.id, venueId, "venue.create_event")
    }

    const createInput: CreateEventInput = {
      venueId,
      operatedByOrganizationId,
      createdByUserId: user.id,
      name: readRequiredString(body, "name", { maxLength: 160 }),
      slug: readSlug(body),
      status: readEnum(body, "status", ["draft", "scheduled"], "draft")
    }
    const startsAt = readOptionalDateString(body, "startsAt")
    const endsAt = readOptionalDateString(body, "endsAt")
    const publicJoinEnabled = readOptionalBoolean(body, "publicJoinEnabled")
    const publicQueueEnabled = readOptionalBoolean(body, "publicQueueEnabled")
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

    const event = await app.events.createEvent(createInput)

    reply.code(201)
    return { event }
  })

  app.get("/dashboard/events/:eventId", async (request) => {
    const user = await requireCurrentUser(request)
    const eventId = readParamUuid(request.params, "eventId")
    const isPlatformAllowed = await app.permissions.hasPlatformPermission(user.id, "platform.manage_venues")
    if (!isPlatformAllowed && !(await app.permissions.hasEventPermission(user.id, eventId, "event.view_stats"))) {
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
    await requireEventManageOrPlatform(app, user.id, eventId)

    const body = readBody(request.body)
    const patchInput: PatchEventInput = {}
    const name = readOptionalString(body, "name", { maxLength: 160 })
    const slug = readOptionalString(body, "slug")
    const startsAt = readOptionalDateString(body, "startsAt")
    const endsAt = readOptionalDateString(body, "endsAt")
    const publicJoinEnabled = readOptionalBoolean(body, "publicJoinEnabled")
    const publicQueueEnabled = readOptionalBoolean(body, "publicQueueEnabled")
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

    const event = await app.events.patchEvent(eventId, patchInput)

    return { event }
  })

  for (const action of lifecycleActions) {
    app.post(`/dashboard/events/:eventId/${action}`, async (request) => {
      const user = await requireActiveCurrentUser(request)
      const eventId = readParamUuid(request.params, "eventId")
      await requireEventManageOrPlatform(app, user.id, eventId)

      return { event: await app.events.changeLifecycle(eventId, action, user.id) }
    })
  }

  app.get("/dashboard/events/:eventId/staff", async (request) => {
    const user = await requireCurrentUser(request)
    const eventId = readParamUuid(request.params, "eventId")
    const isPlatformAllowed = await app.permissions.hasPlatformPermission(user.id, "platform.manage_venues")
    if (!isPlatformAllowed && !(await app.permissions.hasEventPermission(user.id, eventId, "event.view_stats"))) {
      throw forbidden()
    }

    return { staff: await app.events.listStaff(eventId) }
  })

  app.post("/dashboard/events/:eventId/staff", async (request, reply) => {
    const user = await requireActiveCurrentUser(request)
    const eventId = readParamUuid(request.params, "eventId")
    await requireEventManageOrPlatform(app, user.id, eventId)

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
    await requireEventManageOrPlatform(app, user.id, eventId)

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
    await requireEventManageOrPlatform(app, user.id, eventId)

    return { assignment: await app.events.removeStaffAssignment(eventId, assignmentId) }
  })
}

export async function registerEventPublicRoutes(app: FastifyInstance): Promise<void> {
  app.get("/public/venues/:venueSlug/active-event", async (request) => {
    const venueSlug = readParamSlug(request.params, "venueSlug")
    const lookup = await app.events.getPublicActiveEventByVenueSlug(venueSlug)
    if (!lookup) {
      throw new ApiHttpError(404, "NOT_FOUND", "Missing venue")
    }

    return lookup
  })
}

async function requireEventManageOrPlatform(app: FastifyInstance, userId: string, eventId: string): Promise<void> {
  const isPlatformAllowed = await app.permissions.hasPlatformPermission(userId, "platform.manage_venues")
  if (isPlatformAllowed) {
    return
  }

  await app.permissions.requireEventPermission(userId, eventId, "event.manage")
}

function forbidden(): ApiHttpError {
  return new ApiHttpError(403, "FORBIDDEN", "Forbidden")
}
