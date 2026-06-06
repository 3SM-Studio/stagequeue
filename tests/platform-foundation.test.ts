import assert from "node:assert/strict"
import test from "node:test"
import { createApiApp } from "../apps/api/src/app.ts"
import type { AuthenticatedDomainUser } from "../apps/api/src/auth/access.ts"
import type { ApiConfig } from "../apps/api/src/config.ts"
import { ApiHttpError } from "../apps/api/src/errors.ts"
import { createAccessRequestsService } from "../apps/api/src/modules/accessRequests/service.ts"
import type { ApiModuleServices } from "../apps/api/src/plugins/modules.ts"
import type { DbResources } from "../apps/api/src/plugins/db.ts"
import type { PermissionService } from "../apps/api/src/permissions/service.ts"

const USER_ID = "11111111-1111-4111-8111-111111111111"
const ORG_ID = "22222222-2222-4222-8222-222222222222"
const OTHER_ORG_ID = "33333333-3333-4333-8333-333333333333"
const VENUE_ID = "44444444-4444-4444-8444-444444444444"
const ACCESS_REQUEST_ID = "55555555-5555-4555-8555-555555555555"

test("dashboard user sees their organizations", async () => {
  const app = await createTestApp({
    services: {
      organizations: fakeOrganizationsService({
        userOrganizations: [{ id: ORG_ID, slug: "poza-nuta", name: "Poza Nuta", type: "karaoke_company", status: "active" }]
      })
    }
  })
  try {
    const response = await app.inject({ method: "GET", url: "/dashboard/organizations" })
    const body = response.json()

    assert.equal(response.statusCode, 200)
    assert.equal(body.organizations.length, 1)
    assert.equal(body.organizations[0].id, ORG_ID)
  } finally {
    await app.close()
  }
})

test("dashboard user does not see a foreign organization", async () => {
  const app = await createTestApp({
    services: {
      organizations: fakeOrganizationsService({ activeMemberships: new Set([ORG_ID]) })
    }
  })
  try {
    const response = await app.inject({ method: "GET", url: `/dashboard/organizations/${OTHER_ORG_ID}` })
    const body = response.json()

    assert.equal(response.statusCode, 403)
    assert.equal(body.error.code, "FORBIDDEN")
    assert.equal(body.error.requestId, response.headers["x-request-id"])
  } finally {
    await app.close()
  }
})

test("platform owner can list organizations", async () => {
  const app = await createTestApp({
    permissions: fakePermissions({ platform: new Set(["platform.manage_organizations"]) }),
    services: {
      organizations: fakeOrganizationsService({
        platformOrganizations: [{ id: ORG_ID, slug: "poza-nuta", name: "Poza Nuta", type: "karaoke_company", status: "active" }]
      })
    }
  })
  try {
    const response = await app.inject({ method: "GET", url: "/platform/organizations" })
    const body = response.json()

    assert.equal(response.statusCode, 200)
    assert.equal(body.organizations[0].id, ORG_ID)
  } finally {
    await app.close()
  }
})

test("organization owner can patch organization", async () => {
  let patchedName: string | undefined
  const app = await createTestApp({
    permissions: fakePermissions({ organization: new Set(["organization.manage_profile"]) }),
    services: {
      organizations: fakeOrganizationsService({
        patchOrganization: async (_organizationId, input) => {
          patchedName = input.name
          return { id: ORG_ID, slug: "poza-nuta", name: input.name ?? "Poza Nuta", type: "karaoke_company", status: "active" }
        }
      })
    }
  })
  try {
    const response = await app.inject({
      method: "PATCH",
      url: `/dashboard/organizations/${ORG_ID}`,
      payload: { name: "Poza Nuta Updated" }
    })
    const body = response.json()

    assert.equal(response.statusCode, 200)
    assert.equal(patchedName, "Poza Nuta Updated")
    assert.equal(body.organization.name, "Poza Nuta Updated")
  } finally {
    await app.close()
  }
})

test("organization viewer cannot patch organization", async () => {
  const app = await createTestApp({
    permissions: fakePermissions(),
    services: {
      organizations: fakeOrganizationsService()
    }
  })
  try {
    const response = await app.inject({
      method: "PATCH",
      url: `/dashboard/organizations/${ORG_ID}`,
      payload: { name: "Nope" }
    })
    const body = response.json()

    assert.equal(response.statusCode, 403)
    assert.equal(body.error.code, "FORBIDDEN")
  } finally {
    await app.close()
  }
})

