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

export type PublicEventPageData =
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

export type PublicEventQueuePageData =
  | {
      kind: "ready"
      detail: PublicEventDetail
      queue: PublicQueue
    }
  | {
      kind: "unavailable"
      detail: PublicEventDetail
      reason: "disabled" | "scheduled" | "unavailable"
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

export async function getPublicEventPageData(eventPublicId: string, cookieHeader?: string | null): Promise<PublicEventPageData> {
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

export async function getPublicEventQueuePageData(
  eventPublicId: string,
  cookieHeader?: string | null
): Promise<PublicEventQueuePageData> {
  let detail: PublicEventDetail
  try {
    detail = await getServerPublicEventDetail(eventPublicId, cookieHeader)
  } catch (error) {
    return publicPageError(error)
  }

  if (!detail.publicQueue.visible) {
    return {
      kind: "unavailable",
      detail,
      reason: queueUnavailableReason(detail)
    }
  }

  try {
    return {
      kind: "ready",
      detail,
      queue: await getServerPublicQueue(eventPublicId, cookieHeader)
    }
  } catch (error) {
    if (error instanceof PublicApiError && error.status === 403) {
      return { kind: "unavailable", detail, reason: "disabled" }
    }
    if (error instanceof PublicApiError && error.status === 409) {
      return {
        kind: "unavailable",
        detail,
        reason: detail.event.status === "scheduled" ? "scheduled" : "unavailable"
      }
    }
    return publicPageError(error)
  }
}

function queueUnavailableReason(detail: PublicEventDetail): "disabled" | "scheduled" | "unavailable" {
  if (detail.publicQueue.reason === "PUBLIC_QUEUE_DISABLED") {
    return "disabled"
  }
  if (detail.event.status === "scheduled") {
    return "scheduled"
  }
  return "unavailable"
}

function publicPageError(error: unknown): { kind: "not-found" } | { kind: "api-error"; message: string } {
  if (error instanceof PublicApiError && error.status === 404) {
    return { kind: "not-found" }
  }

  return {
    kind: "api-error",
    message: error instanceof Error ? error.message : "Public API is unavailable"
  }
}
