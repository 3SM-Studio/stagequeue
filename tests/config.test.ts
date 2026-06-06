import assert from "node:assert/strict"
import test from "node:test"
import { parseApiConfig } from "../apps/api/src/config.ts"

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
