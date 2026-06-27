import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import test from "node:test"
import { createApiApp, createLoggerConfig } from "../apps/api/src/app.ts"
import { evaluateDashboardAccess, shouldBootstrapPlatformOwner } from "../apps/api/src/auth/access.ts"
import type { ApiConfig } from "../apps/api/src/config.ts"
import type { DbResources } from "../apps/api/src/plugins/db.ts"

test("Fastify GET /health returns API and DB status", async () => {
  const app = await createTestApp()
  try {
    const response = await app.inject({ method: "GET", url: "/health" })
    const body = response.json()

    assert.equal(response.statusCode, 200)
    assert.match(String(response.headers["x-request-id"]), /^[0-9a-f-]{36}$/)
    assert.equal(body.ok, true)
    assert.equal(body.service, "poza-nuta-api")
    assert.deepEqual(body.db, { ok: true })
  } finally {
    await app.close()
  }
})

test("Fastify unknown route returns a consistent 404 error", async () => {
  const app = await createTestApp()
  try {
    const response = await app.inject({ method: "GET", url: "/missing" })
    const body = response.json()

    assert.equal(response.statusCode, 404)
    assert.equal(body.error.code, "ROUTE_NOT_FOUND")
    assert.equal(body.error.message, "Route not found")
    assert.equal(body.error.requestId, response.headers["x-request-id"])
  } finally {
    await app.close()
  }
})

test("Fastify production error responses hide stack traces and internal messages", async () => {
  const app = await createApiApp({
    auth: fakeAuth(),
    config: testConfig({ nodeEnv: "production" }),
    db: fakeDbResources(),
    logger: false
  })
  app.get("/test/internal-error", async () => {
    throw new Error("private failure detail")
  })

  try {
    const response = await app.inject({ method: "GET", url: "/test/internal-error" })
    const body = response.json()
    const serializedBody = JSON.stringify(body)

    assert.equal(response.statusCode, 500)
    assert.equal(body.error.code, "INTERNAL_SERVER_ERROR")
    assert.equal(body.error.message, "Internal server error")
    assert.equal(body.error.requestId, response.headers["x-request-id"])
    assert.equal(serializedBody.includes("private failure detail"), false)
    assert.doesNotMatch(serializedBody, /stack|at /i)
  } finally {
    await app.close()
  }
})

test("Fastify CORS uses an allowlist and does not combine wildcard origin with credentials", async () => {
  const app = await createTestApp()
  try {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/health",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "GET"
      }
    })

    assert.equal(response.statusCode, 204)
    assert.equal(response.headers["access-control-allow-origin"], "http://localhost:3000")
    assert.equal(response.headers["access-control-allow-credentials"], "true")
    assert.notEqual(response.headers["access-control-allow-origin"], "*")
  } finally {
    await app.close()
  }
})

test("Fastify logger redacts Authorization cookie and set-cookie values", async () => {
  const lines: string[] = []
  const config = testConfig({
    logLevel: "info",
    nodeEnv: "development"
  })
  const loggerConfig = createLoggerConfig(config)
  assert.notEqual(loggerConfig, false)
  const app = await createApiApp({
    auth: fakeAuth(),
    config,
    db: fakeDbResources(),
    logger: captureLogger(config, lines)
  })
  const authorization = "Bearer admin-token-secret-value"
  const cookie = "pn_participant=participant-token-secret; session=auth-session-secret"
  const setCookie = "pn_participant=participant-token-secret; Path=/; HttpOnly"

  try {
    app.log.info(
      {
        headers: {
          authorization,
          cookie,
          "set-cookie": setCookie
        },
        request: {
          headers: {
            authorization,
            cookie,
            "set-cookie": setCookie
          }
        },
        response: {
          headers: {
            "set-cookie": setCookie
          }
        }
      },
      "redaction probe"
    )
    await new Promise((resolve) => setImmediate(resolve))
  } finally {
    await app.close()
  }

  const logs = lines.join("")
  assert.match(logs, /"authorization":"\[Redacted\]"/)
  assert.match(logs, /"cookie":"\[Redacted\]"/)
  assert.match(logs, /"set-cookie":"\[Redacted\]"/)
  assert.equal(logs.includes(authorization), false)
  assert.equal(logs.includes(cookie), false)
  assert.equal(logs.includes(setCookie), false)
  assert.equal(logs.includes("participant-token-secret"), false)
  assert.equal(logs.includes("auth-session-secret"), false)
})

