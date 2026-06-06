import { ApiHttpError } from "../errors.ts"

const publicQueueVisibleStatuses = ["active", "paused", "closed"] as const

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

export function assertPublicQueueVisible(event: PublicQueueVisibilityEvent): void {
  if (!event.publicQueueEnabled) {
    throw new ApiHttpError(403, "FORBIDDEN", "Public queue is disabled for this event")
  }

  if (!publicQueueVisibleStatuses.includes(event.status as (typeof publicQueueVisibleStatuses)[number])) {
    throw new ApiHttpError(409, "CONFLICT", "Queue is not active for this event")
  }
}
