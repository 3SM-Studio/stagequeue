import { drizzle } from "drizzle-orm/node-postgres"
import pg from "pg"
import * as schema from "./schema.ts"

const { Pool } = pg

export type DbClientOptions = {
  poolMax?: number
  idleTimeoutMs?: number
  connectionTimeoutMs?: number
  statementTimeoutMs?: number
  lockTimeoutMs?: number
  applicationName?: string
}

export function createDbClient(connectionString = process.env.DATABASE_URL, options: DbClientOptions = {}) {
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL")
  }

  const pool = new Pool(buildPoolConfig(connectionString, options))
  const db = drizzle(pool, { schema })

  return { db, pool }
}

export function buildPoolConfig(connectionString: string, options: DbClientOptions = {}): pg.PoolConfig {
  return {
    connectionString,
    max: options.poolMax,
    idleTimeoutMillis: options.idleTimeoutMs,
    connectionTimeoutMillis: options.connectionTimeoutMs,
    statement_timeout: options.statementTimeoutMs,
    lock_timeout: options.lockTimeoutMs,
    application_name: options.applicationName
  }
}

export type DbClient = ReturnType<typeof createDbClient>["db"]
export type DbPool = ReturnType<typeof createDbClient>["pool"]
