import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { createApiApp } from "../apps/api/src/app.ts"
import type { AuthenticatedDomainUser } from "../apps/api/src/auth/access.ts"
import type { ApiConfig } from "../apps/api/src/config.ts"
import { ApiHttpError } from "../apps/api/src/errors.ts"
import {
  createEventsService,
  type EventSummary,
  type PublicActiveEventLookup
} from "../apps/api/src/modules/events/service.ts"
import { PARTICIPANT_COOKIE_NAME, hashParticipantToken } from "../apps/api/src/modules/queue/participant.ts"
import {
  createQueueService,
  lockQueueForEvent,
  mapQueueMutationError,
  type QueueService,
  type QueueSongRequest,
  type SubmitPublicRequestInput
} from "../apps/api/src/modules/queue/service.ts"
import type { ApiModuleServices } from "../apps/api/src/plugins/modules.ts"
import type { DbResources } from "../apps/api/src/plugins/db.ts"
import type {
  PermissionService,
  PlatformOwnerEventSupportAccessAuditInput
} from "../apps/api/src/permissions/service.ts"

const USER_ID = "11111111-1111-4111-8111-111111111111"
const VENUE_ID = "22222222-2222-4222-8222-222222222222"
const ACTIVE_EVENT_ID = "33333333-3333-4333-8333-333333333333"
const PAUSED_EVENT_ID = "44444444-4444-4444-8444-444444444444"
const SCHEDULED_EVENT_ID = "55555555-5555-4555-8555-555555555555"
const CLOSED_EVENT_ID = "88888888-8888-4888-8888-888888888888"

test("public submit creates pending request for active event and writes queue event", async () => {
  const queue = createInMemoryQueueService()
  const app = await createTestApp({ queue })
  try {
    const response = await app.inject({
      method: "POST",
      url: `/public/events/${ACTIVE_EVENT_ID}/requests`,
      payload: publicSubmitPayload("Michał", "Królowa Łez")
    })

    assert.equal(response.statusCode, 201)
    assert.equal(typeof response.json().request.id, "string")
    assert.equal(response.json().request.status, "pending")
    assert.equal(response.json().request.singerName, "Michał")
    assert.equal(queue.state.requests[0].songTitle, "Królowa Łez")
    assert.deepEqual(queue.state.queueEvents.map((event) => event.type), ["request.created"])
  } finally {
    await app.close()
  }
})

test("public submit rate limit allows first requests and blocks the sixth for the same IP and event", async () => {
  const queue = createInMemoryQueueService()
  const app = await createTestApp({ queue })
  try {
    const responses = []
    for (let index = 0; index < 6; index += 1) {
      responses.push(
        await app.inject({
          method: "POST",
          url: `/public/events/${ACTIVE_EVENT_ID}/requests`,
          payload: publicSubmitPayload(`Singer ${index + 1}`, `Song ${index + 1}`)
        })
      )
    }

    assert.deepEqual(
      responses.slice(0, 5).map((response) => response.statusCode),
      [201, 201, 201, 201, 201]
    )
    assert.equal(responses[5].statusCode, 429)
    assert.equal(responses[5].json().error.code, "TOO_MANY_REQUESTS")
    assert.equal(responses[5].json().error.message, "Too many public song requests. Please try again later.")
    assert.equal(queue.state.requests.length, 5)
  } finally {
    await app.close()
  }
})

test("public submit without cookie sets participant cookie and stores only token hash", async () => {
  const queue = createInMemoryQueueService()
  const app = await createTestApp({ queue })
  try {
    const response = await app.inject({
      method: "POST",
      url: `/public/events/${ACTIVE_EVENT_ID}/requests`,
      payload: publicSubmitPayload()
    })
    const token = readParticipantCookie(response)
    const storedHash = queue.state.requests[0].participantTokenHash

    assert.equal(response.statusCode, 201)
    assert.equal(typeof token, "string")
    assert.equal(typeof storedHash, "string")
    assert.notEqual(storedHash, token)
    assert.equal(storedHash, hashParticipantToken(token, testConfig().participantTokenSecret))
  } finally {
    await app.close()
  }
})

test("public submit with cookie reuses the same participant token hash", async () => {
  const first = new Date("2026-05-29T18:00:00.000Z")
  const queue = createInMemoryQueueService({ now: first })
  const app = await createTestApp({ queue })
  try {
    const firstResponse = await app.inject({
      method: "POST",
      url: `/public/events/${ACTIVE_EVENT_ID}/requests`,
      payload: publicSubmitPayload("Singer 1", "Song 1")
    })
    const token = readParticipantCookie(firstResponse)
    queue.setNow(new Date(first.getTime() + 21_000))
    const secondResponse = await app.inject({
      method: "POST",
      url: `/public/events/${ACTIVE_EVENT_ID}/requests`,
      headers: { cookie: `${PARTICIPANT_COOKIE_NAME}=${token}` },
      payload: publicSubmitPayload("Singer 2", "Song 2")
    })

    assert.equal(secondResponse.statusCode, 201)
    assert.equal(queue.state.requests[0].participantTokenHash, queue.state.requests[1].participantTokenHash)
    assert.equal(queue.state.requests[0].participantTokenHash, hashParticipantToken(token, testConfig().participantTokenSecret))
  } finally {
    await app.close()
  }
})

test("venue-first my-requests without participant cookie returns an empty list", async () => {
  const queue = createInMemoryQueueService()
  const app = await createTestApp({ queue })
  try {
    const response = await app.inject({
      method: "GET",
      url: "/public/venues/klub-x/my-requests"
    })

    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.json(), { requests: [] })
  } finally {
    await app.close()
  }
})

test("venue-first my-requests returns only requests owned by participant cookie", async () => {
  const ownerToken = "participant-token-owned-by-this-browser-123"
  const otherToken = "participant-token-owned-by-another-browser"
  const ownerHash = hashParticipantToken(ownerToken, testConfig().participantTokenSecret)
  const otherHash = hashParticipantToken(otherToken, testConfig().participantTokenSecret)
  const queue = createInMemoryQueueService()
  queue.addRequest(ACTIVE_EVENT_ID, "pending", {
    participantTokenHash: ownerHash,
    singerName: "Owner",
    displayName: "Owner",
    songArtist: "ABBA",
    songTitle: "Dancing Queen"
  })
  queue.addRequest(ACTIVE_EVENT_ID, "approved", {
    participantTokenHash: otherHash,
    singerName: "Other",
    displayName: "Other",
    songArtist: "NSYNC",
    songTitle: "Bye Bye Bye"
  })
  const app = await createTestApp({ queue })
  try {
    const response = await app.inject({
      method: "GET",
      url: "/public/venues/klub-x/my-requests",
      headers: { cookie: `${PARTICIPANT_COOKIE_NAME}=${ownerToken}` }
    })
    const body = response.json()
    const serialized = response.body

    assert.equal(response.statusCode, 200)
    assert.equal(body.requests.length, 1)
    assert.equal(body.requests[0].singerName, "Owner")
    assert.equal(body.requests[0].artist, "ABBA")
    assert.equal(body.requests[0].title, "Dancing Queen")
    assert.equal(body.requests[0].status, "pending")
    assert.equal(serialized.includes(ownerToken), false)
    assert.equal(serialized.includes(ownerHash), false)
    assert.equal(serialized.includes(otherHash), false)
  } finally {
    await app.close()
  }
})

test("venue-first my-requests returns all public request statuses for the participant", async () => {
  const token = "participant-token-for-all-statuses-123"
  const participantTokenHash = hashParticipantToken(token, testConfig().participantTokenSecret)
  const queue = createInMemoryQueueService()
  for (const status of ["pending", "approved", "now", "done", "rejected", "skipped"]) {
    queue.addRequest(ACTIVE_EVENT_ID, status, { participantTokenHash })
  }
  const app = await createTestApp({ queue })
  try {
    const response = await app.inject({
      method: "GET",
      url: "/public/venues/klub-x/my-requests",
      headers: { cookie: `${PARTICIPANT_COOKIE_NAME}=${token}` }
    })

    assert.equal(response.statusCode, 200)
    assert.deepEqual(
      response.json().requests.map((request: { status: string }) => request.status).sort(),
      ["approved", "done", "now", "pending", "rejected", "skipped"]
    )
  } finally {
    await app.close()
  }
})

test("venue-first my-requests returns empty when venue has no active or paused event", async () => {
  const token = "participant-token-no-active-event-12345"
  const participantTokenHash = hashParticipantToken(token, testConfig().participantTokenSecret)
  const queue = createInMemoryQueueService()
  queue.addRequest(CLOSED_EVENT_ID, "done", { participantTokenHash })
  const app = await createTestApp({
    events: fakeEventsService({ lookup: makePublicLookup(null) }),
    queue
  })
  try {
    const response = await app.inject({
      method: "GET",
      url: "/public/venues/klub-x/my-requests",
      headers: { cookie: `${PARTICIPANT_COOKIE_NAME}=${token}` }
    })

    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.json(), { requests: [] })
  } finally {
    await app.close()
  }
})

