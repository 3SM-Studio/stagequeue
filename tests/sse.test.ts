import assert from "node:assert/strict"
import type { AddressInfo } from "node:net"
import test from "node:test"
import { createApiApp, type CreateApiAppOptions } from "../apps/api/src/app.ts"
import type { ApiConfig } from "../apps/api/src/config.ts"
import { createEventsService, type EventSummary } from "../apps/api/src/modules/events/service.ts"
import { createQueueService, type QueueSongRequest } from "../apps/api/src/modules/queue/service.ts"
import { createInMemoryDomainEventBus, type DomainEventPayload } from "../apps/api/src/plugins/eventBus.ts"
import type { ApiModuleServices } from "../apps/api/src/plugins/modules.ts"
import type { DbResources } from "../apps/api/src/plugins/db.ts"
import type { PermissionService } from "../apps/api/src/permissions/service.ts"
import { ApiHttpError } from "../apps/api/src/errors.ts"
import type { DbClient } from "@poza-nuta/db"

const USER_ID = "11111111-1111-4111-8111-111111111111"
const VENUE_ID = "22222222-2222-4222-8222-222222222222"
const ORG_ID = "33333333-3333-4333-8333-333333333333"
const EVENT_ID = "44444444-4444-4444-8444-444444444444"
const REQUEST_ID = "55555555-5555-4555-8555-555555555555"
const IMPORT_RUN_ID = "66666666-6666-4666-8666-666666666666"

test("public stream endpoint returns text/event-stream and cleans up subscriber on close", async () => {
  const app = await createTestApp()
  await app.listen({ host: "127.0.0.1", port: 0 })
  const port = (app.server.address() as AddressInfo).port
  const controller = new AbortController()
  try {
    const response = await fetch(`http://127.0.0.1:${port}/public/events/${EVENT_ID}/stream`, {
      headers: {
        Origin: "http://localhost:3000"
      },
      signal: controller.signal
    })

    assert.equal(response.status, 200)
    assertAllowedSseCors(response, "http://localhost:3000")
    assert.equal(app.eventBus.subscriberCount(app.eventBus.eventChannel(EVENT_ID)), 1)

    controller.abort()
    await delay(50)
    assert.equal(app.eventBus.subscriberCount(app.eventBus.eventChannel(EVENT_ID)), 0)
  } finally {
    controller.abort()
    await app.close()
  }
})

test("venue-first public stream resolves active event and returns text/event-stream", async () => {
  const app = await createTestApp()
  await app.listen({ host: "127.0.0.1", port: 0 })
  const port = (app.server.address() as AddressInfo).port
  const controller = new AbortController()
  try {
    const response = await fetch(`http://127.0.0.1:${port}/public/venues/klub-x/stream`, {
      headers: {
        Origin: "http://localhost:3000"
      },
      signal: controller.signal
    })

    assert.equal(response.status, 200)
    assertAllowedSseCors(response, "http://localhost:3000")
    assert.equal(app.eventBus.subscriberCount(app.eventBus.eventChannel(EVENT_ID)), 1)
  } finally {
    controller.abort()
    await app.close()
  }
})

test("public stream does not allow unsupported origins", async () => {
  const app = await createTestApp()
  await app.listen({ host: "127.0.0.1", port: 0 })
  const port = (app.server.address() as AddressInfo).port
  const controller = new AbortController()
  try {
    const response = await fetch(`http://127.0.0.1:${port}/public/venues/klub-x/stream`, {
      headers: {
        Origin: "https://evil.example"
      },
      signal: controller.signal
    })

    assert.equal(response.status, 200)
    assert.match(response.headers.get("content-type") ?? "", /^text\/event-stream; charset=utf-8/)
    assert.equal(response.headers.get("access-control-allow-origin"), null)
    assert.equal(response.headers.get("access-control-allow-credentials"), null)
  } finally {
    controller.abort()
    await app.close()
  }
})

