import type { FastifyInstance } from "fastify"
import { requireCurrentUser } from "../../permissions/request.ts"
import { ApiHttpError } from "../../errors.ts"

export async function registerSetupRoutes(app: FastifyInstance): Promise<void> {
  app.get("/setup/status", async () => {
    if (!app.config.platformSetupEnabled) {
      return {
        setupRequired: false
      }
    }

    return app.setup.getStatus()
  })

  app.post("/setup/claim-platform-owner", async (request) => {
    if (!app.config.platformSetupEnabled) {
      throw new ApiHttpError(403, "SETUP_DISABLED", "Platform setup is disabled")
    }

    const body = parseClaimPlatformOwnerBody(request.body)
    const user = await requireCurrentUser(request)
    return app.setup.claimPlatformOwner(user, body.setupToken, app.config.platformSetupToken)
  })
}

function parseClaimPlatformOwnerBody(body: unknown): { setupToken: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiHttpError(400, "BAD_REQUEST", "Request body must be a JSON object")
  }

  const setupToken = (body as { setupToken?: unknown }).setupToken

  if (typeof setupToken !== "string" || !setupToken.trim()) {
    throw new ApiHttpError(400, "BAD_REQUEST", "setupToken is required")
  }

  return {
    setupToken
  }
}