test("max active requests per participant blocks another public submit", async () => {
  const start = new Date("2026-05-29T18:10:00.000Z")
  const token = "participant-token-for-active-limit"
  const participantTokenHash = hashParticipantToken(token, testConfig().participantTokenSecret)
  const queue = createInMemoryQueueService({ now: start })
  const app = await createTestApp({ queue })
  try {
    const responses = []
    for (let index = 0; index < 4; index += 1) {
      queue.setNow(new Date(start.getTime() + index * 21_000))
      responses.push(
        await app.inject({
          method: "POST",
          url: `/public/events/${ACTIVE_EVENT_ID}/requests`,
          headers: { cookie: `${PARTICIPANT_COOKIE_NAME}=${token}` },
          payload: publicSubmitPayload(`Singer ${index}`, `Song ${index}`)
        })
      )
    }

    assert.deepEqual(
      responses.slice(0, 3).map((response) => response.statusCode),
      [201, 201, 201]
    )
    assert.equal(responses[3].statusCode, 429)
    assert.equal(responses[3].json().error.message, "Too many active requests for this event.")
    assert.equal(queue.state.requests.length, 3)
    assert.equal(queue.state.requests.every((request) => request.participantTokenHash === participantTokenHash), true)
  } finally {
    await app.close()
  }
})

test("done rejected and skipped requests do not count against participant active limit", async () => {
  const token = "participant-token-with-history"
  const participantTokenHash = hashParticipantToken(token, testConfig().participantTokenSecret)
  const old = new Date("2026-05-29T17:00:00.000Z")
  const queue = createInMemoryQueueService({ now: new Date("2026-05-29T18:20:00.000Z") })
  queue.addRequest(ACTIVE_EVENT_ID, "done", { participantTokenHash, requestedAt: old })
  queue.addRequest(ACTIVE_EVENT_ID, "rejected", { participantTokenHash, requestedAt: old })
  queue.addRequest(ACTIVE_EVENT_ID, "skipped", { participantTokenHash, requestedAt: old })
  const app = await createTestApp({ queue })
  try {
    const response = await app.inject({
      method: "POST",
      url: `/public/events/${ACTIVE_EVENT_ID}/requests`,
      headers: { cookie: `${PARTICIPANT_COOKIE_NAME}=${token}` },
      payload: publicSubmitPayload()
    })

    assert.equal(response.statusCode, 201)
    assert.equal(queue.state.requests.at(-1)?.status, "pending")
  } finally {
    await app.close()
  }
})

test("participant cooldown blocks rapid submit and allows submit after cooldown", async () => {
  const start = new Date("2026-05-29T18:30:00.000Z")
  const token = "participant-token-for-cooldown-123456"
  const queue = createInMemoryQueueService({ now: start })
  const app = await createTestApp({ queue })
  try {
    const first = await app.inject({
      method: "POST",
      url: `/public/events/${ACTIVE_EVENT_ID}/requests`,
      headers: { cookie: `${PARTICIPANT_COOKIE_NAME}=${token}` },
      payload: publicSubmitPayload("Singer 1", "Song 1")
    })
    queue.setNow(new Date(start.getTime() + 5_000))
    const blocked = await app.inject({
      method: "POST",
      url: `/public/events/${ACTIVE_EVENT_ID}/requests`,
      headers: { cookie: `${PARTICIPANT_COOKIE_NAME}=${token}` },
      payload: publicSubmitPayload("Singer 2", "Song 2")
    })
    queue.setNow(new Date(start.getTime() + 21_000))
    const allowed = await app.inject({
      method: "POST",
      url: `/public/events/${ACTIVE_EVENT_ID}/requests`,
      headers: { cookie: `${PARTICIPANT_COOKIE_NAME}=${token}` },
      payload: publicSubmitPayload("Singer 3", "Song 3")
    })

    assert.equal(first.statusCode, 201)
    assert.equal(blocked.statusCode, 429)
    assert.equal(blocked.json().error.message, "Please wait before submitting another request.")
    assert.equal(allowed.statusCode, 201)
  } finally {
    await app.close()
  }
})

test("public submit is blocked for paused scheduled and closed events", async () => {
  const queue = createInMemoryQueueService()
  const app = await createTestApp({ queue })
  try {
    const paused = await app.inject({
      method: "POST",
      url: `/public/events/${PAUSED_EVENT_ID}/requests`,
      payload: publicSubmitPayload()
    })
    const scheduled = await app.inject({
      method: "POST",
      url: `/public/events/${SCHEDULED_EVENT_ID}/requests`,
      payload: publicSubmitPayload()
    })
    const closed = await app.inject({
      method: "POST",
      url: `/public/events/${CLOSED_EVENT_ID}/requests`,
      payload: publicSubmitPayload()
    })

    assert.equal(paused.statusCode, 409)
    assert.equal(paused.json().error.code, "CONFLICT")
    assert.equal(scheduled.statusCode, 409)
    assert.equal(scheduled.json().error.code, "CONFLICT")
    assert.equal(closed.statusCode, 409)
    assert.equal(closed.json().error.code, "CONFLICT")
    assert.equal(queue.state.requests.length, 0)
  } finally {
    await app.close()
  }
})

test("public submit is blocked when publicJoinEnabled is false", async () => {
  const db = fakeDbForQueueEventContext({
    status: "active",
    publicJoinEnabled: false,
    publicQueueEnabled: true
  })
  const app = await createTestApp({
    db,
    queue: createQueueService(db.db)
  })
  try {
    const response = await app.inject({
      method: "POST",
      url: `/public/events/${ACTIVE_EVENT_ID}/requests`,
      payload: publicSubmitPayload()
    })

    assert.equal(response.statusCode, 409)
    assert.equal(response.json().error.code, "CONFLICT")
  } finally {
    await app.close()
  }
})

test("public event detail returns active public event", async () => {
  const db = fakeDbForPublicEventDetail({ status: "active", publicJoinEnabled: true, publicQueueEnabled: true })
  const app = await createTestApp({
    db,
    events: createEventsService(db.db)
  })
  try {
    const response = await app.inject({ method: "GET", url: `/public/events/${ACTIVE_EVENT_ID}` })
    const body = response.json()

    assert.equal(response.statusCode, 200)
    assert.equal(body.event.id, ACTIVE_EVENT_ID)
    assert.equal(body.event.publicId, ACTIVE_EVENT_ID)
    assert.equal(body.event.name, "Active Event")
    assert.equal(body.event.status, "active")
    assert.equal(body.event.publicJoinEnabled, true)
    assert.equal(body.event.publicQueueEnabled, true)
    assert.equal(body.venue.slug, "klub-x")
    assert.equal(body.venue.name, "Klub X")
    assert.equal(body.operatedByOrganization.slug, "poza-nuta-demo")
    assert.equal(body.submissions.enabled, true)
    assert.equal(body.publicQueue.visible, true)
  } finally {
    await app.close()
  }
})

test("public event detail hides events from non-public venues and organizations", async () => {
  for (const hiddenContext of [
    { venueStatus: "draft" },
    { venueStatus: "archived" },
    { venueVerificationStatus: "pending" },
    { venueVerificationStatus: "rejected" },
    { organizationStatus: "pending" },
    { organizationStatus: "archived" }
  ]) {
    const db = fakeDbForPublicEventDetail({
      status: "active",
      publicJoinEnabled: true,
      publicQueueEnabled: true,
      ...hiddenContext
    })
    const app = await createTestApp({
      db,
      events: createEventsService(db.db)
    })
    try {
      const response = await app.inject({ method: "GET", url: `/public/events/${ACTIVE_EVENT_ID}` })

      assert.equal(response.statusCode, 404)
      assert.equal(response.json().error.code, "NOT_FOUND")
      assert.equal(response.json().error.message, "Missing event")
    } finally {
      await app.close()
    }
  }
})

test("public event detail hides non-public event statuses", async () => {
  for (const status of ["draft", "archived", "cancelled"]) {
    const db = fakeDbForPublicEventDetail({ status, publicJoinEnabled: true, publicQueueEnabled: true })
    const app = await createTestApp({
      db,
      events: createEventsService(db.db)
    })
    try {
      const response = await app.inject({ method: "GET", url: `/public/events/${ACTIVE_EVENT_ID}` })

      assert.equal(response.statusCode, 404)
      assert.equal(response.json().error.code, "NOT_FOUND")
      assert.equal(response.json().error.message, "Missing event")
    } finally {
      await app.close()
    }
  }
})

