import assert from "node:assert/strict"
import test from "node:test"
import { parseApiConfig } from "../apps/api/src/config.ts"
import { validateWebConfigEnv } from "../scripts/check-web-config.mjs"

test("production config fails without required auth secret", () => {
  assert.throws(
    () =>
      parseApiConfig({
        ...validProductionEnv(),
        AUTH_SECRET: undefined
      }),
    (error) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /Invalid production configuration/)
      assert.match(error.message, /AUTH_SECRET is required in production/)
      assert.equal(error.message.includes(validProductionEnv().GOOGLE_CLIENT_SECRET), false)
      return true
    }
  )
})

test("production config fails for placeholder secrets", () => {
  assert.throws(
    () =>
      parseApiConfig({
        ...validProductionEnv(),
        AUTH_SECRET: "replace_me_with_at_least_32_random_characters"
      }),
    (error) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /AUTH_SECRET must not use a placeholder value in production/)
      assert.equal(error.message.includes("replace_me_with_at_least_32_random_characters"), false)
      return true
    }
  )
})

test("production config rejects localhost and non-https app URLs", () => {
  assert.throws(
    () =>
      parseApiConfig({
        ...validProductionEnv(),
        API_URL: "http://localhost:4321",
        DATABASE_URL: "postgres://user:pass@localhost:5432/poza_nuta"
      }),
    (error) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /API_URL must use https in production/)
      assert.match(error.message, /API_URL must not point to localhost in production/)
      assert.match(error.message, /DATABASE_URL must not point to localhost in production/)
      return true
    }
  )
})

test("production config fails without Redis URL", () => {
  assert.throws(
    () =>
      parseApiConfig({
        ...validProductionEnv(),
        REDIS_URL: undefined
      }),
    (error) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /Invalid production configuration/)
      assert.match(error.message, /REDIS_URL is required in production/)
      return true
    }
  )
})

test("production config rejects invalid Redis URL protocol", () => {
  assert.throws(
    () =>
      parseApiConfig({
        ...validProductionEnv(),
        REDIS_URL: "http://redis.internal:6379"
      }),
    (error) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /REDIS_URL must use redis or rediss protocol in production/)
      return true
    }
  )
})

test("production config accepts localhost Redis URL", () => {
  const config = parseApiConfig({
    ...validProductionEnv(),
    REDIS_URL: "redis://localhost:6379"
  })

  assert.equal(config.redisUrl, "redis://localhost:6379")
})

test("development config keeps local defaults", () => {
  const config = parseApiConfig({ NODE_ENV: "development" })

  assert.equal(config.nodeEnv, "development")
  assert.equal(config.databaseUrl, "postgres://poza_nuta:poza_nuta@localhost:5432/poza_nuta")
  assert.equal(config.databasePoolMax, 10)
  assert.equal(config.databaseIdleTimeoutMs, 30_000)
  assert.equal(config.databaseConnectionTimeoutMs, 5_000)
  assert.equal(config.databaseStatementTimeoutMs, 15_000)
  assert.equal(config.databaseLockTimeoutMs, 5_000)
  assert.equal(config.databaseApplicationName, "stagequeue-api")
  assert.equal(config.authSecret, "dev-only-poza-nuta-auth-secret-change-me")
  assert.equal(config.googleClientId, "replace_me")
})

test("test config keeps local defaults", () => {
  const config = parseApiConfig({ NODE_ENV: "test" })

  assert.equal(config.nodeEnv, "test")
  assert.equal(config.publicWebUrl, "http://localhost:3000")
  assert.equal(config.dashboardWebUrl, "http://localhost:3001")
  assert.equal(config.databasePoolMax, 10)
  assert.equal(config.databaseApplicationName, "stagequeue-api")
})

