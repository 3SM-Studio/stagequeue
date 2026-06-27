export const DEFAULT_DASHBOARD_API_URL = "http://localhost:4321"
export const DEFAULT_DASHBOARD_WEB_URL = "http://localhost:3001"
export const DASHBOARD_MUTATION_TIMEOUT_MS = 10000
export const DASHBOARD_MUTATION_TIMEOUT_MESSAGE = "Nie udalo sie zmienic statusu wydarzenia. Sprobuj ponownie."

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

export type DashboardEventStatus = "draft" | "scheduled" | "active" | "paused" | "closed" | "archived" | "cancelled"
export type DashboardEventVisibility = "public" | "unlisted" | "private"
export type DashboardJoinAccessMode = "open" | "invite_required"

export type DashboardEventSummary = {
  id: string
  publicId: string
  name: string
  slug: string
  status: DashboardEventStatus
  visibility: DashboardEventVisibility
  startsAt: string | null
  endsAt: string | null
  publicJoinEnabled: boolean
  publicQueueEnabled: boolean
  venue: {
    id: string
    name: string
    slug: string
  }
  operatedByOrganization: {
    id: string
    name: string
    slug: string
  }
}

export type DashboardVenueSummary = {
  id: string
  name: string
  slug: string
  status?: string
  verificationStatus?: string
}

export type DashboardEventDetail = {
  id: string
  publicId: string
  venueId: string
  operatedByOrganizationId: string
  createdByUserId: string | null
  name: string
  slug: string
  status: DashboardEventStatus
  visibility: DashboardEventVisibility
  startsAt: string | null
  endsAt: string | null
  publicJoinEnabled: boolean
  publicQueueEnabled: boolean
  joinAccessMode: DashboardJoinAccessMode
}

export type DashboardEventsResponse = {
  events: DashboardEventSummary[]
}

export type DashboardVenuesResponse = {
  venues: DashboardVenueSummary[]
}

export type DashboardEventResponse = {
  event: DashboardEventDetail
}

export type DashboardInvite = {
  code: string
  status: "active" | "revoked"
  expiresAt: string | null
  inviteUrl: string
  urlPath?: string
}

export type DashboardInviteResponse = {
  invite: DashboardInvite | null
}

export type DashboardCreatedEventResponse = {
  event: DashboardEventSummary
}

