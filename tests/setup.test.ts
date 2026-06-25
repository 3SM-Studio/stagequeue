import assert from "node:assert/strict"
import test from "node:test"
import { createApiApp } from "../apps/api/src/app.ts"
import type { AuthenticatedDomainUser } from "../apps/api/src/auth/access.ts"
import type { BetterAuthInstance } from "../apps/api/src/auth/betterAuth.ts"
import type { ApiConfig } from "../apps/api/src/config.ts"
import type { DbResources } from "../apps/api/src/plugins/db.ts"
import {
  createPlatformSetupService,
  type PlatformSetupRepository
} from "../apps/api/src/modules/setup/service.ts"

const USER_ID = "11111111-1111-4111-8111-111111111111"
const SETUP_TOKEN = "test-platform-setup-token"

test("setup status is required when there is no active platform owner", async () => {
  const app = await createTestApp({ repository: new FakeSetupRepository() })
  try {
    const response = await app.inject({ method: "GET", url: "/setup/status" })
    const body = response.json()

    assert.equal(response.statusCode, 200)
    assert.deepEqual(body, { setupRequired: true })
  } finally {
    await app.close()
  }
})

test("setup status is completed when an active platform owner exists", async () => {
  const repository = new FakeSetupRepository()
  repository.ownerExists = true
  const app = await createTestApp({ repository })
  try {
    const response = await app.inject({ method: "GET", url: "/setup/status" })
    const body = response.json()

    assert.equal(response.statusCode, 200)
    assert.deepEqual(body, { setupRequired: false })
  } finally {
    await app.close()
  }
})

test("setup claim without a session returns unauthorized", async () => {
  const app = await createTestApp({ authenticated: false, repository: new FakeSetupRepository() })
  try {
    const response = await app.inject({
      method: "POST",
      payload: { setupToken: SETUP_TOKEN },
      url: "/setup/claim-platform-owner"
    })
    const body = response.json()

    assert.equal(response.statusCode, 401)
    assert.equal(body.error.code, "UNAUTHORIZED")
  } finally {
    await app.close()
  }
})

test("setup claim with an invalid token returns forbidden", async () => {
  const app = await createTestApp({ repository: new FakeSetupRepository() })
  try {
    const response = await app.inject({
      method: "POST",
      payload: { setupToken: "wrong-token" },
      url: "/setup/claim-platform-owner"
    })
    const body = response.json()

    assert.equal(response.statusCode, 403)
    assert.equal(body.error.code, "INVALID_SETUP_TOKEN")
  } finally {
    await app.close()
  }
})

test("setup claim returns conflict when owner already exists", async () => {
  const repository = new FakeSetupRepository()
  repository.ownerExists = true
  const app = await createTestApp({ repository })
  try {
    const response = await app.inject({
      method: "POST",
      payload: { setupToken: SETUP_TOKEN },
      url: "/setup/claim-platform-owner"
    })
    const body = response.json()

    assert.equal(response.statusCode, 409)
    assert.equal(body.error.code, "SETUP_ALREADY_COMPLETED")
  } finally {
    await app.close()
  }
})

test("setup claim with a valid token activates user and creates platform owner membership", async () => {
  const repository = new FakeSetupRepository()
  const app = await createTestApp({ repository })
  try {
    const response = await app.inject({
      method: "POST",
      payload: { setupToken: SETUP_TOKEN },
      url: "/setup/claim-platform-owner"
    })
    const body = response.json()

    assert.equal(response.statusCode, 200)
    assert.equal(body.user.id, USER_ID)
    assert.equal(body.user.status, "active")
    assert.deepEqual(body.platform.roles, ["platform_owner"])
    assert.equal(repository.users.get(USER_ID)?.status, "active")
    assert.deepEqual(repository.memberships, [{ role: "platform_owner", status: "active", userId: USER_ID }])
  } finally {
    await app.close()
  }
})

test("setup claim does not create duplicate platform owner memberships", async () => {
  const repository = new FakeSetupRepository()
  const service = createPlatformSetupService(repository)

  await service.claimPlatformOwner(fakeUser(), SETUP_TOKEN, SETUP_TOKEN)
  await assert.rejects(() => service.claimPlatformOwner(fakeUser(), SETUP_TOKEN, SETUP_TOKEN), /Platform setup is already completed/)

  assert.deepEqual(repository.memberships, [{ role: "platform_owner", status: "active", userId: USER_ID }])
})

async function createTestApp(options: { authenticated?: boolean; repository: FakeSetupRepository }) {
  const appOptions = {
    auth: fakeAuth(),
    config: testConfig(),
    db: fakeDbResources(),
    logger: false,
    services: {
      setup: createPlatformSetupService(options.repository)
    }
  }

  return createApiApp(
    options.authenticated === false
      ? appOptions
      : {
          ...appOptions,
          currentUserResolver: async () => fakeUser()
        }
  )
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
    platformSetupToken: SETUP_TOKEN,
    logLevel: "silent"
  }
}

function fakeUser(): AuthenticatedDomainUser {
  return {
    id: USER_ID,
    email: "owner@example.com",
    name: "Owner",
    status: "pending"
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

function fakeAuth(): BetterAuthInstance {
  return {
    handler: async () => new Response(null, { status: 404 }),
    api: {
      getSession: async () => null
    }
  } as unknown as BetterAuthInstance
}

class FakeSetupRepository implements PlatformSetupRepository {
  memberships: Array<{ role: "platform_owner"; status: "active"; userId: string }> = []
  ownerExists = false
  users = new Map<string, AuthenticatedDomainUser>([[USER_ID, fakeUser()]])

  async hasActivePlatformOwner(): Promise<boolean> {
    return this.ownerExists || this.memberships.some((membership) => membership.role === "platform_owner" && membership.status === "active")
  }

  async activateUser(userId: string): Promise<AuthenticatedDomainUser> {
    const user = this.users.get(userId)
    if (!user) {
      throw new Error("User not found")
    }

    const activeUser = { ...user, status: "active" as const }
    this.users.set(userId, activeUser)
    return activeUser
  }

  async grantPlatformOwner(userId: string): Promise<void> {
    const existing = this.memberships.find((membership) => membership.userId === userId && membership.role === "platform_owner")
    if (existing) {
      existing.status = "active"
      return
    }

    this.memberships.push({
      role: "platform_owner",
      status: "active",
      userId
    })
  }

  async withSetupLock<T>(operation: (repository: PlatformSetupRepository) => Promise<T>): Promise<T> {
    return operation(this)
  }
}
