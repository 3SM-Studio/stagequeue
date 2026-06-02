import { fromNodeHeaders } from "better-auth/node"
import type { FastifyRequest } from "fastify"
import type { PlatformPermission } from "@poza-nuta/domain/permissions"
import { getOrCreateDomainUserForAuthUser } from "../auth/domainUsers.ts"
import type { AuthenticatedDomainUser } from "../auth/access.ts"
import { ApiHttpError } from "../errors.ts"

export type CurrentUserResolver = (request: FastifyRequest) => Promise<AuthenticatedDomainUser>

declare module "fastify" {
  interface FastifyInstance {
    currentUserResolver?: CurrentUserResolver
  }
}

export async function requireCurrentUser(request: FastifyRequest) {
  if (request.server.currentUserResolver) {
    return request.server.currentUserResolver(request)
  }

  const session = await request.server.auth.api.getSession({
    headers: fromNodeHeaders(request.headers)
  })

  if (!session) {
    throw new ApiHttpError(401, "UNAUTHORIZED", "Authentication required")
  }

  const profile = await getOrCreateDomainUserForAuthUser(
    request.server.db,
    session.user,
    request.server.config.bootstrapPlatformOwnerEmail
  )

  if (profile.user.status === "disabled") {
    throw new ApiHttpError(403, "FORBIDDEN", "User is disabled")
  }

  return profile.user
}

export async function requireActiveCurrentUser(request: FastifyRequest): Promise<AuthenticatedDomainUser> {
  const user = await requireCurrentUser(request)
  if (user.status !== "active") {
    throw new ApiHttpError(403, "FORBIDDEN", "Active user access is required")
  }

  return user
}

export async function requirePlatformPermissionForRequest(
  request: FastifyRequest,
  permission: PlatformPermission
): Promise<void> {
  const user = await requireCurrentUser(request)
  await request.server.permissions.requirePlatformPermission(user.id, permission)
}