export type CreateDashboardEventInput = {
  venueId: string
  name: string
  slug: string
  status?: Extract<DashboardEventStatus, "draft" | "scheduled" | "active">
  visibility?: DashboardEventVisibility
  startsAt?: string
  endsAt?: string
  publicJoinEnabled?: boolean
  publicQueueEnabled?: boolean
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

type DashboardRequestInit = RequestInit & {
  timeoutMs?: number
}

type DashboardFetchOptions = {
  fetchImpl?: DashboardFetch
  timeoutMs?: number
}

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

export function buildDashboardEventQueuePath(eventId: string): string {
  return `/dashboard/events/${encodeURIComponent(eventId)}/queue`
}

export async function listDashboardEvents(
  options: { cookieHeader?: string; fetchImpl?: DashboardFetch } = {}
): Promise<DashboardEventsResponse> {
  const fetchImpl = options.fetchImpl ?? fetch
  const headers = new Headers()

  if (options.cookieHeader) {
    headers.set("Cookie", options.cookieHeader)
  }

  const response = await fetchImpl(buildDashboardApiUrl("/dashboard/events"), {
    cache: "no-store",
    credentials: "include",
    headers
  })

  const payload = await readJson(response)

  if (!response.ok) {
    throw dashboardApiError(response.status, payload)
  }

  return assertDashboardEventsResponse(payload)
}

export async function listDashboardVenues(
  options: { cookieHeader?: string; fetchImpl?: DashboardFetch } = {}
): Promise<DashboardVenuesResponse> {
  const fetchImpl = options.fetchImpl ?? fetch
  const headers = new Headers()

  if (options.cookieHeader) {
    headers.set("Cookie", options.cookieHeader)
  }

  const response = await fetchImpl(buildDashboardApiUrl("/dashboard/venues"), {
    cache: "no-store",
    credentials: "include",
    headers
  })

  const payload = await readJson(response)

  if (!response.ok) {
    throw dashboardApiError(response.status, payload)
  }

  return assertDashboardVenuesResponse(payload)
}

export async function createDashboardEvent(
  input: CreateDashboardEventInput,
  options: DashboardFetchOptions = {}
): Promise<DashboardCreatedEventResponse> {
  return assertDashboardCreatedEventResponse(
    await fetchDashboardJson(
      "/dashboard/events",
      {
        body: JSON.stringify(input),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST",
        timeoutMs: options.timeoutMs ?? DASHBOARD_MUTATION_TIMEOUT_MS
      },
      options.fetchImpl
    )
  )
}

export async function getDashboardEvent(
  eventId: string,
  options: { fetchImpl?: DashboardFetch } = {}
): Promise<DashboardEventResponse> {
  return assertDashboardEventResponse(
    await fetchDashboardJson(`/dashboard/events/${encodeURIComponent(eventId)}`, {}, options.fetchImpl)
  )
}

export async function getDashboardEventInvite(
  eventId: string,
  options: { fetchImpl?: DashboardFetch } = {}
): Promise<DashboardInviteResponse> {
  return assertDashboardInviteResponse(
    await fetchDashboardJson(`/dashboard/events/${encodeURIComponent(eventId)}/invite`, {}, options.fetchImpl)
  )
}

export async function rotateDashboardEventInvite(
  eventId: string,
  options: DashboardFetchOptions = {}
): Promise<DashboardInviteResponse> {
  return mutateDashboardEventInvite(eventId, "rotate", options)
}

export async function revokeDashboardEventInvite(
  eventId: string,
  options: DashboardFetchOptions = {}
): Promise<DashboardInviteResponse> {
  return mutateDashboardEventInvite(eventId, "revoke", options)
}

export async function startDashboardEvent(eventId: string, options: DashboardFetchOptions = {}): Promise<DashboardEventResponse> {
  return postDashboardEventLifecycle(eventId, "start", options)
}

export async function pauseDashboardEvent(eventId: string, options: DashboardFetchOptions = {}): Promise<DashboardEventResponse> {
  return postDashboardEventLifecycle(eventId, "pause", options)
}

export async function resumeDashboardEvent(eventId: string, options: DashboardFetchOptions = {}): Promise<DashboardEventResponse> {
  return postDashboardEventLifecycle(eventId, "resume", options)
}

export async function closeDashboardEvent(eventId: string, options: DashboardFetchOptions = {}): Promise<DashboardEventResponse> {
  return postDashboardEventLifecycle(eventId, "close", options)
}

export async function archiveDashboardEvent(eventId: string, options: DashboardFetchOptions = {}): Promise<DashboardEventResponse> {
  return postDashboardEventLifecycle(eventId, "archive", options)
}

export async function cancelDashboardEvent(eventId: string, options: DashboardFetchOptions = {}): Promise<DashboardEventResponse> {
  return postDashboardEventLifecycle(eventId, "cancel", options)
}

export async function updateDashboardEventFlags(
  eventId: string,
  flags: { publicJoinEnabled?: boolean; publicQueueEnabled?: boolean },
  options: DashboardFetchOptions = {}
): Promise<DashboardEventResponse> {
  return assertDashboardEventResponse(
    await fetchDashboardJson(
      `/dashboard/events/${encodeURIComponent(eventId)}`,
      {
        body: JSON.stringify(flags),
        headers: {
          "Content-Type": "application/json"
        },
        method: "PATCH",
        timeoutMs: options.timeoutMs ?? DASHBOARD_MUTATION_TIMEOUT_MS
      },
      options.fetchImpl
    )
  )
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
  options: DashboardFetchOptions = {}
): Promise<QueueActionResponse> {
  return postQueueAction(eventId, requestId, "approve", undefined, options)
}

export async function rejectRequest(
  eventId: string,
  requestId: string,
  options: { reason?: string; fetchImpl?: DashboardFetch; timeoutMs?: number } = {}
): Promise<QueueActionResponse> {
  const body = options.reason ? { reason: options.reason } : undefined
  return postQueueAction(eventId, requestId, "reject", body, options)
}

export async function startRequest(
  eventId: string,
  requestId: string,
  options: DashboardFetchOptions = {}
): Promise<QueueActionResponse> {
  return postQueueAction(eventId, requestId, "start", undefined, options)
}

export async function doneRequest(
  eventId: string,
  requestId: string,
  options: DashboardFetchOptions = {}
): Promise<QueueActionResponse> {
  return postQueueAction(eventId, requestId, "done", undefined, options)
}

export async function skipRequest(
  eventId: string,
  requestId: string,
  options: DashboardFetchOptions = {}
): Promise<QueueActionResponse> {
  return postQueueAction(eventId, requestId, "skip", undefined, options)
}

export async function moveRequest(
  eventId: string,
  requestId: string,
  position: number,
  options: DashboardFetchOptions = {}
): Promise<QueueActionResponse> {
  return postQueueAction(eventId, requestId, "move", { position }, options)
}

async function postQueueAction(
  eventId: string,
  requestId: string,
  action: "approve" | "reject" | "start" | "done" | "skip" | "move",
  body: Record<string, unknown> | undefined,
  options: DashboardFetchOptions
): Promise<QueueActionResponse> {
  return assertQueueActionResponse(
    await fetchDashboardJson(
      `/dashboard/events/${encodeURIComponent(eventId)}/requests/${encodeURIComponent(requestId)}/${action}`,
      {
        timeoutMs: options.timeoutMs ?? DASHBOARD_MUTATION_TIMEOUT_MS,
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
      options.fetchImpl
    )
  )
}

async function postDashboardEventLifecycle(
  eventId: string,
  action: "start" | "pause" | "resume" | "close" | "archive" | "cancel",
  options: DashboardFetchOptions
): Promise<DashboardEventResponse> {
  return assertDashboardEventResponse(
    await fetchDashboardJson(
      `/dashboard/events/${encodeURIComponent(eventId)}/${action}`,
      {
        method: "POST",
        timeoutMs: options.timeoutMs ?? DASHBOARD_MUTATION_TIMEOUT_MS
      },
      options.fetchImpl
    )
  )
}

async function fetchDashboardJson(path: string, init: DashboardRequestInit = {}, fetchImpl: DashboardFetch = fetch): Promise<unknown> {
  const { timeoutMs, ...requestInit } = init
  const timeout = createTimeoutSignal(timeoutMs, requestInit.signal)
  let response: Response

  try {
    const fetchInit: RequestInit = {
      ...requestInit,
      cache: "no-store",
      credentials: requestInit.credentials ?? "include"
    }
    if (timeout.signal) {
      fetchInit.signal = timeout.signal
    }

    response = await fetchImpl(buildDashboardApiUrl(path), fetchInit)
  } catch (error) {
    if (timeout.didTimeout() || isAbortError(error)) {
      throw new DashboardApiError(0, "REQUEST_TIMEOUT", DASHBOARD_MUTATION_TIMEOUT_MESSAGE)
    }
    throw error
  } finally {
    timeout.cleanup()
  }

  const payload = await readJson(response)

  if (!response.ok) {
    throw dashboardApiError(response.status, payload)
  }

  return payload
}

function createTimeoutSignal(timeoutMs: number | undefined, externalSignal: AbortSignal | null | undefined) {
  if (!timeoutMs) {
    return {
      cleanup: () => undefined,
      didTimeout: () => false,
      signal: externalSignal ?? undefined
    }
  }

  const controller = new AbortController()
  let timedOut = false
  const timeoutHandle = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const onExternalAbort = () => controller.abort()

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort()
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true })
    }
  }

  return {
    cleanup: () => {
      clearTimeout(timeoutHandle)
      externalSignal?.removeEventListener("abort", onExternalAbort)
    },
    didTimeout: () => timedOut,
    signal: controller.signal
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
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

export function assertDashboardEventsResponse(value: unknown): DashboardEventsResponse {
  if (!isRecord(value) || !Array.isArray(value.events) || !value.events.every(isDashboardEventSummary)) {
    throw new Error("Invalid dashboard API response: events")
  }

  return {
    events: value.events
  }
}

export function assertDashboardVenuesResponse(value: unknown): DashboardVenuesResponse {
  if (!isRecord(value) || !Array.isArray(value.venues) || !value.venues.every(isDashboardVenueSummary)) {
    throw new Error("Invalid dashboard API response: venues")
  }

  return {
    venues: value.venues
  }
}

export function assertDashboardEventResponse(value: unknown): DashboardEventResponse {
  if (!isRecord(value) || !isDashboardEventDetail(value.event)) {
    throw new Error("Invalid dashboard API response: event")
  }

  return {
    event: value.event
  }
}

export function assertDashboardInviteResponse(value: unknown): DashboardInviteResponse {
  if (!isRecord(value) || (value.invite !== null && !isDashboardInvite(value.invite))) {
    throw new Error("Invalid dashboard API response: event invite")
  }

  return {
    invite: value.invite
  }
}

export function assertDashboardCreatedEventResponse(value: unknown): DashboardCreatedEventResponse {
  if (!isRecord(value) || !isDashboardEventSummary(value.event)) {
    throw new Error("Invalid dashboard API response: created event")
  }

  return {
    event: value.event
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

function isDashboardEventDetail(value: unknown): value is DashboardEventDetail {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.id === "string" &&
    typeof value.publicId === "string" &&
    typeof value.venueId === "string" &&
    typeof value.operatedByOrganizationId === "string" &&
    (typeof value.createdByUserId === "string" || value.createdByUserId === null) &&
    typeof value.name === "string" &&
    typeof value.slug === "string" &&
    isDashboardEventStatus(value.status) &&
    isDashboardEventVisibility(value.visibility) &&
    (typeof value.startsAt === "string" || value.startsAt === null) &&
    (typeof value.endsAt === "string" || value.endsAt === null) &&
    typeof value.publicJoinEnabled === "boolean" &&
    typeof value.publicQueueEnabled === "boolean" &&
    isDashboardJoinAccessMode(value.joinAccessMode)
  )
}

function isDashboardInvite(value: unknown): value is DashboardInvite {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.code === "string" &&
    (value.status === "active" || value.status === "revoked") &&
    (typeof value.expiresAt === "string" || value.expiresAt === null) &&
    isAbsoluteHttpUrl(value.inviteUrl) &&
    (value.urlPath === undefined || typeof value.urlPath === "string")
  )
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

function isDashboardEventSummary(value: unknown): value is DashboardEventSummary {
  if (!isRecord(value)) {
    return false
  }

  const venue = value.venue
  const organization = value.operatedByOrganization

  return (
    typeof value.id === "string" &&
    typeof value.publicId === "string" &&
    typeof value.name === "string" &&
    typeof value.slug === "string" &&
    isDashboardEventStatus(value.status) &&
    isDashboardEventVisibility(value.visibility) &&
    (typeof value.startsAt === "string" || value.startsAt === null) &&
    (typeof value.endsAt === "string" || value.endsAt === null) &&
    typeof value.publicJoinEnabled === "boolean" &&
    typeof value.publicQueueEnabled === "boolean" &&
    isRecord(venue) &&
    typeof venue.id === "string" &&
    typeof venue.name === "string" &&
    typeof venue.slug === "string" &&
    isRecord(organization) &&
    typeof organization.id === "string" &&
    typeof organization.name === "string" &&
    typeof organization.slug === "string"
  )
}

function isDashboardVenueSummary(value: unknown): value is DashboardVenueSummary {
  if (!isRecord(value)) {
    return false
  }

  return typeof value.id === "string" && typeof value.name === "string" && typeof value.slug === "string"
}

function isDomainUserStatus(value: unknown): value is "pending" | "active" | "disabled" {
  return value === "pending" || value === "active" || value === "disabled"
}

function isDashboardEventStatus(value: unknown): value is DashboardEventStatus {
  return (
    value === "draft" ||
    value === "scheduled" ||
    value === "active" ||
    value === "paused" ||
    value === "closed" ||
    value === "archived" ||
    value === "cancelled"
  )
}

function isDashboardEventVisibility(value: unknown): value is DashboardEventVisibility {
  return value === "public" || value === "unlisted" || value === "private"
}

function isDashboardJoinAccessMode(value: unknown): value is DashboardJoinAccessMode {
  return value === "open" || value === "invite_required"
}

function isAbsoluteHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false
  }

  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
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

function mutateDashboardEventInvite(
  eventId: string,
  action: "rotate" | "revoke",
  options: DashboardFetchOptions
): Promise<DashboardInviteResponse> {
  return fetchDashboardJson(
    `/dashboard/events/${encodeURIComponent(eventId)}/invite/${action}`,
    {
      method: "POST",
      timeoutMs: options.timeoutMs ?? DASHBOARD_MUTATION_TIMEOUT_MS
    },
    options.fetchImpl
  ).then(assertDashboardInviteResponse)
}
