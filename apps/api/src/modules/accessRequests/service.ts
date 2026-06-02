import { accessRequests, users, venueOrganizationAccess, type DbClient } from "@poza-nuta/db"
import { eq, sql } from "drizzle-orm"
import { ApiHttpError } from "../../errors.ts"

export type AccessRequestSummary = {
  id: string
  email: string
  name: string | null
  organizationName: string | null
  venueName: string | null
  venueId: string | null
  organizationId: string | null
  venueAccessRole: string
  status: string
  message: string | null
}

export type AccessRequestsService = {
  listAccessRequests(): Promise<AccessRequestSummary[]>
  approveAccessRequest(accessRequestId: string, reviewerUserId: string): Promise<AccessRequestSummary>
  rejectAccessRequest(accessRequestId: string, reviewerUserId: string): Promise<AccessRequestSummary>
}

export function createAccessRequestsService(db: DbClient): AccessRequestsService {
  return {
    async listAccessRequests() {
      return db
        .select({
          id: accessRequests.id,
          email: accessRequests.email,
          name: accessRequests.name,
          organizationName: accessRequests.organizationName,
          venueName: accessRequests.venueName,
          venueId: accessRequests.venueId,
          organizationId: accessRequests.organizationId,
          venueAccessRole: accessRequests.venueAccessRole,
          status: accessRequests.status,
          message: accessRequests.message
        })
        .from(accessRequests)
    },

    async approveAccessRequest(accessRequestId, reviewerUserId) {
      const approve = async (tx: DbClient) => {
        const request = await findAccessRequest(tx, accessRequestId)

        const updated = await updateStatus(tx, accessRequestId, "approved", reviewerUserId)

        if (request.venueId && request.organizationId) {
          await tx
            .insert(venueOrganizationAccess)
            .values({
              venueId: request.venueId,
              organizationId: request.organizationId,
              role: request.venueAccessRole,
              status: "active",
              grantedByUserId: reviewerUserId
            })
            .onConflictDoUpdate({
              target: [venueOrganizationAccess.venueId, venueOrganizationAccess.organizationId, venueOrganizationAccess.role],
              set: {
                status: "active",
                grantedByUserId: reviewerUserId,
                updatedAt: sql`now()`
              }
            })
        }

        await tx.update(users).set({ status: "active", updatedAt: sql`now()` }).where(eq(users.email, request.email))

        return updated
      }

      return "transaction" in db ? db.transaction(approve as never) : approve(db)
    },

    async rejectAccessRequest(accessRequestId, reviewerUserId) {
      return updateStatus(db, accessRequestId, "rejected", reviewerUserId)
    }
  }
}

async function findAccessRequest(db: DbClient, accessRequestId: string): Promise<AccessRequestSummary> {
  const rows = await db
    .select({
      id: accessRequests.id,
      email: accessRequests.email,
      name: accessRequests.name,
      organizationName: accessRequests.organizationName,
      venueName: accessRequests.venueName,
      venueId: accessRequests.venueId,
      organizationId: accessRequests.organizationId,
      venueAccessRole: accessRequests.venueAccessRole,
      status: accessRequests.status,
      message: accessRequests.message
    })
    .from(accessRequests)
    .where(eq(accessRequests.id, accessRequestId))
    .limit(1)

  if (!rows[0]) {
    throw new ApiHttpError(404, "NOT_FOUND", "Missing access request")
  }

  return rows[0]
}

async function updateStatus(
  db: DbClient,
  accessRequestId: string,
  status: "approved" | "rejected",
  reviewerUserId: string
): Promise<AccessRequestSummary> {
  const rows = await db
    .update(accessRequests)
    .set({
      status,
      reviewedByUserId: reviewerUserId,
      reviewedAt: sql`now()`,
      updatedAt: sql`now()`
    })
    .where(eq(accessRequests.id, accessRequestId))
    .returning({
      id: accessRequests.id,
      email: accessRequests.email,
      name: accessRequests.name,
      organizationName: accessRequests.organizationName,
      venueName: accessRequests.venueName,
      venueId: accessRequests.venueId,
      organizationId: accessRequests.organizationId,
      venueAccessRole: accessRequests.venueAccessRole,
      status: accessRequests.status,
      message: accessRequests.message
    })

  if (!rows[0]) {
    throw new ApiHttpError(404, "NOT_FOUND", "Missing access request")
  }

  return rows[0]
}
