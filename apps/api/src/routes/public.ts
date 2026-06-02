import type { FastifyInstance } from "fastify"
import { notImplemented } from "../errors.ts"
import { registerEventPublicRoutes } from "../modules/events/routes.ts"
import { registerQueuePublicRoutes } from "../modules/queue/routes.ts"
import { registerVenuePublicRoutes } from "../modules/venues/routes.ts"

export async function registerPublicRoutes(app: FastifyInstance): Promise<void> {
  app.get("/public", async () => {
    throw notImplemented("Public API routes are not implemented yet")
  })

  await registerVenuePublicRoutes(app)
  await registerEventPublicRoutes(app)
  await registerQueuePublicRoutes(app)
}
