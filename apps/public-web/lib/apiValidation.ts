import type { ActiveEventLookup, PublicEvent, PublicQueue, QueueItem, SubmitSongRequestResult, Venue } from "./apiClient.ts"

type VenueResponse = {
  venue: Venue
}

export function assertVenueResponse(value: unknown): VenueResponse {
  if (!isRecord(value) || !isVenue(value.venue)) {
    throw invalidResponse("venue")
  }

  return { venue: value.venue }
}

export function assertActiveEventResponse(value: unknown): ActiveEventLookup {
  if (!isRecord(value) || !isActiveEventVenue(value.venue) || !(value.activeEvent === null || isPublicEvent(value.activeEvent))) {
    throw invalidResponse("active event")
  }

  return {
    venue: value.venue,
    activeEvent: value.activeEvent
  }
}

export function assertPublicQueueResponse(value: unknown): PublicQueue {
  if (
    !isRecord(value) ||
    !(value.event === null || isPublicQueueEvent(value.event)) ||
    !(
      value.activeEvent === undefined ||
      value.activeEvent === null ||
      isPublicEvent(value.activeEvent)
    ) ||
    !isPublicQueueVenue(value.venue) ||
    !(value.now === null || isQueueItem(value.now)) ||
    !Array.isArray(value.queue) ||
    !value.queue.every(isQueueItem) ||
    !isPublicQueueSubmissions(value.submissions)
  ) {
    throw invalidResponse("public queue")
  }

  const queue: PublicQueue = {
    event: value.event,
    venue: value.venue,
    now: value.now,
    queue: value.queue,
    submissions: value.submissions
  }
  if (value.activeEvent !== undefined) {
    queue.activeEvent = value.activeEvent
  }

  return queue
}

export function assertSubmitRequestResponse(value: unknown): SubmitSongRequestResult {
  if (!isRecord(value) || !isSubmitRequest(value.request)) {
    throw invalidResponse("submit request")
  }

  return {
    request: value.request
  }
}

function isVenue(value: unknown): value is Venue {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.slug) &&
    isString(value.name) &&
    isNullableString(value.address) &&
    isNullableString(value.city) &&
    isString(value.country) &&
    isString(value.timezone) &&
    isString(value.status) &&
    isString(value.verificationStatus)
  )
}

function isActiveEventVenue(value: unknown): value is ActiveEventLookup["venue"] {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.slug) &&
    isString(value.name) &&
    isNullableString(value.city) &&
    isString(value.timezone)
  )
}

function isPublicEvent(value: unknown): value is PublicEvent {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.venueId) &&
    isString(value.operatedByOrganizationId) &&
    isString(value.name) &&
    isString(value.slug) &&
    isEventStatus(value.status) &&
    isNullableString(value.startsAt) &&
    isNullableString(value.endsAt) &&
    typeof value.publicJoinEnabled === "boolean" &&
    typeof value.publicQueueEnabled === "boolean"
  )
}

function isQueueItem(value: unknown): value is QueueItem {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.singerName) &&
    isString(value.songTitle) &&
    isString(value.songArtist) &&
    (value.position === undefined || value.position === null || typeof value.position === "number")
  )
}

function isPublicQueueEvent(value: unknown): value is PublicQueue["event"] {
  return isRecord(value) && isString(value.id) && isString(value.name) && isEventStatus(value.status)
}

function isPublicQueueVenue(value: unknown): value is PublicQueue["venue"] {
  return isRecord(value) && isString(value.id) && isString(value.name) && isString(value.slug)
}

function isPublicQueueSubmissions(value: unknown): value is PublicQueue["submissions"] {
  return isRecord(value) && typeof value.enabled === "boolean" && (value.reason === undefined || isString(value.reason))
}

function isSubmitRequest(value: unknown): value is SubmitSongRequestResult["request"] {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.status) &&
    isString(value.singerName) &&
    isString(value.songTitle) &&
    isString(value.songArtist) &&
    isString(value.sourceId) &&
    isString(value.sourceTrackId)
  )
}

function isEventStatus(value: unknown): value is PublicEvent["status"] {
  return (
    isString(value) &&
    ["active", "paused", "draft", "scheduled", "closed", "archived", "cancelled"].includes(value)
  )
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value)
}

function isString(value: unknown): value is string {
  return typeof value === "string"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function invalidResponse(name: string): Error {
  return new Error(`Invalid public API response: ${name}`)
}
