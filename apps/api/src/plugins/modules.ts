import type { FastifyInstance } from "fastify"
import {
  createAccessRequestsService,
  type AccessRequestsService
} from "../modules/accessRequests/service.ts"
import {
  createOrganizationsService,
  type OrganizationsService
} from "../modules/organizations/service.ts"
import { createEventsService, type EventsService } from "../modules/events/service.ts"
import { createQueueService, type QueueService } from "../modules/queue/service.ts"
import { createVenuesService, type VenuesService } from "../modules/venues/service.ts"

export type ApiModuleServices = {
  organizations: OrganizationsService
  venues: VenuesService
  events: EventsService
  queue: QueueService
  accessRequests: AccessRequestsService
}

declare module "fastify" {
  interface FastifyInstance {
    organizations: OrganizationsService
    venues: VenuesService
    events: EventsService
    queue: QueueService
    accessRequests: AccessRequestsService
  }
}

export async function registerModuleServices(app: FastifyInstance, overrides: Partial<ApiModuleServices> = {}): Promise<void> {
  app.decorate("organizations", overrides.organizations ?? createOrganizationsService(app.db))
  app.decorate("venues", overrides.venues ?? createVenuesService(app.db))
  app.decorate("events", overrides.events ?? createEventsService(app.db, app.eventBus))
  app.decorate(
    "queue",
    overrides.queue ??
      createQueueService(app.db, app.eventBus, {
        maxActivePerParticipant: app.config.publicRequestMaxActivePerParticipant,
        cooldownSeconds: app.config.publicRequestCooldownSeconds
      })
  )
  app.decorate("accessRequests", overrides.accessRequests ?? createAccessRequestsService(app.db))
}