test("dashboard stream allows dashboard CORS origin", async () => {
  const app = await createTestApp()
  await app.listen({ host: "127.0.0.1", port: 0 })
  const port = (app.server.address() as AddressInfo).port
  const controller = new AbortController()
  try {
    const response = await fetch(`http://127.0.0.1:${port}/dashboard/events/${EVENT_ID}/stream`, {
      headers: {
        Origin: "http://localhost:3001"
      },
      signal: controller.signal
    })

    assert.equal(response.status, 200)
    assertAllowedSseCors(response, "http://localhost:3001")
  } finally {
    controller.abort()
    await app.close()
  }
})

test("venue-first public stream rejects venues without an active event", async () => {
  const app = await createTestApp({ event: null })
  try {
    const response = await app.inject({ method: "GET", url: "/public/venues/klub-x/stream" })

    assert.equal(response.statusCode, 409)
    assert.equal(response.json().error.code, "EVENT_NOT_ACTIVE")
    assert.equal(app.eventBus.subscriberCount(app.eventBus.eventChannel(EVENT_ID)), 0)
  } finally {
    await app.close()
  }
})

test("public stream is forbidden when publicQueueEnabled is false", async () => {
  const app = await createTestApp({
    event: {
      ...makeEvent("active"),
      publicQueueEnabled: false
    }
  })
  try {
    const response = await app.inject({ method: "GET", url: `/public/events/${EVENT_ID}/stream` })

    assert.equal(response.statusCode, 403)
    assert.equal(response.json().error.code, "FORBIDDEN")
    assert.equal(response.json().error.message, "Public queue is disabled for this event")
    assert.equal(app.eventBus.subscriberCount(app.eventBus.eventChannel(EVENT_ID)), 0)
  } finally {
    await app.close()
  }
})

test("public stream is hidden for archived and cancelled events", async () => {
  for (const status of ["archived", "cancelled"]) {
    const app = await createTestApp({
      event: makeEvent(status)
    })
    try {
      const response = await app.inject({ method: "GET", url: `/public/events/${EVENT_ID}/stream` })

      assert.equal(response.statusCode, 409)
      assert.equal(response.json().error.code, "CONFLICT")
      assert.equal(response.json().error.message, "Queue is not active for this event")
      assert.equal(app.eventBus.subscriberCount(app.eventBus.eventChannel(EVENT_ID)), 0)
    } finally {
      await app.close()
    }
  }
})

test("dashboard stream without auth returns unauthorized", async () => {
  const app = await createTestApp({ authenticated: false })
  try {
    const response = await app.inject({ method: "GET", url: `/dashboard/events/${EVENT_ID}/stream` })

    assert.equal(response.statusCode, 401)
    assert.equal(response.json().error.code, "UNAUTHORIZED")
  } finally {
    await app.close()
  }
})

test("dashboard stream without event permission returns forbidden", async () => {
  const app = await createTestApp({ permissions: fakePermissions() })
  try {
    const response = await app.inject({ method: "GET", url: `/dashboard/events/${EVENT_ID}/stream` })

    assert.equal(response.statusCode, 403)
    assert.equal(response.json().error.code, "FORBIDDEN")
  } finally {
    await app.close()
  }
})

test("event bus publishes only to subscribers of the target event", () => {
  const bus = createInMemoryDomainEventBus()
  const receivedA: DomainEventPayload[] = []
  const receivedB: DomainEventPayload[] = []

  bus.subscribeToEvent("event-a", (event) => receivedA.push(event))
  bus.subscribeToEvent("event-b", (event) => receivedB.push(event))
  bus.publish({ type: "queue.updated", eventId: "event-a", venueId: VENUE_ID })

  assert.equal(receivedA.length, 1)
  assert.equal(receivedA[0].type, "queue.updated")
  assert.equal(receivedB.length, 0)
})

test("queue service publishes request event and queue.updated without private note", async () => {
  const bus = createInMemoryDomainEventBus()
  const received: DomainEventPayload[] = []
  bus.subscribeToEvent(EVENT_ID, (event) => received.push(event))

  const queue = createQueueService(fakeDbForApprove(), bus)
  await queue.approveRequest(EVENT_ID, REQUEST_ID, USER_ID)

  assert.deepEqual(
    received.map((event) => event.type),
    ["request.approved", "queue.updated"]
  )
  assert.equal(received[0].requestId, REQUEST_ID)
  assert.equal("note" in received[0], false)
})

