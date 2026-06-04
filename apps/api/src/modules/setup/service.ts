import { timingSafeEqual } from "node:crypto"
import { and, eq, sql } from "drizzle-orm"
import type { DbClient } from "@poza-nuta/db"
import { platformMemberships, users } from "@poza-nuta/db"
import type { AuthenticatedDomainUser } from "../../auth/access.ts"
import { ApiHttpError } from "../../errors.ts"

type DbTransaction = Parameters<Parameters<DbClient["transaction"]>[0]>[0]
type SetupDbClient = DbClient | DbTransaction

export type PlatformSetupStatus = {
  setupRequired: boolean
}

export type PlatformSetupClaimResult = {
  user: AuthenticatedDomainUser
  platform: {
    roles: ["platform_owner"]
  }
}

export type PlatformSetupRepository = {
  hasActivePlatformOwner(): Promise<boolean>
  activateUser(userId: string): Promise<AuthenticatedDomainUser>
  grantPlatformOwner(userId: string, grantedByUserId: string): Promise<void>
  withSetupLock<T>(operation: (repository: PlatformSetupRepository) => Promise<T>): Promise<T>
}

export type PlatformSetupService = {
  getStatus(): Promise<PlatformSetupStatus>
  claimPlatformOwner(user: AuthenticatedDomainUser, setupToken: string, expectedSetupToken?: string): Promise<PlatformSetupClaimResult>
}

export function createPlatformSetupService(repository: PlatformSetupRepository): PlatformSetupService {
  return {
    async getStatus() {
      return {
        setupRequired: !(await repository.hasActivePlatformOwner())
      }
    },

    async claimPlatformOwner(user, setupToken, expectedSetupToken) {
      if (!isValidSetupToken(setupToken, expectedSetupToken)) {
        throw new ApiHttpError(403, "INVALID_SETUP_TOKEN", "Invalid setup token")
      }

      return repository.withSetupLock(async (lockedRepository) => {
        if (await lockedRepository.hasActivePlatformOwner()) {
          throw new ApiHttpError(409, "SETUP_ALREADY_COMPLETED", "Platform setup is already completed")
        }

        const activeUser = await lockedRepository.activateUser(user.id)
        await lockedRepository.grantPlatformOwner(activeUser.id, activeUser.id)

        return {
          user: activeUser,
          platform: {
            roles: ["platform_owner"]
          }
        }
      })
    }
  }
}

export function createDbPlatformSetupRepository(db: DbClient): PlatformSetupRepository {
  return createDbPlatformSetupRepositoryForClient(db, async (operation) =>
    db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('poza_nuta_platform_setup'))`)
      return operation(createDbPlatformSetupRepositoryForClient(tx))
    })
  )
}

function createDbPlatformSetupRepositoryForClient(
  db: SetupDbClient,
  withSetupLock: PlatformSetupRepository["withSetupLock"] = async (operation) => operation(createDbPlatformSetupRepositoryForClient(db))
): PlatformSetupRepository {
  return {
    async hasActivePlatformOwner() {
      const rows = await db
        .select({ id: platformMemberships.id })
        .from(platformMemberships)
        .where(and(eq(platformMemberships.role, "platform_owner"), eq(platformMemberships.status, "active")))
        .limit(1)

      return rows.length > 0
    },

    async activateUser(userId) {
      const user = (
        await db
          .update(users)
          .set({
            status: "active",
            updatedAt: sql`now()`
          })
          .where(eq(users.id, userId))
          .returning()
      )[0]

      if (!user) {
        throw new ApiHttpError(404, "USER_NOT_FOUND", "User not found")
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        status: user.status as AuthenticatedDomainUser["status"]
      }
    },

    async grantPlatformOwner(userId, grantedByUserId) {
      await db
        .insert(platformMemberships)
        .values({
          userId,
          role: "platform_owner",
          status: "active",
          grantedByUserId
        })
        .onConflictDoUpdate({
          target: [platformMemberships.userId, platformMemberships.role],
          set: {
            status: "active",
            grantedByUserId,
            updatedAt: sql`now()`
          }
        })
    },

    withSetupLock
  }
}

function isValidSetupToken(setupToken: string, expectedSetupToken: string | undefined): boolean {
  const token = setupToken.trim()
  const expected = expectedSetupToken?.trim()

  if (!token || !expected) {
    return false
  }

  const tokenBuffer = Buffer.from(token)
  const expectedBuffer = Buffer.from(expected)

  return tokenBuffer.length === expectedBuffer.length && timingSafeEqual(tokenBuffer, expectedBuffer)
}
