import type { FastifyInstance } from "fastify"
import { notImplemented } from "../errors.ts"
import { registerAccessRequestPlatformRoutes } from "../modules/accessRequests/routes.ts"
import { registerCatalogPlatformRoutes } from "../modules/catalog/routes.ts"
import { registerOrganizationPlatformRoutes } from "../modules/organizations/routes.ts"
import { registerVenuePlatformRoutes } from "../modules/venues/routes.ts"

export async function registerPlatformRoutes(app: FastifyInstance): Promise<void> {
  app.get("/platform", async () => {
    throw notImplemented("Platform API routes are not implemented yet")
  })

  await registerAccessRequestPlatformRoutes(app)
  await registerOrganizationPlatformRoutes(app)
  await registerVenuePlatformRoutes(app)
  await registerCatalogPlatformRoutes(app)
}
