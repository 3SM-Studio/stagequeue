import { PublicApiError, type ActiveEventLookup, type Venue } from "./apiClient.ts"
import { getActiveEvent, getVenue } from "./serverApiClient.ts"

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
