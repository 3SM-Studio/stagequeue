import type { DbClient, DbClientOptions, DbPool } from "@poza-nuta/db"
import { createDbClient } from "@poza-nuta/db"
import type { FastifyInstance } from "fastify"
import type { ApiConfig } from "../config.ts"

export type DbResources = {
  db: DbClient
  pool: DbPool
}

declare module "fastify" {
  interface FastifyInstance {
    db: DbClient
    dbPool: DbPool
  }
}

export async function registerDb(app: FastifyInstance, config: ApiConfig, resources?: DbResources): Promise<void> {
  const dbResources = resources ?? createDbClient(config.databaseUrl, createDbClientOptions(config))

  if ("on" in dbResources.pool && typeof dbResources.pool.on === "function") {
    dbResources.pool.on("error", (error: unknown) => {
      app.log.error(
        {
          event: "db_pool_error",
          operation: "idle_client_error",
          ...toSafeErrorFields(error, [config.databaseUrl])
        },
        "DB pool error"
      )
    })
  }

  app.decorate("db", dbResources.db)
  app.decorate("dbPool", dbResources.pool)
  app.addHook("onClose", async () => {
    await dbResources.pool.end()
  })
}

export function createDbClientOptions(config: ApiConfig): DbClientOptions {
  return {
    poolMax: config.databasePoolMax,
    idleTimeoutMs: config.databaseIdleTimeoutMs,
    connectionTimeoutMs: config.databaseConnectionTimeoutMs,
    statementTimeoutMs: config.databaseStatementTimeoutMs,
    lockTimeoutMs: config.databaseLockTimeoutMs,
    applicationName: config.databaseApplicationName
  }
}

function toSafeErrorFields(error: unknown, redactedValues: string[] = []): { errorName: string; errorMessage: string; errorCode?: string } {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: sanitizeErrorMessage(error.message, redactedValues),
      ...readErrorCode(error)
    }
  }

  return {
    errorName: "Error",
    errorMessage: sanitizeErrorMessage(String(error), redactedValues)
  }
}

function readErrorCode(error: Error): { errorCode?: string } {
  const code = (error as { code?: unknown }).code
  return typeof code === "string" ? { errorCode: code } : {}
}

function sanitizeErrorMessage(message: string, redactedValues: string[]): string {
  let sanitized = message
  for (const value of redactedValues) {
    if (value) {
      sanitized = sanitized.split(value).join("[redacted]")
    }
  }
  return sanitized.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]")
}