test("config parses DB pool and timeout env values", () => {
  const config = parseApiConfig({
    NODE_ENV: "test",
    DATABASE_POOL_MAX: "7",
    DATABASE_IDLE_TIMEOUT_MS: "20000",
    DATABASE_CONNECTION_TIMEOUT_MS: "2500",
    DATABASE_STATEMENT_TIMEOUT_MS: "9000",
    DATABASE_LOCK_TIMEOUT_MS: "1200",
    DATABASE_APPLICATION_NAME: "stagequeue-api-test"
  })

  assert.equal(config.databasePoolMax, 7)
  assert.equal(config.databaseIdleTimeoutMs, 20_000)
  assert.equal(config.databaseConnectionTimeoutMs, 2_500)
  assert.equal(config.databaseStatementTimeoutMs, 9_000)
  assert.equal(config.databaseLockTimeoutMs, 1_200)
  assert.equal(config.databaseApplicationName, "stagequeue-api-test")
})

test("config rejects invalid DB numeric env values without printing DATABASE_URL", () => {
  const invalidValues = ["", "0", "-1", "1.5", "NaN", "abc"]
  const numericEnvNames = [
    "DATABASE_POOL_MAX",
    "DATABASE_IDLE_TIMEOUT_MS",
    "DATABASE_CONNECTION_TIMEOUT_MS",
    "DATABASE_STATEMENT_TIMEOUT_MS",
    "DATABASE_LOCK_TIMEOUT_MS"
  ]
  for (const name of numericEnvNames) {
    for (const value of invalidValues) {
      assert.throws(
        () =>
          parseApiConfig({
            NODE_ENV: "test",
            DATABASE_URL: "postgres://user:secret@db.internal:5432/stagequeue",
            [name]: value
          }),
        (error) => {
          assert.ok(error instanceof Error)
          assert.match(error.message, new RegExp(`${name} must be a positive integer`))
          assert.equal(error.message.includes("postgres://user:secret@db.internal:5432/stagequeue"), false)
          return true
        }
      )
    }
  }
})

test("config rejects empty or sensitive database application name", () => {
  assert.throws(
    () =>
      parseApiConfig({
        NODE_ENV: "test",
        DATABASE_APPLICATION_NAME: ""
      }),
    /DATABASE_APPLICATION_NAME must not be empty/
  )
  assert.throws(
    () =>
      parseApiConfig({
        NODE_ENV: "test",
        DATABASE_APPLICATION_NAME: "postgres://user:secret@db.internal:5432/stagequeue"
      }),
    /DATABASE_APPLICATION_NAME must not contain secrets/
  )
})

test("valid production config is accepted", () => {
  const config = parseApiConfig(validProductionEnv())

  assert.equal(config.nodeEnv, "production")
  assert.equal(config.apiUrl, "https://api.poza-nuta.example")
  assert.equal(config.publicWebUrl, "https://poza-nuta.example")
  assert.equal(config.dashboardWebUrl, "https://dashboard.poza-nuta.example")
  assert.equal(config.platformSetupToken, validProductionEnv().PLATFORM_SETUP_TOKEN)
  assert.equal(config.databasePoolMax, 12)
  assert.equal(config.databaseIdleTimeoutMs, 25_000)
  assert.equal(config.databaseConnectionTimeoutMs, 4_000)
  assert.equal(config.databaseStatementTimeoutMs, 12_000)
  assert.equal(config.databaseLockTimeoutMs, 3_000)
  assert.equal(config.databaseApplicationName, "stagequeue-api-prod")
})

test("production config rejects bootstrap platform owner email", () => {
  assert.throws(
    () =>
      parseApiConfig({
        ...validProductionEnv(),
        BOOTSTRAP_PLATFORM_OWNER_EMAIL: "owner@example.com"
      }),
    (error) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /BOOTSTRAP_PLATFORM_OWNER_EMAIL is development\/test-only/)
      assert.match(error.message, /PLATFORM_SETUP_TOKEN/)
      return true
    }
  )
})

test("production config accepts platform setup token without bootstrap email", () => {
  const config = parseApiConfig({
    ...validProductionEnv(),
    BOOTSTRAP_PLATFORM_OWNER_EMAIL: undefined
  })

  assert.equal(config.nodeEnv, "production")
  assert.equal(config.bootstrapPlatformOwnerEmail, undefined)
  assert.equal(config.platformSetupToken, validProductionEnv().PLATFORM_SETUP_TOKEN)
})

