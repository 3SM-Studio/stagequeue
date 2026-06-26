import { ApiHttpError } from "../errors.ts"

const publicQueueVisibleStatuses = ["active", "paused", "closed"] as const
const publicEventDetailVisibleStatuses = ["scheduled", "active", "paused", "closed"] as const

export type PublicVenueVisibility = {
  status: string
  verificationStatus: string
}

export type PublicOrganizationVisibility = {
  status: string
}

export type PublicQueueVisibilityEvent = {
  status: string
  publicQueueEnabled: boolean
}

export type PublicEventDetailVisibilityEvent = {
  status: string
  visibility: string
  publicJoinEnabled: boolean
  publicQueueEnabled: boolean
  joinAccessMode?: string
}

export type PublicEventDirectVisibility = {
  visibility: string
}

export type PublicEventContainerVisibility = {
  venue: PublicVenueVisibility
  organization: PublicOrganizationVisibility
}

export function isPublicVenueVisible(venue: PublicVenueVisibility): boolean {
  return venue.status === "active" && venue.verificationStatus === "verified"
}

export function isPublicOrganizationVisible(organization: PublicOrganizationVisibility): boolean {
  return organization.status === "active"
}

export function assertPublicEventContainerVisible(
  context: PublicEventContainerVisibility,
  message = "Missing event"
): void {
  if (!isPublicVenueVisible(context.venue) || !isPublicOrganizationVisible(context.organization)) {
    throw new ApiHttpError(404, "NOT_FOUND", message)
  }
}

export function isPublicEventDiscoverable(event: PublicEventDirectVisibility): boolean {
  return event.visibility === "public"
}

export function assertPublicEventDirectlyVisible(
  event: PublicEventDirectVisibility,
  message = "Missing event"
): void {
  if (event.visibility !== "public" && event.visibility !== "unlisted") {
    throw new ApiHttpError(404, "NOT_FOUND", message)
  }
}

export function assertPublicQueueVisible(event: PublicQueueVisibilityEvent): void {
  if (!event.publicQueueEnabled) {
    throw new ApiHttpError(403, "FORBIDDEN", "Public queue is disabled for this event")
  }

  if (!publicQueueVisibleStatuses.includes(event.status as (typeof publicQueueVisibleStatuses)[number])) {
    throw new ApiHttpError(409, "CONFLICT", "Queue is not active for this event")
  }
}

export function assertPublicEventDetailVisible(event: PublicEventDetailVisibilityEvent): void {
  assertPublicEventDirectlyVisible(event)
  if (!publicEventDetailVisibleStatuses.includes(event.status as (typeof publicEventDetailVisibleStatuses)[number])) {
    throw new ApiHttpError(404, "NOT_FOUND", "Missing event")
  }
}

export function getPublicSubmissionsState(
  event: PublicEventDetailVisibilityEvent,
  options: { hasParticipantAccess?: boolean } = {}
): { enabled: boolean; reason?: string } {
  if (event.status !== "active") {
    return { enabled: false, reason: "EVENT_NOT_ACTIVE" }
  }

  if (!event.publicJoinEnabled) {
    return { enabled: false, reason: "PUBLIC_JOIN_DISABLED" }
  }

  if (event.joinAccessMode === "invite_required" && options.hasParticipantAccess !== true) {
    return { enabled: false, reason: "ACCESS_REQUIRED" }
  }

  return { enabled: true }
}

export function getPublicQueueState(event: PublicEventDetailVisibilityEvent): { visible: boolean; reason?: string } {
  if (!event.publicQueueEnabled) {
    return { visible: false, reason: "PUBLIC_QUEUE_DISABLED" }
  }

  if (!publicQueueVisibleStatuses.includes(event.status as (typeof publicQueueVisibleStatuses)[number])) {
    return { visible: false, reason: "QUEUE_NOT_VISIBLE" }
  }

  return { visible: true }
}
