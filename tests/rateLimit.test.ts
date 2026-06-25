import assert from "node:assert/strict"
import test from "node:test"
import { createApiApp } from "../apps/api/src/app.ts"
import type { ApiConfig } from "../apps/api/src/config.ts"
import {
  createRedisRateLimitResources,
  type RedisRateLimitClient
} from "../apps/api/src/plugins/rateLimit.ts"
import type { DbResources } from "../apps/api/src/plugins/db.ts"
import { createInMemoryDomainEventBus } from "../apps/api/src/plugins/eventBus.ts"

const REDIS_URL = "redis://redis.internal:6379"

test("registerRateLimit keeps in-memory rate limiting without Redis URL in non-production", async () => {
  let redisClientCreates = 0
  const app = await createApiApp({
    config: testConfig(),
    db: fakeDbResources(),
    auth: fakeAuth(),
    logger: false,
    rateLimit: {
      createRedisClient: () => {
        redisClientCreates += 1
        throw new Error("Redis client should not be created")
      }
    }
  })

  try {
    assert.equal((await app.inject("/health")).statusCode, 200)
    assert.equal(redisClientCreates, 0)
  } finally {
    await app.close()
  }
})

test("registerRateLimit uses Redis store when Redis URL is configured", async () => {
  const { createRedisClient, clients } = createFakeRedisFactory()
  const app = await createApiApp({
    config: testConfig({ redisUrl: REDIS_URL }),
    db: fakeDbResources(),
    auth: fakeAuth(),
    eventBus: createInMemoryDomainEventBus(),
    logger: false,
    rateLimit: { createRedisClient }
  })

  try {
    const first = await app.inject("/health")

    assert.equal(clients.length, 1)
    assert.equal(clients[0].connectCalls, 1)
    assert.equal(clients[0].evalCalls.length, 1)
    assert.equal(first.statusCode, 200)
  } finally {
    await app.close()
  }
})

test("Redis rate limit child store reuses client and scopes route prefixes", async () => {
  const { createRedisClient, clients } = createFakeRedisFactory()
  const resources = createRedisRateLimitResources(REDIS_URL, { createRedisClient })
  const rootStore = new resources.store({ continueExceeding: false, exponentialBackoff: false })
  const childStore = rootStore.child({
    continueExceeding: false,
    exponentialBackoff: false,
    routeInfo: { method: "POST", url: "/public/events/:eventPublicId/requests" }
  })

  try {
    const root = await increment(rootStore, "127.0.0.1:event-a", 60_000, 300)
    const child = await increment(childStore, "127.0.0.1:event-a", 60_000, 5)

    assert.equal(clients.length, 1)
    assert.equal(root.current, 1)
    assert.equal(child.current, 1)
    assert.notEqual(clients[0].evalCalls[0].key, clients[0].evalCalls[1].key)
    assert.match(clients[0].evalCalls[1].key, /POST\/public\/events\/:eventPublicId\/requests/)
  } finally {
    await resources.close()
  }
})

test("Redis rate limit increments deterministically and isolates different keys", async () => {
  const { createRedisClient } = createFakeRedisFactory()
  const resources = createRedisRateLimitResources(REDIS_URL, { createRedisClient })
  const store = new resources.store({ continueExceeding: false, exponentialBackoff: false })

  try {
    const first = await increment(store, "same-key", 60_000, 2)
    const second = await increment(store, "same-key", 60_000, 2)
    const third = await increment(store, "same-key", 60_000, 2)
    const other = await increment(store, "other-key", 60_000, 2)

    assert.deepEqual(
      [first.current, second.current, third.current],
      [1, 2, 3]
    )
    assert.equal(first.ttl > 0, true)
    assert.equal(third.current > 2, true)
    assert.equal(other.current, 1)
    assert.equal(other.ttl > 0, true)
  } finally {
    await resources.close()
  }
})

test("Redis rate limit window reset starts the count again", async () => {
  const { createRedisClient, clients } = createFakeRedisFactory()
  const resources = createRedisRateLimitResources(REDIS_URL, { createRedisClient })
  const store = new resources.store({ continueExceeding: false, exponentialBackoff: false })

  try {
    const first = await increment(store, "reset-key", 1_000, 2)
    clients[0].advance(1_001)
    const afterWindow = await increment(store, "reset-key", 1_000, 2)

    assert.equal(first.current, 1)
    assert.equal(afterWindow.current, 1)
    assert.equal(afterWindow.ttl > 0, true)
  } finally {
    await resources.close()
  }
})

