import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { parseApiConfig } from "../apps/api/src/config.ts"
import { createDbClientOptions } from "../apps/api/src/plugins/db.ts"
import { buildPoolConfig, createDbClient } from "../packages/db/src/client.ts"

const CONNECTION_STRING = "postgres://poza_nuta:poza_nuta@db.internal:5432/poza_nuta"

test("buildPoolConfig maps DB runtime options to pg Pool config", () => {
  const poolConfig = buildPoolConfig(CONNECTION_STRING, {
    poolMax: 12,
    idleTimeoutMs: 25_000,
    connectionTimeoutMs: 4_000,
    statementTimeoutMs: 12_000,
    lockTimeoutMs: 3_000,
    applicationName: "stagequeue-api-test"
  })

  assert.equal(poolConfig.connectionString, CONNECTION_STRING)
  assert.equal(poolConfig.max, 12)
  assert.equal(poolConfig.idleTimeoutMillis, 25_000)
  assert.equal(poolConfig.connectionTimeoutMillis, 4_000)
  assert.equal(poolConfig.statement_timeout, 12_000)
  assert.equal(poolConfig.lock_timeout, 3_000)
  assert.equal(poolConfig.application_name, "stagequeue-api-test")
})

test("createDbClient constructs pg Pool with DB runtime options", async () => {
  const { pool } = createDbClient(CONNECTION_STRING, {
    poolMax: 8,
    idleTimeoutMs: 20_000,
    connectionTimeoutMs: 2_000,
    statementTimeoutMs: 9_000,
    lockTimeoutMs: 1_000,
    applicationName: "stagequeue-api-client-test"
  })

  try {
    const options = (pool as unknown as { options: Record<string, unknown> }).options

    assert.equal(options.max, 8)
    assert.equal(options.idleTimeoutMillis, 20_000)
    assert.equal(options.connectionTimeoutMillis, 2_000)
    assert.equal(options.statement_timeout, 9_000)
    assert.equal(options.lock_timeout, 1_000)
    assert.equal(options.application_name, "stagequeue-api-client-test")
  } finally {
    await pool.end()
  }
})

test("db plugin maps ApiConfig DB runtime settings to createDbClient options", () => {
  const config = parseApiConfig({
    NODE_ENV: "test",
    DATABASE_POOL_MAX: "11",
    DATABASE_IDLE_TIMEOUT_MS: "21000",
    DATABASE_CONNECTION_TIMEOUT_MS: "3100",
    DATABASE_STATEMENT_TIMEOUT_MS: "11000",
    DATABASE_LOCK_TIMEOUT_MS: "4100",
    DATABASE_APPLICATION_NAME: "stagequeue-api-plugin-test"
  })

  assert.deepEqual(createDbClientOptions(config), {
    poolMax: 11,
    idleTimeoutMs: 21_000,
    connectionTimeoutMs: 3_100,
    statementTimeoutMs: 11_000,
    lockTimeoutMs: 4_100,
    applicationName: "stagequeue-api-plugin-test"
  })
})

test("CI DB migration smoke script uses createDbClient path", () => {
  const source = readFileSync("apps/api/scripts/ci-db-migration-smoke.ts", "utf8")

  assert.match(source, /createDbClient/)
  assert.match(source, /const \{ db, pool \} = createDbClient\(databaseUrl\)/)
})
