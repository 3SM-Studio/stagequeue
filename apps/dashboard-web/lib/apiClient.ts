export const DEFAULT_DASHBOARD_API_URL = "http://localhost:4321"
export const DEFAULT_DASHBOARD_WEB_URL = "http://localhost:3001"

export type DashboardAccessReason = "unauthenticated" | "pending_approval" | "disabled" | "active_user" | "platform_role"

export type DashboardMeResponse =
  | {
      authenticated: false
    }
  | {
      authenticated: true
      user: {
        id: string
        email: string
        name: string | null
        status: "pending" | "active" | "disabled"
      }
      platform: {
        roles: string[]
      }
      access: {
        dashboardAllowed: boolean
        reason: DashboardAccessReason
      }
    }

export type OperatorQueueItem = {
  id: string
  singerName: string
  displayName: string
  sourceId: string
  sourceTrackId: string
  songTitle: string
  songArtist: string
  songUrl: string | null
  note: string | null
  status: string
  position: number | null
  requestedAt: string
  approvedAt: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
}

export type OperatorQueueResponse = {
  event: {
    id: string
    name: string
    status: string
  }
  venue: {
    id: string
    name: string
    slug: string
  }
  pending: OperatorQueueItem[]
  approved: OperatorQueueItem[]
  now: OperatorQueueItem | null
  done: OperatorQueueItem[]
  rejected: OperatorQueueItem[]
  skipped: OperatorQueueItem[]
}

export type QueueActionResponse = {
  request: OperatorQueueItem
}

export type PlatformSetupStatusResponse = {
  setupRequired: boolean
}

export type ClaimPlatformOwnerResponse = {
  user: {
    id: string
    email: string
    name: string | null
    status: "active"
  }
  platform: {
    roles: ["platform_owner"]
  }
}

export class DashboardApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = "DashboardApiError"
    this.status = status
    this.code = code
  }
}

export type DashboardFetch = (
  input: string | URL,
  init?: RequestInit
) => Promise<Response>

export function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "")
}

export function getDashboardApiBaseUrl(): string {
  return normalizeBaseUrl(process.env.NEXT_PUBLIC_API_URL || DEFAULT_DASHBOARD_API_URL)
}

export function getDashboardWebBaseUrl(): string {
  return normalizeBaseUrl(process.env.NEXT_PUBLIC_DASHBOARD_URL || DEFAULT_DASHBOARD_WEB_URL)
}