test("Redis rate limit errors fail closed with controlled production error", async () => {
  const { createRedisClient, clients } = createFakeRedisFactory({ failEval: true })
  const app = await createApiApp({
    config: testConfig({ nodeEnv: "production", redisUrl: REDIS_URL }),
    db: fakeDbResources(),
    auth: fakeAuth(),
    eventBus: createInMemoryDomainEventBus(),
    logger: false,
    rateLimit: { createRedisClient }
  })

  try {
    const response = await app.inject("/health")
    const body = response.json()

    assert.equal(response.statusCode, 500)
    assert.equal(body.error.code, "INTERNAL_SERVER_ERROR")
    assert.equal(body.error.message, "Internal server error")
    assert.equal(JSON.stringify(body).includes("stack"), false)
    assert.equal(JSON.stringify(body).includes(REDIS_URL), false)
    assert.equal(clients.length, 1)
    assert.equal(clients[0].evalCalls.length, 1)
  } finally {
    await app.close()
  }
})

test("Redis rate limit cleanup closes one shared client and is idempotent", async () => {
  const { createRedisClient, clients } = createFakeRedisFactory()
  const resources = createRedisRateLimitResources(REDIS_URL, { createRedisClient })
  const store = new resources.store({ continueExceeding: false, exponentialBackoff: false })

  await increment(store, "same-key", 60_000, 1)
  await resources.close()
  await resources.close()

  assert.equal(clients.length, 1)
  assert.equal(clients[0].quitCalls, 1)
  assert.equal(clients[0].destroyCalls, 1)
})

test("Fastify app close runs Redis rate limit cleanup", async () => {
  const { createRedisClient, clients } = createFakeRedisFactory()
  const app = await createApiApp({
    config: testConfig({ redisUrl: REDIS_URL }),
    db: fakeDbResources(),
    auth: fakeAuth(),
    eventBus: createInMemoryDomainEventBus(),
    logger: false,
    rateLimit: { createRedisClient }
  })

  await app.inject("/health")
  await app.close()

  assert.equal(clients.length, 1)
  assert.equal(clients[0].quitCalls, 1)
  assert.equal(clients[0].destroyCalls, 1)
})

function increment(
  store: { incr(key: string, callback: (error: Error | null, result?: { current: number; ttl: number }) => void, timeWindow?: number, max?: number): void },
  key: string,
  timeWindow: number,
  max: number
): Promise<{ current: number; ttl: number }> {
  return new Promise((resolve, reject) => {
    store.incr(
      key,
      (error, result) => {
        if (error) {
          reject(error)
          return
        }
        if (!result) {
          reject(new Error("Missing rate limit result"))
          return
        }
        resolve(result)
      },
      timeWindow,
      max
    )
  })
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

function createFakeRedisFactory(options: { failEval?: boolean } = {}) {
  const clients: FakeRedisRateLimitClient[] = []
  return {
    clients,
    createRedisClient: (url: string) => {
      const client = new FakeRedisRateLimitClient(url, options)
      clients.push(client)
      return client
    }
  }
}

class FakeRedisRateLimitClient implements RedisRateLimitClient {
  readonly evalCalls: Array<{ script: string; key: string; arguments: string[] }> = []
  readonly counters = new Map<string, { current: number; expiresAt: number }>()
  readonly url: string
  private readonly options: { failEval?: boolean }
  connectCalls = 0
  quitCalls = 0
  destroyCalls = 0
  now = 0

  constructor(url: string, options: { failEval?: boolean } = {}) {
    this.url = url
    this.options = options
  }

  async connect(): Promise<void> {
    this.connectCalls += 1
  }

  async eval<T>(script: string, options: { keys: string[]; arguments: string[] }): Promise<T> {
    this.evalCalls.push({ script, key: options.keys[0], arguments: options.arguments })
    if (this.options.failEval) {
      throw new Error("Redis unavailable")
    }

    const [timeWindowValue, maxValue, continueExceedingValue, exponentialBackoffValue] = options.arguments
    const timeWindow = Number(timeWindowValue)
    const max = Number(maxValue)
    const continueExceeding = continueExceedingValue === "true"
    const exponentialBackoff = exponentialBackoffValue === "true"
    const key = options.keys[0]
    const existing = this.counters.get(key)
    const previous = existing && existing.expiresAt > this.now ? existing : undefined
    const current = (previous?.current ?? 0) + 1
    let ttl: number

    if (current === 1 || (continueExceeding && current > max)) {
      ttl = timeWindow
      this.counters.set(key, { current, expiresAt: this.now + ttl })
    } else if (exponentialBackoff && current > max) {
      ttl = Math.min(timeWindow * 2 ** (current - max - 1), Number.MAX_SAFE_INTEGER)
      this.counters.set(key, { current, expiresAt: this.now + ttl })
    } else {
      ttl = Math.max(0, (previous?.expiresAt ?? this.now) - this.now)
      this.counters.set(key, { current, expiresAt: this.now + ttl })
    }

    return [current, ttl] as T
  }

  async quit(): Promise<void> {
    this.quitCalls += 1
  }

  destroy(): void {
    this.destroyCalls += 1
  }

  advance(milliseconds: number): void {
    this.now += milliseconds
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
