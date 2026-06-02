import type { FastifyInstance } from "fastify"
import { notImplemented } from "../errors.ts"
import { registerEventDashboardRoutes } from "../modules/events/routes.ts"
import { registerOrganizationDashboardRoutes } from "../modules/organizations/routes.ts"
import { registerQueueDashboardRoutes } from "../modules/queue/routes.ts"
import { registerVenueDashboardRoutes } from "../modules/venues/routes.ts"

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get("/dashboard", async () => {
    throw notImplemented("Dashboard API routes are not implemented yet")
  })

  await registerOrganizationDashboardRoutes(app)
  await registerVenueDashboardRoutes(app)
  await registerEventDashboardRoutes(app)
  await registerQueueDashboardRoutes(app)
}
