import {
  accessRequests,
  organizationMemberships,
  venueAccessRoles,
  venueOrganizationAccess,
  venueVerificationStatuses,
  venues,
  type DbClient
} from "@poza-nuta/db"
import { and, eq, sql } from "drizzle-orm"
import { ApiHttpError } from "../../errors.ts"
import { isPublicVenueVisible } from "../publicVisibility.ts"

export type VenueSummary = {
  id: string
  slug: string
  name: string
  address: string | null
  city: string | null
  country: string
  timezone: string
  status: string
  verificationStatus: string
  claimedByOrganizationId: string | null
}

export type VenueAccessSummary = {
  id: string
  venueId: string
  organizationId: string
  role: string
  status: string
}

export type CreateVenueInput = {
  name: string
  slug: string
  createdByUserId: string
  address?: string
  city?: string
  country?: string
  timezone?: string
  organizationId?: string
  accessRole?: string
}

export type PatchVenueInput = {
  name?: string
  address?: string | null
  city?: string | null
  country?: string
  timezone?: string
  status?: string
  verificationStatus?: string
}

export type CreateVenueAccessRequestInput = {
  userId: string
  email: string
  name: string | null
  venueId: string
  organizationId: string
  role: string
  message?: string
}

export type VenuesService = {
  listForUser(userId: string, options?: { includeAll?: boolean }): Promise<VenueSummary[]>
  listForPlatform(): Promise<VenueSummary[]>
  getById(venueId: string): Promise<VenueSummary | null>
  getBySlug(slug: string): Promise<VenueSummary | null>
  createVenue(input: CreateVenueInput): Promise<VenueSummary>
  patchVenue(venueId: string, input: PatchVenueInput): Promise<VenueSummary>
  listAccess(venueId: string): Promise<VenueAccessSummary[]>
  createAccessRequest(input: CreateVenueAccessRequestInput): Promise<{ id: string; status: string }>
}

