import {
  eventStaffAssignments,
  events,
  organizationMemberships,
  platformMemberships,
  venueOrganizationAccess,
  type DbClient
} from "@poza-nuta/db"
import {
  hasEventStaffRolePermission,
  hasOrganizationRolePermission,
  hasPlatformRolePermission,
  hasVenueAccessRolePermission,
  type OrganizationPermission,
  type PlatformPermission,
  type VenueEventPermission
} from "@poza-nuta/domain/permissions"
import { and, eq } from "drizzle-orm"
import { ApiHttpError } from "../errors.ts"

type MembershipStatus = "active" | "removed" | "disabled" | "invited" | "suspended" | string
type AccessStatus = "active" | "revoked" | "pending" | "expired" | "rejected" | string
type EventStatus = "draft" | "scheduled" | "active" | "paused" | "closed" | "archived" | "cancelled" | string

export type RoleRecord = {
  role: string
  status: MembershipStatus | AccessStatus
}

export type VenueAccessRecord = RoleRecord & {
  organizationId: string
}

export type EventPermissionContext = {
  event: {
    id: string
    venueId: string
    operatedByOrganizationId: string
    status: EventStatus
  } | null
  organizationMembership: RoleRecord | null
  venueAccess: VenueAccessRecord[]
  eventStaffAssignments: RoleRecord[]
}

export type PermissionRepository = {
  getPlatformMemberships(userId: string): Promise<RoleRecord[]>
  getOrganizationMembership(userId: string, organizationId: string): Promise<RoleRecord | null>
  getVenueAccessForUser(userId: string, venueId: string): Promise<VenueAccessRecord[]>
  getEventPermissionContext(userId: string, eventId: string): Promise<EventPermissionContext>
}

export type PermissionService = {
  hasPlatformPermission(userId: string, permission: PlatformPermission): Promise<boolean>
  requirePlatformPermission(userId: string, permission: PlatformPermission): Promise<void>
  hasOrganizationPermission(userId: string, organizationId: string, permission: OrganizationPermission): Promise<boolean>
  requireOrganizationPermission(userId: string, organizationId: string, permission: OrganizationPermission): Promise<void>
  hasVenuePermission(userId: string, venueId: string, permission: VenueEventPermission): Promise<boolean>
  requireVenuePermission(userId: string, venueId: string, permission: VenueEventPermission): Promise<void>
  hasEventPermission(userId: string, eventId: string, permission: VenueEventPermission): Promise<boolean>
  requireEventPermission(userId: string, eventId: string, permission: VenueEventPermission): Promise<void>
}

export function createPermissionService(repository: PermissionRepository): PermissionService {
  async function hasPlatformPermission(userId: string, permission: PlatformPermission): Promise<boolean> {
    const memberships = await repository.getPlatformMemberships(userId)
    return memberships.some((membership) => isActive(membership.status) && hasPlatformRolePermission(membership.role, permission))
  }

  async function hasPlatformOwnerSupportAccess(userId: string): Promise<boolean> {
    const memberships = await repository.getPlatformMemberships(userId)
    return memberships.some((membership) => isActive(membership.status) && membership.role === "platform_owner")
  }

  async function hasOrganizationPermission(
    userId: string,
    organizationId: string,
    permission: OrganizationPermission
  ): Promise<boolean> {
    const membership = await repository.getOrganizationMembership(userId, organizationId)
    return Boolean(membership && isActive(membership.status) && hasOrganizationRolePermission(membership.role, permission))
  }

  async function hasVenuePermission(userId: string, venueId: string, permission: VenueEventPermission): Promise<boolean> {
    const accessRows = await repository.getVenueAccessForUser(userId, venueId)
    return accessRows.some((row) => isActive(row.status) && hasVenueAccessRolePermission(row.role, permission))
  }

  async function hasEventPermission(userId: string, eventId: string, permission: VenueEventPermission): Promise<boolean> {
    const context = await repository.getEventPermissionContext(userId, eventId)
    if (!context.event) {
      return false
    }

    if (isEventScopedPermission(permission) && (await hasPlatformOwnerSupportAccess(userId))) {
      return true
    }

    if (!context.organizationMembership || !isActive(context.organizationMembership.status)) {
      return false
    }

    const operatedOrganizationAccess = context.venueAccess.filter(
      (access) => access.organizationId === context.event?.operatedByOrganizationId && isActive(access.status)
    )
    if (operatedOrganizationAccess.length === 0) {
      return false
    }

    return (
      context.eventStaffAssignments.some(
        (assignment) => isActive(assignment.status) && hasEventStaffRolePermission(assignment.role, permission)
      ) || operatedOrganizationAccess.some((access) => hasVenueAccessRolePermission(access.role, permission))
    )
  }

  return {
    hasPlatformPermission,
    requirePlatformPermission: requirePermission(() => hasPlatformPermission, "platform"),
    hasOrganizationPermission,
    requireOrganizationPermission: requirePermission(() => hasOrganizationPermission, "organization"),
    hasVenuePermission,
    requireVenuePermission: requirePermission(() => hasVenuePermission, "venue"),
    hasEventPermission,
    requireEventPermission: requirePermission(() => hasEventPermission, "event")
  }
}