export function buildDashboardApiUrl(path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`
  return `${getDashboardApiBaseUrl()}${cleanPath}`
}

export function buildDashboardEventStreamUrl(eventId: string): string {
  return buildDashboardApiUrl(`/dashboard/events/${encodeURIComponent(eventId)}/stream`)
}

export async function getPlatformSetupStatus(options: { fetchImpl?: DashboardFetch } = {}): Promise<PlatformSetupStatusResponse> {
  return assertPlatformSetupStatusResponse(await fetchDashboardJson("/setup/status", {}, options.fetchImpl))
}

export async function claimPlatformOwner(
  setupToken: string,
  options: { fetchImpl?: DashboardFetch } = {}
): Promise<ClaimPlatformOwnerResponse> {
  return assertClaimPlatformOwnerResponse(
    await fetchDashboardJson(
      "/setup/claim-platform-owner",
      {
        body: JSON.stringify({ setupToken }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      },
      options.fetchImpl
    )
  )
}

export async function getMe(options: { cookieHeader?: string; fetchImpl?: DashboardFetch } = {}): Promise<DashboardMeResponse> {
  const fetchImpl = options.fetchImpl ?? fetch
  const headers = new Headers()

  if (options.cookieHeader) {
    headers.set("Cookie", options.cookieHeader)
  }

  const response = await fetchImpl(buildDashboardApiUrl("/me"), {
    cache: "no-store",
    credentials: "include",
    headers
  })

  const payload = await readJson(response)

  if (!response.ok) {
    throw dashboardApiError(response.status, payload)
  }

  return assertMeResponse(payload)
}

export async function getOperatorQueue(
  eventId: string,
  options: { fetchImpl?: DashboardFetch } = {}
): Promise<OperatorQueueResponse> {
  return assertOperatorQueueResponse(
    await fetchDashboardJson(`/dashboard/events/${encodeURIComponent(eventId)}/operator-queue`, {}, options.fetchImpl)
  )
}

export async function approveRequest(
  eventId: string,
  requestId: string,
  options: { fetchImpl?: DashboardFetch } = {}
): Promise<QueueActionResponse> {
  return postQueueAction(eventId, requestId, "approve", undefined, options.fetchImpl)
}

export async function rejectRequest(
  eventId: string,
  requestId: string,
  options: { reason?: string; fetchImpl?: DashboardFetch } = {}
): Promise<QueueActionResponse> {
  const body = options.reason ? { reason: options.reason } : undefined
  return postQueueAction(eventId, requestId, "reject", body, options.fetchImpl)
}

export async function startRequest(
  eventId: string,
  requestId: string,
  options: { fetchImpl?: DashboardFetch } = {}
): Promise<QueueActionResponse> {
  return postQueueAction(eventId, requestId, "start", undefined, options.fetchImpl)
}

export async function doneRequest(
  eventId: string,
  requestId: string,
  options: { fetchImpl?: DashboardFetch } = {}
): Promise<QueueActionResponse> {
  return postQueueAction(eventId, requestId, "done", undefined, options.fetchImpl)
}

export async function skipRequest(
  eventId: string,
  requestId: string,
  options: { fetchImpl?: DashboardFetch } = {}
): Promise<QueueActionResponse> {
  return postQueueAction(eventId, requestId, "skip", undefined, options.fetchImpl)
}

export async function moveRequest(
  eventId: string,
  requestId: string,
  position: number,
  options: { fetchImpl?: DashboardFetch } = {}
): Promise<QueueActionResponse> {
  return postQueueAction(eventId, requestId, "move", { position }, options.fetchImpl)
}

async function postQueueAction(
  eventId: string,
  requestId: string,
  action: "approve" | "reject" | "start" | "done" | "skip" | "move",
  body: Record<string, unknown> | undefined,
  fetchImpl?: DashboardFetch
): Promise<QueueActionResponse> {
  return assertQueueActionResponse(
    await fetchDashboardJson(
      `/dashboard/events/${encodeURIComponent(eventId)}/requests/${encodeURIComponent(requestId)}/${action}`,
      {
        method: "POST",
        ...(body
          ? {
              body: JSON.stringify(body),
              headers: {
                "Content-Type": "application/json"
              }
            }
          : {})
      },
      fetchImpl
    )
  )
}

async function fetchDashboardJson(path: string, init: RequestInit = {}, fetchImpl: DashboardFetch = fetch): Promise<unknown> {
  const response = await fetchImpl(buildDashboardApiUrl(path), {
    ...init,
    cache: "no-store",
    credentials: init.credentials ?? "include"
  })

  const payload = await readJson(response)

  if (!response.ok) {
    throw dashboardApiError(response.status, payload)
  }

  return payload
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function dashboardApiError(status: number, payload: unknown): DashboardApiError {
  if (isRecord(payload)) {
    const error = payload.error
    if (isRecord(error)) {
      const code = typeof error.code === "string" ? error.code : "API_ERROR"
      const message = typeof error.message === "string" ? error.message : "API error"
      return new DashboardApiError(status, code, message)
    }
  }

  return new DashboardApiError(status, "API_ERROR", "API error")
}

export function assertMeResponse(value: unknown): DashboardMeResponse {
  if (!isRecord(value) || typeof value.authenticated !== "boolean") {
    throw new Error("Invalid dashboard API response: me")
  }

  if (!value.authenticated) {
    return { authenticated: false }
  }

  const user = value.user
  const platform = value.platform
  const access = value.access

  if (
    !isRecord(user) ||
    typeof user.id !== "string" ||
    typeof user.email !== "string" ||
    (typeof user.name !== "string" && user.name !== null) ||
    !isDomainUserStatus(user.status) ||
    !isRecord(platform) ||
    !Array.isArray(platform.roles) ||
    !platform.roles.every((role) => typeof role === "string") ||
    !isRecord(access) ||
    typeof access.dashboardAllowed !== "boolean" ||
    !isDashboardAccessReason(access.reason)
  ) {
    throw new Error("Invalid dashboard API response: me")
  }

  return {
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status
    },
    platform: {
      roles: platform.roles
    },
    access: {
      dashboardAllowed: access.dashboardAllowed,
      reason: access.reason
    }
  }
}

export function assertOperatorQueueResponse(value: unknown): OperatorQueueResponse {
  if (!isRecord(value)) {
    throw new Error("Invalid dashboard API response: operator queue")
  }

  const event = value.event
  const venue = value.venue
  const pending = value.pending
  const approved = value.approved
  const now = value.now
  const done = value.done
  const rejected = value.rejected
  const skipped = value.skipped

  if (
    !isRecord(event) ||
    typeof event.id !== "string" ||
    typeof event.name !== "string" ||
    typeof event.status !== "string" ||
    !isRecord(venue) ||
    typeof venue.id !== "string" ||
    typeof venue.name !== "string" ||
    typeof venue.slug !== "string" ||
    !isOperatorQueueItems(pending) ||
    !isOperatorQueueItems(approved) ||
    (now !== null && !isOperatorQueueItem(now)) ||
    !isOperatorQueueItems(done) ||
    !isOperatorQueueItems(rejected) ||
    !isOperatorQueueItems(skipped)
  ) {
    throw new Error("Invalid dashboard API response: operator queue")
  }

  return {
    event: {
      id: event.id,
      name: event.name,
      status: event.status
    },
    venue: {
      id: venue.id,
      name: venue.name,
      slug: venue.slug
    },
    pending,
    approved,
    now,
    done,
    rejected,
    skipped
  }
}

function assertQueueActionResponse(value: unknown): QueueActionResponse {
  if (!isRecord(value) || !isOperatorQueueItem(value.request)) {
    throw new Error("Invalid dashboard API response: queue action")
  }

  return {
    request: value.request
  }
}

export function assertPlatformSetupStatusResponse(value: unknown): PlatformSetupStatusResponse {
  if (!isRecord(value) || typeof value.setupRequired !== "boolean") {
    throw new Error("Invalid dashboard API response: setup status")
  }

  return {
    setupRequired: value.setupRequired
  }
}

export function assertClaimPlatformOwnerResponse(value: unknown): ClaimPlatformOwnerResponse {
  if (!isRecord(value)) {
    throw new Error("Invalid dashboard API response: setup claim")
  }

  const user = value.user
  const platform = value.platform

  if (
    !isRecord(user) ||
    typeof user.id !== "string" ||
    typeof user.email !== "string" ||
    (typeof user.name !== "string" && user.name !== null) ||
    user.status !== "active" ||
    !isRecord(platform) ||
    !Array.isArray(platform.roles) ||
    platform.roles.length !== 1 ||
    platform.roles[0] !== "platform_owner"
  ) {
    throw new Error("Invalid dashboard API response: setup claim")
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status
    },
    platform: {
      roles: ["platform_owner"]
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isOperatorQueueItems(value: unknown): value is OperatorQueueItem[] {
  return Array.isArray(value) && value.every(isOperatorQueueItem)
}

function isOperatorQueueItem(value: unknown): value is OperatorQueueItem {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.id === "string" &&
    typeof value.singerName === "string" &&
    typeof value.displayName === "string" &&
    typeof value.sourceId === "string" &&
    typeof value.sourceTrackId === "string" &&
    typeof value.songTitle === "string" &&
    typeof value.songArtist === "string" &&
    (typeof value.songUrl === "string" || value.songUrl === null) &&
    (typeof value.note === "string" || value.note === null) &&
    typeof value.status === "string" &&
    (typeof value.position === "number" || value.position === null) &&
    typeof value.requestedAt === "string" &&
    (typeof value.approvedAt === "string" || value.approvedAt === null) &&
    (typeof value.startedAt === "string" || value.startedAt === null) &&
    (typeof value.finishedAt === "string" || value.finishedAt === null) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  )
}

function isDomainUserStatus(value: unknown): value is "pending" | "active" | "disabled" {
  return value === "pending" || value === "active" || value === "disabled"
}

function isDashboardAccessReason(value: unknown): value is DashboardAccessReason {
  return (
    value === "unauthenticated" ||
    value === "pending_approval" ||
    value === "disabled" ||
    value === "active_user" ||
    value === "platform_role"
  )
}
