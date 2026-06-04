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

  if (!databaseUrl) {
    throw new Error("Missing required env DATABASE_URL")
  }
  if (!authSecret) {
    throw new Error("Missing required env AUTH_SECRET")
  }
  if (!googleClientId) {
    throw new Error("Missing required env GOOGLE_CLIENT_ID")
  }
  if (!googleClientSecret) {
    throw new Error("Missing required env GOOGLE_CLIENT_SECRET")
  }

  const config: ApiConfig = {
    nodeEnv,
    host,
    port,
    apiUrl,
    publicWebUrl,
    dashboardWebUrl,
    databaseUrl,
    authSecret,
    googleClientId,
    googleClientSecret,
    participantTokenSecret: rawParticipantTokenSecret ?? authSecret,
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

  return config
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
