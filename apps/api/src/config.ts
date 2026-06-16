import { readFile } from "node:fs/promises"

export type ApiRuntimeEnv = "development" | "test" | "production"

export type ApiConfig = {
  nodeEnv: ApiRuntimeEnv
  host: string
  port: number
  apiUrl: string
  publicWebUrl: string
  dashboardWebUrl: string
  cookieDomain?: string
  databaseUrl: string
  authSecret: string
  googleClientId: string
  googleClientSecret: string
  participantTokenSecret: string
  publicRequestMaxActivePerParticipant: number
  publicRequestCooldownSeconds: number
  bootstrapPlatformOwnerEmail?: string
  platformSetupToken?: string
  platformSetupEnabled: boolean
  logLevel: "silent" | "info" | "debug"
}

const LOCAL_DATABASE_URL = "postgres://poza_nuta:poza_nuta@localhost:5432/poza_nuta"
const LOCAL_AUTH_SECRET = "dev-only-poza-nuta-auth-secret-change-me"

export async function loadApiConfig(envPath = ".env", envOverrides: NodeJS.ProcessEnv = process.env): Promise<ApiConfig> {
  const fileEnv = await readEnvFile(envPath)
  return parseApiConfig({ ...fileEnv, ...envOverrides })
}

export function parseApiConfig(env: Record<string, string | undefined>): ApiConfig {
  const nodeEnv = parseNodeEnv(env.NODE_ENV)
  const host = readText(env.API_HOST) ?? "127.0.0.1"
  const port = parsePort(env.API_PORT, 4321)
  const apiUrl = readText(env.API_URL) ?? `http://${host}:${port}`
  const publicWebUrl = readText(env.PUBLIC_WEB_URL) ?? "http://localhost:3000"
  const dashboardWebUrl = readText(env.DASHBOARD_WEB_URL) ?? "http://localhost:3001"
  const databaseUrl = readText(env.DATABASE_URL) ?? (nodeEnv === "production" ? undefined : LOCAL_DATABASE_URL)
  const authSecret = readText(env.AUTH_SECRET) ?? (nodeEnv === "production" ? undefined : LOCAL_AUTH_SECRET)
  const googleClientId = readText(env.GOOGLE_CLIENT_ID) ?? (nodeEnv === "production" ? undefined : "replace_me")
  const googleClientSecret = readText(env.GOOGLE_CLIENT_SECRET) ?? (nodeEnv === "production" ? undefined : "replace_me")
  const rawParticipantTokenSecret = readText(env.PARTICIPANT_TOKEN_SECRET)

  if (nodeEnv !== "production" && !databaseUrl) {
    throw new Error("Missing required env DATABASE_URL")
  }
  if (nodeEnv !== "production" && !authSecret) {
    throw new Error("Missing required env AUTH_SECRET")
  }
  if (nodeEnv !== "production" && !googleClientId) {
    throw new Error("Missing required env GOOGLE_CLIENT_ID")
  }
  if (nodeEnv !== "production" && !googleClientSecret) {
    throw new Error("Missing required env GOOGLE_CLIENT_SECRET")
  }

  const config: ApiConfig = {
    nodeEnv,
    host,
    port,
    apiUrl,
    publicWebUrl,
    dashboardWebUrl,
    databaseUrl: databaseUrl ?? "",
    authSecret: authSecret ?? "",
    googleClientId: googleClientId ?? "",
    googleClientSecret: googleClientSecret ?? "",
    participantTokenSecret: rawParticipantTokenSecret ?? authSecret ?? "",
    publicRequestMaxActivePerParticipant: parsePositiveInteger(env.PUBLIC_REQUEST_MAX_ACTIVE_PER_PARTICIPANT, 3),
    publicRequestCooldownSeconds: parsePositiveInteger(env.PUBLIC_REQUEST_COOLDOWN_SECONDS, 20),
    platformSetupEnabled: parseBoolean(env.PLATFORM_SETUP_ENABLED, true),
    logLevel: parseLogLevel(env.API_LOG_LEVEL)
  }
  const cookieDomain = readText(env.COOKIE_DOMAIN)
  if (cookieDomain !== undefined) {
    config.cookieDomain = cookieDomain
  }
  const bootstrapPlatformOwnerEmail = readText(env.BOOTSTRAP_PLATFORM_OWNER_EMAIL)?.toLowerCase()
  if (bootstrapPlatformOwnerEmail !== undefined) {
    config.bootstrapPlatformOwnerEmail = bootstrapPlatformOwnerEmail
  }
  const platformSetupToken = readText(env.PLATFORM_SETUP_TOKEN)
  if (platformSetupToken !== undefined) {
    config.platformSetupToken = platformSetupToken
  }

  validateProductionConfig(config, {
    databaseUrl: env.DATABASE_URL,
    authSecret: env.AUTH_SECRET,
    googleClientId: env.GOOGLE_CLIENT_ID,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET,
    participantTokenSecret: env.PARTICIPANT_TOKEN_SECRET,
    apiUrl: env.API_URL,
    publicWebUrl: env.PUBLIC_WEB_URL,
    dashboardWebUrl: env.DASHBOARD_WEB_URL,
    platformSetupToken: env.PLATFORM_SETUP_TOKEN
  })

  return config
}

type ProductionEnvInputs = {
  databaseUrl: string | undefined
  authSecret: string | undefined
  googleClientId: string | undefined
  googleClientSecret: string | undefined
  participantTokenSecret: string | undefined
  apiUrl: string | undefined
  publicWebUrl: string | undefined
  dashboardWebUrl: string | undefined
  platformSetupToken: string | undefined
}

