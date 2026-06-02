import {
  organizationMemberships,
  organizationStatuses,
  organizationTypes,
  organizations,
  users,
  type DbClient,
  type OrganizationStatus,
  type OrganizationType
} from "@poza-nuta/db"
import { and, eq, sql } from "drizzle-orm"
import { ApiHttpError } from "../../errors.ts"

export type OrganizationSummary = {
  id: string
  slug: string
  name: string
  type: string
  status: string
}

export type OrganizationMemberSummary = {
  id: string
  userId: string
  email: string
  name: string | null
  role: string
  status: string
}

export type CreateOrganizationInput = {
  name: string
  slug: string
  type: OrganizationType
  status?: OrganizationStatus
  ownerUserId?: string
}

export type PatchOrganizationInput = {
  name?: string
  type?: OrganizationType
  status?: OrganizationStatus
}

export type OrganizationsService = {
  listForUser(userId: string): Promise<OrganizationSummary[]>
  listForPlatform(): Promise<OrganizationSummary[]>
  getById(organizationId: string): Promise<OrganizationSummary | null>
  hasActiveMembership(userId: string, organizationId: string): Promise<boolean>
  createOrganization(input: CreateOrganizationInput): Promise<OrganizationSummary>
  patchOrganization(organizationId: string, input: PatchOrganizationInput): Promise<OrganizationSummary>
  listMembers(organizationId: string): Promise<OrganizationMemberSummary[]>
}

export function createOrganizationsService(db: DbClient): OrganizationsService {
  return {
    async listForUser(userId) {
      return db
        .select({
          id: organizations.id,
          slug: organizations.slug,
          name: organizations.name,
          type: organizations.type,
          status: organizations.status
        })
        .from(organizationMemberships)
        .innerJoin(organizations, eq(organizationMemberships.organizationId, organizations.id))
        .where(and(eq(organizationMemberships.userId, userId), eq(organizationMemberships.status, "active")))
    },

    async listForPlatform() {
      return db
        .select({
          id: organizations.id,
          slug: organizations.slug,
          name: organizations.name,
          type: organizations.type,
          status: organizations.status
        })
        .from(organizations)
    },

    async getById(organizationId) {
      const rows = await db
        .select({
          id: organizations.id,
          slug: organizations.slug,
          name: organizations.name,
          type: organizations.type,
          status: organizations.status
        })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1)

      return rows[0] ?? null
    },

    async hasActiveMembership(userId, organizationId) {
      const rows = await db
        .select({ id: organizationMemberships.id })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.userId, userId),
            eq(organizationMemberships.organizationId, organizationId),
            eq(organizationMemberships.status, "active")
          )
        )
        .limit(1)

      return rows.length > 0
    },

    async createOrganization(input) {
      const create = async (tx: DbClient) => {
        const organization = (
          await tx
            .insert(organizations)
            .values({
              name: input.name,
              slug: input.slug,
              type: input.type,
              status: input.status ?? "active"
            })
            .returning({
              id: organizations.id,
              slug: organizations.slug,
              name: organizations.name,
              type: organizations.type,
              status: organizations.status
            })
        )[0]

        if (!organization) {
          throw new Error("Failed to create organization")
        }

        if (input.ownerUserId) {
          await tx.insert(organizationMemberships).values({
            organizationId: organization.id,
            userId: input.ownerUserId,
            role: "owner",
            status: "active"
          })
        }

        return organization
      }

      return "transaction" in db ? db.transaction(create as never) : create(db)
    },

    async patchOrganization(organizationId, input) {
      const update: Partial<typeof organizations.$inferInsert> = {}
      if (input.name !== undefined) {
        update.name = input.name
      }
      if (input.type !== undefined) {
        update.type = input.type
      }
      if (input.status !== undefined) {
        update.status = input.status
      }

      if (Object.keys(update).length === 0) {
        const existing = await this.getById(organizationId)
        if (!existing) {
          throw notFound("Missing organization")
        }
        return existing
      }

      const rows = await db
        .update(organizations)
        .set({ ...update, updatedAt: sql`now()` })
        .where(eq(organizations.id, organizationId))
        .returning({
          id: organizations.id,
          slug: organizations.slug,
          name: organizations.name,
          type: organizations.type,
          status: organizations.status
        })

      if (!rows[0]) {
        throw notFound("Missing organization")
      }

      return rows[0]
    },

    async listMembers(organizationId) {
      return db
        .select({
          id: organizationMemberships.id,
          userId: users.id,
          email: users.email,
          name: users.name,
          role: organizationMemberships.role,
          status: organizationMemberships.status
        })
        .from(organizationMemberships)
        .innerJoin(users, eq(organizationMemberships.userId, users.id))
        .where(eq(organizationMemberships.organizationId, organizationId))
    }
  }
}

export const allowedOrganizationTypes = organizationTypes
export const allowedOrganizationStatuses = organizationStatuses

function notFound(message: string): ApiHttpError {
  return new ApiHttpError(404, "NOT_FOUND", message)
}