test("Fastify logs DB pool errors without DATABASE_URL and still closes pool", async () => {
  const lines: string[] = []
  const databaseUrl = "postgres://user:password@db.internal:5432/stagequeue"
  const config = testConfig({
    databaseUrl,
    logLevel: "info",
    nodeEnv: "development"
  })
  const pool = new FakeObservablePool()
  const app = await createApiApp({
    auth: fakeAuth(),
    config,
    db: {
      db: {
        execute: async () => []
      } as unknown as DbResources["db"],
      pool: pool as unknown as DbResources["pool"]
    },
    logger: captureLogger(config, lines)
  })
  const error = Object.assign(new Error(`connection lost for ${databaseUrl}`), { code: "ECONNRESET" })

  try {
    pool.emit("error", error)
    await new Promise((resolve) => setImmediate(resolve))
  } finally {
    await app.close()
  }

  const log = parseLogLine(lines.find((line) => line.includes("db_pool_error")) ?? "")
  const allLogs = lines.join("")
  assert.equal(log.event, "db_pool_error")
  assert.equal(log.operation, "idle_client_error")
  assert.equal(log.errorName, "Error")
  assert.equal(log.errorCode, "ECONNRESET")
  assert.equal(String(log.errorMessage).includes("[redacted]"), true)
  assert.equal(allLogs.includes(databaseUrl), false)
  assert.equal(pool.endCalls, 1)
})

test("Fastify GET /me without a session returns authenticated false", async () => {
  const app = await createTestApp()
  try {
    const response = await app.inject({ method: "GET", url: "/me" })
    const body = response.json()

    assert.equal(response.statusCode, 200)
    assert.deepEqual(body, { authenticated: false })
  } finally {
    await app.close()
  }
})

test("bootstrap platform owner matching is case-insensitive", () => {
  assert.equal(shouldBootstrapPlatformOwner("Owner@Example.com", "owner@example.com"), true)
  assert.equal(shouldBootstrapPlatformOwner("other@example.com", "owner@example.com"), false)
})

test("pending and disabled users cannot access dashboard", () => {
  assert.deepEqual(
    evaluateDashboardAccess({ id: "u1", email: "pending@example.com", name: null, status: "pending" }, []),
    { dashboardAllowed: false, reason: "pending_approval" }
  )
  assert.deepEqual(
    evaluateDashboardAccess({ id: "u2", email: "disabled@example.com", name: null, status: "disabled" }, ["platform_owner"]),
    { dashboardAllowed: false, reason: "disabled" }
  )
})

test("active users and platform owners can access dashboard", () => {
  assert.deepEqual(evaluateDashboardAccess({ id: "u1", email: "active@example.com", name: null, status: "active" }, []), {
    dashboardAllowed: true,
    reason: "active_user"
  })
  assert.deepEqual(evaluateDashboardAccess({ id: "u2", email: "owner@example.com", name: null, status: "pending" }, ["platform_owner"]), {
    dashboardAllowed: true,
    reason: "platform_role"
  })
})

async function createTestApp() {
  return createApiApp({
    config: testConfig(),
    db: fakeDbResources(),
    auth: fakeAuth(),
    logger: false
  })
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

class FakeObservablePool extends EventEmitter {
  endCalls = 0

  async end(): Promise<void> {
    this.endCalls += 1
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
