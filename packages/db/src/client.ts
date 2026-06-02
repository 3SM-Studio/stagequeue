import { drizzle } from "drizzle-orm/node-postgres"
import pg from "pg"
import * as schema from "./schema.ts"

const { Pool } = pg

export function createDbClient(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL")
  }

  const pool = new Pool({ connectionString })
  const db = drizzle(pool, { schema })

  return { db, pool }
}

export type DbClient = ReturnType<typeof createDbClient>["db"]
export type DbPool = ReturnType<typeof createDbClient>["pool"]
