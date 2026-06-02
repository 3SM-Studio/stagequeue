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
  readParamUuid,
  readRequiredString,
  readSlug
} from "../http/validation.ts"
import { allowedOrganizationStatuses, allowedOrganizationTypes } from "./service.ts"
import type { CreateOrganizationInput, PatchOrganizationInput } from "./service.ts"

export async function registerOrganizationDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get("/dashboard/organizations", async (request) => {
    const user = await requireCurrentUser(request)
    return { organizations: await app.organizations.listForUser(user.id) }
  })

  app.post("/dashboard/organizations", async (request, reply) => {
    await requirePlatformPermissionForRequest(request, "platform.manage_organizations")
    const body = readBody(request.body)
    const createInput: CreateOrganizationInput = {
      name: readRequiredString(body, "name", { maxLength: 120 }),
      slug: readSlug(body),
      type: readEnum(body, "type", allowedOrganizationTypes, "karaoke_company"),
      status: readEnum(body, "status", allowedOrganizationStatuses, "active")
    }
    const ownerUserId = readOptionalUuid(body, "ownerUserId")
    if (ownerUserId !== undefined) {
      createInput.ownerUserId = ownerUserId
    }
    const organization = await app.organizations.createOrganization(createInput)

    reply.code(201)
    return { organization }
  })

  app.get("/dashboard/organizations/:organizationId", async (request) => {
    const user = await requireCurrentUser(request)
    const organizationId = readParamUuid(request.params, "organizationId")
    const isPlatformAllowed = await app.permissions.hasPlatformPermission(user.id, "platform.manage_organizations")
    if (!isPlatformAllowed && !(await app.organizations.hasActiveMembership(user.id, organizationId))) {
      throw forbidden()
    }

    const organization = await app.organizations.getById(organizationId)
    if (!organization) {
      throw new ApiHttpError(404, "NOT_FOUND", "Missing organization")
    }

    return { organization }
  })

  app.patch("/dashboard/organizations/:organizationId", async (request) => {
    const user = await requireActiveCurrentUser(request)
    const organizationId = readParamUuid(request.params, "organizationId")
    const isPlatformAllowed = await app.permissions.hasPlatformPermission(user.id, "platform.manage_organizations")
    if (!isPlatformAllowed) {
      await app.permissions.requireOrganizationPermission(user.id, organizationId, "organization.manage_profile")
    }

    const body = readBody(request.body)
    const patchInput: PatchOrganizationInput = {}
    const name = readOptionalString(body, "name", { maxLength: 120 })
    const type = readOptionalEnum(body, "type", allowedOrganizationTypes)
    if (name !== undefined) {
      patchInput.name = name
    }
    if (type !== undefined) {
      patchInput.type = type
    }
    const organization = await app.organizations.patchOrganization(organizationId, patchInput)

    return { organization }
  })

  app.get("/dashboard/organizations/:organizationId/members", async (request) => {
    const user = await requireCurrentUser(request)
    const organizationId = readParamUuid(request.params, "organizationId")
    const isPlatformAllowed = await app.permissions.hasPlatformPermission(user.id, "platform.manage_organizations")
    if (!isPlatformAllowed) {
      await app.permissions.requireOrganizationPermission(user.id, organizationId, "organization.manage_members")
    }

    return { members: await app.organizations.listMembers(organizationId) }
  })
}

export async function registerOrganizationPlatformRoutes(app: FastifyInstance): Promise<void> {
  app.get("/platform/organizations", async (request) => {
    await requirePlatformPermissionForRequest(request, "platform.manage_organizations")
    return { organizations: await app.organizations.listForPlatform() }
  })

  app.patch("/platform/organizations/:organizationId/status", async (request) => {
    await requirePlatformPermissionForRequest(request, "platform.manage_organizations")
    const organizationId = readParamUuid(request.params, "organizationId")
    const body = readBody(request.body)
    const organization = await app.organizations.patchOrganization(organizationId, {
      status: readEnum(body, "status", allowedOrganizationStatuses)
    })

    return { organization }
  })
}

function forbidden(): ApiHttpError {
  return new ApiHttpError(403, "FORBIDDEN", "Forbidden")
}
