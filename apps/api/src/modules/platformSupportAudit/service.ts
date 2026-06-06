import { platformMemberships, platformSupportAuditEvents, type DbClient } from "@poza-nuta/db"
import { and, desc, eq, type SQL } from "drizzle-orm"

export type PlatformSupportAuditEventSummary = {
  id: string
  createdAt: Date
  actorUserId: string
  targetEventId: string
  operation: string
  permission: string
  accessType: string
  outcome: string
  metadata: unknown
}

export type ListPlatformSupportAuditEventsInput = {
  actorUserId?: string
  limit: number
  offset: number
  operation?: string
  targetEventId?: string
}

export type PlatformSupportAuditService = {
  hasActivePlatformOwner(userId: string): Promise<boolean>
  listSupportAuditEvents(input: ListPlatformSupportAuditEventsInput): Promise<PlatformSupportAuditEventSummary[]>
}

export function createPlatformSupportAuditService(db: DbClient): PlatformSupportAuditService {
  return {
    async hasActivePlatformOwner(userId) {
      const rows = await db
        .select({ id: platformMemberships.id })
        .from(platformMemberships)
        .where(
          and(
            eq(platformMemberships.userId, userId),
            eq(platformMemberships.role, "platform_owner"),
            eq(platformMemberships.status, "active")
          )
        )
        .limit(1)

      return rows.length > 0
    },

    async listSupportAuditEvents(input) {
      const filters: SQL[] = []
      if (input.actorUserId) {
        filters.push(eq(platformSupportAuditEvents.actorUserId, input.actorUserId))
      }
      if (input.targetEventId) {
        filters.push(eq(platformSupportAuditEvents.targetEventId, input.targetEventId))
      }
      if (input.operation) {
        filters.push(eq(platformSupportAuditEvents.operation, input.operation))
      }

      let query = db
        .select({
          id: platformSupportAuditEvents.id,
          createdAt: platformSupportAuditEvents.createdAt,
          actorUserId: platformSupportAuditEvents.actorUserId,
          targetEventId: platformSupportAuditEvents.targetEventId,
          operation: platformSupportAuditEvents.operation,
          permission: platformSupportAuditEvents.permission,
          accessType: platformSupportAuditEvents.accessType,
          outcome: platformSupportAuditEvents.outcome,
          metadata: platformSupportAuditEvents.metadata
        })
        .from(platformSupportAuditEvents)
        .$dynamic()

      if (filters.length > 0) {
        query = query.where(and(...filters))
      }

      return query.orderBy(desc(platformSupportAuditEvents.createdAt)).limit(input.limit).offset(input.offset)
    }
  }
}
