import assert from "node:assert/strict"
import type { AddressInfo } from "node:net"
import test from "node:test"
import { createApiApp, createLoggerConfig, type CreateApiAppOptions } from "../apps/api/src/app.ts"
import type { ApiConfig } from "../apps/api/src/config.ts"
import { createEventsService, type EventSummary } from "../apps/api/src/modules/events/service.ts"
import { createQueueService, type QueueSongRequest } from "../apps/api/src/modules/queue/service.ts"
import {
  createInMemoryDomainEventBus,
  type DomainEventBus,
  type DomainEventPayload
} from "../apps/api/src/plugins/eventBus.ts"
import type { ApiModuleServices } from "../apps/api/src/plugins/modules.ts"
import type { DbResources } from "../apps/api/src/plugins/db.ts"
import type {
  PermissionService,
  PlatformOwnerEventSupportAccessAuditInput
} from "../apps/api/src/permissions/service.ts"
import { startEventStream } from "../apps/api/src/modules/streams/eventStreams.ts"
import { ApiHttpError } from "../apps/api/src/errors.ts"
import type { DbClient } from "@poza-nuta/db"

const USER_ID = "11111111-1111-4111-8111-111111111111"
const VENUE_ID = "22222222-2222-4222-8222-222222222222"
const ORG_ID = "33333333-3333-4333-8333-333333333333"
const EVENT_ID = "44444444-4444-4444-8444-444444444444"
const EVENT_PUBLIC_ID = "sseEvent1"
const REQUEST_ID = "55555555-5555-4555-8555-555555555555"
const IMPORT_RUN_ID = "66666666-6666-4666-8666-666666666666"

