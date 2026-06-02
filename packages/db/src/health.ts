import { sql } from "drizzle-orm"
import type { DbClient } from "./client.ts"

export async function checkDbConnection(db: DbClient): Promise<void> {
  await db.execute(sql`select 1`)
}