test("venue reserved slug is rejected", async () => {
  const app = await createTestApp({
    permissions: fakePermissions({ organization: new Set(["organization.request_venue_access"]) })
  })
  try {
    const response = await app.inject({
      method: "POST",
      url: "/dashboard/venues",
      payload: { name: "Admin Venue", slug: "admin", organizationId: ORG_ID }
    })
    const body = response.json()

    assert.equal(response.statusCode, 400)
    assert.equal(body.error.code, "BAD_REQUEST")
    assert.match(body.error.message, /Reserved venue slug/)
  } finally {
    await app.close()
  }
})

test("platform owner can list venues", async () => {
  const app = await createTestApp({
    permissions: fakePermissions({ platform: new Set(["platform.manage_venues"]) }),
    services: {
      venues: fakeVenuesService({
        platformVenues: [fakeVenue()]
      })
    }
  })
  try {
    const response = await app.inject({ method: "GET", url: "/platform/venues" })
    const body = response.json()

    assert.equal(response.statusCode, 200)
    assert.equal(body.venues[0].id, VENUE_ID)
  } finally {
    await app.close()
  }
})

test("public venue lookup returns active verified venue", async () => {
  const app = await createTestApp({
    services: {
      venues: fakeVenuesService({
        getBySlug: async () => fakeVenue({ status: "active", verificationStatus: "verified" })
      })
    }
  })
  try {
    const response = await app.inject({ method: "GET", url: "/public/venues/klub-x" })
    const body = response.json()

    assert.equal(response.statusCode, 200)
    assert.equal(body.venue.id, VENUE_ID)
    assert.equal(body.venue.slug, "klub-x")
    assert.equal(body.venue.name, "Klub X")
  } finally {
    await app.close()
  }
})

test("public venue lookup hides non-public venue statuses and verification states", async () => {
  const cases = [
    fakeVenue({ status: "draft", verificationStatus: "verified" }),
    fakeVenue({ status: "archived", verificationStatus: "verified" }),
    fakeVenue({ status: "active", verificationStatus: "pending" }),
    fakeVenue({ status: "active", verificationStatus: "rejected" })
  ]

  for (const venue of cases) {
    const app = await createTestApp({
      services: {
        venues: fakeVenuesService({
          getBySlug: async () => venue
        })
      }
    })
    try {
      const response = await app.inject({ method: "GET", url: "/public/venues/klub-x" })

      assert.equal(response.statusCode, 404)
      assert.equal(response.json().error.code, "NOT_FOUND")
      assert.equal(response.json().error.message, "Missing venue")
    } finally {
      await app.close()
    }
  }
})

test("dashboard user can see venue through active venue access", async () => {
  const app = await createTestApp({
    permissions: fakePermissions({ venue: new Set(["event.view_stats"]) }),
    services: {
      venues: fakeVenuesService({ getById: async () => fakeVenue() })
    }
  })
  try {
    const response = await app.inject({ method: "GET", url: `/dashboard/venues/${VENUE_ID}` })
    const body = response.json()

    assert.equal(response.statusCode, 200)
    assert.equal(body.venue.id, VENUE_ID)
  } finally {
    await app.close()
  }
})

test("platform owner can approve and reject access requests", async () => {
  const calls: string[] = []
  const app = await createTestApp({
    permissions: fakePermissions({ platform: new Set(["platform.manage_access"]) }),
    services: {
      accessRequests: fakeAccessRequestsService({
        approveAccessRequest: async (id) => {
          calls.push(`approve:${id}`)
          return fakeAccessRequest("approved")
        },
        rejectAccessRequest: async (id) => {
          calls.push(`reject:${id}`)
          return fakeAccessRequest("rejected")
        }
      })
    }
  })
  try {
    const approve = await app.inject({ method: "POST", url: `/platform/access-requests/${ACCESS_REQUEST_ID}/approve` })
    const reject = await app.inject({ method: "POST", url: `/platform/access-requests/${ACCESS_REQUEST_ID}/reject` })

    assert.equal(approve.statusCode, 200)
    assert.equal(approve.json().accessRequest.status, "approved")
    assert.equal(reject.statusCode, 200)
    assert.equal(reject.json().accessRequest.status, "rejected")
    assert.deepEqual(calls, [`approve:${ACCESS_REQUEST_ID}`, `reject:${ACCESS_REQUEST_ID}`])
  } finally {
    await app.close()
  }
})

