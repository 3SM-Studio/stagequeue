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
