import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import { type DbClient, authAccounts, authSessions, authUsers, authVerifications } from "@poza-nuta/db"
import { betterAuth } from "better-auth"
import type { ApiConfig } from "../config.ts"

export function createBetterAuth(config: ApiConfig, db: DbClient) {
  return betterAuth({
    baseURL: config.apiUrl,
    basePath: "/auth",
    secret: config.authSecret,
    trustedOrigins: [config.publicWebUrl, config.dashboardWebUrl],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: authUsers,
        session: authSessions,
        account: authAccounts,
        verification: authVerifications
      }
    }),
    socialProviders: {
      google: {
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret
      }
    },
    advanced: {
      useSecureCookies: config.nodeEnv === "production",
      crossSubDomainCookies: config.cookieDomain
        ? {
            enabled: true,
            domain: config.cookieDomain
          }
        : undefined
    }
  })
}

export type BetterAuthInstance = ReturnType<typeof createBetterAuth>
