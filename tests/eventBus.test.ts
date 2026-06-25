import assert from "node:assert/strict"
import test from "node:test"
import type { ApiConfig } from "../apps/api/src/config.ts"
import {
  createDomainEventBus,
  createInMemoryDomainEventBus,
  createRedisDomainEventBus,
  type DomainEventPayload
} from "../apps/api/src/plugins/eventBus.ts"

const EVENT_ID = "event-a"
const OTHER_EVENT_ID = "event-b"
const VENUE_ID = "venue-a"
const REDIS_URL = "redis://redis.internal:6379"

test("createDomainEventBus chooses Redis adapter when Redis URL is configured", async () => {
  const clients: FakeRedisClient[] = []
  const bus = createDomainEventBus(testConfig({ redisUrl: REDIS_URL }), {
    createRedisClient: (url) => {
      const client = new FakeRedisClient(url)
      clients.push(client)
      return client
    }
  })

  try {
    assert.equal(clients.length, 2)
    bus.publish({ type: "queue.updated", eventId: EVENT_ID, venueId: VENUE_ID, at: "2026-06-25T10:00:00.000Z" })
    await waitFor(() => clients[0].published.length === 1)
    assert.equal(clients[0].published[0].channel, "event:event-a")
  } finally {
    await bus.close?.()
  }
})

test("createDomainEventBus chooses in-memory adapter without Redis URL in non-production", () => {
  const bus = createDomainEventBus(testConfig())
  const received: DomainEventPayload[] = []

  bus.subscribeToEvent(EVENT_ID, (event) => received.push(event))
  bus.publish({ type: "queue.updated", eventId: EVENT_ID, venueId: VENUE_ID })

  assert.equal(received.length, 1)
  assert.equal(received[0].type, "queue.updated")
})

test("Redis event bus uses one publisher and one subscriber client", async () => {
  const { bus, clients } = createFakeRedisBus()

  try {
    assert.equal(clients.length, 2)
  } finally {
    await bus.close?.()
  }
})

test("Redis event bus subscribes to Redis only once for the first channel listener", async () => {
  const { bus, subscriber } = createFakeRedisBus()

  try {
    const unsubscribeA = bus.subscribeToEvent(EVENT_ID, () => undefined)
    const unsubscribeB = bus.subscribeToEvent(EVENT_ID, () => undefined)

    await waitFor(() => subscriber.subscribeCalls.length === 1)
    assert.deepEqual(subscriber.subscribeCalls, ["event:event-a"])

    unsubscribeA()
    await delay(0)
    assert.equal(subscriber.unsubscribeCalls.length, 0)

    unsubscribeB()
    await waitFor(() => subscriber.unsubscribeCalls.length === 1)
    assert.deepEqual(subscriber.unsubscribeCalls, ["event:event-a"])
  } finally {
    await bus.close?.()
  }
})

test("Redis event bus publish serializes events as JSON on the target channel", async () => {
  const { bus, publisher } = createFakeRedisBus()
  const event = {
    type: "request.approved" as const,
    eventId: EVENT_ID,
    venueId: VENUE_ID,
    requestId: "request-a",
    at: "2026-06-25T10:00:00.000Z"
  }

  try {
    bus.publish(event)

    await waitFor(() => publisher.published.length === 1)
    assert.equal(publisher.published[0].channel, "event:event-a")
    assert.deepEqual(JSON.parse(publisher.published[0].message), event)
  } finally {
    await bus.close?.()
  }
})

