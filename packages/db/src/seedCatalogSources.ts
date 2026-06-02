import { sql } from "drizzle-orm"
import { createDbClient } from "./client.ts"
import { songSources } from "./schema.ts"

const sources = [
  { id: "ising", name: "iSing", status: "active" },
  { id: "karafun", name: "KaraFun", status: "active" }
]

const localDatabaseUrl = "postgres://poza_nuta:poza_nuta@localhost:5432/poza_nuta"
const { db, pool } = createDbClient(process.env.DATABASE_URL ?? localDatabaseUrl)

try {
  await db
    .insert(songSources)
    .values(sources)
    .onConflictDoUpdate({
      target: songSources.id,
      set: {
        name: sql`excluded.name`,
        status: sql`excluded.status`,
        updatedAt: sql`now()`
      }
    })

  console.log("Seeded catalog sources: ising, karafun")
} finally {
  await pool.end()
}