test("public event detail does not expose private queue fields", async () => {
  const db = fakeDbForPublicEventDetail({ status: "active", publicJoinEnabled: true, publicQueueEnabled: true })
  const app = await createTestApp({
    db,
    events: createEventsService(db.db)
  })
  try {
    const response = await app.inject({ method: "GET", url: `/public/events/${ACTIVE_EVENT_ID}` })

    assert.equal(response.statusCode, 200)
    assert.equal(response.body.includes("operator note"), false)
    assert.equal(response.body.includes("participantTokenHash"), false)
    assert.equal(response.body.includes("createdByUserId"), false)
  } finally {
    await app.close()
  }
})

test("event-id public submit hides events from non-public venues and organizations", async () => {
  for (const hiddenContext of [
    { venueStatus: "draft" },
    { venueStatus: "archived" },
    { venueVerificationStatus: "pending" },
    { venueVerificationStatus: "rejected" },
    { organizationStatus: "pending" },
    { organizationStatus: "archived" }
  ]) {
    const db = fakeDbForQueueEventContext({
      status: "active",
      publicJoinEnabled: true,
      publicQueueEnabled: true,
      ...hiddenContext
    })
    const app = await createTestApp({
      db,
      queue: createQueueService(db.db)
    })
    try {
      const response = await app.inject({
        method: "POST",
        url: `/public/events/${ACTIVE_EVENT_ID}/requests`,
        payload: publicSubmitPayload()
      })

      assert.equal(response.statusCode, 404)
      assert.equal(response.json().error.code, "NOT_FOUND")
      assert.equal(response.json().error.message, "Missing event")
    } finally {
      await app.close()
    }
  }
})

test("public queue shows now and approved queue without private notes", async () => {
  const queue = createInMemoryQueueService()
  const approved = queue.addRequest(ACTIVE_EVENT_ID, "approved", { position: 1, note: "private operator note" })
  const now = queue.addRequest(ACTIVE_EVENT_ID, "now", { songTitle: "Dancing Queen" })
  const app = await createTestApp({ queue })
  try {
    const response = await app.inject({ method: "GET", url: `/public/events/${ACTIVE_EVENT_ID}/queue` })
    const body = response.json()

    assert.equal(response.statusCode, 200)
    assert.equal(body.event.id, ACTIVE_EVENT_ID)
    assert.equal(body.event.name, "Active Event")
    assert.equal(body.event.status, "active")
    assert.equal(body.venue.id, VENUE_ID)
    assert.equal(body.venue.name, "Klub X")
    assert.equal(body.venue.slug, "klub-x")
    assert.equal(body.now.id, now.id)
    assert.equal(body.now.songTitle, "Dancing Queen")
    assert.equal(body.queue[0].id, approved.id)
    assert.equal(body.queue[0].songTitle, "Królowa Łez")
    assert.equal(body.queue[0].position, 1)
    assert.equal(body.submissions.enabled, true)
    assert.equal("note" in body.queue[0], false)
  } finally {
    await app.close()
  }
})

test("public queue is forbidden when publicQueueEnabled is false", async () => {
  const db = fakeDbForQueueEventContext({
    status: "active",
    publicJoinEnabled: true,
    publicQueueEnabled: false
  })
  const app = await createTestApp({
    db,
    queue: createQueueService(db.db)
  })
  try {
    const response = await app.inject({ method: "GET", url: `/public/events/${ACTIVE_EVENT_ID}/queue` })

    assert.equal(response.statusCode, 403)
    assert.equal(response.json().error.code, "FORBIDDEN")
    assert.equal(response.json().error.message, "Public queue is disabled for this event")
  } finally {
    await app.close()
  }
})

test("event-id public queue hides events from non-public venues and organizations", async () => {
  for (const hiddenContext of [
    { venueStatus: "draft" },
    { venueStatus: "archived" },
    { venueVerificationStatus: "pending" },
    { venueVerificationStatus: "rejected" },
    { organizationStatus: "pending" },
    { organizationStatus: "archived" }
  ]) {
    const db = fakeDbForQueueEventContext({
      status: "active",
      publicJoinEnabled: true,
      publicQueueEnabled: true,
      ...hiddenContext
    })
    const app = await createTestApp({
      db,
      queue: createQueueService(db.db)
    })
    try {
      const response = await app.inject({ method: "GET", url: `/public/events/${ACTIVE_EVENT_ID}/queue` })

      assert.equal(response.statusCode, 404)
      assert.equal(response.json().error.code, "NOT_FOUND")
      assert.equal(response.json().error.message, "Missing event")
    } finally {
      await app.close()
    }
  }
})

test("venue-first and event-id public queue share venue and organization visibility policy", async () => {
  for (const hiddenContext of [
    { venueStatus: "draft" },
    { venueStatus: "archived" },
    { venueVerificationStatus: "pending" },
    { venueVerificationStatus: "rejected" },
    { organizationStatus: "pending" },
    { organizationStatus: "archived" }
  ]) {
    const db = fakeDbForQueueEventContext({
      status: "active",
      publicJoinEnabled: true,
      publicQueueEnabled: true,
      ...hiddenContext
    })
    const app = await createTestApp({
      db,
      queue: createQueueService(db.db),
      events: fakeEventsService({ lookup: makePublicLookup(makePublicEvent(ACTIVE_EVENT_ID, "active")) })
    })
    try {
      const venueFirst = await app.inject({ method: "GET", url: "/public/venues/klub-x/queue" })
      const eventId = await app.inject({ method: "GET", url: `/public/events/${ACTIVE_EVENT_ID}/queue` })

      for (const response of [venueFirst, eventId]) {
        assert.equal(response.statusCode, 404)
        assert.equal(response.json().error.code, "NOT_FOUND")
        assert.equal(response.json().error.message, "Missing event")
      }
    } finally {
      await app.close()
    }
  }
})

test("public queue snapshot is visible for active paused and closed events", async () => {
  for (const status of ["active", "paused", "closed"]) {
    const db = fakeDbForPublicQueueStatus(status)
    const app = await createTestApp({
      db,
      queue: createQueueService(db.db)
    })
    try {
      const response = await app.inject({ method: "GET", url: `/public/events/${ACTIVE_EVENT_ID}/queue` })

      assert.equal(response.statusCode, 200)
      assert.equal(response.json().event.status, status)
    } finally {
      await app.close()
    }
  }
})

test("public queue snapshot is hidden for archived and cancelled events", async () => {
  for (const status of ["archived", "cancelled"]) {
    const db = fakeDbForQueueEventContext({
      status,
      publicJoinEnabled: true,
      publicQueueEnabled: true
    })
    const app = await createTestApp({
      db,
      queue: createQueueService(db.db)
    })
    try {
      const response = await app.inject({ method: "GET", url: `/public/events/${ACTIVE_EVENT_ID}/queue` })

      assert.equal(response.statusCode, 409)
      assert.equal(response.json().error.code, "CONFLICT")
      assert.equal(response.json().error.message, "Queue is not active for this event")
    } finally {
      await app.close()
    }
  }
})

test("venue-first and event-id public queue share archived and cancelled policy", async () => {
  for (const status of ["archived", "cancelled"]) {
    const db = fakeDbForQueueEventContext({
      status,
      publicJoinEnabled: true,
      publicQueueEnabled: true
    })
    const app = await createTestApp({
      db,
      queue: createQueueService(db.db),
      events: fakeEventsService({ lookup: makePublicLookup(makePublicEvent(ACTIVE_EVENT_ID, status)) })
    })
    try {
      const venueFirst = await app.inject({ method: "GET", url: "/public/venues/klub-x/queue" })
      const eventId = await app.inject({ method: "GET", url: `/public/events/${ACTIVE_EVENT_ID}/queue` })

      for (const response of [venueFirst, eventId]) {
        assert.equal(response.statusCode, 409)
        assert.equal(response.json().error.code, "CONFLICT")
        assert.equal(response.json().error.message, "Queue is not active for this event")
      }
    } finally {
      await app.close()
    }
  }
})

test("public queue for paused event is visible with submissions disabled", async () => {
  const queue = createInMemoryQueueService()
  queue.addRequest(PAUSED_EVENT_ID, "approved", { position: 1 })
  const app = await createTestApp({ queue })
  try {
    const response = await app.inject({ method: "GET", url: `/public/events/${PAUSED_EVENT_ID}/queue` })
    const body = response.json()

    assert.equal(response.statusCode, 200)
    assert.equal(body.event.status, "paused")
    assert.equal(body.submissions.enabled, false)
    assert.equal(body.queue.length, 1)
  } finally {
    await app.close()
  }
})

