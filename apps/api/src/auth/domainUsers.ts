import { eq, or, sql } from "drizzle-orm"
import type { DbClient } from "@poza-nuta/db"
import { platformMemberships, users } from "@poza-nuta/db"
import { isPlatformRole, type PlatformRole } from "@poza-nuta/domain/permissions"
import { shouldBootstrapPlatformOwner, type AuthenticatedDomainUser } from "./access.ts"

export type AuthSessionUser = {
  id: string
  email: string
  name?: string | null | undefined
  image?: string | null | undefined
}

export type DomainSessionProfile = {
  user: AuthenticatedDomainUser
  platformRoles: PlatformRole[]
}

export async function getOrCreateDomainUserForAuthUser(
  db: DbClient,
  authUser: AuthSessionUser,
  bootstrapPlatformOwnerEmail?: string
): Promise<DomainSessionProfile> {
  const email = authUser.email.trim().toLowerCase()
  const shouldBootstrapOwner = shouldBootstrapPlatformOwner(email, bootstrapPlatformOwnerEmail)
  const existing = await db
    .select()
    .from(users)
    .where(or(eq(users.authUserId, authUser.id), eq(users.email, email)))
    .limit(1)

  const user =
    existing[0] ??
    (
      await db
        .insert(users)
        .values({
          authUserId: authUser.id,
          email,
          name: authUser.name ?? null,
          avatarUrl: authUser.image ?? null,
          status: shouldBootstrapOwner ? "active" : "pending"
        })
        .returning()
    )[0]

  if (!user) {
    throw new Error("Failed to create domain user")
  }

  const updates: Partial<typeof users.$inferInsert> = {}
  if (!user.authUserId) {
    updates.authUserId = authUser.id
  }
  if (authUser.name && user.name !== authUser.name) {
    updates.name = authUser.name
  }
  if (authUser.image && user.avatarUrl !== authUser.image) {
    updates.avatarUrl = authUser.image
  }
  if (shouldBootstrapOwner && user.status !== "active") {
    updates.status = "active"
  }

  const domainUser =
    Object.keys(updates).length > 0
      ? (
          await db
            .update(users)
            .set({ ...updates, updatedAt: sql`now()` })
            .where(eq(users.id, user.id))
            .returning()
        )[0]
      : user

  if (!domainUser) {
    throw new Error("Failed to update domain user")
  }

  if (shouldBootstrapOwner) {
    await grantPlatformOwner(db, domainUser.id)
  }

  return {
    user: {
      id: domainUser.id,
      email: domainUser.email,
      name: domainUser.name,
      status: domainUser.status as AuthenticatedDomainUser["status"]
    },
    platformRoles: await getActivePlatformRoles(db, domainUser.id)
  }
}

export async function grantPlatformOwner(db: DbClient, userId: string): Promise<void> {
  await db
    .insert(platformMemberships)
    .values({
      userId,
      role: "platform_owner",
      status: "active"
    })
    .onConflictDoUpdate({
      target: [platformMemberships.userId, platformMemberships.role],
      set: {
        status: "active",
        updatedAt: sql`now()`
      }
    })
}

export async function getActivePlatformRoles(db: DbClient, userId: string): Promise<PlatformRole[]> {
  const rows = await db
    .select({ role: platformMemberships.role })
    .from(platformMemberships)
    .where(sql`${platformMemberships.userId} = ${userId} and ${platformMemberships.status} = 'active'`)

  return rows.map((row) => row.role).filter(isPlatformRole)
}