test("public stream endpoint returns text/event-stream and cleans up subscriber on close", async () => {
  const app = await createTestApp()
  await app.listen({ host: "127.0.0.1", port: 0 })
  const port = (app.server.address() as AddressInfo).port
  const controller = new AbortController()
  try {
    const response = await fetch(`http://127.0.0.1:${port}/public/events/${EVENT_PUBLIC_ID}/stream`, {
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

test("public event and legacy venue streams omit internal identifiers from connected and event payloads", async () => {
  for (const path of [
    `/public/events/${EVENT_PUBLIC_ID}/stream`,
    "/public/venues/klub-x/stream"
  ]) {
    const app = await createTestApp()
    await app.listen({ host: "127.0.0.1", port: 0 })
    const port = (app.server.address() as AddressInfo).port
    const controller = new AbortController()
    try {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        headers: { Origin: "http://localhost:3000" },
        signal: controller.signal
      })
      const reader = response.body?.getReader()
      assert.ok(reader, "Expected SSE response body")
      const connectedFrame = await readUntilSseMarker(reader, "event: connected")

      app.eventBus.publish({
        type: "request.created",
        eventId: EVENT_ID,
        venueId: VENUE_ID,
        requestId: REQUEST_ID,
        at: "2026-06-27T10:00:00.000Z"
      })
      const eventFrame = await readUntilSseMarker(reader, "event: request.created")
      const payload = readSseEventData(eventFrame, "request.created")

      assert.equal(response.status, 200)
      assert.deepEqual(payload, {
        type: "request.created",
        at: "2026-06-27T10:00:00.000Z"
      })
      for (const internalValue of [EVENT_ID, VENUE_ID, REQUEST_ID]) {
        assert.equal(connectedFrame.includes(internalValue), false)
        assert.equal(eventFrame.includes(internalValue), false)
      }
      assert.equal("eventId" in payload, false)
      assert.equal("venueId" in payload, false)
      assert.equal("requestId" in payload, false)
      assert.equal("organizationId" in payload, false)
    } finally {
      controller.abort()
      await app.close()
    }
  }
})

test("dashboard stream keeps its authenticated internal event payload", async () => {
  const app = await createTestApp()
  await app.listen({ host: "127.0.0.1", port: 0 })
  const port = (app.server.address() as AddressInfo).port
  const controller = new AbortController()
  try {
    const response = await fetch(`http://127.0.0.1:${port}/dashboard/events/${EVENT_ID}/stream`, {
      headers: { Origin: "http://localhost:3001" },
      signal: controller.signal
    })
    const reader = response.body?.getReader()
    assert.ok(reader, "Expected SSE response body")
    await readUntilSseMarker(reader, "event: connected")

    app.eventBus.publish({
      type: "request.moved",
      eventId: EVENT_ID,
      venueId: VENUE_ID,
      requestId: REQUEST_ID,
      at: "2026-06-27T10:01:00.000Z"
    })
    const eventFrame = await readUntilSseMarker(reader, "event: request.moved")

    assert.deepEqual(readSseEventData(eventFrame, "request.moved"), {
      type: "request.moved",
      eventId: EVENT_ID,
      venueId: VENUE_ID,
      requestId: REQUEST_ID,
      at: "2026-06-27T10:01:00.000Z"
    })
  } finally {
    controller.abort()
    await app.close()
  }
})

test("event stream writes heartbeat comments and cleans up after disconnect", async () => {
  const app = await createTestApp()
  const channel = app.eventBus.eventChannel(EVENT_ID)
  app.get("/test/sse-heartbeat", async (_request, reply) =>
    startEventStream(app, reply, {
      channel,
      connected: { scope: "test.heartbeat" },
      heartbeatIntervalMs: 5
    })
  )
  await app.listen({ host: "127.0.0.1", port: 0 })
  const port = (app.server.address() as AddressInfo).port
  const controller = new AbortController()
  try {
    const response = await fetch(`http://127.0.0.1:${port}/test/sse-heartbeat`, {
      signal: controller.signal
    })
    const reader = response.body?.getReader()
    assert.ok(reader, "Expected SSE response body")

    assert.match(await readUntilSseMarker(reader, ": ping"), /: ping\n\n/)
    assert.equal(app.eventBus.subscriberCount(channel), 1)

    controller.abort()
    await waitFor(() => app.eventBus.subscriberCount(channel) === 0)
  } finally {
    controller.abort()
    await app.close()
  }
})

test("public stream lifecycle logs open and close without changing connected event", async () => {
  const lines: string[] = []
  const config = testConfig({ logLevel: "debug", nodeEnv: "development" })
  const app = await createTestApp({
    config,
    logger: captureLogger(config, lines)
  })
  await app.listen({ host: "127.0.0.1", port: 0 })
  const port = (app.server.address() as AddressInfo).port
  const controller = new AbortController()
  try {
    const response = await fetch(`http://127.0.0.1:${port}/public/events/${EVENT_PUBLIC_ID}/stream`, {
      headers: {
        Cookie: "pn_participant=participant-token-secret",
        Origin: "http://localhost:3000"
      },
      signal: controller.signal
    })
    const firstChunk = await readFirstChunk(response)

    assert.equal(response.status, 200)
    assertAllowedSseCors(response, "http://localhost:3000")
    assert.match(firstChunk, /^event: connected/m)
    assert.match(firstChunk, /"scope":"public\.event"/)

    controller.abort()
    await waitFor(() => lines.some((line) => line.includes("sse_stream_close")))
  } finally {
    controller.abort()
    await app.close()
  }

  const openLog = parseLogLine(lines.find((line) => line.includes("sse_stream_open")) ?? "")
  const closeLog = parseLogLine(lines.find((line) => line.includes("sse_stream_close")) ?? "")
  const allLogs = lines.join("")
  assert.equal(openLog.event, "sse_stream_open")
  assert.equal(openLog.operation, "open")
  assert.equal(openLog.scope, "public.event")
  assert.equal(openLog.eventPublicId, EVENT_PUBLIC_ID)
  assert.equal(closeLog.event, "sse_stream_close")
  assert.equal(closeLog.operation, "close")
  assert.equal(typeof closeLog.durationMs, "number")
  assert.equal(allLogs.includes("queue.updated"), false)
  assert.equal(allLogs.includes("participant-token-secret"), false)
  assert.equal(allLogs.includes("pn_participant"), false)
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

test("public and dashboard streams use app event bus override", async () => {
  const baseBus = createInMemoryDomainEventBus()
  const subscribedChannels: string[] = []
  let closeCalls = 0
  const eventBus: DomainEventBus = {
    ...baseBus,
    subscribe(channel, listener) {
      subscribedChannels.push(channel)
      return baseBus.subscribe(channel, listener)
    },
    close() {
      closeCalls += 1
      baseBus.close?.()
    }
  }
  const app = await createTestApp({ eventBus })
  await app.listen({ host: "127.0.0.1", port: 0 })
  const port = (app.server.address() as AddressInfo).port
  const publicController = new AbortController()
  const dashboardController = new AbortController()
  try {
    const publicResponse = await fetch(`http://127.0.0.1:${port}/public/events/${EVENT_PUBLIC_ID}/stream`, {
      headers: {
        Origin: "http://localhost:3000"
      },
      signal: publicController.signal
    })
    const dashboardResponse = await fetch(`http://127.0.0.1:${port}/dashboard/events/${EVENT_ID}/stream`, {
      headers: {
        Origin: "http://localhost:3001"
      },
      signal: dashboardController.signal
    })

    assert.equal(publicResponse.status, 200)
    assert.equal(dashboardResponse.status, 200)
    assert.equal(subscribedChannels.filter((channel) => channel === app.eventBus.eventChannel(EVENT_ID)).length, 2)
  } finally {
    publicController.abort()
    dashboardController.abort()
    await app.close()
  }

  assert.equal(closeCalls, 1)
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
    const response = await app.inject({ method: "GET", url: `/public/events/${EVENT_PUBLIC_ID}/stream` })

    assert.equal(response.statusCode, 403)
    assert.equal(response.json().error.code, "FORBIDDEN")
    assert.equal(response.json().error.message, "Public queue is disabled for this event")
    assert.equal(app.eventBus.subscriberCount(app.eventBus.eventChannel(EVENT_ID)), 0)
  } finally {
    await app.close()
  }
})

test("private event stream returns controlled not found without subscribing", async () => {
  const app = await createTestApp({
    event: makeEvent("active", "private")
  })
  try {
    const response = await app.inject({ method: "GET", url: `/public/events/${EVENT_PUBLIC_ID}/stream` })

    assert.equal(response.statusCode, 404)
    assert.equal(response.json().error.code, "NOT_FOUND")
    assert.equal(response.json().error.message, "Missing event")
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
      const response = await app.inject({ method: "GET", url: `/public/events/${EVENT_PUBLIC_ID}/stream` })

      assert.equal(response.statusCode, 409)
      assert.equal(response.json().error.code, "CONFLICT")
      assert.equal(response.json().error.message, "Queue is not active for this event")
      assert.equal(app.eventBus.subscriberCount(app.eventBus.eventChannel(EVENT_ID)), 0)
    } finally {
      await app.close()
    }
  }
})

test("event-id public stream hides events from non-public venues and organizations", async () => {
  for (const publicContext of [
    { venueStatus: "draft" },
    { venueStatus: "archived" },
    { venueVerificationStatus: "pending" },
    { venueVerificationStatus: "rejected" },
    { organizationStatus: "pending" },
    { organizationStatus: "archived" }
  ]) {
    const app = await createTestApp({ publicContext })
    try {
      const response = await app.inject({ method: "GET", url: `/public/events/${EVENT_PUBLIC_ID}/stream` })

      assert.equal(response.statusCode, 404)
      assert.equal(response.json().error.code, "NOT_FOUND")
      assert.equal(response.json().error.message, "Missing event")
      assert.equal(response.headers["content-type"], "application/json; charset=utf-8")
      assert.equal(app.eventBus.subscriberCount(app.eventBus.eventChannel(EVENT_ID)), 0)
    } finally {
      await app.close()
    }
  }
})

test("venue-first public stream uses the shared venue and organization visibility policy", async () => {
  for (const publicContext of [
    { venueStatus: "draft" },
    { venueStatus: "archived" },
    { venueVerificationStatus: "pending" },
    { venueVerificationStatus: "rejected" },
    { organizationStatus: "pending" },
    { organizationStatus: "archived" }
  ]) {
    const app = await createTestApp({ publicContext })
    try {
      const response = await app.inject({ method: "GET", url: "/public/venues/klub-x/stream" })

      assert.equal(response.statusCode, 404)
      assert.equal(response.json().error.code, "NOT_FOUND")
      assert.equal(response.json().error.message, "Missing event")
      assert.equal(response.headers["content-type"], "application/json; charset=utf-8")
      assert.equal(app.eventBus.subscriberCount(app.eventBus.eventChannel(EVENT_ID)), 0)
    } finally {
      await app.close()
    }
  }
})

test("venue-first public stream uses the shared event status and public queue flag policy", async () => {
  for (const status of ["archived", "cancelled"]) {
    const app = await createTestApp({ event: makeEvent(status) })
    try {
      const response = await app.inject({ method: "GET", url: "/public/venues/klub-x/stream" })

      assert.equal(response.statusCode, 409)
      assert.equal(response.json().error.code, "CONFLICT")
      assert.equal(response.json().error.message, "Queue is not active for this event")
      assert.equal(app.eventBus.subscriberCount(app.eventBus.eventChannel(EVENT_ID)), 0)
    } finally {
      await app.close()
    }
  }

  const app = await createTestApp({
    event: {
      ...makeEvent("active"),
      publicQueueEnabled: false
    }
  })
  try {
    const response = await app.inject({ method: "GET", url: "/public/venues/klub-x/stream" })

    assert.equal(response.statusCode, 403)
    assert.equal(response.json().error.code, "FORBIDDEN")
    assert.equal(response.json().error.message, "Public queue is disabled for this event")
    assert.equal(app.eventBus.subscriberCount(app.eventBus.eventChannel(EVENT_ID)), 0)
  } finally {
    await app.close()
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

test("dashboard stream allows platform owner support access", async () => {
  const supportAccessAudit: PlatformOwnerEventSupportAccessAuditInput[] = []
  const app = await createTestApp({ permissions: fakePermissions({ platformOwner: true, supportAccessAudit }) })
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
    assert.deepEqual(supportAccessAudit.map((entry) => entry.operation), ["dashboard.queue.stream"])
    assert.equal(supportAccessAudit[0].eventId, EVENT_ID)
    assert.equal(supportAccessAudit[0].userId, USER_ID)
  } finally {
    controller.abort()
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

test("request submit queue move and lifecycle change reach the public SSE stream", async () => {
  const eventBus = createInMemoryDomainEventBus()
  const app = await createTestApp({ eventBus })
  await app.listen({ host: "127.0.0.1", port: 0 })
  const port = (app.server.address() as AddressInfo).port
  const controller = new AbortController()
  try {
    const response = await fetch(`http://127.0.0.1:${port}/public/events/${EVENT_PUBLIC_ID}/stream`, {
      headers: { Origin: "http://localhost:3000" },
      signal: controller.signal
    })
    const reader = response.body?.getReader()
    assert.ok(reader, "Expected SSE response body")
    await readUntilSseMarker(reader, "event: connected")

    const submitQueue = createQueueService(fakeDbForSubmit(), eventBus, {
      maxActivePerParticipant: 3,
      cooldownSeconds: 20
    })
    await submitQueue.submitPublicRequest(EVENT_ID, {
      singerName: "Michał",
      participantTokenHash: "participant-token-hash",
      sourceId: "ising",
      sourceTrackId: "9053",
      songTitle: "Królowa Łez",
      songArtist: "Agnieszka Chylińska"
    })
    assert.match(await readUntilSseMarker(reader, "event: request.created"), /event: request\.created/)

    const moveQueue = createQueueService(fakeDbForMove(), eventBus)
    await moveQueue.moveRequest(EVENT_ID, REQUEST_ID, 2, USER_ID)
    assert.match(await readUntilSseMarker(reader, "event: request.moved"), /event: request\.moved/)

    const events = createEventsService(fakeDbForLifecycle("active", "paused"), eventBus)
    await events.changeLifecycle(EVENT_ID, "pause", USER_ID)
    assert.match(await readUntilSseMarker(reader, "event: event.paused"), /event: event\.paused/)
  } finally {
    controller.abort()
    await app.close()
  }
})

test("event lifecycle changes publish lifecycle and queue update events", async () => {
  for (const scenario of [
    { action: "start", from: "scheduled", to: "active", eventType: "event.started" },
    { action: "pause", from: "active", to: "paused", eventType: "event.paused" },
    { action: "resume", from: "paused", to: "active", eventType: "event.resumed" },
    { action: "close", from: "active", to: "closed", eventType: "event.closed" }
  ] as const) {
    const bus = createInMemoryDomainEventBus()
    const received: DomainEventPayload[] = []
    bus.subscribeToEvent(EVENT_ID, (event) => received.push(event))
    const events = createEventsService(fakeDbForLifecycle(scenario.from, scenario.to), bus)

    await events.changeLifecycle(EVENT_ID, scenario.action, USER_ID)

    assert.deepEqual(
      received.map((event) => event.type),
      [scenario.eventType, "queue.updated"]
    )
  }
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

async function createTestApp(options: {
  authenticated?: boolean
  config?: ApiConfig
  permissions?: PermissionService
  eventBus?: DomainEventBus
  event?: EventSummary | null
  logger?: CreateApiAppOptions["logger"]
  publicContext?: {
    venueStatus?: string
    venueVerificationStatus?: string
    organizationStatus?: string
  }
} = {}) {
  const appOptions: CreateApiAppOptions = {
    config: options.config ?? testConfig(),
    db: fakeDbResources(options.event ?? makeEvent("active"), options.publicContext),
    auth: fakeAuth(),
    permissions: options.permissions ?? fakePermissions({ event: new Set(["event.view_stats"]), platform: new Set(["platform.manage_catalog"]) }),
    services: {
      organizations: fakeOrganizationsService(),
      venues: fakeVenuesService(),
      events: fakeEventsService(options.event),
      accessRequests: fakeAccessRequestsService()
    },
    logger: options.logger ?? false
  }
  if (options.authenticated !== false) {
    appOptions.currentUserResolver = async () => ({ id: USER_ID, email: "user@example.com", name: "User", status: "active" })
  }
  if (options.eventBus !== undefined) {
    appOptions.eventBus = options.eventBus
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
        return queryChain([eventContext()])
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

function fakeDbForSubmit(): DbClient {
  const request = {
    ...makeRequest("pending"),
    participantTokenHash: "participant-token-hash"
  }
  let selectCount = 0
  let insertCount = 0
  return {
    execute: async () => [],
    select: () => {
      selectCount += 1
      if (selectCount === 1) {
        return queryChain([eventContext()])
      }
      if (selectCount === 2) {
        return queryChain([{ id: "ising" }])
      }
      return queryChain([])
    },
    insert: () => ({
      values: () => {
        insertCount += 1
        return insertCount === 1
          ? {
              returning: () => [request]
            }
          : undefined
      }
    })
  } as unknown as DbClient
}

function fakeDbForMove(): DbClient {
  const request = { ...makeRequest("approved"), position: 1 }
  const nextRequest = {
    ...makeRequest("approved"),
    id: "77777777-7777-4777-8777-777777777777",
    position: 2
  }
  let selectCount = 0
  return {
    execute: async () => [],
    select: () => {
      selectCount += 1
      if (selectCount === 1) {
        return queryChain([eventContext()])
      }
      if (selectCount === 2 || selectCount === 4) {
        return queryChain([request])
      }
      if (selectCount === 3) {
        return queryChain([request, nextRequest])
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

function fakeDbForLifecycle(from: string, to: string): DbClient {
  const event = makeEvent(from)
  const updated = makeEvent(to)
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
      publicId: EVENT_PUBLIC_ID,
      venueId: VENUE_ID,
      operatedByOrganizationId: ORG_ID,
      name: "SSE Event",
      status: "active",
      visibility: "public",
      publicJoinEnabled: true,
      publicQueueEnabled: true,
      joinAccessMode: "open"
    },
    venue: {
      id: VENUE_ID,
      name: "Klub X",
      slug: "klub-x",
      status: "active",
      verificationStatus: "verified"
    },
    organization: {
      id: ORG_ID,
      status: "active"
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

function makeEvent(
  status: string,
  visibility: "public" | "unlisted" | "private" = "public"
): EventSummary {
  return {
    id: EVENT_ID,
    publicId: "sseEvent1",
    venueId: VENUE_ID,
    operatedByOrganizationId: ORG_ID,
    createdByUserId: USER_ID,
    name: "SSE Event",
    slug: "sse-event",
    status,
    visibility,
    startsAt: null,
    endsAt: null,
    publicJoinEnabled: true,
    publicQueueEnabled: true,
    joinAccessMode: "open"
  }
}

function fakePermissions(options: {
  event?: Set<string>
  platform?: Set<string>
  platformOwner?: boolean
  supportAccessAudit?: PlatformOwnerEventSupportAccessAuditInput[]
} = {}): PermissionService {
  const hasPlatformSupportAccess = options.platformOwner === true
  return {
    hasPlatformPermission: async (_userId, permission) => Boolean(options.platform?.has(permission)),
    requirePlatformPermission: async (_userId, permission) => requireAllowed(options.platform?.has(permission)),
    hasOrganizationPermission: async () => false,
    requireOrganizationPermission: async () => requireAllowed(false),
    hasVenuePermission: async () => false,
    requireVenuePermission: async () => requireAllowed(false),
    hasEventPermission: async (_userId, _eventId, permission) => Boolean(options.event?.has(permission)),
    requireEventPermission: async (_userId, _eventId, permission) => requireAllowed(options.event?.has(permission)),
    hasPlatformOwnerEventSupportAccess: async (userId, eventId, permission, operation) => {
      if (hasPlatformSupportAccess) {
        options.supportAccessAudit?.push({ eventId, operation, permission, userId })
      }
      return hasPlatformSupportAccess
    },
    requirePlatformOwnerEventSupportAccess: async () => requireAllowed(hasPlatformSupportAccess)
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
    resolvePublicEventByPublicId: async (eventPublicId: string) =>
      event && event.publicId === eventPublicId && event.visibility !== "private"
        ? {
            id: event.id,
            publicId: event.publicId,
            venueId: event.venueId,
            status: event.status,
            visibility: event.visibility,
            publicJoinEnabled: event.publicJoinEnabled,
            publicQueueEnabled: event.publicQueueEnabled,
            joinAccessMode: event.joinAccessMode
          }
        : null,
    getPublicActiveEventByVenueSlug: async (venueSlug: string) =>
      venueSlug === "klub-x"
        ? {
            venue: { id: VENUE_ID, slug: "klub-x", name: "Klub X", city: "Warszawa", timezone: "Europe/Warsaw" },
            activeEvent: event?.visibility === "public" ? event : null
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

function fakeDbResources(
  event: EventSummary,
  publicContext: {
    venueStatus?: string
    venueVerificationStatus?: string
    organizationStatus?: string
  } = {}
): DbResources {
  let selectCount = 0
  return {
    db: {
      execute: async () => [],
      select: () => {
        selectCount += 1
        if (selectCount === 1) {
          return queryChain([
            {
              event: {
                id: event.id,
                publicId: event.publicId,
                venueId: event.venueId,
                operatedByOrganizationId: event.operatedByOrganizationId,
                name: event.name,
                status: event.status,
                visibility: event.visibility,
                publicJoinEnabled: event.publicJoinEnabled,
                publicQueueEnabled: event.publicQueueEnabled,
                joinAccessMode: event.joinAccessMode
              },
              venue: {
                id: VENUE_ID,
                name: "Klub X",
                slug: "klub-x",
                status: publicContext.venueStatus ?? "active",
                verificationStatus: publicContext.venueVerificationStatus ?? "verified"
              },
              organization: {
                id: ORG_ID,
                status: publicContext.organizationStatus ?? "active"
              }
            }
          ])
        }

        return queryChain([])
      }
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

function testConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    nodeEnv: "test",
    host: "127.0.0.1",
    port: 0,
    apiUrl: "http://127.0.0.1:0",
    publicWebUrl: "http://localhost:3000",
    dashboardWebUrl: "http://localhost:3001",
    databaseUrl: "postgres://poza_nuta:poza_nuta@localhost:5432/poza_nuta",
    databasePoolMax: 10,
    databaseIdleTimeoutMs: 30_000,
    databaseConnectionTimeoutMs: 5_000,
    databaseStatementTimeoutMs: 15_000,
    databaseLockTimeoutMs: 5_000,
    databaseApplicationName: "stagequeue-api",
    authSecret: "test-only-poza-nuta-auth-secret-change-me",
    googleClientId: "test-google-client-id",
    googleClientSecret: "test-google-client-secret",
    participantTokenSecret: "test-only-participant-token-secret",
    publicRequestMaxActivePerParticipant: 3,
    publicRequestCooldownSeconds: 20,
    bootstrapPlatformOwnerEmail: "owner@example.com",
    platformSetupEnabled: true,
    platformSetupToken: "test-platform-setup-token",
    logLevel: "silent",
    ...overrides
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function readFirstChunk(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  assert.ok(reader, "Expected SSE response body")
  const chunk = await reader.read()
  assert.equal(chunk.done, false)
  return new TextDecoder().decode(chunk.value)
}

async function readUntilSseMarker(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  marker: string
): Promise<string> {
  const decoder = new TextDecoder()
  let content = ""
  const timeoutAt = Date.now() + 1_000

  while (!content.includes(marker)) {
    if (Date.now() >= timeoutAt) {
      throw new Error(`Timed out waiting for SSE marker: ${marker}`)
    }
    const remainingMs = timeoutAt - Date.now()
    const chunk = await readStreamChunk(reader, remainingMs, marker)
    if (chunk.done) {
      throw new Error(`SSE stream ended before marker: ${marker}`)
    }
    content += decoder.decode(chunk.value, { stream: true })
  }

  return content
}

async function readStreamChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number,
  marker: string
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timed out waiting for SSE marker: ${marker}`)), timeoutMs)
      })
    ])
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout)
    }
  }
}

function readSseEventData(content: string, eventName: string): Record<string, unknown> {
  const frame = content
    .split("\n\n")
    .find((candidate) => candidate.split("\n").includes(`event: ${eventName}`))
  assert.ok(frame, `Expected SSE event frame: ${eventName}`)
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice("data: ".length))
    .join("\n")
  return JSON.parse(data) as Record<string, unknown>
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const startedAt = Date.now()
  while (!predicate()) {
    if (Date.now() - startedAt > 500) {
      throw new Error("Timed out waiting for assertion")
    }
    await delay(1)
  }
}

function assertAllowedSseCors(response: Response, origin: string): void {
  assert.match(response.headers.get("content-type") ?? "", /^text\/event-stream; charset=utf-8/)
  assert.equal(response.headers.get("access-control-allow-origin"), origin)
  assert.equal(response.headers.get("access-control-allow-credentials"), "true")
  assert.match(response.headers.get("vary") ?? "", /\bOrigin\b/)
}

function captureLogger(config: ApiConfig, lines: string[]) {
  const loggerConfig = createLoggerConfig(config)
  assert.notEqual(loggerConfig, false)
  return {
    ...(loggerConfig as Record<string, unknown>),
    stream: {
      write: (line: string) => lines.push(line)
    }
  } as never
}

function parseLogLine(line: string): Record<string, unknown> {
  return JSON.parse(line) as Record<string, unknown>
}