test("venue-first public queue returns 404 for missing venue", async () => {
  const app = await createTestApp({
    events: fakeEventsService({ lookup: null })
  })
  try {
    const response = await app.inject({ method: "GET", url: "/public/venues/missing-venue/queue" })

    assert.equal(response.statusCode, 404)
    assert.equal(response.json().error.code, "NOT_FOUND")
  } finally {
    await app.close()
  }
})

test("venue-first public queue returns inactive shape without active event", async () => {
  const app = await createTestApp({
    events: fakeEventsService({ lookup: makePublicLookup(null) })
  })
  try {
    const response = await app.inject({ method: "GET", url: "/public/venues/klub-x/queue" })
    const body = response.json()

    assert.equal(response.statusCode, 200)
    assert.equal(body.venue.slug, "klub-x")
    assert.equal(body.activeEvent, null)
    assert.equal(body.event, null)
    assert.equal(body.now, null)
    assert.deepEqual(body.queue, [])
    assert.deepEqual(body.submissions, { enabled: false, reason: "NO_ACTIVE_EVENT" })
  } finally {
    await app.close()
  }
})

test("venue-first public queue resolves active event and hides operator note", async () => {
  const queue = createInMemoryQueueService()
  const approved = queue.addRequest(ACTIVE_EVENT_ID, "approved", { position: 1, note: "private operator note" })
  const app = await createTestApp({
    queue,
    events: fakeEventsService({ lookup: makePublicLookup(makePublicEvent(ACTIVE_EVENT_ID, "active")) })
  })
  try {
    const response = await app.inject({ method: "GET", url: "/public/venues/klub-x/queue" })
    const body = response.json()

    assert.equal(response.statusCode, 200)
    assert.equal(body.activeEvent.id, ACTIVE_EVENT_ID)
    assert.equal(body.event.id, ACTIVE_EVENT_ID)
    assert.equal(body.queue[0].id, approved.id)
    assert.equal("note" in body.queue[0], false)
    assert.equal(body.submissions.enabled, true)
  } finally {
    await app.close()
  }
})

test("venue-first public queue resolves paused event with submissions disabled", async () => {
  const queue = createInMemoryQueueService()
  queue.addRequest(PAUSED_EVENT_ID, "approved", { position: 1 })
  const app = await createTestApp({
    queue,
    events: fakeEventsService({ lookup: makePublicLookup(makePublicEvent(PAUSED_EVENT_ID, "paused")) })
  })
  try {
    const response = await app.inject({ method: "GET", url: "/public/venues/klub-x/queue" })
    const body = response.json()

    assert.equal(response.statusCode, 200)
    assert.equal(body.event.status, "paused")
    assert.equal(body.submissions.enabled, false)
    assert.equal(body.queue.length, 1)
  } finally {
    await app.close()
  }
})

test("venue-first public submit creates request for active event", async () => {
  const queue = createInMemoryQueueService()
  const app = await createTestApp({
    queue,
    events: fakeEventsService({ lookup: makePublicLookup(makePublicEvent(ACTIVE_EVENT_ID, "active")) })
  })
  try {
    const response = await app.inject({
      method: "POST",
      url: "/public/venues/klub-x/requests",
      payload: publicSubmitPayload("Michał", "Królowa Łez")
    })

    assert.equal(response.statusCode, 201)
    assert.equal(response.json().request.status, "pending")
    assert.equal(queue.state.requests[0].eventId, ACTIVE_EVENT_ID)
    assert.equal(typeof readParticipantCookie(response), "string")
    assert.equal(typeof queue.state.requests[0].participantTokenHash, "string")
  } finally {
    await app.close()
  }
})

test("venue-first public submit is blocked without active event", async () => {
  const queue = createInMemoryQueueService()
  const app = await createTestApp({
    queue,
    events: fakeEventsService({ lookup: makePublicLookup(null) })
  })
  try {
    const response = await app.inject({
      method: "POST",
      url: "/public/venues/klub-x/requests",
      payload: publicSubmitPayload()
    })

    assert.equal(response.statusCode, 409)
    assert.equal(response.json().error.code, "EVENT_NOT_ACTIVE")
    assert.equal(queue.state.requests.length, 0)
  } finally {
    await app.close()
  }
})

test("venue-first public submit is blocked for paused event", async () => {
  const queue = createInMemoryQueueService()
  const app = await createTestApp({
    queue,
    events: fakeEventsService({ lookup: makePublicLookup(makePublicEvent(PAUSED_EVENT_ID, "paused")) })
  })
  try {
    const response = await app.inject({
      method: "POST",
      url: "/public/venues/klub-x/requests",
      payload: publicSubmitPayload()
    })

    assert.equal(response.statusCode, 409)
    assert.equal(response.json().error.code, "CONFLICT")
    assert.equal(queue.state.requests.length, 0)
  } finally {
    await app.close()
  }
})

test("operator queue shows pending approved and now buckets", async () => {
  const queue = createInMemoryQueueService()
  queue.addRequest(ACTIVE_EVENT_ID, "pending")
  queue.addRequest(ACTIVE_EVENT_ID, "approved", { position: 1 })
  queue.addRequest(ACTIVE_EVENT_ID, "now")
  const app = await createTestApp({ queue, permissions: fakePermissions({ event: new Set(["event.operate_queue"]) }) })
  try {
    const response = await app.inject({ method: "GET", url: `/dashboard/events/${ACTIVE_EVENT_ID}/operator-queue` })
    const body = response.json()

    assert.equal(response.statusCode, 200)
    assert.equal(body.pending.length, 1)
    assert.equal(body.approved.length, 1)
    assert.equal(body.now.status, "now")
  } finally {
    await app.close()
  }
})

test("platform owner support access can view operator queue", async () => {
  const queue = createInMemoryQueueService()
  queue.addRequest(ACTIVE_EVENT_ID, "pending")
  const supportAccessAudit: PlatformOwnerEventSupportAccessAuditInput[] = []
  const app = await createTestApp({ queue, permissions: fakePermissions({ platformOwner: true, supportAccessAudit }) })
  try {
    const response = await app.inject({ method: "GET", url: `/dashboard/events/${ACTIVE_EVENT_ID}/operator-queue` })

    assert.equal(response.statusCode, 200)
    assert.equal(response.json().pending.length, 1)
    assert.deepEqual(supportAccessAudit.map((entry) => entry.operation), ["dashboard.queue.view"])
    assert.equal(supportAccessAudit[0].eventId, ACTIVE_EVENT_ID)
    assert.equal(supportAccessAudit[0].userId, USER_ID)
  } finally {
    await app.close()
  }
})

test("approve pending request appends position and writes queue event", async () => {
  const queue = createInMemoryQueueService()
  const request = queue.addRequest(ACTIVE_EVENT_ID, "pending")
  const app = await createTestApp({ queue, permissions: fakePermissions({ event: new Set(["event.operate_queue"]) }) })
  try {
    const response = await app.inject({
      method: "POST",
      url: `/dashboard/events/${ACTIVE_EVENT_ID}/requests/${request.id}/approve`
    })

    assert.equal(response.statusCode, 200)
    assert.equal(response.json().request.status, "approved")
    assert.equal(response.json().request.position, 1)
    assert.equal(queue.state.queueEvents.at(-1)?.type, "request.approved")
  } finally {
    await app.close()
  }
})

test("platform owner support access can approve pending request", async () => {
  const queue = createInMemoryQueueService()
  const request = queue.addRequest(ACTIVE_EVENT_ID, "pending")
  const supportAccessAudit: PlatformOwnerEventSupportAccessAuditInput[] = []
  const app = await createTestApp({ queue, permissions: fakePermissions({ platformOwner: true, supportAccessAudit }) })
  try {
    const response = await app.inject({
      method: "POST",
      url: `/dashboard/events/${ACTIVE_EVENT_ID}/requests/${request.id}/approve`
    })

    assert.equal(response.statusCode, 200)
    assert.equal(response.json().request.status, "approved")
    assert.equal(response.json().request.position, 1)
    assert.deepEqual(supportAccessAudit.map((entry) => entry.operation), ["dashboard.queue.operate"])
    assert.equal(supportAccessAudit[0].eventId, ACTIVE_EVENT_ID)
    assert.equal(supportAccessAudit[0].userId, USER_ID)
  } finally {
    await app.close()
  }
})

test("approve successive pending requests assigns positions 1, 2 and 3", async () => {
  const queue = createInMemoryQueueService()
  const first = queue.addRequest(ACTIVE_EVENT_ID, "pending")
  const second = queue.addRequest(ACTIVE_EVENT_ID, "pending")
  const third = queue.addRequest(ACTIVE_EVENT_ID, "pending")
  const app = await createTestApp({ queue, permissions: fakePermissions({ event: new Set(["event.operate_queue"]) }) })
  try {
    for (const request of [first, second, third]) {
      const response = await app.inject({
        method: "POST",
        url: `/dashboard/events/${ACTIVE_EVENT_ID}/requests/${request.id}/approve`
      })
      assert.equal(response.statusCode, 200)
    }

    assert.deepEqual(approvedPositions(queue.state, ACTIVE_EVENT_ID), [1, 2, 3])
  } finally {
    await app.close()
  }
})

