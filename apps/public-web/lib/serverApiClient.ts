import {
  DEFAULT_API_URL,
  normalizeBaseUrl,
  PublicApiError,
  type ActiveEventLookup,
  type ApiErrorBody,
  type PublicQueue,
  type Venue
} from "./apiClient.ts"
import {
  assertActiveEventResponse,
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

export async function getServerPublicQueue(eventId: string): Promise<PublicQueue> {
  return assertPublicQueueResponse(await fetchServerJson(`/public/events/${encodeURIComponent(eventId)}/queue`))
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

async function readApiErrorBody(response: Response): Promise<ApiErrorBody> {
  try {
    return (await response.json()) as ApiErrorBody
  } catch {
    return {}
  }
}
