import {
  PublicApiError,
  type ActiveEventLookup,
  type PublicDiscoveryResponse,
  type PublicEventDetail,
  type PublicQueue,
  type Venue
} from "./apiClient.ts"
import {
  fetchPublicDiscovery,
  getActiveEvent,
  getServerPublicEventDetail,
  getServerPublicQueue,
  getVenue
} from "./serverApiClient.ts"

export type VenuePageData =
  | {
      kind: "ready"
      venue: Venue
      active: ActiveEventLookup
    }
  | {
      kind: "not-found"
    }
  | {
      kind: "api-error"
      message: string
    }

export type PublicEventSessionPageData =
  | {
      kind: "ready"
      detail: PublicEventDetail
      queue: PublicQueue | null
    }
  | {
      kind: "not-found"
    }
  | {
      kind: "api-error"
      message: string
    }

export type PublicEventLandingPageData =
  | {
      kind: "ready"
      detail: PublicEventDetail
    }
  | {
      kind: "not-found"
    }
  | {
      kind: "api-error"
      message: string
    }

export type PublicDiscoveryPageData =
  | {
      kind: "ready"
      discovery: PublicDiscoveryResponse
    }
  | {
      kind: "api-error"
      message: string
    }

export async function getPublicDiscoveryPageData(): Promise<PublicDiscoveryPageData> {
  try {
    return {
      kind: "ready",
      discovery: await fetchPublicDiscovery()
    }
  } catch {
    return {
      kind: "api-error",
      message: "Spróbuj odświeżyć stronę za chwilę."
    }
  }
}

export async function getVenuePageData(venueSlug: string): Promise<VenuePageData> {
  try {
    const [venue, active] = await Promise.all([getVenue(venueSlug), getActiveEvent(venueSlug)])
    return { kind: "ready", venue, active }
  } catch (error) {
    if (error instanceof PublicApiError && error.status === 404) {
      return { kind: "not-found" }
    }

    return {
      kind: "api-error",
      message: error instanceof Error ? error.message : "Public API is unavailable"
    }
  }
}

export async function getVenueMetadataData(venueSlug: string): Promise<Venue | null> {
  try {
    return await getVenue(venueSlug)
  } catch {
    return null
  }
}

export async function getPublicEventSessionPageData(
  eventPublicId: string,
  cookieHeader?: string | null
): Promise<PublicEventSessionPageData> {
  try {
    const detail = await getServerPublicEventDetail(eventPublicId, cookieHeader)
    const queue = detail.publicQueue.visible ? await getServerPublicQueue(eventPublicId, cookieHeader) : null
    return {
      kind: "ready",
      detail,
      queue
    }
  } catch (error) {
    if (error instanceof PublicApiError && error.status === 404) {
      return { kind: "not-found" }
    }

    return {
      kind: "api-error",
      message: error instanceof Error ? error.message : "Public API is unavailable"
    }
  }
}

export async function getPublicEventLandingPageData(
  eventPublicId: string,
  cookieHeader?: string | null
): Promise<PublicEventLandingPageData> {
  try {
    return {
      kind: "ready",
      detail: await getServerPublicEventDetail(eventPublicId, cookieHeader)
    }
  } catch (error) {
    if (error instanceof PublicApiError && error.status === 404) {
      return { kind: "not-found" }
    }

    return {
      kind: "api-error",
      message: error instanceof Error ? error.message : "Public API is unavailable"
    }
  }
}