test("platform owner support access can start and finish a request", async () => {
  const queue = createInMemoryQueueService()
  const request = queue.addRequest(ACTIVE_EVENT_ID, "approved", { position: 1 })
  const supportAccessAudit: PlatformOwnerEventSupportAccessAuditInput[] = []
  const app = await createTestApp({ queue, permissions: fakePermissions({ platformOwner: true, supportAccessAudit }) })
  try {
    const start = await app.inject({
      method: "POST",
      url: `/dashboard/events/${ACTIVE_EVENT_ID}/requests/${request.id}/start`
    })
    const done = await app.inject({
      method: "POST",
      url: `/dashboard/events/${ACTIVE_EVENT_ID}/requests/${request.id}/done`
    })

    assert.equal(start.statusCode, 200)
    assert.equal(start.json().request.status, "now")
    assert.equal(done.statusCode, 200)
    assert.equal(done.json().request.status, "done")
    assert.deepEqual(
      supportAccessAudit.map((entry) => entry.operation),
      ["dashboard.queue.operate", "dashboard.queue.operate"]
    )
  } finally {
    await app.close()
  }
})

test("event staff queue operator still has operator queue access", async () => {
  const queue = createInMemoryQueueService()
  queue.addRequest(ACTIVE_EVENT_ID, "pending")
  const supportAccessAudit: PlatformOwnerEventSupportAccessAuditInput[] = []
  const app = await createTestApp({
    queue,
    permissions: fakePermissions({ event: new Set(["event.operate_queue"]), supportAccessAudit })
  })
  try {
    const response = await app.inject({ method: "GET", url: `/dashboard/events/${ACTIVE_EVENT_ID}/operator-queue` })

    assert.equal(response.statusCode, 200)
    assert.equal(response.json().pending.length, 1)
    assert.deepEqual(supportAccessAudit, [])
  } finally {
    await app.close()
  }
})

test("reject pending request moves it to rejected", async () => {
  const queue = createInMemoryQueueService()
  const request = queue.addRequest(ACTIVE_EVENT_ID, "pending")
  const app = await createTestApp({ queue, permissions: fakePermissions({ event: new Set(["event.operate_queue"]) }) })
  try {
    const response = await app.inject({
      method: "POST",
      url: `/dashboard/events/${ACTIVE_EVENT_ID}/requests/${request.id}/reject`,
      payload: { reason: "duplicate" }
    })

    assert.equal(response.statusCode, 200)
    assert.equal(response.json().request.status, "rejected")
    assert.equal(queue.state.queueEvents.at(-1)?.type, "request.rejected")
  } finally {
    await app.close()
  }
})

test("reject approved request renumbers positions without gaps", async () => {
  const queue = createInMemoryQueueService()
  const first = queue.addRequest(ACTIVE_EVENT_ID, "approved", { position: 1 })
  const second = queue.addRequest(ACTIVE_EVENT_ID, "approved", { position: 2 })
  const third = queue.addRequest(ACTIVE_EVENT_ID, "approved", { position: 3 })
  const app = await createTestApp({ queue, permissions: fakePermissions({ event: new Set(["event.operate_queue"]) }) })
  try {
    const response = await app.inject({
      method: "POST",
      url: `/dashboard/events/${ACTIVE_EVENT_ID}/requests/${second.id}/reject`
    })

    assert.equal(response.statusCode, 200)
    assert.deepEqual(
      queue.state.requests
        .filter((request) => request.status === "approved")
        .map((request) => [request.id, request.position]),
      [
        [first.id, 1],
        [third.id, 2]
      ]
    )
  } finally {
    await app.close()
  }
})

test("start approved request marks it as now and blocks second now", async () => {
  const queue = createInMemoryQueueService()
  const first = queue.addRequest(ACTIVE_EVENT_ID, "approved", { position: 1 })
  const second = queue.addRequest(ACTIVE_EVENT_ID, "approved", { position: 2 })
  const app = await createTestApp({ queue, permissions: fakePermissions({ event: new Set(["event.operate_queue"]) }) })
  try {
    const firstStart = await app.inject({
      method: "POST",
      url: `/dashboard/events/${ACTIVE_EVENT_ID}/requests/${first.id}/start`
    })
    const secondStart = await app.inject({
      method: "POST",
      url: `/dashboard/events/${ACTIVE_EVENT_ID}/requests/${second.id}/start`
    })

    assert.equal(firstStart.statusCode, 200)
    assert.equal(firstStart.json().request.status, "now")
    assert.equal(secondStart.statusCode, 409)
    assert.equal(queue.state.queueEvents.at(-1)?.type, "request.started")
  } finally {
    await app.close()
  }
})

test("start approved request removes it from approved queue and renumbers the rest", async () => {
  const queue = createInMemoryQueueService()
  const first = queue.addRequest(ACTIVE_EVENT_ID, "approved", { position: 1 })
  const second = queue.addRequest(ACTIVE_EVENT_ID, "approved", { position: 2 })
  const third = queue.addRequest(ACTIVE_EVENT_ID, "approved", { position: 3 })
  const app = await createTestApp({ queue, permissions: fakePermissions({ event: new Set(["event.operate_queue"]) }) })
  try {
    const response = await app.inject({
      method: "POST",
      url: `/dashboard/events/${ACTIVE_EVENT_ID}/requests/${second.id}/start`
    })

    assert.equal(response.statusCode, 200)
    assert.equal(queue.state.requests.find((request) => request.id === second.id)?.status, "now")
    assert.deepEqual(approvedQueueIds(queue.state, ACTIVE_EVENT_ID), [first.id, third.id])
    assert.deepEqual(approvedPositions(queue.state, ACTIVE_EVENT_ID), [1, 2])
  } finally {
    await app.close()
  }
})

test("done current request moves it to done", async () => {
  const queue = createInMemoryQueueService()
  const request = queue.addRequest(ACTIVE_EVENT_ID, "now")
  const app = await createTestApp({ queue, permissions: fakePermissions({ event: new Set(["event.operate_queue"]) }) })
  try {
    const response = await app.inject({
      method: "POST",
      url: `/dashboard/events/${ACTIVE_EVENT_ID}/requests/${request.id}/done`
    })

    assert.equal(response.statusCode, 200)
    assert.equal(response.json().request.status, "done")
    assert.equal(queue.state.queueEvents.at(-1)?.type, "request.done")
  } finally {
    await app.close()
  }
})

test("skip approved renumbers and skip now clears current", async () => {
  const queue = createInMemoryQueueService()
  const first = queue.addRequest(ACTIVE_EVENT_ID, "approved", { position: 1 })
  const second = queue.addRequest(ACTIVE_EVENT_ID, "approved", { position: 2 })
  const now = queue.addRequest(ACTIVE_EVENT_ID, "now")
  const app = await createTestApp({ queue, permissions: fakePermissions({ event: new Set(["event.operate_queue"]) }) })
  try {
    const skipApproved = await app.inject({
      method: "POST",
      url: `/dashboard/events/${ACTIVE_EVENT_ID}/requests/${first.id}/skip`
    })
    const skipNow = await app.inject({
      method: "POST",
      url: `/dashboard/events/${ACTIVE_EVENT_ID}/requests/${now.id}/skip`
    })

    assert.equal(skipApproved.statusCode, 200)
    assert.equal(skipNow.statusCode, 200)
    assert.equal(queue.state.requests.find((request) => request.id === second.id)?.position, 1)
    assert.equal(queue.state.requests.filter((request) => request.status === "now").length, 0)
  } finally {
    await app.close()
  }
})

test("move approved request changes order", async () => {
  const queue = createInMemoryQueueService()
  const first = queue.addRequest(ACTIVE_EVENT_ID, "approved", { position: 1 })
  const second = queue.addRequest(ACTIVE_EVENT_ID, "approved", { position: 2 })
  const third = queue.addRequest(ACTIVE_EVENT_ID, "approved", { position: 3 })
  const app = await createTestApp({ queue, permissions: fakePermissions({ event: new Set(["event.operate_queue"]) }) })
  try {
    const response = await app.inject({
      method: "POST",
      url: `/dashboard/events/${ACTIVE_EVENT_ID}/requests/${third.id}/move`,
      payload: { position: 1 }
    })

    assert.equal(response.statusCode, 200)
    assert.deepEqual(
      queue.state.requests
        .filter((request) => request.status === "approved")
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((request) => request.id),
      [third.id, first.id, second.id]
    )
    assert.equal(queue.state.queueEvents.at(-1)?.type, "request.moved")
  } finally {
    await app.close()
  }
})

