import {
  DEFAULT_API_URL,
  normalizeBaseUrl,
  PublicApiError,
  type ActiveEventLookup,
  type ApiErrorBody,
  type PublicDiscoveryResponse,
  type PublicEventDetail,
  type PublicInviteClaimResponse,
  type PublicQueue,
  type Venue
} from "./apiClient.ts"
import {
  assertActiveEventResponse,
  assertPublicDiscoveryResponse,
  assertPublicInviteClaimResponse,
  assertPublicEventDetailResponse,
  assertPublicQueueResponse,
  assertVenueResponse
} from "./apiValidation.ts"
import { isReservedPublicPathSlug } from "./staticSlugGuard.ts"

export function getServerApiBaseUrl(): string {
  return normalizeBaseUrl(process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL)
}

export function buildServerPublicApiUrl(path: string, params: Record<string, string | number | undefined> = {}): string {
  const url = new URL(path, `${getServerApiBaseUrl()}/`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

export async function getVenue(venueSlug: string): Promise<Venue> {
  assertPublicVenueSlug(venueSlug)
  return assertVenueResponse(await fetchServerJson(`/public/venues/${encodeURIComponent(venueSlug)}`)).venue
}

export async function getActiveEvent(venueSlug: string): Promise<ActiveEventLookup> {
  assertPublicVenueSlug(venueSlug)
  return assertActiveEventResponse(await fetchServerJson(`/public/venues/${encodeURIComponent(venueSlug)}/active-event`))
}

export async function getServerPublicQueue(eventId: string, cookieHeader?: string | null): Promise<PublicQueue> {
  return assertPublicQueueResponse(
    await fetchServerJson(`/public/events/${encodeURIComponent(eventId)}/queue`, requestInitWithCookie(cookieHeader))
  )
}

export async function getServerPublicEventDetail(eventPublicId: string, cookieHeader?: string | null): Promise<PublicEventDetail> {
  return assertPublicEventDetailResponse(
    await fetchServerJson(`/public/events/${encodeURIComponent(eventPublicId)}`, requestInitWithCookie(cookieHeader))
  )
}

export async function fetchPublicDiscovery(): Promise<PublicDiscoveryResponse> {
  return assertPublicDiscoveryResponse(await fetchServerJson("/public/discovery"))
}

export type ServerInviteClaimResult = {
  body: PublicInviteClaimResponse
  setCookieHeaders: string[]
}

export async function claimPublicInviteServer(
  inviteCode: string,
  cookieHeader?: string | null
): Promise<ServerInviteClaimResult> {
  const init: RequestInit = {
    method: "POST",
    cache: "no-store"
  }
  if (cookieHeader) {
    init.headers = { cookie: cookieHeader }
  }
  const response = await fetch(buildServerPublicApiUrl(`/public/invites/${encodeURIComponent(inviteCode)}/claim`), init)

  if (!response.ok) {
    const body = await readApiErrorBody(response)
    throw new PublicApiError(response.status, body.error?.code ?? "API_ERROR", body.error?.message ?? "API request failed")
  }

  return {
    body: assertPublicInviteClaimResponse(await response.json()),
    setCookieHeaders: readSetCookieHeaders(response.headers)
  }
}

export async function getServerPublicQueueByVenueSlug(venueSlug: string): Promise<PublicQueue> {
  assertPublicVenueSlug(venueSlug)
  return assertPublicQueueResponse(await fetchServerJson(`/public/venues/${encodeURIComponent(venueSlug)}/queue`))
}

function assertPublicVenueSlug(venueSlug: string): void {
  if (isReservedPublicPathSlug(venueSlug)) {
    throw new PublicApiError(404, "NOT_FOUND", "Public route is reserved")
  }
}

async function fetchServerJson(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(buildServerPublicApiUrl(path), {
    ...init,
    cache: "no-store"
  })

  if (!response.ok) {
    const body = await readApiErrorBody(response)
    throw new PublicApiError(response.status, body.error?.code ?? "API_ERROR", body.error?.message ?? "API request failed")
  }

  return response.json() as Promise<unknown>
}

function requestInitWithCookie(cookieHeader?: string | null): RequestInit {
  return cookieHeader ? { headers: { cookie: cookieHeader } } : {}
}

async function readApiErrorBody(response: Response): Promise<ApiErrorBody> {
  try {
    return (await response.json()) as ApiErrorBody
  } catch {
    return {}
  }
}

function readSetCookieHeaders(headers: Headers): string[] {
  const maybeHeaders = headers as Headers & { getSetCookie?: () => string[] }
  if (typeof maybeHeaders.getSetCookie === "function") {
    return maybeHeaders.getSetCookie()
  }

  const setCookie = headers.get("set-cookie")
  return setCookie ? [setCookie] : []
}
