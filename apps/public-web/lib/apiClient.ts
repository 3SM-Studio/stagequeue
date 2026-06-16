import {
  assertActiveEventResponse,
  assertMyRequestsResponse,
  assertPublicInviteClaimResponse,
  assertPublicEventDetailResponse,
  assertPublicQueueResponse,
  assertSubmitRequestResponse,
  assertVenueResponse
} from "./apiValidation.ts"
import { isReservedPublicPathSlug } from "./staticSlugGuard.ts"

export type Venue = {
  id: string
  slug: string
  name: string
  address: string | null
  city: string | null
  country: string
  timezone: string
  status: string
  verificationStatus: string
}

export type PublicEvent = {
  publicId: string
  name: string
  slug: string
  status: "active" | "paused" | "draft" | "scheduled" | "closed" | "archived" | "cancelled" | string
  startsAt: string | null
  endsAt: string | null
  publicJoinEnabled: boolean
  publicQueueEnabled: boolean
  joinAccessMode: "open" | "invite_required"
}

export type ActiveEventLookup = {
  venue: {
    id: string
    slug: string
    name: string
    city: string | null
    timezone: string
  }
  activeEvent: PublicEvent | null
}

export type PublicEventDetail = {
  event: {
    publicId: string
    name: string
    slug: string
    status: PublicEvent["status"]
    startsAt: string | null
    endsAt: string | null
    publicJoinEnabled: boolean
    publicQueueEnabled: boolean
    joinAccessMode: PublicEvent["joinAccessMode"]
  }
  venue: {
    slug: string
    name: string
    city: string | null
    timezone: string
  }
  operatedByOrganization: {
    slug: string
    name: string
  }
  submissions: {
    enabled: boolean
    reason?: string
  }
  publicQueue: {
    visible: boolean
    reason?: string
  }
}

export type QueueItem = {
  id: string
  singerName: string
  songTitle: string
  songArtist: string
  position?: number | null
}

export type PublicQueue = {
  event: {
    publicId: string
    name: string
    status: string
  } | null
  activeEvent?: PublicEvent | null
  venue: {
    id: string
    name: string
    slug: string
  }
  now: QueueItem | null
  queue: QueueItem[]
  submissions: {
    enabled: boolean
    reason?: string
  }
}

export type SubmitSongRequestInput = {
  singerName: string
  sourceId: string
  sourceTrackId?: string
  songTitle: string
  songArtist: string
  songUrl?: string
  note?: string
}

export type SubmitSongRequestResult = {
  request: {
    id: string
    status: string
    singerName: string
    songTitle: string
    songArtist: string
    sourceId: string
    sourceTrackId: string
  }
}

export type PublicMyRequestStatus = "pending" | "approved" | "now" | "done" | "rejected" | "skipped"

export type PublicMyRequest = {
  id: string
  status: PublicMyRequestStatus
  singerName: string
  artist: string
  title: string
  position: number | null
  createdAt: string
}

export type PublicMyRequestsResponse = {
  requests: PublicMyRequest[]
}

export type PublicInviteClaimResponse = {
  eventPublicId: string
  redirectTo: string
}

export type ApiErrorBody = {
  error?: {
    code?: string
    message?: string
  }
}

export class PublicApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = "PublicApiError"
    this.status = status
    this.code = code
  }
}

const DEFAULT_API_URL = "http://localhost:4321"

export function getBrowserApiBaseUrl(): string {
  return normalizeBaseUrl(process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL)
}