export function createDrizzlePermissionRepository(db: DbClient): PermissionRepository {
  return {
    async getPlatformMemberships(userId) {
      return db
        .select({ role: platformMemberships.role, status: platformMemberships.status })
        .from(platformMemberships)
        .where(eq(platformMemberships.userId, userId))
    },

    async getOrganizationMembership(userId, organizationId) {
      const rows = await db
        .select({ role: organizationMemberships.role, status: organizationMemberships.status })
        .from(organizationMemberships)
        .where(and(eq(organizationMemberships.userId, userId), eq(organizationMemberships.organizationId, organizationId)))
        .limit(1)

      return rows[0] ?? null
    },

    async getVenueAccessForUser(userId, venueId) {
      const memberships = await db
        .select({
          organizationId: organizationMemberships.organizationId,
          status: organizationMemberships.status
        })
        .from(organizationMemberships)
        .where(eq(organizationMemberships.userId, userId))

      const activeOrganizationIds = new Set(
        memberships.filter((membership) => isActive(membership.status)).map((membership) => membership.organizationId)
      )
      if (activeOrganizationIds.size === 0) {
        return []
      }

      const accessRows = await db
        .select({
          organizationId: venueOrganizationAccess.organizationId,
          role: venueOrganizationAccess.role,
          status: venueOrganizationAccess.status
        })
        .from(venueOrganizationAccess)
        .where(eq(venueOrganizationAccess.venueId, venueId))

      return accessRows.filter((access) => activeOrganizationIds.has(access.organizationId))
    },

    async getEventPermissionContext(userId, eventId) {
      const eventRows = await db
        .select({
          id: events.id,
          venueId: events.venueId,
          operatedByOrganizationId: events.operatedByOrganizationId,
          status: events.status
        })
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1)
      const event = eventRows[0] ?? null

      if (!event) {
        return { event: null, organizationMembership: null, venueAccess: [], eventStaffAssignments: [] }
      }

      const membershipRows = await db
        .select({ role: organizationMemberships.role, status: organizationMemberships.status })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.userId, userId),
            eq(organizationMemberships.organizationId, event.operatedByOrganizationId)
          )
        )
        .limit(1)

      const venueAccessRows = await db
        .select({
          organizationId: venueOrganizationAccess.organizationId,
          role: venueOrganizationAccess.role,
          status: venueOrganizationAccess.status
        })
        .from(venueOrganizationAccess)
        .where(
          and(
            eq(venueOrganizationAccess.venueId, event.venueId),
            eq(venueOrganizationAccess.organizationId, event.operatedByOrganizationId)
          )
        )

      const staffRows = await db
        .select({ role: eventStaffAssignments.role, status: eventStaffAssignments.status })
        .from(eventStaffAssignments)
        .where(and(eq(eventStaffAssignments.eventId, eventId), eq(eventStaffAssignments.userId, userId)))

      return {
        event,
        organizationMembership: membershipRows[0] ?? null,
        venueAccess: venueAccessRows,
        eventStaffAssignments: staffRows
      }
    }
  }
}

function requirePermission<TArgs extends unknown[]>(
  getHas: () => (...args: TArgs) => Promise<boolean>,
  scope: "platform" | "organization" | "venue" | "event"
): (...args: TArgs) => Promise<void> {
  return async (...args) => {
    const allowed = await getHas()(...args)
    if (!allowed) {
      throw new ApiHttpError(403, "FORBIDDEN", `Missing required ${scope} permission`)
    }
  }
}

function isActive(status: string): boolean {
  return status === "active"
}

function isEventScopedPermission(permission: VenueEventPermission): boolean {
  return permission.startsWith("event.")
}