test("Redis event bus message handler dispatches only listeners for the received channel", async () => {
  const { bus, subscriber } = createFakeRedisBus()
  const receivedA: DomainEventPayload[] = []
  const receivedB: DomainEventPayload[] = []
  const event = {
    type: "queue.updated" as const,
    eventId: EVENT_ID,
    venueId: VENUE_ID,
    at: "2026-06-25T10:00:00.000Z"
  }

  try {
    bus.subscribeToEvent(EVENT_ID, (payload) => receivedA.push(payload))
    bus.subscribeToEvent(OTHER_EVENT_ID, (payload) => receivedB.push(payload))
    await waitFor(() => subscriber.subscribeCalls.length === 2)

    subscriber.emit("event:event-a", JSON.stringify(event))

    assert.deepEqual(receivedA, [event])
    assert.equal(receivedB.length, 0)
  } finally {
    await bus.close?.()
  }
})

test("Redis event bus ignores invalid JSON without crashing", async () => {
  const errors: unknown[] = []
  const { bus, subscriber } = createFakeRedisBus({ errors })
  const received: DomainEventPayload[] = []

  try {
    bus.subscribeToEvent(EVENT_ID, (payload) => received.push(payload))
    await waitFor(() => subscriber.subscribeCalls.length === 1)

    assert.doesNotThrow(() => subscriber.emit("event:event-a", "{not-json"))
    assert.equal(received.length, 0)
    assert.equal(errors.length, 1)
  } finally {
    await bus.close?.()
  }
})

test("Redis event bus close shuts down publisher and subscriber clients", async () => {
  const { bus, publisher, subscriber } = createFakeRedisBus()

  await bus.close?.()

  assert.equal(publisher.quitCalls, 1)
  assert.equal(subscriber.quitCalls, 1)
  assert.equal(publisher.destroyCalls, 1)
  assert.equal(subscriber.destroyCalls, 1)
})

test("Redis event bus close is safe without active subscriptions", async () => {
  const { bus, publisher, subscriber } = createFakeRedisBus()

  await assert.doesNotReject(async () => bus.close?.())
  assert.equal(publisher.quitCalls, 1)
  assert.equal(subscriber.quitCalls, 1)
})

test("Redis event bus close is idempotent", async () => {
  const { bus, publisher, subscriber } = createFakeRedisBus()

  await bus.close?.()
  await bus.close?.()

  assert.equal(publisher.quitCalls, 1)
  assert.equal(subscriber.quitCalls, 1)
  assert.equal(publisher.destroyCalls, 1)
  assert.equal(subscriber.destroyCalls, 1)
})

function createFakeRedisBus(options: { errors?: unknown[] } = {}) {
  const clients: FakeRedisClient[] = []
  const bus = createRedisDomainEventBus(REDIS_URL, {
    createRedisClient: (url) => {
      const client = new FakeRedisClient(url)
      clients.push(client)
      return client
    },
    onError: (error) => options.errors?.push(error)
  })

  return {
    bus,
    clients,
    publisher: clients[0],
    subscriber: clients[1]
  }
}

class FakeRedisClient {
  readonly url: string
  readonly published: Array<{ channel: string; message: string }> = []
  readonly subscribeCalls: string[] = []
  readonly unsubscribeCalls: string[] = []
  readonly listeners = new Map<string, (message: string, channel: string) => void>()
  connectCalls = 0
  quitCalls = 0
  destroyCalls = 0

  constructor(url: string) {
    this.url = url
  }

  async connect(): Promise<void> {
    this.connectCalls += 1
  }

  async publish(channel: string, message: string): Promise<void> {
    this.published.push({ channel, message })
  }

  async subscribe(channel: string, listener: (message: string, channel: string) => void): Promise<void> {
    this.subscribeCalls.push(channel)
    this.listeners.set(channel, listener)
  }

  async unsubscribe(channel: string): Promise<void> {
    this.unsubscribeCalls.push(channel)
    this.listeners.delete(channel)
  }

  async quit(): Promise<void> {
    this.quitCalls += 1
  }

  destroy(): void {
    this.destroyCalls += 1
  }

  emit(channel: string, message: string): void {
    this.listeners.get(channel)?.(message, channel)
  }
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
    platformSetupEnabled: true,
    logLevel: "silent",
    ...overrides
  }
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

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}