test("access request cannot be approved twice", async () => {
  const db = fakeDbForAccessRequest("pending")
  const service = createAccessRequestsService(db.db)

  const approved = await service.approveAccessRequest(ACCESS_REQUEST_ID, USER_ID)
  await assert.rejects(() => service.approveAccessRequest(ACCESS_REQUEST_ID, USER_ID), {
    statusCode: 409,
    code: "ACCESS_REQUEST_INVALID_TRANSITION"
  })

  assert.equal(approved.status, "approved")
  assert.equal(db.state.status, "approved")
})

test("access request cannot be rejected twice", async () => {
  const db = fakeDbForAccessRequest("pending")
  const service = createAccessRequestsService(db.db)

  const rejected = await service.rejectAccessRequest(ACCESS_REQUEST_ID, USER_ID)
  await assert.rejects(() => service.rejectAccessRequest(ACCESS_REQUEST_ID, USER_ID), {
    statusCode: 409,
    code: "ACCESS_REQUEST_INVALID_TRANSITION"
  })

  assert.equal(rejected.status, "rejected")
  assert.equal(db.state.status, "rejected")
})

test("access request cannot be approved after reject or rejected after approve", async () => {
  const rejectedDb = fakeDbForAccessRequest("rejected")
  const approvedDb = fakeDbForAccessRequest("approved")

  await assert.rejects(() => createAccessRequestsService(rejectedDb.db).approveAccessRequest(ACCESS_REQUEST_ID, USER_ID), {
    statusCode: 409,
    code: "ACCESS_REQUEST_INVALID_TRANSITION"
  })
  await assert.rejects(() => createAccessRequestsService(approvedDb.db).rejectAccessRequest(ACCESS_REQUEST_ID, USER_ID), {
    statusCode: 409,
    code: "ACCESS_REQUEST_INVALID_TRANSITION"
  })

  assert.equal(rejectedDb.state.status, "rejected")
  assert.equal(approvedDb.state.status, "approved")
})

async function createTestApp(options: {
  user?: AuthenticatedDomainUser
  permissions?: PermissionService
  services?: Partial<ApiModuleServices>
} = {}) {
  return createApiApp({
    config: testConfig(),
    db: fakeDbResources(),
    auth: fakeAuth(),
    currentUserResolver: async () =>
      options.user ?? { id: USER_ID, email: "user@example.com", name: "User", status: "active" },
    permissions: options.permissions ?? fakePermissions(),
    services: {
      organizations: fakeOrganizationsService(),
      venues: fakeVenuesService(),
      accessRequests: fakeAccessRequestsService(),
      ...options.services
    },
    logger: false
  })
}

function fakePermissions(options: {
  platform?: Set<string>
  organization?: Set<string>
  venue?: Set<string>
  event?: Set<string>
} = {}): PermissionService {
  return {
    hasPlatformPermission: async (_userId, permission) => Boolean(options.platform?.has(permission)),
    requirePlatformPermission: async (_userId, permission) => requireAllowed(options.platform?.has(permission)),
    hasOrganizationPermission: async (_userId, _organizationId, permission) => Boolean(options.organization?.has(permission)),
    requireOrganizationPermission: async (_userId, _organizationId, permission) => requireAllowed(options.organization?.has(permission)),
    hasVenuePermission: async (_userId, _venueId, permission) => Boolean(options.venue?.has(permission)),
    requireVenuePermission: async (_userId, _venueId, permission) => requireAllowed(options.venue?.has(permission)),
    hasEventPermission: async (_userId, _eventId, permission) => Boolean(options.event?.has(permission)),
    requireEventPermission: async (_userId, _eventId, permission) => requireAllowed(options.event?.has(permission)),
    hasPlatformOwnerEventSupportAccess: async () => false,
    requirePlatformOwnerEventSupportAccess: async () => requireAllowed(false)
  }
}

function requireAllowed(allowed: boolean | undefined): void {
  if (!allowed) {
    throw new ApiHttpError(403, "FORBIDDEN", "Forbidden")
  }
}

