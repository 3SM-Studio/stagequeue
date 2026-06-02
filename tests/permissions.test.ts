import assert from "node:assert/strict"
import test from "node:test"
import {
  hasOrganizationRolePermission,
  hasPlatformRolePermission,
  hasVenueAccessRolePermission,
  eventStaffRoles,
  organizationRoles,
  platformPermissions,
  venueAccessRoles,
  venueEventPermissions
} from "../packages/domain/src/permissions/index.ts"
import {
  defaultEventStaffRole,
  defaultOrganizationMemberRole,
  defaultVenueAccessRole
} from "../packages/db/src/schema.ts"
import { ApiHttpError } from "../apps/api/src/errors.ts"
import {
  createPermissionService,
  type EventPermissionContext,
  type PermissionRepository,
  type RoleRecord,
  type VenueAccessRecord
} from "../apps/api/src/permissions/service.ts"

test("permission constants expose the platform and venue/event permissions", () => {
  assert.deepEqual(platformPermissions, [
    "platform.manage_access",
    "platform.manage_catalog",
    "platform.manage_organizations",
    "platform.manage_venues"
  ])
  assert.ok(venueEventPermissions.includes("event.operate_queue"))
})

test("database role defaults are known to the permission model", () => {
  assert.equal(organizationRoles.includes(defaultOrganizationMemberRole), true)
  assert.equal(venueAccessRoles.includes(defaultVenueAccessRole), true)
  assert.equal(eventStaffRoles.includes(defaultEventStaffRole), true)
  assert.equal(defaultVenueAccessRole, "karaoke_operator")
  assert.equal(defaultEventStaffRole, "queue_operator")
})

test("platform_owner has platform.manage_catalog", () => {
  assert.equal(hasPlatformRolePermission("platform_owner", "platform.manage_catalog"), true)
})

test("ordinary active user without platform role does not have platform.manage_catalog", async () => {
  const service = createPermissionService(fakeRepository())

  assert.equal(await service.hasPlatformPermission("active-user", "platform.manage_catalog"), false)
})

test("organization owner has organization.manage_members and viewer does not", async () => {
  const service = createPermissionService(
    fakeRepository({
      organizationMemberships: {
        "owner-user:org-1": { role: "owner", status: "active" },
        "viewer-user:org-1": { role: "viewer", status: "active" }
      }
    })
  )

  assert.equal(await service.hasOrganizationPermission("owner-user", "org-1", "organization.manage_members"), true)
  assert.equal(await service.hasOrganizationPermission("viewer-user", "org-1", "organization.manage_members"), false)
  assert.equal(hasOrganizationRolePermission("viewer", "organization.manage_members"), false)
})

test("venue owner has venue.create_event", () => {
  assert.equal(hasVenueAccessRolePermission("owner", "venue.create_event"), true)
})

test("karaoke_operator has event.operate_queue through venue access", async () => {
  const service = createPermissionService(
    fakeRepository({
      venueAccessByUser: {
        "operator-user:venue-1": [{ organizationId: "org-1", role: "karaoke_operator", status: "active" }]
      }
    })
  )

  assert.equal(await service.hasVenuePermission("operator-user", "venue-1", "event.operate_queue"), true)
})

test("event lead_host has event.operate_queue", async () => {
  const service = createPermissionService(
    fakeRepository({
      eventContexts: {
        "lead-host:event-1": {
          event: {
            id: "event-1",
            venueId: "venue-1",
            operatedByOrganizationId: "org-1",
            status: "active"
          },
          organizationMembership: { role: "host", status: "active" },
          venueAccess: [{ organizationId: "org-1", role: "viewer", status: "active" }],
          eventStaffAssignments: [{ role: "lead_host", status: "active" }]
        }
      }
    })
  )

  assert.equal(await service.hasEventPermission("lead-host", "event-1", "event.operate_queue"), true)
})

test("event lead_host has event.manage through event staff role mapping", async () => {
  const service = createPermissionService(
    fakeRepository({
      eventContexts: {
        "lead-host:event-1": {
          event: {
            id: "event-1",
            venueId: "venue-1",
            operatedByOrganizationId: "org-1",
            status: "active"
          },
          organizationMembership: { role: "host", status: "active" },
          venueAccess: [{ organizationId: "org-1", role: "viewer", status: "active" }],
          eventStaffAssignments: [{ role: "lead_host", status: "active" }]
        }
      }
    })
  )

  assert.equal(await service.hasEventPermission("lead-host", "event-1", "event.manage"), true)
})

test("removed organization member does not pass event permission", async () => {
  const service = createPermissionService(
    fakeRepository({
      eventContexts: {
        "removed-user:event-1": {
          event: {
            id: "event-1",
            venueId: "venue-1",
            operatedByOrganizationId: "org-1",
            status: "active"
          },
          organizationMembership: { role: "host", status: "removed" },
          venueAccess: [{ organizationId: "org-1", role: "owner", status: "active" }],
          eventStaffAssignments: [{ role: "lead_host", status: "active" }]
        }
      }
    })
  )

  assert.equal(await service.hasEventPermission("removed-user", "event-1", "event.operate_queue"), false)
})

test("missing permission throws FORBIDDEN in require functions", async () => {
  const service = createPermissionService(fakeRepository())

  await assert.rejects(
    () => service.requirePlatformPermission("active-user", "platform.manage_catalog"),
    (error) => {
      assert.equal(error instanceof ApiHttpError, true)
      assert.equal((error as ApiHttpError).statusCode, 403)
      assert.equal((error as ApiHttpError).code, "FORBIDDEN")
      return true
    }
  )
})

type FakeRepositoryInput = {
  platformMemberships?: Record<string, RoleRecord[]>
  organizationMemberships?: Record<string, RoleRecord>
  venueAccessByUser?: Record<string, VenueAccessRecord[]>
  eventContexts?: Record<string, EventPermissionContext>
}

function fakeRepository(input: FakeRepositoryInput = {}): PermissionRepository {
  return {
    async getPlatformMemberships(userId) {
      return input.platformMemberships?.[userId] ?? []
    },
    async getOrganizationMembership(userId, organizationId) {
      return input.organizationMemberships?.[`${userId}:${organizationId}`] ?? null
    },
    async getVenueAccessForUser(userId, venueId) {
      return input.venueAccessByUser?.[`${userId}:${venueId}`] ?? []
    },
    async getEventPermissionContext(userId, eventId) {
      return (
        input.eventContexts?.[`${userId}:${eventId}`] ?? {
          event: null,
          organizationMembership: null,
          venueAccess: [],
          eventStaffAssignments: []
        }
      )
    }
  }
}