test("test config accepts bootstrap platform owner email", () => {
  const config = parseApiConfig({
    NODE_ENV: "test",
    BOOTSTRAP_PLATFORM_OWNER_EMAIL: "Owner@Example.COM"
  })

  assert.equal(config.bootstrapPlatformOwnerEmail, "owner@example.com")
})

test("web config check passes in non-strict mode without deployment env", () => {
  const result = validateWebConfigEnv({})

  assert.equal(result.ok, true)
  assert.equal(result.strict, false)
  assert.match(result.warnings.join("\n"), /Production-like web config is not active/)
})

test("web config check accepts strict production-like URLs", () => {
  const result = validateWebConfigEnv(validWebConfigEnv())

  assert.equal(result.ok, true)
  assert.equal(result.strict, true)
})

test("web config check requires browser API URL in strict mode", () => {
  const env = validWebConfigEnv()
  delete env.NEXT_PUBLIC_API_URL

  const result = validateWebConfigEnv(env)

  assert.equal(result.ok, false)
  assert.match(result.errors.join("\n"), /NEXT_PUBLIC_API_URL is required/)
})

test("web config check rejects localhost public URLs without printing values", () => {
  const result = validateWebConfigEnv({
    ...validWebConfigEnv(),
    API_URL: "http://localhost:4321"
  })

  const errors = result.errors.join("\n")

  assert.equal(result.ok, false)
  assert.match(errors, /API_URL must use HTTPS/)
  assert.match(errors, /API_URL must not point to localhost/)
  assert.equal(errors.includes("http://localhost:4321"), false)
})

test("web config check allows internal API URL over private http", () => {
  const result = validateWebConfigEnv({
    ...validWebConfigEnv(),
    API_INTERNAL_URL: "http://api:4321"
  })

  assert.equal(result.ok, true)
})

test("web config check warns when public and dashboard URLs are identical", () => {
  const result = validateWebConfigEnv({
    ...validWebConfigEnv(),
    DASHBOARD_WEB_URL: "https://poza-nuta.example"
  })

  assert.equal(result.ok, true)
  assert.match(result.warnings.join("\n"), /PUBLIC_WEB_URL and DASHBOARD_WEB_URL are identical/)
})

function validProductionEnv(): Record<string, string> {
  return {
    NODE_ENV: "production",
    API_URL: "https://api.poza-nuta.example",
    PUBLIC_WEB_URL: "https://poza-nuta.example",
    DASHBOARD_WEB_URL: "https://dashboard.poza-nuta.example",
    DATABASE_URL: "postgres://poza_nuta:strong-password@db.internal:5432/poza_nuta",
    DATABASE_POOL_MAX: "12",
    DATABASE_IDLE_TIMEOUT_MS: "25000",
    DATABASE_CONNECTION_TIMEOUT_MS: "4000",
    DATABASE_STATEMENT_TIMEOUT_MS: "12000",
    DATABASE_LOCK_TIMEOUT_MS: "3000",
    DATABASE_APPLICATION_NAME: "stagequeue-api-prod",
    REDIS_URL: "redis://redis.internal:6379",
    AUTH_SECRET: "prod_auth_secret_32_characters_min",
    PARTICIPANT_TOKEN_SECRET: "prod_participant_secret_32_chars",
    GOOGLE_CLIENT_ID: "google-client-id.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "google-client-secret-value",
    PLATFORM_SETUP_ENABLED: "true",
    PLATFORM_SETUP_TOKEN: "prod_platform_setup_token_32_min"
  }
}

function validWebConfigEnv(): Record<string, string> {
  return {
    WEB_CONFIG_STRICT: "true",
    API_URL: "https://api.poza-nuta.example",
    PUBLIC_WEB_URL: "https://poza-nuta.example",
    DASHBOARD_WEB_URL: "https://dashboard.poza-nuta.example",
    NEXT_PUBLIC_API_URL: "https://api.poza-nuta.example",
    NEXT_PUBLIC_DASHBOARD_URL: "https://dashboard.poza-nuta.example"
  }
}