test("move approved request from first to last", async () => {
  const queue = createInMemoryQueueService()
  const first = queue.addRequest(ACTIVE_EVENT_ID, "approved", { position: 1 })
  const second = queue.addRequest(ACTIVE_EVENT_ID, "approved", { position: 2 })
  const third = queue.addRequest(ACTIVE_EVENT_ID, "approved", { position: 3 })
  const app = await createTestApp({ queue, permissions: fakePermissions({ event: new Set(["event.operate_queue"]) }) })
  try {
    const response = await app.inject({
      method: "POST",
      url: `/dashboard/events/${ACTIVE_EVENT_ID}/requests/${first.id}/move`,
      payload: { position: 3 }
    })

    assert.equal(response.statusCode, 200)
    assert.deepEqual(approvedQueueIds(queue.state, ACTIVE_EVENT_ID), [second.id, third.id, first.id])
    assert.deepEqual(approvedPositions(queue.state, ACTIVE_EVENT_ID), [1, 2, 3])
  } finally {
    await app.close()
  }
})

test("move approved request from last to first", async () => {
  const queue = createInMemoryQueueService()
  const first = queue.addRequest(ACTIVE_EVENT_ID, "approved", { position: 1 })
  const second = queue.addRequest(ACTIVE_EVENT_ID, "approved", { position: 2 })
  const third = queue.addRequest(ACTIVE_EVENT_ID, "approved", { position: 3 })
  const app = await createTestApp({ queue, permissions: fakePermissions({ event: new Set(["event.operate_queue"]) }) })
  try {
    const response = await app.inject({
      method: "POST",
      url: `/dashboard/events/${ACTIVE_EVENT_ID}/requests/${third.id}/move`,
      payload: { position: 1 }
    })

    assert.equal(response.statusCode, 200)
    assert.deepEqual(approvedQueueIds(queue.state, ACTIVE_EVENT_ID), [third.id, first.id, second.id])
    assert.deepEqual(approvedPositions(queue.state, ACTIVE_EVENT_ID), [1, 2, 3])
  } finally {
    await app.close()
  }
})

test("move approved request to same position keeps a dense queue", async () => {
  const queue = createInMemoryQueueService()
  const first = queue.addRequest(ACTIVE_EVENT_ID, "approved", { position: 1 })
  const second = queue.addRequest(ACTIVE_EVENT_ID, "approved", { position: 2 })
  const third = queue.addRequest(ACTIVE_EVENT_ID, "approved", { position: 3 })
  const app = await createTestApp({ queue, permissions: fakePermissions({ event: new Set(["event.operate_queue"]) }) })
  try {
    const response = await app.inject({
      method: "POST",
      url: `/dashboard/events/${ACTIVE_EVENT_ID}/requests/${second.id}/move`,
      payload: { position: 2 }
    })

    assert.equal(response.statusCode, 200)
    assert.deepEqual(approvedQueueIds(queue.state, ACTIVE_EVENT_ID), [first.id, second.id, third.id])
    assert.deepEqual(approvedPositions(queue.state, ACTIVE_EVENT_ID), [1, 2, 3])
  } finally {
    await app.close()
  }
})

test("move approved request past queue length moves it to the end", async () => {
  const queue = createInMemoryQueueService()
  const first = queue.addRequest(ACTIVE_EVENT_ID, "approved", { position: 1 })
  const second = queue.addRequest(ACTIVE_EVENT_ID, "approved", { position: 2 })
  const third = queue.addRequest(ACTIVE_EVENT_ID, "approved", { position: 3 })
  const app = await createTestApp({ queue, permissions: fakePermissions({ event: new Set(["event.operate_queue"]) }) })
  try {
    const response = await app.inject({
      method: "POST",
      url: `/dashboard/events/${ACTIVE_EVENT_ID}/requests/${first.id}/move`,
      payload: { position: 99 }
    })

    assert.equal(response.statusCode, 200)
    assert.deepEqual(approvedQueueIds(queue.state, ACTIVE_EVENT_ID), [second.id, third.id, first.id])
    assert.deepEqual(approvedPositions(queue.state, ACTIVE_EVENT_ID), [1, 2, 3])
  } finally {
    await app.close()
  }
})

test("move rejects positions below 1", async () => {
  const queue = createInMemoryQueueService()
  const request = queue.addRequest(ACTIVE_EVENT_ID, "approved", { position: 1 })
  const app = await createTestApp({ queue, permissions: fakePermissions({ event: new Set(["event.operate_queue"]) }) })
  try {
    const response = await app.inject({
      method: "POST",
      url: `/dashboard/events/${ACTIVE_EVENT_ID}/requests/${request.id}/move`,
      payload: { position: 0 }
    })

    assert.equal(response.statusCode, 400)
    assert.equal(response.json().error.code, "BAD_REQUEST")
    assert.deepEqual(approvedPositions(queue.state, ACTIVE_EVENT_ID), [1])
  } finally {
    await app.close()
  }
})

test("approved position partial unique index exists in schema and migration", () => {
  const schema = readFileSync("packages/db/src/schema.ts", "utf8")
  const migration = readFileSync("packages/db/drizzle/0005_amused_surge.sql", "utf8")

  assert.ok(schema.includes("song_requests_one_approved_position_per_event_unique"))
  assert.ok(migration.includes("CREATE UNIQUE INDEX \"song_requests_one_approved_position_per_event_unique\""))
  assert.ok(migration.includes("WHERE \"song_requests\".\"status\" = 'approved'"))
  assert.ok(migration.includes("\"song_requests\".\"position\" is not null"))
})

test("queue service maps now and approved position unique violations to 409 errors", () => {
  const nowError = mapQueueMutationError({
    code: "23505",
    constraint: "song_requests_one_now_per_event_unique"
  })
  const positionError = mapQueueMutationError({
    code: "23505",
    constraint: "song_requests_one_approved_position_per_event_unique"
  })

  assert.ok(nowError instanceof ApiHttpError)
  assert.equal(nowError.statusCode, 409)
  assert.equal(nowError.code, "REQUEST_ALREADY_NOW")
  assert.ok(positionError instanceof ApiHttpError)
  assert.equal(positionError.statusCode, 409)
  assert.equal(positionError.code, "QUEUE_POSITION_CONFLICT")
})

test("queue service advisory lock executes inside queue mutation transactions", async () => {
  let lockCount = 0
  await lockQueueForEvent(
    {
      execute: async () => {
        lockCount += 1
        return []
      }
    } as unknown as DbResources["db"],
    ACTIVE_EVENT_ID
  )

  assert.equal(lockCount, 1)
})

test("operator without permission gets forbidden", async () => {
  const queue = createInMemoryQueueService()
  const supportAccessAudit: PlatformOwnerEventSupportAccessAuditInput[] = []
  const app = await createTestApp({ queue, permissions: fakePermissions({ supportAccessAudit }) })
  try {
    const response = await app.inject({ method: "GET", url: `/dashboard/events/${ACTIVE_EVENT_ID}/operator-queue` })

    assert.equal(response.statusCode, 403)
    assert.equal(response.json().error.code, "FORBIDDEN")
    assert.deepEqual(supportAccessAudit, [])
  } finally {
    await app.close()
  }
})

async function createTestApp(options: {
  user?: AuthenticatedDomainUser
  permissions?: PermissionService
  queue?: QueueService
  events?: ApiModuleServices["events"]
  db?: DbResources
} = {}) {
  return createApiApp({
    config: testConfig(),
    db: options.db ?? fakeDbResources(),
    auth: fakeAuth(),
    currentUserResolver: async () =>
      options.user ?? { id: USER_ID, email: "user@example.com", name: "User", status: "active" },
    permissions: options.permissions ?? fakePermissions(),
    services: {
      organizations: fakeOrganizationsService(),
      venues: fakeVenuesService(),
      events: options.events ?? fakeEventsService(),
      accessRequests: fakeAccessRequestsService(),
      queue: options.queue ?? createInMemoryQueueService()
    },
    logger: false
  })
}

type InMemoryQueueState = {
  events: Map<string, { id: string; name: string; status: string }>
  requests: QueueSongRequest[]
  queueEvents: Array<{ eventId: string; requestId: string; type: string }>
}

type AddRequestHelper = (
  eventId: string,
  status: string,
  overrides?: Partial<QueueSongRequest | SubmitPublicRequestInput>
) => QueueSongRequest

type TestQueueService = QueueService & {
  state: InMemoryQueueState
  addRequest: AddRequestHelper
  setNow: (now: Date) => void
}

