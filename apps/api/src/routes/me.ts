import type { FastifyInstance } from "fastify"
import { fromNodeHeaders } from "better-auth/node"
import { evaluateDashboardAccess } from "../auth/access.ts"
import { getOrCreateDomainUserForAuthUser } from "../auth/domainUsers.ts"

export async function registerMeRoutes(app: FastifyInstance): Promise<void> {
  app.get("/me", async (request) => {
    const session = await app.auth.api.getSession({
      headers: fromNodeHeaders(request.headers)
    })

    if (!session) {
      return { authenticated: false }
    }

    const profile = await getOrCreateDomainUserForAuthUser(app.db, session.user, app.config.bootstrapPlatformOwnerEmail)
    const access = evaluateDashboardAccess(profile.user, profile.platformRoles)

    return {
      authenticated: true,
      user: profile.user,
      platform: {
        roles: profile.platformRoles
      },
      access
    }
  })
}