function fakeOrganizationsService(overrides: Partial<ApiModuleServices["organizations"]> & {
  userOrganizations?: Awaited<ReturnType<ApiModuleServices["organizations"]["listForUser"]>>
  platformOrganizations?: Awaited<ReturnType<ApiModuleServices["organizations"]["listForPlatform"]>>
  activeMemberships?: Set<string>
} = {}): ApiModuleServices["organizations"] {
  return {
    listForUser: async () => overrides.userOrganizations ?? [],
    listForPlatform: async () => overrides.platformOrganizations ?? [],
    getById: async (organizationId) => ({ id: organizationId, slug: "poza-nuta", name: "Poza Nuta", type: "karaoke_company", status: "active" }),
    hasActiveMembership: async (_userId, organizationId) => Boolean(overrides.activeMemberships?.has(organizationId)),
    createOrganization: async (input) => ({
      id: ORG_ID,
      slug: input.slug,
      name: input.name,
      type: input.type,
      status: input.status ?? "active"
    }),
    patchOrganization: async (organizationId, input) => ({
      id: organizationId,
      slug: "poza-nuta",
      name: input.name ?? "Poza Nuta",
      type: input.type ?? "karaoke_company",
      status: input.status ?? "active"
    }),
    listMembers: async () => [],
    ...overrides
  }
}

function fakeVenuesService(overrides: Partial<ApiModuleServices["venues"]> & {
  platformVenues?: Awaited<ReturnType<ApiModuleServices["venues"]["listForPlatform"]>>
} = {}): ApiModuleServices["venues"] {
  return {
    listForUser: async (_userId, options) => (options?.includeAll ? (overrides.platformVenues ?? []) : []),
    listForPlatform: async () => overrides.platformVenues ?? [],
    getById: async () => fakeVenue(),
    getBySlug: async () => fakeVenue(),
    createVenue: async (input) => ({ ...fakeVenue(), name: input.name, slug: input.slug }),
    patchVenue: async (_venueId, input) => ({ ...fakeVenue(), ...input }),
    listAccess: async () => [],
    createAccessRequest: async () => ({ id: ACCESS_REQUEST_ID, status: "pending" }),
    ...overrides
  }
}

function fakeAccessRequestsService(
  overrides: Partial<ApiModuleServices["accessRequests"]> = {}
): ApiModuleServices["accessRequests"] {
  return {
    listAccessRequests: async () => [fakeAccessRequest("pending")],
    approveAccessRequest: async () => fakeAccessRequest("approved"),
    rejectAccessRequest: async () => fakeAccessRequest("rejected"),
    ...overrides
  }
}

function fakeVenue(overrides: Partial<ReturnType<typeof fakeVenueBase>> = {}) {
  return {
    ...fakeVenueBase(),
    ...overrides
  }
}

function fakeVenueBase() {
  return {
    id: VENUE_ID,
    slug: "klub-x",
    name: "Klub X",
    address: null,
    city: "Warszawa",
    country: "PL",
    timezone: "Europe/Warsaw",
    status: "active",
    verificationStatus: "verified",
    claimedByOrganizationId: ORG_ID
  }
}

function fakeAccessRequest(status: string) {
  return {
    id: ACCESS_REQUEST_ID,
    email: "user@example.com",
    name: "User",
    organizationName: null,
    venueName: null,
    venueId: VENUE_ID,
    organizationId: ORG_ID,
    venueAccessRole: "karaoke_operator",
    status,
    message: null
  }
}

function fakeDbForAccessRequest(initialStatus: "pending" | "approved" | "rejected"): DbResources & {
  state: ReturnType<typeof fakeAccessRequest>
  venueAccessWrites: number
  userActivations: number
} {
  const resources: DbResources & {
    state: ReturnType<typeof fakeAccessRequest>
    venueAccessWrites: number
    userActivations: number
  } = {
    state: fakeAccessRequest(initialStatus),
    venueAccessWrites: 0,
    userActivations: 0,
    db: {
      select: () => queryChain([resources.state]),
      update: () => ({
        set: (values: { status?: string }) => ({
          where: () => ({
            returning: () => {
              if (resources.state.status !== "pending") {
                return []
              }
              resources.state = { ...resources.state, status: values.status ?? resources.state.status }
              return [resources.state]
            }
          })
        })
      }),
      insert: () => ({
        values: () => {
          resources.venueAccessWrites += 1
          return {
            onConflictDoUpdate: () => undefined
          }
        }
      }),
      transaction: async <T>(action: (tx: DbResources["db"]) => Promise<T>) => action(resources.db)
    } as unknown as DbResources["db"],
    pool: {
      end: async () => undefined
    } as unknown as DbResources["pool"]
  }

  return resources
}

function queryChain<T>(result: T[]) {
  return {
    from() {
      return this
    },
    where() {
      return this
    },
    limit() {
      return result
    }
  }
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
