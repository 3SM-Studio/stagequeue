import type { ActiveEventLookup } from "./apiClient.ts"
import { getJoinVisibility } from "./joinVisibility.ts"

export const publicJoinRefetchEvents = [
  "queue.updated",
  "event.started",
  "event.paused",
  "event.resumed",
  "event.closed",
  "event.archived",
  "event.cancelled"
] as const

export type PublicJoinViewState =
  | {
      kind: "inactive"
      active: ActiveEventLookup
    }
  | {
      kind: "open"
      active: ActiveEventLookup
    }
  | {
      kind: "paused"
      active: ActiveEventLookup
    }
  | {
      kind: "closed"
      active: ActiveEventLookup
      message: string
    }

export function getPublicJoinViewState(active: ActiveEventLookup): PublicJoinViewState {
  const activeEvent = active.activeEvent
  if (!activeEvent) {
    return {
      kind: "inactive",
      active
    }
  }

  const visibility = getJoinVisibility(activeEvent)
  if (visibility.kind === "paused") {
    return {
      kind: "paused",
      active
    }
  }

  if (visibility.kind === "closed") {
    return {
      kind: "closed",
      active,
      message: visibility.message
    }
  }

  return {
    kind: "open",
    active
  }
}

export function shouldRefetchPublicJoinOnSse(eventType: string): boolean {
  return (publicJoinRefetchEvents as readonly string[]).includes(eventType)
}

export function getPublicVenueStreamKey(venueSlug: string): string {
  return `public-venue:${venueSlug}`
}

export function getPublicJoinStreamErrorState(): { fatal: false; kind: "stale" } {
  return {
    fatal: false,
    kind: "stale"
  }
}