test("event lifecycle publishes lifecycle event and queue.updated", async () => {
  const bus = createInMemoryDomainEventBus()
  const received: DomainEventPayload[] = []
  bus.subscribeToEvent(EVENT_ID, (event) => received.push(event))

  const events = createEventsService(fakeDbForLifecycleStart(), bus)
  await events.changeLifecycle(EVENT_ID, "start", USER_ID)

  assert.deepEqual(
    received.map((event) => event.type),
    ["event.started", "queue.updated"]
  )
})

test("platform catalog import stream requires platform catalog permission", async () => {
  const app = await createTestApp({ permissions: fakePermissions() })
  try {
    const response = await app.inject({ method: "GET", url: `/platform/catalog/import-runs/${IMPORT_RUN_ID}/stream` })

    assert.equal(response.statusCode, 403)
    assert.equal(response.json().error.code, "FORBIDDEN")
  } finally {
    await app.close()
  }
})

async function createTestApp(options: { authenticated?: boolean; permissions?: PermissionService; event?: EventSummary | null } = {}) {
  const appOptions: CreateApiAppOptions = {
    config: testConfig(),
    db: fakeDbResources(),
    auth: fakeAuth(),
    permissions: options.permissions ?? fakePermissions({ event: new Set(["event.view_stats"]), platform: new Set(["platform.manage_catalog"]) }),
    services: {
      organizations: fakeOrganizationsService(),
      venues: fakeVenuesService(),
      events: fakeEventsService(options.event),
      accessRequests: fakeAccessRequestsService()
    },
    logger: false
  }
  if (options.authenticated !== false) {
    appOptions.currentUserResolver = async () => ({ id: USER_ID, email: "user@example.com", name: "User", status: "active" })
  }

  return createApiApp(appOptions)
}

function fakeDbForApprove(): DbClient {
  const request = makeRequest("pending")
  let selectCount = 0
  return {
    execute: async () => [],
    select: () => {
      selectCount += 1
      if (selectCount === 1) {
        return queryChain([{ event: eventContext().event, venue: eventContext().venue }])
      }
      if (selectCount === 2) {
        return queryChain([request])
      }
      if (selectCount === 3 || selectCount === 4) {
        return queryChain([request])
      }
      return queryChain([])
    },
    update: () => ({
      set: (values: Partial<QueueSongRequest>) => ({
        where: () => ({
          returning: () => {
            Object.assign(request, values)
            return [request]
          }
        })
      })
    }),
    insert: () => ({
      values: () => undefined
    })
  } as unknown as DbClient
}

function fakeDbForLifecycleStart(): DbClient {
  const event = makeEvent("scheduled")
  const updated = makeEvent("active")
  let selectCount = 0
  return {
    select: () => {
      selectCount += 1
      return queryChain(selectCount === 1 ? [event] : [])
    },
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => [updated]
        })
      })
    }),
    insert: () => ({
      values: () => undefined
    })
  } as unknown as DbClient
}

function queryChain<T>(result: T[]) {
  return {
    from() {
      return this
    },
    innerJoin() {
      return this
    },
    where() {
      return this
    },
    limit() {
      return result
    },
    orderBy() {
      return result
    }
  }
}

function eventContext() {
  return {
    event: {
      id: EVENT_ID,
      venueId: VENUE_ID,
      operatedByOrganizationId: ORG_ID,
      name: "SSE Event",
      status: "active",
      publicJoinEnabled: true,
      publicQueueEnabled: true
    },
    venue: {
      id: VENUE_ID,
      name: "Klub X",
      slug: "klub-x"
    }
  }
}

function makeRequest(status: string): QueueSongRequest {
  const now = new Date()
  return {
    id: REQUEST_ID,
    venueId: VENUE_ID,
    eventId: EVENT_ID,
    singerName: "Michał",
    displayName: "Michał",
    participantTokenHash: null,
    sourceId: "ising",
    sourceTrackId: "9053",
    songTitle: "Królowa Łez",
    songArtist: "Agnieszka Chylińska",
    songUrl: "https://ising.pl/song",
    note: "private note",
    status,
    position: null,
    requestedAt: now,
    approvedAt: null,
    startedAt: null,
    finishedAt: null,
    createdAt: now,
    updatedAt: now
  }
}

