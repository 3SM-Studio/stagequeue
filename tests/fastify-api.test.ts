import assert from "node:assert/strict"
import test from "node:test"
import { createApiApp } from "../apps/api/src/app.ts"
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

function testConfig(): ApiConfig {
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
    logLevel: "silent"
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

function fakeAuth() {
  return {
    handler: async () => new Response(null, { status: 404 }),
    api: {
      getSession: async () => null
    }
  } as any
}
