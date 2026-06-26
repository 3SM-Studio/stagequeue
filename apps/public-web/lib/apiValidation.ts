import type {
  ActiveEventLookup,
  PublicDiscoveryEvent,
  PublicDiscoveryResponse,
  PublicDiscoveryVenue,
  PublicEvent,
  PublicEventDetail,
  PublicInviteClaimResponse,
  PublicMyRequest,
  PublicMyRequestsResponse,
  PublicQueue,
  QueueItem,
  SubmitSongRequestResult,
  Venue
} from "./apiClient.ts"

type VenueResponse = {
  venue: Venue
}

export function assertPublicDiscoveryResponse(value: unknown): PublicDiscoveryResponse {
  if (
    !isRecordWithKeys(value, ["now", "upcoming", "venues"]) ||
    !Array.isArray(value.now) ||
    !value.now.every((event) => isPublicDiscoveryEvent(event, "active")) ||
    !Array.isArray(value.upcoming) ||
    !value.upcoming.every((event) => isPublicDiscoveryEvent(event, "scheduled")) ||
    !Array.isArray(value.venues) ||
    !value.venues.every(isPublicDiscoveryVenue)
  ) {
    throw invalidResponse("public discovery")
  }

  return {
    now: value.now,
    upcoming: value.upcoming,
    venues: value.venues
  }
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

export function assertPublicEventDetailResponse(value: unknown): PublicEventDetail {
  if (
    !isRecord(value) ||
    !isPublicEventDetailEvent(value.event) ||
    !isPublicEventDetailVenue(value.venue) ||
    !isPublicEventOrganization(value.operatedByOrganization) ||
    !isPublicQueueSubmissions(value.submissions) ||
    !isPublicEventQueueState(value.publicQueue)
  ) {
    throw invalidResponse("public event detail")
  }

  return {
    event: value.event,
    venue: value.venue,
    operatedByOrganization: value.operatedByOrganization,
    submissions: value.submissions,
    publicQueue: value.publicQueue
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

export function assertMyRequestsResponse(value: unknown): PublicMyRequestsResponse {
  if (!isRecord(value) || !Array.isArray(value.requests) || !value.requests.every(isMyRequest)) {
    throw invalidResponse("my requests")
  }

  return {
    requests: value.requests
  }
}

export function assertPublicInviteClaimResponse(value: unknown): PublicInviteClaimResponse {
  if (!isRecord(value) || !isString(value.eventPublicId) || !isString(value.redirectTo)) {
    throw invalidResponse("public invite claim")
  }

  return {
    eventPublicId: value.eventPublicId,
    redirectTo: value.redirectTo
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

function isPublicDiscoveryEvent(
  value: unknown,
  expectedStatus: PublicDiscoveryEvent["status"]
): value is PublicDiscoveryEvent {
  return (
    isRecordWithKeys(value, ["eventPublicId", "name", "status", "startsAt", "venue", "joinState"]) &&
    isString(value.eventPublicId) &&
    isString(value.name) &&
    value.status === expectedStatus &&
    isNullableString(value.startsAt) &&
    isPublicDiscoveryEventVenue(value.venue) &&
    isPublicDiscoveryJoinState(value.joinState)
  )
}

function isPublicDiscoveryEventVenue(value: unknown): value is PublicDiscoveryEvent["venue"] {
  return (
    isRecordWithKeys(value, ["slug", "name", "city", "timezone"]) &&
    isString(value.slug) &&
    isString(value.name) &&
    isNullableString(value.city) &&
    isString(value.timezone)
  )
}

function isPublicDiscoveryVenue(value: unknown): value is PublicDiscoveryVenue {
  return (
    isRecordWithKeys(value, ["slug", "name", "city", "timezone", "activeEvent"]) &&
    isString(value.slug) &&
    isString(value.name) &&
    isNullableString(value.city) &&
    isString(value.timezone) &&
    (value.activeEvent === null || isPublicDiscoveryVenueEvent(value.activeEvent))
  )
}

function isPublicDiscoveryVenueEvent(value: unknown): value is NonNullable<PublicDiscoveryVenue["activeEvent"]> {
  return (
    isRecordWithKeys(value, ["eventPublicId", "name", "joinState"]) &&
    isString(value.eventPublicId) &&
    isString(value.name) &&
    isPublicDiscoveryJoinState(value.joinState)
  )
}

function isPublicDiscoveryJoinState(value: unknown): value is PublicDiscoveryEvent["joinState"] {
  return isString(value) && ["open", "invite_required", "closed"].includes(value)
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
    isString(value.publicId) &&
    isString(value.name) &&
    isString(value.slug) &&
    isEventStatus(value.status) &&
    isEventVisibility(value.visibility) &&
    isNullableString(value.startsAt) &&
    isNullableString(value.endsAt) &&
    typeof value.publicJoinEnabled === "boolean" &&
    typeof value.publicQueueEnabled === "boolean" &&
    isJoinAccessMode(value.joinAccessMode)
  )
}

function isPublicEventDetailEvent(value: unknown): value is PublicEventDetail["event"] {
  return (
    isRecord(value) &&
    isString(value.publicId) &&
    isString(value.name) &&
    isString(value.slug) &&
    isEventStatus(value.status) &&
    isEventVisibility(value.visibility) &&
    isNullableString(value.startsAt) &&
    isNullableString(value.endsAt) &&
    typeof value.publicJoinEnabled === "boolean" &&
    typeof value.publicQueueEnabled === "boolean" &&
    isJoinAccessMode(value.joinAccessMode)
  )
}

function isPublicEventDetailVenue(value: unknown): value is PublicEventDetail["venue"] {
  return (
    isRecord(value) &&
    isString(value.slug) &&
    isString(value.name) &&
    isNullableString(value.city) &&
    isString(value.timezone)
  )
}

function isPublicEventOrganization(value: unknown): value is PublicEventDetail["operatedByOrganization"] {
  return isRecord(value) && isString(value.slug) && isString(value.name)
}

function isPublicEventQueueState(value: unknown): value is PublicEventDetail["publicQueue"] {
  return isRecord(value) && typeof value.visible === "boolean" && (value.reason === undefined || isString(value.reason))
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
  return isRecord(value) && isString(value.publicId) && isString(value.name) && isEventStatus(value.status)
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

function isMyRequest(value: unknown): value is PublicMyRequest {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isRequestStatus(value.status) &&
    isString(value.singerName) &&
    isString(value.artist) &&
    isString(value.title) &&
    (value.position === null || typeof value.position === "number") &&
    isString(value.createdAt)
  )
}

function isEventStatus(value: unknown): value is PublicEvent["status"] {
  return (
    isString(value) &&
    ["active", "paused", "draft", "scheduled", "closed", "archived", "cancelled"].includes(value)
  )
}

function isRequestStatus(value: unknown): value is PublicMyRequest["status"] {
  return isString(value) && ["pending", "approved", "now", "done", "rejected", "skipped"].includes(value)
}

function isJoinAccessMode(value: unknown): value is PublicEvent["joinAccessMode"] {
  return isString(value) && ["open", "invite_required"].includes(value)
}

function isEventVisibility(value: unknown): value is PublicEvent["visibility"] {
  return isString(value) && ["public", "unlisted", "private"].includes(value)
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

function isRecordWithKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).length === keys.length && keys.every((key) => key in value)
}

function invalidResponse(name: string): Error {
  return new Error(`Invalid public API response: ${name}`)
}