function makeEvent(status: string): EventSummary {
  return {
    id: EVENT_ID,
    venueId: VENUE_ID,
    operatedByOrganizationId: ORG_ID,
    createdByUserId: USER_ID,
    name: "SSE Event",
    slug: "sse-event",
    status,
    startsAt: null,
    endsAt: null,
    publicJoinEnabled: true,
    publicQueueEnabled: true
  }
}

function fakePermissions(options: { event?: Set<string>; platform?: Set<string> } = {}): PermissionService {
  return {
    hasPlatformPermission: async (_userId, permission) => Boolean(options.platform?.has(permission)),
    requirePlatformPermission: async (_userId, permission) => requireAllowed(options.platform?.has(permission)),
    hasOrganizationPermission: async () => false,
    requireOrganizationPermission: async () => requireAllowed(false),
    hasVenuePermission: async () => false,
    requireVenuePermission: async () => requireAllowed(false),
    hasEventPermission: async (_userId, _eventId, permission) => Boolean(options.event?.has(permission)),
    requireEventPermission: async (_userId, _eventId, permission) => requireAllowed(options.event?.has(permission))
  }
}

function requireAllowed(allowed: boolean | undefined): void {
  if (!allowed) {
    throw new ApiHttpError(403, "FORBIDDEN", "Forbidden")
  }
}

function fakeEventsService(event: EventSummary | null = makeEvent("active")): ApiModuleServices["events"] {
  return {
    getById: async () => event,
    getPublicActiveEventByVenueSlug: async (venueSlug: string) =>
      venueSlug === "klub-x"
        ? {
            venue: { id: VENUE_ID, slug: "klub-x", name: "Klub X", city: "Warszawa", timezone: "Europe/Warsaw" },
            activeEvent: event
          }
        : null
  } as unknown as ApiModuleServices["events"]
}

function fakeOrganizationsService(): ApiModuleServices["organizations"] {
  return {} as ApiModuleServices["organizations"]
}

function fakeVenuesService(): ApiModuleServices["venues"] {
  return {} as ApiModuleServices["venues"]
}

function fakeAccessRequestsService(): ApiModuleServices["accessRequests"] {
  return {} as ApiModuleServices["accessRequests"]
}

function fakeDbResources(): DbResources {
  return {
    db: {
      execute: async () => []
    } as unknown as DbResources["db"],
    pool: {
      end: async () => undefined
    } as unknown as DbResources["pool"]
  }
}

function fakeAuth() {
  return {
    handler: async () => new Response(null, { status: 404 }),
    api: {
      getSession: async () => null
    }
  } as any
}

function testConfig(): ApiConfig {
  return {
    nodeEnv: "test",
    host: "127.0.0.1",
    port: 0,
    apiUrl: "http://127.0.0.1:0",
    publicWebUrl: "http://localhost:3000",
    dashboardWebUrl: "http://localhost:3001",
    databaseUrl: "postgres://poza_nuta:poza_nuta@localhost:5432/poza_nuta",
    authSecret: "test-only-poza-nuta-auth-secret-change-me",
    googleClientId: "test-google-client-id",
    googleClientSecret: "test-google-client-secret",
    participantTokenSecret: "test-only-participant-token-secret",
    publicRequestMaxActivePerParticipant: 3,
    publicRequestCooldownSeconds: 20,
    bootstrapPlatformOwnerEmail: "owner@example.com",
    logLevel: "silent"
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function assertAllowedSseCors(response: Response, origin: string): void {
  assert.match(response.headers.get("content-type") ?? "", /^text\/event-stream; charset=utf-8/)
  assert.equal(response.headers.get("access-control-allow-origin"), origin)
  assert.equal(response.headers.get("access-control-allow-credentials"), "true")
  assert.match(response.headers.get("vary") ?? "", /\bOrigin\b/)
}
