import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
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
import type { DbClient } from "../packages/db/src/index.ts"
import { ApiHttpError } from "../apps/api/src/errors.ts"
import {
  createDrizzlePermissionRepository,
  createPermissionService,
  type EventPermissionContext,
  type PermissionRepository,
  type PlatformOwnerEventSupportAccessAuditInput,
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

test("platform owner event access uses explicit support override", async () => {
  const supportAccessAudit: PlatformOwnerEventSupportAccessAuditInput[] = []
  const service = createPermissionService(
    fakeRepository({
      supportAccessAudit,
      platformMemberships: {
        "platform-owner": [{ role: "platform_owner", status: "active" }]
      },
      eventContexts: {
        "platform-owner:event-1": {
          event: {
            id: "event-1",
            venueId: "venue-1",
            operatedByOrganizationId: "org-1",
            status: "active"
          },
          organizationMembership: null,
          venueAccess: [],
          eventStaffAssignments: []
        }
      }
    })
  )

  assert.equal(await service.hasEventPermission("platform-owner", "event-1", "event.view_stats"), false)
  assert.equal(
    await service.hasPlatformOwnerEventSupportAccess(
      "platform-owner",
      "event-1",
      "event.view_stats",
      "dashboard.event.read"
    ),
    true
  )
  assert.equal(
    await service.hasPlatformOwnerEventSupportAccess(
      "platform-owner",
      "event-1",
      "event.operate_queue",
      "dashboard.queue.operate"
    ),
    true
  )
  assert.equal(
    await service.hasPlatformOwnerEventSupportAccess(
      "platform-owner",
      "event-1",
      "event.manage",
      "dashboard.event.manage"
    ),
    true
  )
  assert.equal(
    await service.hasPlatformOwnerEventSupportAccess(
      "platform-owner",
      "event-1",
      "event.operate_queue",
      "dashboard.event.manage"
    ),
    false
  )
  assert.deepEqual(
    supportAccessAudit.map((entry) => entry.operation),
    ["dashboard.event.read", "dashboard.queue.operate", "dashboard.event.manage"]
  )
  assertSupportAuditEntry(supportAccessAudit[0], {
    eventId: "event-1",
    metadata: { eventStatus: "active" },
    operation: "dashboard.event.read",
    permission: "event.view_stats",
    userId: "platform-owner"
  })
})

test("platform owner support access denial does not write an allowed audit event", async () => {
  const supportAccessAudit: PlatformOwnerEventSupportAccessAuditInput[] = []
  const service = createPermissionService(
    fakeRepository({
      supportAccessAudit,
      platformMemberships: {
        "ordinary-user": [{ role: "platform_admin", status: "active" }]
      },
      eventContexts: {
        "ordinary-user:event-1": {
          event: {
            id: "event-1",
            venueId: "venue-1",
            operatedByOrganizationId: "org-1",
            status: "active"
          },
          organizationMembership: null,
          venueAccess: [],
          eventStaffAssignments: []
        }
      }
    })
  )

  assert.equal(
    await service.hasPlatformOwnerEventSupportAccess(
      "ordinary-user",
      "event-1",
      "event.view_stats",
      "dashboard.event.read"
    ),
    false
  )
  assert.deepEqual(supportAccessAudit, [])
})

test("platform support audit table is present in schema and migration", () => {
  const schema = readFileSync("packages/db/src/schema.ts", "utf8")
  const migration = readFileSync("packages/db/drizzle/0006_common_lorna_dane.sql", "utf8")

  assert.ok(schema.includes("platformSupportAuditEvents"))
  assert.ok(schema.includes("platform_owner_support"))
  assert.ok(migration.includes('CREATE TABLE "platform_support_audit_events"'))
  assert.ok(migration.includes('"actor_user_id" uuid NOT NULL'))
  assert.ok(migration.includes('"target_event_id" uuid NOT NULL'))
  assert.ok(migration.includes('"operation" text NOT NULL'))
  assert.ok(migration.includes('"permission" text NOT NULL'))
  assert.ok(migration.includes('"access_type" text DEFAULT \'platform_owner_support\' NOT NULL'))
  assert.ok(migration.includes('"outcome" text DEFAULT \'allowed\' NOT NULL'))
  assert.ok(migration.includes('"created_at" timestamp with time zone DEFAULT now() NOT NULL'))
})

test("drizzle permission repository persists platform owner support audit event", async () => {
  const inserts: unknown[] = []
  const repository = createDrizzlePermissionRepository({
    insert: () => ({
      values: (value: unknown) => {
        inserts.push(value)
      }
    })
  } as unknown as DbClient)

  await repository.recordPlatformOwnerEventSupportAccess({
    eventId: "event-1",
    metadata: { eventStatus: "active" },
    operation: "dashboard.queue.operate",
    permission: "event.operate_queue",
    userId: "user-1"
  })

  assert.deepEqual(inserts, [
    {
      actorUserId: "user-1",
      targetEventId: "event-1",
      operation: "dashboard.queue.operate",
      permission: "event.operate_queue",
      accessType: "platform_owner_support",
      outcome: "allowed",
      metadata: { eventStatus: "active" }
    }
  ])
})

test("platform owner event permission still requires an existing event", async () => {
  const service = createPermissionService(
    fakeRepository({
      platformMemberships: {
        "platform-owner": [{ role: "platform_owner", status: "active" }]
      }
    })
  )

  assert.equal(await service.hasEventPermission("platform-owner", "missing-event", "event.operate_queue"), false)
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
  supportAccessAudit?: PlatformOwnerEventSupportAccessAuditInput[]
}

function assertSupportAuditEntry(
  actual: PlatformOwnerEventSupportAccessAuditInput | undefined,
  expected: PlatformOwnerEventSupportAccessAuditInput
): void {
  assert.deepEqual(actual, expected)
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
    },
    async recordPlatformOwnerEventSupportAccess(auditInput) {
      input.supportAccessAudit?.push(auditInput)
    }
  }
}