export function buildPublicApiUrl(path: string, params: Record<string, string | number | undefined> = {}): string {
  const url = new URL(path, `${getBrowserApiBaseUrl()}/`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

export const getPublicApiBaseUrl = getBrowserApiBaseUrl

export function buildPublicEventStreamUrl(eventPublicId: string): string {
  return buildPublicApiUrl(`/public/events/${encodeURIComponent(eventPublicId)}/stream`)
}

export function buildPublicVenueStreamUrl(venueSlug: string): string {
  return buildPublicApiUrl(`/public/venues/${encodeURIComponent(venueSlug)}/stream`)
}

export async function getVenue(venueSlug: string): Promise<Venue> {
  assertPublicVenueSlug(venueSlug)
  return assertVenueResponse(await fetchJson(`/public/venues/${encodeURIComponent(venueSlug)}`)).venue
}

export async function getActiveEvent(venueSlug: string): Promise<ActiveEventLookup> {
  assertPublicVenueSlug(venueSlug)
  return assertActiveEventResponse(await fetchJson(`/public/venues/${encodeURIComponent(venueSlug)}/active-event`))
}

export async function getPublicQueue(eventPublicId: string): Promise<PublicQueue> {
  return assertPublicQueueResponse(await fetchJson(`/public/events/${encodeURIComponent(eventPublicId)}/queue`))
}

export async function getPublicEventDetail(eventPublicId: string): Promise<PublicEventDetail> {
  return assertPublicEventDetailResponse(await fetchJson(`/public/events/${encodeURIComponent(eventPublicId)}`))
}

export async function claimPublicInvite(inviteCode: string): Promise<PublicInviteClaimResponse> {
  return assertPublicInviteClaimResponse(
    await fetchJson(`/public/invites/${encodeURIComponent(inviteCode)}/claim`, {
      method: "POST"
    })
  )
}

export async function getPublicQueueByVenueSlug(venueSlug: string): Promise<PublicQueue> {
  assertPublicVenueSlug(venueSlug)
  return assertPublicQueueResponse(await fetchJson(`/public/venues/${encodeURIComponent(venueSlug)}/queue`))
}

export async function getMyRequestsByVenueSlug(venueSlug: string): Promise<PublicMyRequestsResponse> {
  assertPublicVenueSlug(venueSlug)
  return assertMyRequestsResponse(await fetchJson(`/public/venues/${encodeURIComponent(venueSlug)}/my-requests`))
}

export async function getMyRequestsByEventPublicId(eventPublicId: string): Promise<PublicMyRequestsResponse> {
  return assertMyRequestsResponse(await fetchJson(`/public/events/${encodeURIComponent(eventPublicId)}/my-requests`))
}

export async function submitSongRequest(eventPublicId: string, input: SubmitSongRequestInput): Promise<SubmitSongRequestResult> {
  return assertSubmitRequestResponse(
    await fetchJson(`/public/events/${encodeURIComponent(eventPublicId)}/requests`, {
      method: "POST",
      body: JSON.stringify(input),
      headers: {
        "Content-Type": "application/json"
      }
    })
  )
}

export async function submitSongRequestByVenueSlug(
  venueSlug: string,
  input: SubmitSongRequestInput
): Promise<SubmitSongRequestResult> {
  assertPublicVenueSlug(venueSlug)
  return assertSubmitRequestResponse(
    await fetchJson(`/public/venues/${encodeURIComponent(venueSlug)}/requests`, {
      method: "POST",
      body: JSON.stringify(input),
      headers: {
        "Content-Type": "application/json"
      }
    })
  )
}

function assertPublicVenueSlug(venueSlug: string): void {
  if (isReservedPublicPathSlug(venueSlug)) {
    throw new PublicApiError(404, "NOT_FOUND", "Public route is reserved")
  }
}

async function fetchJson(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(buildPublicApiUrl(path), {
    ...init,
    cache: "no-store",
    credentials: init.credentials ?? "include"
  })

  if (!response.ok) {
    const body = await readApiErrorBody(response)
    throw new PublicApiError(response.status, body.error?.code ?? "API_ERROR", body.error?.message ?? "API request failed")
  }

  return response.json() as Promise<unknown>
}

async function readApiErrorBody(response: Response): Promise<ApiErrorBody> {
  try {
    return (await response.json()) as ApiErrorBody
  } catch {
    return {}
  }
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "")
}

export { DEFAULT_API_URL, normalizeBaseUrl }
