import { ApiHttpError } from "../../errors.ts"

export const reservedVenueSlugs = [
  "admin",
  "api",
  "dashboard",
  "login",
  "signup",
  "pricing",
  "about",
  "terms",
  "privacy",
  "assets",
  "health",
  "platform",
  "org"
] as const

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function readBody(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw badRequest("JSON body must be an object")
  }

  return body as Record<string, unknown>
}

export function readRequiredString(body: Record<string, unknown>, key: string, options: { maxLength?: number } = {}): string {
  const value = body[key]
  if (typeof value !== "string" || !value.trim()) {
    throw badRequest(`Missing ${key}`)
  }

  const trimmed = value.trim()
  if (options.maxLength && trimmed.length > options.maxLength) {
    throw badRequest(`${key} is too long`)
  }

  return trimmed
}

export function readOptionalString(
  body: Record<string, unknown>,
  key: string,
  options: { maxLength?: number } = {}
): string | undefined {
  const value = body[key]
  if (value === undefined || value === null || value === "") {
    return undefined
  }
  if (typeof value !== "string") {
    throw badRequest(`Invalid ${key}`)
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }
  if (options.maxLength && trimmed.length > options.maxLength) {
    throw badRequest(`${key} is too long`)
  }

  return trimmed
}

export function readOptionalUuid(body: Record<string, unknown>, key: string): string | undefined {
  const value = readOptionalString(body, key)
  if (value === undefined) {
    return undefined
  }
  return validateUuid(value, key)
}

export function readOptionalBoolean(body: Record<string, unknown>, key: string): boolean | undefined {
  const value = body[key]
  if (value === undefined || value === null || value === "") {
    return undefined
  }
  if (typeof value !== "boolean") {
    throw badRequest(`Invalid ${key}`)
  }

  return value
}

export function readPositiveInteger(body: Record<string, unknown>, key: string): number {
  const value = body[key]
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw badRequest(`Invalid ${key}`)
  }

  return value
}

export function readOptionalDateString(body: Record<string, unknown>, key: string): string | undefined {
  const value = readOptionalString(body, key)
  if (value === undefined) {
    return undefined
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw badRequest(`Invalid ${key}`)
  }

  return date.toISOString()
}

export function readParamUuid(params: unknown, key: string): string {
  if (typeof params !== "object" || params === null || !(key in params)) {
    throw badRequest(`Missing ${key}`)
  }

  return validateUuid(String((params as Record<string, unknown>)[key]), key)
}

export function readEnum<TValue extends string>(
  body: Record<string, unknown>,
  key: string,
  allowed: readonly TValue[],
  fallback?: TValue
): TValue {
  const value = body[key]
  if ((value === undefined || value === null || value === "") && fallback !== undefined) {
    return fallback
  }
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw badRequest(`Invalid ${key}`)
  }

  return value as TValue
}

export function readOptionalEnum<TValue extends string>(
  body: Record<string, unknown>,
  key: string,
  allowed: readonly TValue[]
): TValue | undefined {
  const value = body[key]
  if (value === undefined || value === null || value === "") {
    return undefined
  }
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw badRequest(`Invalid ${key}`)
  }

  return value as TValue
}

export function readSlug(body: Record<string, unknown>, key = "slug", options: { reserved?: boolean } = {}): string {
  const slug = readRequiredString(body, key, { maxLength: 80 }).toLowerCase()
  return validateSlug(slug, key, options)
}

export function readParamSlug(params: unknown, key: string): string {
  if (typeof params !== "object" || params === null || !(key in params)) {
    throw badRequest(`Missing ${key}`)
  }

  return validateSlug(String((params as Record<string, unknown>)[key]).toLowerCase(), key)
}

function validateSlug(slug: string, key: string, options: { reserved?: boolean } = {}): string {
  if (!SLUG_PATTERN.test(slug)) {
    throw badRequest(`Invalid ${key}`)
  }
  if (options.reserved && (reservedVenueSlugs as readonly string[]).includes(slug)) {
    throw badRequest(`Reserved venue slug: ${slug}`)
  }

  return slug
}

function validateUuid(value: string, key: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw badRequest(`Invalid ${key}`)
  }
  return value
}

function badRequest(message: string): ApiHttpError {
  return new ApiHttpError(400, "BAD_REQUEST", message)
}
