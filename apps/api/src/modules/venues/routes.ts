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
  readOptionalString,
  readOptionalUuid,
  readParamSlug,
  readParamUuid,
  readRequiredString,
  readSlug
} from "../http/validation.ts"
import { allowedVenueAccessRoles, allowedVenueVerificationStatuses, isVenuePubliclyVisible } from "./service.ts"
import type { CreateVenueAccessRequestInput, CreateVenueInput, PatchVenueInput } from "./service.ts"

export async function registerVenuePublicRoutes(app: FastifyInstance): Promise<void> {
  app.get("/public/venues/:venueSlug", async (request) => {
    const venueSlug = readParamSlug(request.params, "venueSlug")
    const venue = await app.venues.getBySlug(venueSlug)
    if (!venue || !isVenuePubliclyVisible(venue)) {
      throw new ApiHttpError(404, "NOT_FOUND", "Missing venue")
    }

    return { venue }
  })
}

export async function registerVenueDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get("/dashboard/venues", async (request) => {
    const user = await requireCurrentUser(request)
    const includeAll = await app.permissions.hasPlatformPermission(user.id, "platform.manage_venues")
    return { venues: await app.venues.listForUser(user.id, { includeAll }) }
  })

  app.post("/dashboard/venues", async (request, reply) => {
    const user = await requireActiveCurrentUser(request)
    const body = readBody(request.body)
    const organizationId = readOptionalUuid(body, "organizationId")
    const accessRole = readEnum(body, "accessRole", allowedVenueAccessRoles, "event_creator")

    if (organizationId) {
      await app.permissions.requireOrganizationPermission(user.id, organizationId, "organization.request_venue_access")
    } else {
      await app.permissions.requirePlatformPermission(user.id, "platform.manage_venues")
    }

    const createInput: CreateVenueInput = {
      name: readRequiredString(body, "name", { maxLength: 160 }),
      slug: readSlug(body, "slug", { reserved: true }),
      createdByUserId: user.id,
      accessRole
    }
    const address = readOptionalString(body, "address", { maxLength: 200 })
    const city = readOptionalString(body, "city", { maxLength: 120 })
    const country = readOptionalString(body, "country", { maxLength: 2 })
    const timezone = readOptionalString(body, "timezone", { maxLength: 80 })
    if (address !== undefined) {
      createInput.address = address
    }
    if (city !== undefined) {
      createInput.city = city
    }
    if (country !== undefined) {
      createInput.country = country
    }
    if (timezone !== undefined) {
      createInput.timezone = timezone
    }
    if (organizationId !== undefined) {
      createInput.organizationId = organizationId
    }
    const venue = await app.venues.createVenue(createInput)

    reply.code(201)
    return { venue }
  })

  app.get("/dashboard/venues/:venueId", async (request) => {
    const user = await requireCurrentUser(request)
    const venueId = readParamUuid(request.params, "venueId")
    const isPlatformAllowed = await app.permissions.hasPlatformPermission(user.id, "platform.manage_venues")
    if (!isPlatformAllowed && !(await app.permissions.hasVenuePermission(user.id, venueId, "event.view_stats"))) {
      throw forbidden()
    }

    const venue = await app.venues.getById(venueId)
    if (!venue) {
      throw new ApiHttpError(404, "NOT_FOUND", "Missing venue")
    }

    return { venue }
  })

  app.patch("/dashboard/venues/:venueId", async (request) => {
    const user = await requireActiveCurrentUser(request)
    const venueId = readParamUuid(request.params, "venueId")
    const isPlatformAllowed = await app.permissions.hasPlatformPermission(user.id, "platform.manage_venues")
    if (!isPlatformAllowed) {
      await app.permissions.requireVenuePermission(user.id, venueId, "venue.manage_profile")
    }

    const body = readBody(request.body)
    const patchInput: PatchVenueInput = {}
    const name = readOptionalString(body, "name", { maxLength: 160 })
    const address = readOptionalString(body, "address", { maxLength: 200 })
    const city = readOptionalString(body, "city", { maxLength: 120 })
    const country = readOptionalString(body, "country", { maxLength: 2 })
    const timezone = readOptionalString(body, "timezone", { maxLength: 80 })
    if (name !== undefined) {
      patchInput.name = name
    }
    if (address !== undefined) {
      patchInput.address = address
    }
    if (city !== undefined) {
      patchInput.city = city
    }
    if (country !== undefined) {
      patchInput.country = country
    }
    if (timezone !== undefined) {
      patchInput.timezone = timezone
    }
    const venue = await app.venues.patchVenue(venueId, patchInput)

    return { venue }
  })

  app.get("/dashboard/venues/:venueId/access", async (request) => {
    const user = await requireCurrentUser(request)
    const venueId = readParamUuid(request.params, "venueId")
    const isPlatformAllowed = await app.permissions.hasPlatformPermission(user.id, "platform.manage_venues")
    if (!isPlatformAllowed) {
      await app.permissions.requireVenuePermission(user.id, venueId, "venue.grant_access")
    }

    return { access: await app.venues.listAccess(venueId) }
  })

  app.post("/dashboard/venues/:venueId/access-requests", async (request, reply) => {
    const user = await requireActiveCurrentUser(request)
    const venueId = readParamUuid(request.params, "venueId")
    const body = readBody(request.body)
    const organizationId = readOptionalUuid(body, "organizationId")
    if (!organizationId) {
      throw new ApiHttpError(400, "BAD_REQUEST", "Missing organizationId")
    }

    await app.permissions.requireOrganizationPermission(user.id, organizationId, "organization.request_venue_access")
    const createInput: CreateVenueAccessRequestInput = {
      userId: user.id,
      email: user.email,
      name: user.name,
      venueId,
      organizationId,
      role: readEnum(body, "role", allowedVenueAccessRoles, "karaoke_operator")
    }
    const message = readOptionalString(body, "message", { maxLength: 1000 })
    if (message !== undefined) {
      createInput.message = message
    }
    const accessRequest = await app.venues.createAccessRequest(createInput)

    reply.code(201)
    return { accessRequest }
  })
}

export async function registerVenuePlatformRoutes(app: FastifyInstance): Promise<void> {
  app.get("/platform/venues", async (request) => {
    await requirePlatformPermissionForRequest(request, "platform.manage_venues")
    return { venues: await app.venues.listForPlatform() }
  })

  app.patch("/platform/venues/:venueId/verification", async (request) => {
    await requirePlatformPermissionForRequest(request, "platform.manage_venues")
    const venueId = readParamUuid(request.params, "venueId")
    const body = readBody(request.body)
    const verificationStatus = readEnum(body, "verificationStatus", allowedVenueVerificationStatuses)
    const patchInput: PatchVenueInput = { verificationStatus }
    if (verificationStatus === "verified") {
      patchInput.status = "active"
    }
    const venue = await app.venues.patchVenue(venueId, patchInput)

    return { venue }
  })
}

function forbidden(): ApiHttpError {
  return new ApiHttpError(403, "FORBIDDEN", "Forbidden")
}
