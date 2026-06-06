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

test("development config keeps local defaults", () => {
  const config = parseApiConfig({ NODE_ENV: "development" })

  assert.equal(config.nodeEnv, "development")
  assert.equal(config.databaseUrl, "postgres://poza_nuta:poza_nuta@localhost:5432/poza_nuta")
  assert.equal(config.authSecret, "dev-only-poza-nuta-auth-secret-change-me")
  assert.equal(config.googleClientId, "replace_me")
})

test("test config keeps local defaults", () => {
  const config = parseApiConfig({ NODE_ENV: "test" })

  assert.equal(config.nodeEnv, "test")
  assert.equal(config.publicWebUrl, "http://localhost:3000")
  assert.equal(config.dashboardWebUrl, "http://localhost:3001")
})

test("valid production config is accepted", () => {
  const config = parseApiConfig(validProductionEnv())

  assert.equal(config.nodeEnv, "production")
  assert.equal(config.apiUrl, "https://api.poza-nuta.example")
  assert.equal(config.publicWebUrl, "https://poza-nuta.example")
  assert.equal(config.dashboardWebUrl, "https://dashboard.poza-nuta.example")
  assert.equal(config.platformSetupToken, validProductionEnv().PLATFORM_SETUP_TOKEN)
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