function validateProductionConfig(config: ApiConfig, raw: ProductionEnvInputs): void {
  if (config.nodeEnv !== "production") {
    return
  }

  const errors: string[] = []
  requirePresent(raw.databaseUrl, "DATABASE_URL", errors)
  requirePresent(raw.authSecret, "AUTH_SECRET", errors)
  requirePresent(raw.googleClientId, "GOOGLE_CLIENT_ID", errors)
  requirePresent(raw.googleClientSecret, "GOOGLE_CLIENT_SECRET", errors)
  requirePresent(raw.participantTokenSecret, "PARTICIPANT_TOKEN_SECRET", errors)
  requirePresent(raw.apiUrl, "API_URL", errors)
  requirePresent(raw.publicWebUrl, "PUBLIC_WEB_URL", errors)
  requirePresent(raw.dashboardWebUrl, "DASHBOARD_WEB_URL", errors)

  validateDatabaseUrl(config.databaseUrl, "DATABASE_URL", errors)
  validatePublicBaseUrl(config.apiUrl, "API_URL", errors)
  validatePublicBaseUrl(config.publicWebUrl, "PUBLIC_WEB_URL", errors)
  validatePublicBaseUrl(config.dashboardWebUrl, "DASHBOARD_WEB_URL", errors)
  validateSecret(config.authSecret, "AUTH_SECRET", errors)
  validateSecret(config.participantTokenSecret, "PARTICIPANT_TOKEN_SECRET", errors)
  validateOauthValue(config.googleClientId, "GOOGLE_CLIENT_ID", errors)
  validateOauthValue(config.googleClientSecret, "GOOGLE_CLIENT_SECRET", errors)

  if (config.bootstrapPlatformOwnerEmail !== undefined) {
    errors.push("BOOTSTRAP_PLATFORM_OWNER_EMAIL is development/test-only and must not be set in production; use PLATFORM_SETUP_TOKEN")
  }

  if (config.platformSetupEnabled) {
    requirePresent(raw.platformSetupToken, "PLATFORM_SETUP_TOKEN", errors)
    if (config.platformSetupToken !== undefined) {
      validateSecret(config.platformSetupToken, "PLATFORM_SETUP_TOKEN", errors)
    }
  }

  if (config.cookieDomain !== undefined && isLocalHostname(config.cookieDomain)) {
    errors.push("COOKIE_DOMAIN must not be localhost in production")
  }

  if (errors.length > 0) {
    throw new Error(`Invalid production configuration: ${errors.join("; ")}`)
  }
}

function requirePresent(value: string | undefined, name: string, errors: string[]): void {
  if (readText(value) === undefined) {
    errors.push(`${name} is required in production`)
  }
}

function validateSecret(value: string, name: string, errors: string[]): void {
  if (value.length < 32) {
    errors.push(`${name} must be at least 32 characters in production`)
  }
  if (isPlaceholderValue(value)) {
    errors.push(`${name} must not use a placeholder value in production`)
  }
}

function validateOauthValue(value: string, name: string, errors: string[]): void {
  if (isPlaceholderValue(value)) {
    errors.push(`${name} must not use a placeholder value in production`)
  }
}

function validateDatabaseUrl(value: string, name: string, errors: string[]): void {
  const url = parseUrl(value, name, errors)
  if (!url) {
    return
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    errors.push(`${name} must use postgres or postgresql protocol in production`)
  }
  if (isLocalHostname(url.hostname)) {
    errors.push(`${name} must not point to localhost in production`)
  }
}

function validatePublicBaseUrl(value: string, name: string, errors: string[]): void {
  const url = parseUrl(value, name, errors)
  if (!url) {
    return
  }
  if (url.protocol !== "https:") {
    errors.push(`${name} must use https in production`)
  }
  if (isLocalHostname(url.hostname)) {
    errors.push(`${name} must not point to localhost in production`)
  }
}

function parseUrl(value: string, name: string, errors: string[]): URL | null {
  try {
    return new URL(value)
  } catch {
    errors.push(`${name} must be a valid URL in production`)
    return null
  }
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized.endsWith(".localhost")
}

function isPlaceholderValue(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return (
    normalized === "test" ||
    normalized === "secret" ||
    normalized === "password" ||
    normalized.includes("replace_me") ||
    normalized.includes("changeme") ||
    normalized.includes("change-me") ||
    normalized.includes("change_me") ||
    normalized.includes("dev-only") ||
    normalized.includes("dev-secret") ||
    normalized.includes("test-only")
  )
}

async function readEnvFile(path: string): Promise<Record<string, string>> {
  try {
    const raw = await readFile(path, "utf8")
    const env: Record<string, string> = {}

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) {
        continue
      }

      const separatorIndex = trimmed.indexOf("=")
      if (separatorIndex === -1) {
        continue
      }

      env[trimmed.slice(0, separatorIndex).trim()] = trimmed
        .slice(separatorIndex + 1)
        .trim()
        .replace(/^["']|["']$/g, "")
    }

    return env
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return {}
    }
    throw error
  }
}

function parseNodeEnv(value: string | undefined): ApiRuntimeEnv {
  if (value === "production" || value === "test") {
    return value
  }

  return "development"
}

function parsePort(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return fallback
  }

  return parsed
}

function parseLogLevel(value: string | undefined): ApiConfig["logLevel"] {
  if (value === "silent" || value === "info" || value === "debug") {
    return value
  }

  return "info"
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback
  }

  return parsed
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === "true") {
    return true
  }
  if (value === "false") {
    return false
  }

  return fallback
}

function readText(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}