function createInMemoryQueueService(options: { now?: Date } = {}): TestQueueService {
  let currentTime = options.now ?? new Date()
  const state: InMemoryQueueState = {
    events: new Map([
      [ACTIVE_EVENT_ID, { id: ACTIVE_EVENT_ID, name: "Active Event", status: "active" }],
      [PAUSED_EVENT_ID, { id: PAUSED_EVENT_ID, name: "Paused Event", status: "paused" }],
      [SCHEDULED_EVENT_ID, { id: SCHEDULED_EVENT_ID, name: "Scheduled Event", status: "scheduled" }],
      [CLOSED_EVENT_ID, { id: CLOSED_EVENT_ID, name: "Closed Event", status: "closed" }]
    ]),
    requests: [],
    queueEvents: []
  }

  const service: TestQueueService = {
    state,
    setNow: (now) => {
      currentTime = now
    },
    addRequest: (eventId, status, overrides) => addRequestToState(state, eventId, status, overrides),
    async getPublicQueue(eventId) {
      const event = requireEvent(state, eventId)
      if (!["active", "paused", "closed"].includes(event.status)) {
        throw new ApiHttpError(409, "CONFLICT", "Queue is not active for this event")
      }
      return {
        event,
        venue: { id: VENUE_ID, name: "Klub X", slug: "klub-x" },
        now: toPublic(state.requests.find((request) => request.eventId === eventId && request.status === "now") ?? null),
        queue: approvedRequests(state, eventId).map(toPublicItem),
        submissions: { enabled: event.status === "active" }
      }
    },
    async listParticipantRequests(eventId, participantTokenHash) {
      requireEvent(state, eventId)
      return state.requests
        .filter((request) => request.eventId === eventId && request.participantTokenHash === participantTokenHash)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((request) => ({
          id: request.id,
          status: request.status,
          singerName: request.displayName,
          artist: request.songArtist,
          title: request.songTitle,
          position: request.position,
          createdAt: request.createdAt
        }))
    },
    async submitPublicRequest(eventId, input) {
      const event = requireEvent(state, eventId)
      if (event.status !== "active") {
        throw new ApiHttpError(409, "CONFLICT", "Event is not accepting public song requests")
      }
      enforceInMemoryParticipantAntiSpam(state, eventId, input.participantTokenHash, currentTime)
      const request = addRequestToState(state, eventId, "pending", {
        ...input,
        requestedAt: currentTime,
        createdAt: currentTime,
        updatedAt: currentTime
      })
      state.queueEvents.push({ eventId, requestId: request.id, type: "request.created" })
      return request
    },
    async getOperatorQueue(eventId) {
      const event = requireEvent(state, eventId)
      return {
        event,
        venue: { id: VENUE_ID, name: "Klub X", slug: "klub-x" },
        pending: state.requests.filter((request) => request.eventId === eventId && request.status === "pending"),
        approved: approvedRequests(state, eventId),
        now: state.requests.find((request) => request.eventId === eventId && request.status === "now") ?? null,
        done: state.requests.filter((request) => request.eventId === eventId && request.status === "done"),
        rejected: state.requests.filter((request) => request.eventId === eventId && request.status === "rejected"),
        skipped: state.requests.filter((request) => request.eventId === eventId && request.status === "skipped")
      }
    },
    async approveRequest(eventId, requestId) {
      const request = requireRequest(state, eventId, requestId)
      request.status = "approved"
      request.position = null
      renumberApproved(state, eventId)
      state.queueEvents.push({ eventId, requestId, type: "request.approved" })
      return request
    },
    async rejectRequest(eventId, requestId) {
      const request = requireRequest(state, eventId, requestId)
      request.status = "rejected"
      request.position = null
      renumberApproved(state, eventId)
      state.queueEvents.push({ eventId, requestId, type: "request.rejected" })
      return request
    },
    async startRequest(eventId, requestId) {
      const request = requireRequest(state, eventId, requestId)
      if (state.requests.some((candidate) => candidate.eventId === eventId && candidate.status === "now")) {
        throw new ApiHttpError(409, "CONFLICT", "There is already a request marked as now")
      }
      request.status = "now"
      request.position = null
      renumberApproved(state, eventId)
      state.queueEvents.push({ eventId, requestId, type: "request.started" })
      return request
    },
    async completeRequest(eventId, requestId) {
      const request = requireRequest(state, eventId, requestId)
      request.status = "done"
      state.queueEvents.push({ eventId, requestId, type: "request.done" })
      return request
    },
    async skipRequest(eventId, requestId) {
      const request = requireRequest(state, eventId, requestId)
      request.status = "skipped"
      request.position = null
      renumberApproved(state, eventId)
      state.queueEvents.push({ eventId, requestId, type: "request.skipped" })
      return request
    },
    async moveRequest(eventId, requestId, position) {
      const request = requireRequest(state, eventId, requestId)
      if (position < 1) {
        throw new ApiHttpError(400, "BAD_REQUEST", "Position must be a positive integer")
      }
      if (request.status !== "approved") {
        throw new ApiHttpError(409, "CONFLICT", "Only approved requests can be moved")
      }
      const approved = approvedRequests(state, eventId).filter((candidate) => candidate.id !== requestId)
      approved.splice(Math.min(Math.max(position, 1), approved.length + 1) - 1, 0, request)
      approved.forEach((candidate, index) => {
        candidate.position = index + 1
      })
      state.queueEvents.push({ eventId, requestId, type: "request.moved" })
      return request
    }
  }

  return service
}

function addRequestToState(
  state: InMemoryQueueState,
  eventId: string,
  status: string,
  overrides: Partial<QueueSongRequest | SubmitPublicRequestInput> = {}
): QueueSongRequest {
  const now = new Date()
  const request = {
    id: `66666666-6666-4666-8666-${String(state.requests.length + 1).padStart(12, "0")}`,
    venueId: VENUE_ID,
    eventId,
    singerName: "Michał",
    displayName: "Michał",
    participantTokenHash: null,
    sourceId: "ising",
    sourceTrackId: "9053",
    songTitle: "Królowa Łez",
    songArtist: "Agnieszka Chylińska",
    songUrl: "https://ising.pl/song",
    note: null,
    status,
    position: null,
    requestedAt: now,
    approvedAt: null,
    startedAt: null,
    finishedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
  } as QueueSongRequest

  state.requests.push(request)
  return request
}

function requireEvent(state: InMemoryQueueState, eventId: string) {
  const event = state.events.get(eventId)
  if (!event) {
    throw new ApiHttpError(404, "NOT_FOUND", "Missing event")
  }
  return event
}

function requireRequest(state: InMemoryQueueState, eventId: string, requestId: string): QueueSongRequest {
  const request = state.requests.find((candidate) => candidate.eventId === eventId && candidate.id === requestId)
  if (!request) {
    throw new ApiHttpError(404, "NOT_FOUND", "Missing song request")
  }
  return request
}

function approvedRequests(state: InMemoryQueueState, eventId: string): QueueSongRequest[] {
  return state.requests
    .filter((request) => request.eventId === eventId && request.status === "approved")
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
}

function approvedQueueIds(state: InMemoryQueueState, eventId: string): string[] {
  return approvedRequests(state, eventId).map((request) => request.id)
}

function approvedPositions(state: InMemoryQueueState, eventId: string): number[] {
  return approvedRequests(state, eventId).map((request) => request.position ?? 0)
}

function renumberApproved(state: InMemoryQueueState, eventId: string): void {
  approvedRequests(state, eventId).forEach((request, index) => {
    request.position = index + 1
  })
}

function enforceInMemoryParticipantAntiSpam(
  state: InMemoryQueueState,
  eventId: string,
  participantTokenHash: string,
  now: Date
): void {
  const participantRequests = state.requests
    .filter((request) => request.eventId === eventId && request.participantTokenHash === participantTokenHash)
    .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())

  const activeCount = participantRequests.filter((request) => ["pending", "approved", "now"].includes(request.status)).length
  if (activeCount >= 3) {
    throw new ApiHttpError(429, "TOO_MANY_REQUESTS", "Too many active requests for this event.")
  }

  const previous = participantRequests[0]
  if (previous && (now.getTime() - previous.requestedAt.getTime()) / 1000 < 20) {
    throw new ApiHttpError(429, "TOO_MANY_REQUESTS", "Please wait before submitting another request.")
  }
}

function toPublic(request: QueueSongRequest | null) {
  if (!request) {
    return null
  }
  return {
    id: request.id,
    singerName: request.displayName,
    songTitle: request.songTitle,
    songArtist: request.songArtist,
    position: request.position
  }
}

function toPublicItem(request: QueueSongRequest) {
  return toPublic(request) ?? never()
}