export function createVenuesService(db: DbClient): VenuesService {
  return {
    async listForUser(userId, options = {}) {
      if (options.includeAll) {
        return this.listForPlatform()
      }

      return db
        .select({
          id: venues.id,
          slug: venues.slug,
          name: venues.name,
          address: venues.address,
          city: venues.city,
          country: venues.country,
          timezone: venues.timezone,
          status: venues.status,
          verificationStatus: venues.verificationStatus,
          claimedByOrganizationId: venues.claimedByOrganizationId
        })
        .from(organizationMemberships)
        .innerJoin(
          venueOrganizationAccess,
          and(
            eq(organizationMemberships.organizationId, venueOrganizationAccess.organizationId),
            eq(venueOrganizationAccess.status, "active")
          )
        )
        .innerJoin(venues, eq(venueOrganizationAccess.venueId, venues.id))
        .where(and(eq(organizationMemberships.userId, userId), eq(organizationMemberships.status, "active")))
    },

    async listForPlatform() {
      return db
        .select({
          id: venues.id,
          slug: venues.slug,
          name: venues.name,
          address: venues.address,
          city: venues.city,
          country: venues.country,
          timezone: venues.timezone,
          status: venues.status,
          verificationStatus: venues.verificationStatus,
          claimedByOrganizationId: venues.claimedByOrganizationId
        })
        .from(venues)
    },

    async getById(venueId) {
      const rows = await db
        .select(venueSelection)
        .from(venues)
        .where(eq(venues.id, venueId))
        .limit(1)

      return rows[0] ?? null
    },

    async getBySlug(slug) {
      const rows = await db.select(venueSelection).from(venues).where(eq(venues.slug, slug)).limit(1)
      return rows[0] ?? null
    },

    async createVenue(input) {
      const create = async (tx: DbClient) => {
        const venue = (
          await tx
            .insert(venues)
            .values({
              name: input.name,
              slug: input.slug,
              address: input.address,
              city: input.city,
              country: input.country ?? "PL",
              timezone: input.timezone ?? "Europe/Warsaw",
              status: "draft",
              verificationStatus: "pending",
              createdByUserId: input.createdByUserId
            })
            .returning({
              id: venues.id,
              slug: venues.slug,
              name: venues.name,
              address: venues.address,
              city: venues.city,
              country: venues.country,
              timezone: venues.timezone,
              status: venues.status,
              verificationStatus: venues.verificationStatus,
              claimedByOrganizationId: venues.claimedByOrganizationId
            })
        )[0]

        if (!venue) {
          throw new Error("Failed to create venue")
        }

        if (input.organizationId) {
          await tx.insert(venueOrganizationAccess).values({
            venueId: venue.id,
            organizationId: input.organizationId,
            role: input.accessRole ?? "event_creator",
            status: "pending",
            requestedByUserId: input.createdByUserId
          })
        }

        return venue
      }

      return "transaction" in db ? db.transaction(create as never) : create(db)
    },

    async patchVenue(venueId, input) {
      const update: Partial<typeof venues.$inferInsert> = {}
      for (const key of ["name", "address", "city", "country", "timezone", "status", "verificationStatus"] as const) {
        if (input[key] !== undefined) {
          update[key] = input[key] as never
        }
      }

      if (Object.keys(update).length === 0) {
        const existing = await this.getById(venueId)
        if (!existing) {
          throw notFound("Missing venue")
        }
        return existing
      }

      const rows = await db
        .update(venues)
        .set({ ...update, updatedAt: sql`now()` })
        .where(eq(venues.id, venueId))
        .returning({
          id: venues.id,
          slug: venues.slug,
          name: venues.name,
          address: venues.address,
          city: venues.city,
          country: venues.country,
          timezone: venues.timezone,
          status: venues.status,
          verificationStatus: venues.verificationStatus,
          claimedByOrganizationId: venues.claimedByOrganizationId
        })

      if (!rows[0]) {
        throw notFound("Missing venue")
      }

      return rows[0]
    },

    async listAccess(venueId) {
      return db
        .select({
          id: venueOrganizationAccess.id,
          venueId: venueOrganizationAccess.venueId,
          organizationId: venueOrganizationAccess.organizationId,
          role: venueOrganizationAccess.role,
          status: venueOrganizationAccess.status
        })
        .from(venueOrganizationAccess)
        .where(eq(venueOrganizationAccess.venueId, venueId))
    },

    async createAccessRequest(input) {
      const existing = await db
        .select({ id: accessRequests.id, status: accessRequests.status })
        .from(accessRequests)
        .where(
          and(
            eq(accessRequests.venueId, input.venueId),
            eq(accessRequests.organizationId, input.organizationId),
            eq(accessRequests.status, "pending")
          )
        )
        .limit(1)

      if (existing[0]) {
        return existing[0]
      }

      const rows = await db
        .insert(accessRequests)
        .values({
          email: input.email,
          name: input.name,
          venueId: input.venueId,
          organizationId: input.organizationId,
          venueAccessRole: input.role,
          message: input.message
        })
        .returning({ id: accessRequests.id, status: accessRequests.status })

      if (!rows[0]) {
        throw new Error("Failed to create access request")
      }

      return rows[0]
    }
  }
}

export const allowedVenueAccessRoles = venueAccessRoles
export const allowedVenueVerificationStatuses = venueVerificationStatuses

export function isVenuePubliclyVisible(venue: Pick<VenueSummary, "status" | "verificationStatus">): boolean {
  return isPublicVenueVisible(venue)
}

const venueSelection = {
  id: venues.id,
  slug: venues.slug,
  name: venues.name,
  address: venues.address,
  city: venues.city,
  country: venues.country,
  timezone: venues.timezone,
  status: venues.status,
  verificationStatus: venues.verificationStatus,
  claimedByOrganizationId: venues.claimedByOrganizationId
}

function notFound(message: string): ApiHttpError {
  return new ApiHttpError(404, "NOT_FOUND", message)
}
