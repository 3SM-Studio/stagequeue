import type { FastifyInstance } from "fastify"
import { requireActiveCurrentUser } from "../../permissions/request.ts"
import { ApiHttpError } from "../../errors.ts"
import type { ListPlatformSupportAuditEventsInput } from "./service.ts"

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

export async function registerPlatformSupportAuditDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get("/dashboard/platform/support-audit-events", async (request) => {
    const user = await requireActiveCurrentUser(request)
    if (!(await app.platformSupportAudit.hasActivePlatformOwner(user.id))) {
      throw new ApiHttpError(403, "FORBIDDEN", "Forbidden")
    }

    const query = readAuditQuery(request.query)
    const auditEvents = await app.platformSupportAudit.listSupportAuditEvents(query)

    return {
      auditEvents,
      pagination: {
        limit: query.limit,
        offset: query.offset,
        nextOffset: auditEvents.length === query.limit ? query.offset + query.limit : null
      }
    }
  })
}

function readAuditQuery(query: unknown): ListPlatformSupportAuditEventsInput {
  const params = typeof query === "object" && query !== null ? (query as Record<string, unknown>) : {}
  const input: ListPlatformSupportAuditEventsInput = {
    limit: readLimit(params.limit),
    offset: readOffset(params.offset)
  }
  const actorUserId = readOptionalUuidQuery(params, "actorUserId")
  const targetEventId = readOptionalUuidQuery(params, "targetEventId")
  const operation = readOptionalStringQuery(params, "operation", 120)
  if (actorUserId !== undefined) {
    input.actorUserId = actorUserId
  }
  if (targetEventId !== undefined) {
    input.targetEventId = targetEventId
  }
  if (operation !== undefined) {
    input.operation = operation
  }

  return input
}

function readOptionalStringQuery(params: Record<string, unknown>, key: string, maxLength: number): string | undefined {
  const value = params[key]
  if (value === undefined || value === null || value === "") {
    return undefined
  }
  if (typeof value !== "string") {
    throw new ApiHttpError(400, "BAD_REQUEST", `Invalid ${key}`)
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }
  if (trimmed.length > maxLength) {
    throw new ApiHttpError(400, "BAD_REQUEST", `${key} is too long`)
  }

  return trimmed
}

function readOptionalUuidQuery(params: Record<string, unknown>, key: string): string | undefined {
  const value = readOptionalStringQuery(params, key, 80)
  if (value === undefined) {
    return undefined
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiHttpError(400, "BAD_REQUEST", `Invalid ${key}`)
  }

  return value
}

function readLimit(value: unknown): number {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_LIMIT
  }
  const limit = Number(value)
  if (!Number.isInteger(limit) || limit < 1) {
    throw new ApiHttpError(400, "BAD_REQUEST", "Invalid limit")
  }

  return Math.min(limit, MAX_LIMIT)
}

function readOffset(value: unknown): number {
  if (value === undefined || value === null || value === "") {
    return 0
  }
  const offset = Number(value)
  if (!Number.isInteger(offset) || offset < 0) {
    throw new ApiHttpError(400, "BAD_REQUEST", "Invalid offset")
  }

  return offset
}