function never(): never {
  throw new Error("Unexpected empty public queue item")
}

function publicSubmitPayload(singerName = "Michał", songTitle = "Królowa Łez") {
  return {
    singerName,
    sourceId: "ising",
    sourceTrackId: "9053",
    songTitle,
    songArtist: "Agnieszka Chylińska",
    songUrl: "https://ising.pl/song",
    note: "Please"
  }
}

function readParticipantCookie(response: { headers: Record<string, string | number | string[] | undefined> }): string {
  const setCookie = response.headers["set-cookie"]
  const normalizedSetCookie = typeof setCookie === "number" ? String(setCookie) : setCookie
  const header = Array.isArray(normalizedSetCookie)
    ? normalizedSetCookie.find((value) => value.startsWith(`${PARTICIPANT_COOKIE_NAME}=`))
    : normalizedSetCookie
  if (typeof header !== "string") {
    throw new Error("Expected participant cookie header")
  }
  const [nameValue] = header.split(";")
  const [name, value] = nameValue.split("=")
  assert.equal(name, PARTICIPANT_COOKIE_NAME)
  assert.ok(value)
  return value
}

function fakePermissions(options: {
  event?: Set<string>
  platformOwner?: boolean
  supportAccessAudit?: PlatformOwnerEventSupportAccessAuditInput[]
} = {}): PermissionService {
  const hasPlatformSupportAccess = options.platformOwner === true
  return {
    hasPlatformPermission: async () => false,
    requirePlatformPermission: async () => requireAllowed(false),
    hasOrganizationPermission: async () => false,
    requireOrganizationPermission: async () => requireAllowed(false),
    hasVenuePermission: async () => false,
    requireVenuePermission: async () => requireAllowed(false),
    hasEventPermission: async (_userId, _eventId, permission) => Boolean(options.event?.has(permission)),
    requireEventPermission: async (_userId, _eventId, permission) => requireAllowed(options.event?.has(permission)),
    hasPlatformOwnerEventSupportAccess: async (userId, eventId, permission, operation) => {
      if (hasPlatformSupportAccess) {
        options.supportAccessAudit?.push({ eventId, operation, permission, userId })
      }
      return hasPlatformSupportAccess
    },
    requirePlatformOwnerEventSupportAccess: async () => requireAllowed(hasPlatformSupportAccess)
  }
}

function requireAllowed(allowed: boolean | undefined): void {
  if (!allowed) {
    throw new ApiHttpError(403, "FORBIDDEN", "Forbidden")
  }
}

function fakeOrganizationsService(): ApiModuleServices["organizations"] {
  return {} as ApiModuleServices["organizations"]
}

function fakeVenuesService(): ApiModuleServices["venues"] {
  return {} as ApiModuleServices["venues"]
}

function fakeEventsService(options: { lookup?: PublicActiveEventLookup | null } = {}): ApiModuleServices["events"] {
  return {
    getPublicActiveEventByVenueSlug: async () =>
      "lookup" in options ? options.lookup : makePublicLookup(makePublicEvent(ACTIVE_EVENT_ID, "active"))
  } as unknown as ApiModuleServices["events"]
}

function makePublicLookup(activeEvent: EventSummary | null): PublicActiveEventLookup {
  return {
    venue: {
      id: VENUE_ID,
      slug: "klub-x",
      name: "Klub X",
      city: "Warszawa",
      timezone: "Europe/Warsaw"
    },
    activeEvent
  }
}

function makePublicEvent(eventId: string, status: string): EventSummary {
  return {
    id: eventId,
    venueId: VENUE_ID,
    operatedByOrganizationId: "77777777-7777-4777-8777-777777777777",
    createdByUserId: USER_ID,
    name: `${status} Event`,
    slug: `${status}-event`,
    status,
    startsAt: null,
    endsAt: null,
    publicJoinEnabled: true,
    publicQueueEnabled: true
  }
}

function fakeAccessRequestsService(): ApiModuleServices["accessRequests"] {
  return {} as ApiModuleServices["accessRequests"]
}

function testConfig(): ApiConfig {
  return {
    nodeEnv: "test",
    host: "127.0.0.1",
    port: 0,
    apiUrl: "http://127.0.0.1:0",
    publicWebUrl: "http://localhost:3000",
    dashboardWebUrl: "http://localhost:3001",
    databaseUrl: "postgres://poza_nuta:poza_nuta@localhost:5432/poza_nuta",
    authSecret: "test-only-poza-nuta-auth-secret-change-me",
    googleClientId: "test-google-client-id",
    googleClientSecret: "test-google-client-secret",
    participantTokenSecret: "test-only-participant-token-secret",
    publicRequestMaxActivePerParticipant: 3,
    publicRequestCooldownSeconds: 20,
    bootstrapPlatformOwnerEmail: "owner@example.com",
    platformSetupEnabled: true,
    platformSetupToken: "test-platform-setup-token",
    logLevel: "silent"
  }
}

function fakeDbResources(): DbResources {
  return {
    db: {
      execute: async () => []
    } as unknown as DbResources["db"],
    pool: {
      end: async () => undefined
    } as unknown as DbResources["pool"]
  }
}

function fakeDbForQueueEventContext(event: {
  status: string
  publicJoinEnabled: boolean
  publicQueueEnabled: boolean
  venueStatus?: string
  venueVerificationStatus?: string
  organizationStatus?: string
}): DbResources {
  return fakeDbResourcesWithClient({
    select: () =>
      queryChain([
        {
          event: {
            id: ACTIVE_EVENT_ID,
            venueId: VENUE_ID,
            operatedByOrganizationId: "77777777-7777-4777-8777-777777777777",
            name: "Active Event",
            ...event
          },
          venue: {
            id: VENUE_ID,
            name: "Klub X",
            slug: "klub-x",
            status: event.venueStatus ?? "active",
            verificationStatus: event.venueVerificationStatus ?? "verified"
          },
          organization: {
            id: "77777777-7777-4777-8777-777777777777",
            status: event.organizationStatus ?? "active"
          }
        }
      ])
  } as unknown as DbResources["db"])
}

function fakeDbForPublicQueueStatus(status: string): DbResources {
  let selectCount = 0
  return fakeDbResourcesWithClient({
    select: () => {
      selectCount += 1
      if (selectCount === 1) {
        return queryChain([
          {
            event: {
              id: ACTIVE_EVENT_ID,
              venueId: VENUE_ID,
              operatedByOrganizationId: "77777777-7777-4777-8777-777777777777",
              name: "Public Queue Event",
              status,
              publicJoinEnabled: true,
              publicQueueEnabled: true
            },
            venue: {
              id: VENUE_ID,
              name: "Klub X",
              slug: "klub-x",
              status: "active",
              verificationStatus: "verified"
            },
            organization: {
              id: "77777777-7777-4777-8777-777777777777",
              status: "active"
            }
          }
        ])
      }

      return queryChain([])
    }
  } as unknown as DbResources["db"])
}

function fakeDbForPublicEventDetail(event: {
  status: string
  publicJoinEnabled: boolean
  publicQueueEnabled: boolean
  venueStatus?: string
  venueVerificationStatus?: string
  organizationStatus?: string
}): DbResources {
  return fakeDbResourcesWithClient({
    select: () =>
      queryChain([
        {
          event: {
            id: ACTIVE_EVENT_ID,
            name: "Active Event",
            slug: "active-event",
            status: event.status,
            startsAt: null,
            endsAt: null,
            publicJoinEnabled: event.publicJoinEnabled,
            publicQueueEnabled: event.publicQueueEnabled
          },
          venue: {
            id: VENUE_ID,
            slug: "klub-x",
            name: "Klub X",
            city: "Warszawa",
            timezone: "Europe/Warsaw",
            status: event.venueStatus ?? "active",
            verificationStatus: event.venueVerificationStatus ?? "verified"
          },
          organization: {
            id: "77777777-7777-4777-8777-777777777777",
            slug: "poza-nuta-demo",
            name: "Poza Nuta Demo",
            status: event.organizationStatus ?? "active"
          }
        }
      ])
  } as unknown as DbResources["db"])
}

function fakeDbResourcesWithClient(db: DbResources["db"]): DbResources {
  return {
    db: Object.assign({ execute: async () => [] }, db) as unknown as DbResources["db"],
    pool: {
      end: async () => undefined
    } as unknown as DbResources["pool"]
  }
}

function queryChain<T>(result: T[]) {
  return {
    from() {
      return this
    },
    innerJoin() {
      return this
    },
    where() {
      return this
    },
    limit() {
      return result
    },
    orderBy() {
      return result
    }
  }
}

function fakeAuth() {
  return {
    handler: async () => new Response(null, { status: 404 }),
    api: {
      getSession: async () => null
    }
  } as any
}
