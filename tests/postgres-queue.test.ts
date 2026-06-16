import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { createApiApp } from "../apps/api/src/app.ts"
import type { AuthenticatedDomainUser } from "../apps/api/src/auth/access.ts"
import type { ApiConfig } from "../apps/api/src/config.ts"
import { ApiHttpError } from "../apps/api/src/errors.ts"
import { eventInvites, participantEventAccess, queueEvents, songRequests } from "../packages/db/src/schema.ts"
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
const ACTIVE_EVENT_PUBLIC_ID = "ka2Md-d1das"
const PAUSED_EVENT_ID = "44444444-4444-4444-8444-444444444444"
const PAUSED_EVENT_PUBLIC_ID = "pausedEvent1"
const SCHEDULED_EVENT_ID = "55555555-5555-4555-8555-555555555555"
const SCHEDULED_EVENT_PUBLIC_ID = "scheduledEvent1"
const CLOSED_EVENT_ID = "88888888-8888-4888-8888-888888888888"
const CLOSED_EVENT_PUBLIC_ID = "closedEvent1"

test("public submit creates pending request for active event and writes queue event", async () => {
  const queue = createInMemoryQueueService()
  const app = await createTestApp({ queue })
  try {
    const response = await app.inject({
      method: "POST",
      url: `/public/events/${ACTIVE_EVENT_PUBLIC_ID}/requests`,
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
          url: `/public/events/${ACTIVE_EVENT_PUBLIC_ID}/requests`,
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
      url: `/public/events/${ACTIVE_EVENT_PUBLIC_ID}/requests`,
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
      url: `/public/events/${ACTIVE_EVENT_PUBLIC_ID}/requests`,
      payload: publicSubmitPayload("Singer 1", "Song 1")
    })
    const token = readParticipantCookie(firstResponse)
    queue.setNow(new Date(first.getTime() + 21_000))
    const secondResponse = await app.inject({
      method: "POST",
      url: `/public/events/${ACTIVE_EVENT_PUBLIC_ID}/requests`,
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

test("event-first my-requests resolves event by publicId and returns only participant requests", async () => {
  const ownerToken = "participant-token-event-public-id-owner"
  const otherToken = "participant-token-event-public-id-other"
  const ownerHash = hashParticipantToken(ownerToken, testConfig().participantTokenSecret)
  const otherHash = hashParticipantToken(otherToken, testConfig().participantTokenSecret)
  const queue = createInMemoryQueueService()
  queue.addRequest(ACTIVE_EVENT_ID, "approved", {
    participantTokenHash: ownerHash,
    singerName: "Owner",
    displayName: "Owner",
    songArtist: "ABBA",
    songTitle: "Dancing Queen",
    position: 1
  })
  queue.addRequest(ACTIVE_EVENT_ID, "pending", {
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
      url: `/public/events/${ACTIVE_EVENT_PUBLIC_ID}/my-requests`,
      headers: { cookie: `${PARTICIPANT_COOKIE_NAME}=${ownerToken}` }
    })
    const body = response.json()

    assert.equal(response.statusCode, 200)
    assert.equal(body.requests.length, 1)
    assert.equal(body.requests[0].status, "approved")
    assert.equal(body.requests[0].position, 1)
    assert.equal(response.body.includes(ownerToken), false)
    assert.equal(response.body.includes(ownerHash), false)
    assert.equal(response.body.includes(otherHash), false)
  } finally {
    await app.close()
  }
})

test("event-first my-requests without participant cookie returns an empty list", async () => {
  const app = await createTestApp()
  try {
    const response = await app.inject({
      method: "GET",
      url: `/public/events/${ACTIVE_EVENT_PUBLIC_ID}/my-requests`
    })

    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.json(), { requests: [] })
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
          url: `/public/events/${ACTIVE_EVENT_PUBLIC_ID}/requests`,
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
      url: `/public/events/${ACTIVE_EVENT_PUBLIC_ID}/requests`,
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
      url: `/public/events/${ACTIVE_EVENT_PUBLIC_ID}/requests`,
      headers: { cookie: `${PARTICIPANT_COOKIE_NAME}=${token}` },
      payload: publicSubmitPayload("Singer 1", "Song 1")
    })
    queue.setNow(new Date(start.getTime() + 5_000))
    const blocked = await app.inject({
      method: "POST",
      url: `/public/events/${ACTIVE_EVENT_PUBLIC_ID}/requests`,
      headers: { cookie: `${PARTICIPANT_COOKIE_NAME}=${token}` },
      payload: publicSubmitPayload("Singer 2", "Song 2")
    })
    queue.setNow(new Date(start.getTime() + 21_000))
    const allowed = await app.inject({
      method: "POST",
      url: `/public/events/${ACTIVE_EVENT_PUBLIC_ID}/requests`,
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
      url: `/public/events/${PAUSED_EVENT_PUBLIC_ID}/requests`,
      payload: publicSubmitPayload()
    })
    const scheduled = await app.inject({
      method: "POST",
      url: `/public/events/${SCHEDULED_EVENT_PUBLIC_ID}/requests`,
      payload: publicSubmitPayload()
    })
    const closed = await app.inject({
      method: "POST",
      url: `/public/events/${CLOSED_EVENT_PUBLIC_ID}/requests`,
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
      url: `/public/events/${ACTIVE_EVENT_PUBLIC_ID}/requests`,
      payload: publicSubmitPayload()
    })

    assert.equal(response.statusCode, 409)
    assert.equal(response.json().error.code, "CONFLICT")
  } finally {
    await app.close()
  }
})

test("open event allows public submit without invite access", async () => {
  const db = fakeDbForQueueSubmit({ joinAccessMode: "open" })
  const app = await createTestApp({
    db,
    queue: createQueueService(db.db)
  })
  try {
    const response = await app.inject({
      method: "POST",
      url: `/public/events/${ACTIVE_EVENT_PUBLIC_ID}/requests`,
      payload: publicSubmitPayload()
    })

    assert.equal(response.statusCode, 201)
    assert.equal(db.state.requests.length, 1)
  } finally {
    await app.close()
  }
})

test("invite-required event rejects public submit without participant access", async () => {
  const db = fakeDbForQueueSubmit({ joinAccessMode: "invite_required" })
  const app = await createTestApp({
    db,
    queue: createQueueService(db.db)
  })
  try {
    const response = await app.inject({
      method: "POST",
      url: `/public/events/${ACTIVE_EVENT_PUBLIC_ID}/requests`,
      payload: publicSubmitPayload()
    })

    assert.equal(response.statusCode, 403)
    assert.equal(response.json().error.code, "ACCESS_REQUIRED")
    assert.equal(db.state.requests.length, 0)
  } finally {
    await app.close()
  }
})

test("invite-required event allows public submit after invite claim", async () => {
  const claimDb = fakeDbForPublicInviteClaim({ status: "active", joinAccessMode: "invite_required" })
  const claimApp = await createTestApp({
    db: claimDb,
    events: createEventsService(claimDb.db)
  })
  let token = ""
  try {
    const claim = await claimApp.inject({ method: "POST", url: "/public/invites/inviteCode1/claim" })
    token = readParticipantCookie(claim)

    assert.equal(claim.statusCode, 200)
    assert.equal(readAccessRows(claimDb).length, 1)
  } finally {
    await claimApp.close()
  }

  const submitDb = fakeDbForQueueSubmit({
    joinAccessMode: "invite_required",
    accessRows: readAccessRows(claimDb)
  })
  const submitApp = await createTestApp({
    db: submitDb,
    queue: createQueueService(submitDb.db)
  })
  try {
    const response = await submitApp.inject({
      method: "POST",
      url: `/public/events/${ACTIVE_EVENT_PUBLIC_ID}/requests`,
      headers: { cookie: `${PARTICIPANT_COOKIE_NAME}=${token}` },
      payload: publicSubmitPayload()
    })

    assert.equal(response.statusCode, 201)
    assert.equal(submitDb.state.requests.length, 1)
  } finally {
    await submitApp.close()
  }
})

test("publicJoinEnabled false blocks submit even after invite access", async () => {
  const token = "participant-token-with-invite-access-123"
  const participantTokenHash = hashParticipantToken(token, testConfig().participantTokenSecret)
  const db = fakeDbForQueueSubmit({
    joinAccessMode: "invite_required",
    publicJoinEnabled: false,
    accessRows: [{ eventId: ACTIVE_EVENT_ID, participantTokenHash, grantedByInviteId: "invite-1" }]
  })
  const app = await createTestApp({
    db,
    queue: createQueueService(db.db)
  })
  try {
    const response = await app.inject({
      method: "POST",
      url: `/public/events/${ACTIVE_EVENT_PUBLIC_ID}/requests`,
      headers: { cookie: `${PARTICIPANT_COOKIE_NAME}=${token}` },
      payload: publicSubmitPayload()
    })

    assert.equal(response.statusCode, 409)
    assert.equal(response.json().error.code, "CONFLICT")
    assert.equal(db.state.requests.length, 0)
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
    const response = await app.inject({ method: "GET", url: `/public/events/${ACTIVE_EVENT_PUBLIC_ID}` })
    const body = response.json()

    assert.equal(response.statusCode, 200)
    assert.equal(body.event.publicId, ACTIVE_EVENT_PUBLIC_ID)
    assert.equal(body.event.name, "Active Event")
    assert.equal(body.event.status, "active")
    assert.equal(body.event.publicJoinEnabled, true)
    assert.equal(body.event.publicQueueEnabled, true)
    assert.equal(body.venue.slug, "klub-x")
    assert.equal(body.venue.name, "Klub X")
    assert.equal(body.operatedByOrganization.slug, "poza-nuta-demo")
    assert.equal(body.submissions.enabled, true)
    assert.equal(body.publicQueue.visible, true)
    assert.equal(response.body.includes(ACTIVE_EVENT_ID), false)
    assert.equal("id" in body.event, false)
    assert.equal("id" in body.operatedByOrganization, false)
  } finally {
    await app.close()
  }
})

test("public event detail does not use internal event id as public id", async () => {
  const app = await createTestApp({
    events: {
      ...fakeEventsService(),
      getPublicEventById: async (eventPublicId) =>
        eventPublicId === ACTIVE_EVENT_PUBLIC_ID
          ? {
              event: {
                publicId: ACTIVE_EVENT_PUBLIC_ID,
                name: "Active Event",
                slug: "active-event",
                status: "active",
                startsAt: null,
                endsAt: null,
                publicJoinEnabled: true,
                publicQueueEnabled: true,
                joinAccessMode: "open"
              },
              venue: { slug: "klub-x", name: "Klub X", city: "Warszawa", timezone: "Europe/Warsaw" },
              operatedByOrganization: { slug: "poza-nuta-demo", name: "Poza Nuta Demo" },
              submissions: { enabled: true },
              publicQueue: { visible: true }
            }
          : null
    } as ApiModuleServices["events"]
  })
  try {
    const response = await app.inject({ method: "GET", url: `/public/events/${ACTIVE_EVENT_ID}` })

    assert.equal(response.statusCode, 404)
    assert.equal(response.json().error.code, "NOT_FOUND")
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
      const response = await app.inject({ method: "GET", url: `/public/events/${ACTIVE_EVENT_PUBLIC_ID}` })

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
      const response = await app.inject({ method: "GET", url: `/public/events/${ACTIVE_EVENT_PUBLIC_ID}` })

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
    const response = await app.inject({ method: "GET", url: `/public/events/${ACTIVE_EVENT_PUBLIC_ID}` })

    assert.equal(response.statusCode, 200)
    assert.equal(response.body.includes("operator note"), false)
    assert.equal(response.body.includes("participantTokenHash"), false)
    assert.equal(response.body.includes("createdByUserId"), false)
  } finally {
    await app.close()
  }
})

test("public event detail does not expose invite code", async () => {
  const db = fakeDbForPublicEventDetail({ status: "active", publicJoinEnabled: true, publicQueueEnabled: true })
  const app = await createTestApp({
    db,
    events: createEventsService(db.db)
  })
  try {
    const response = await app.inject({ method: "GET", url: `/public/events/${ACTIVE_EVENT_PUBLIC_ID}` })

    assert.equal(response.statusCode, 200)
    assert.equal(response.body.includes("inviteCode"), false)
    assert.equal(response.body.includes("invite"), false)
  } finally {
    await app.close()
  }
})

test("public invite claim sets participant cookie and returns event redirect without internal id", async () => {
  const db = fakeDbForPublicInviteClaim({ status: "active" })
  const app = await createTestApp({
    db,
    events: createEventsService(db.db)
  })
  try {
    const response = await app.inject({ method: "POST", url: "/public/invites/inviteCode1/claim" })
    const token = readParticipantCookie(response)

    assert.equal(response.statusCode, 200)
    assert.match(token, /^[A-Za-z0-9_-]{32,128}$/)
    assert.deepEqual(response.json(), {
      eventPublicId: ACTIVE_EVENT_PUBLIC_ID,
      redirectTo: `/event/${ACTIVE_EVENT_PUBLIC_ID}`
    })
    assert.equal(response.body.includes(ACTIVE_EVENT_ID), false)
    assert.equal(response.body.includes("inviteCode1"), false)
  } finally {
    await app.close()
  }
})

test("public invite claim reuses existing participant cookie", async () => {
  const db = fakeDbForPublicInviteClaim({ status: "active" })
  const app = await createTestApp({
    db,
    events: createEventsService(db.db)
  })
  const token = "participant-token-reused-by-invite-123"
  try {
    const response = await app.inject({
      method: "POST",
      url: "/public/invites/inviteCode1/claim",
      headers: { cookie: `${PARTICIPANT_COOKIE_NAME}=${token}` }
    })

    assert.equal(response.statusCode, 200)
    assert.equal(readParticipantCookie(response), token)
  } finally {
    await app.close()
  }
})

test("valid invite claim creates participant event access without storing raw token", async () => {
  const db = fakeDbForPublicInviteClaim({ status: "active", joinAccessMode: "invite_required" })
  const app = await createTestApp({
    db,
    events: createEventsService(db.db)
  })
  try {
    const response = await app.inject({ method: "POST", url: "/public/invites/inviteCode1/claim" })
    const token = readParticipantCookie(response)
    const accessRows = readAccessRows(db)

    assert.equal(response.statusCode, 200)
    assert.equal(accessRows.length, 1)
    assert.equal(accessRows[0]?.eventId, ACTIVE_EVENT_ID)
    assert.equal(accessRows[0]?.participantTokenHash, hashParticipantToken(token, testConfig().participantTokenSecret))
    assert.notEqual(accessRows[0]?.participantTokenHash, token)
    assert.equal(JSON.stringify(accessRows).includes(token), false)
  } finally {
    await app.close()
  }
})

test("duplicate invite claim does not create duplicate participant access", async () => {
  const db = fakeDbForPublicInviteClaim({ status: "active", joinAccessMode: "invite_required" })
  const app = await createTestApp({
    db,
    events: createEventsService(db.db)
  })
  const token = "participant-token-duplicate-claim-123"
  try {
    const first = await app.inject({
      method: "POST",
      url: "/public/invites/inviteCode1/claim",
      headers: { cookie: `${PARTICIPANT_COOKIE_NAME}=${token}` }
    })
    const second = await app.inject({
      method: "POST",
      url: "/public/invites/inviteCode1/claim",
      headers: { cookie: `${PARTICIPANT_COOKIE_NAME}=${token}` }
    })

    assert.equal(first.statusCode, 200)
    assert.equal(second.statusCode, 200)
    assert.equal(readAccessRows(db).length, 1)
  } finally {
    await app.close()
  }
})

test("revoke invite is idempotent and blocks future claims without granting access", async () => {
  const db = fakeDbForInviteMutation({ joinAccessMode: "invite_required" })
  const app = await createTestApp({
    db,
    events: createEventsService(db.db),
    permissions: fakePermissions({ event: new Set(["event.manage"]) })
  })
  try {
    const firstRevoke = await app.inject({ method: "POST", url: `/dashboard/events/${ACTIVE_EVENT_ID}/invite/revoke` })
    const secondRevoke = await app.inject({ method: "POST", url: `/dashboard/events/${ACTIVE_EVENT_ID}/invite/revoke` })
    const claim = await app.inject({ method: "POST", url: "/public/invites/inviteCode1/claim" })

    assert.equal(firstRevoke.statusCode, 200)
    assert.equal(firstRevoke.json().invite, null)
    assert.equal(secondRevoke.statusCode, 200)
    assert.equal(secondRevoke.json().invite, null)
    assert.equal(claim.statusCode, 404)
    assert.equal(claim.json().error.code, "NOT_FOUND")
    assert.equal(claim.json().error.message, "Invalid or expired invite")
    assert.equal(readAccessRows(db).length, 0)
  } finally {
    await app.close()
  }
})

test("revoke invite does not remove existing participant access and submit still works", async () => {
  const token = "participant-token-before-revoke-123"
  const participantTokenHash = hashParticipantToken(token, testConfig().participantTokenSecret)
  const db = fakeDbForInviteMutation({
    joinAccessMode: "invite_required",
    accessRows: [{ eventId: ACTIVE_EVENT_ID, participantTokenHash, grantedByInviteId: "invite-1" }]
  })
  const app = await createTestApp({
    db,
    events: createEventsService(db.db),
    permissions: fakePermissions({ event: new Set(["event.manage"]) })
  })
  try {
    const revoke = await app.inject({ method: "POST", url: `/dashboard/events/${ACTIVE_EVENT_ID}/invite/revoke` })

    assert.equal(revoke.statusCode, 200)
    assert.equal(readAccessRows(db).length, 1)
  } finally {
    await app.close()
  }

  const submitDb = fakeDbForQueueSubmit({
    joinAccessMode: "invite_required",
    accessRows: readAccessRows(db)
  })
  const submitApp = await createTestApp({
    db: submitDb,
    queue: createQueueService(submitDb.db)
  })
  try {
    const response = await submitApp.inject({
      method: "POST",
      url: `/public/events/${ACTIVE_EVENT_PUBLIC_ID}/requests`,
      headers: { cookie: `${PARTICIPANT_COOKIE_NAME}=${token}` },
      payload: publicSubmitPayload()
    })

    assert.equal(response.statusCode, 201)
    assert.equal(submitDb.state.requests.length, 1)
  } finally {
    await submitApp.close()
  }
})

test("rotate invalidates old invite code and new code can be claimed", async () => {
  const existingToken = "participant-token-before-rotate-123"
  const existingParticipantTokenHash = hashParticipantToken(existingToken, testConfig().participantTokenSecret)
  const db = fakeDbForInviteMutation({
    joinAccessMode: "invite_required",
    accessRows: [{ eventId: ACTIVE_EVENT_ID, participantTokenHash: existingParticipantTokenHash, grantedByInviteId: "invite-1" }]
  })
  const app = await createTestApp({
    db,
    events: createEventsService(db.db),
    permissions: fakePermissions({ event: new Set(["event.manage"]) })
  })
  try {
    const rotate = await app.inject({ method: "POST", url: `/dashboard/events/${ACTIVE_EVENT_ID}/invite/rotate` })
    const oldClaim = await app.inject({ method: "POST", url: "/public/invites/inviteCode1/claim" })
    const newCode = rotate.json().invite.code
    const newClaim = await app.inject({ method: "POST", url: `/public/invites/${newCode}/claim` })

    assert.equal(rotate.statusCode, 200)
    assert.match(newCode, /^[A-Za-z0-9_-]{8,80}$/)
    assert.notEqual(newCode, "inviteCode1")
    assert.equal(rotate.json().invite.urlPath, `/invite/${newCode}`)
    assert.equal(oldClaim.statusCode, 404)
    assert.equal(newClaim.statusCode, 200)
    assert.equal(newClaim.json().redirectTo, `/event/${ACTIVE_EVENT_PUBLIC_ID}`)
    assert.equal(readAccessRows(db).length, 2)
  } finally {
    await app.close()
  }

  const submitDb = fakeDbForQueueSubmit({
    joinAccessMode: "invite_required",
    accessRows: readAccessRows(db)
  })
  const submitApp = await createTestApp({
    db: submitDb,
    queue: createQueueService(submitDb.db)
  })
  try {
    const response = await submitApp.inject({
      method: "POST",
      url: `/public/events/${ACTIVE_EVENT_PUBLIC_ID}/requests`,
      headers: { cookie: `${PARTICIPANT_COOKIE_NAME}=${existingToken}` },
      payload: publicSubmitPayload()
    })

    assert.equal(response.statusCode, 201)
    assert.equal(submitDb.state.requests.length, 1)
  } finally {
    await submitApp.close()
  }
})

test("public invite claim rejects revoked and expired invites with controlled not found", async () => {
  for (const invite of [
    { inviteStatus: "revoked" },
    { expiresAt: new Date(Date.now() - 1_000) }
  ]) {
    const db = fakeDbForPublicInviteClaim({ status: "active", ...invite })
    const app = await createTestApp({
      db,
      events: createEventsService(db.db)
    })
    try {
      const response = await app.inject({ method: "POST", url: "/public/invites/inviteCode1/claim" })

      assert.equal(response.statusCode, 404)
      assert.equal(response.json().error.code, "NOT_FOUND")
      assert.equal(response.json().error.message, "Invalid or expired invite")
      assert.equal(response.body.includes("inviteCode1"), false)
      assert.equal(readAccessRows(db).length, 0)
    } finally {
      await app.close()
    }
  }
})

test("public invite claim hides invites for non-public venues organizations and events", async () => {
  for (const hiddenContext of [
    { venueStatus: "draft" },
    { venueStatus: "archived" },
    { venueVerificationStatus: "pending" },
    { venueVerificationStatus: "rejected" },
    { organizationStatus: "pending" },
    { organizationStatus: "archived" },
    { status: "draft" },
    { status: "archived" },
    { status: "cancelled" }
  ]) {
    const db = fakeDbForPublicInviteClaim({
      status: "active",
      ...hiddenContext
    })
    const app = await createTestApp({
      db,
      events: createEventsService(db.db)
    })
    try {
      const response = await app.inject({ method: "POST", url: "/public/invites/inviteCode1/claim" })

      assert.equal(response.statusCode, 404)
      assert.equal(response.json().error.code, "NOT_FOUND")
      assert.equal(response.json().error.message, "Invalid or expired invite")
    } finally {
      await app.close()
    }
  }
})

test("event public id unique constraint exists in schema and migration", () => {
  const schemaSource = readFileSync("packages/db/src/schema.ts", "utf8")
  const migrationSource = readFileSync("packages/db/drizzle/0007_melodic_moira_mactaggert.sql", "utf8")

  assert.match(schemaSource, /events_public_id_unique/)
  assert.match(migrationSource, /ALTER TABLE "events" ADD COLUMN "public_id" text/)
  assert.match(migrationSource, /ALTER TABLE "events" ALTER COLUMN "public_id" SET NOT NULL/)
  assert.match(migrationSource, /events_public_id_unique/)
})

test("event invites table and code unique constraint exist in schema and migration", () => {
  const schemaSource = readFileSync("packages/db/src/schema.ts", "utf8")
  const migrationSource = readFileSync("packages/db/drizzle/0008_previous_human_robot.sql", "utf8")

  assert.match(schemaSource, /eventInvites/)
  assert.match(schemaSource, /event_invites_code_unique/)
  assert.match(migrationSource, /CREATE TABLE "event_invites"/)
  assert.match(migrationSource, /CONSTRAINT "event_invites_code_unique" UNIQUE\("code"\)/)
  assert.match(migrationSource, /INSERT INTO "event_invites"/)
})

test("participant event access schema and migration protect invite-required access", () => {
  const schemaSource = readFileSync("packages/db/src/schema.ts", "utf8")
  const migrationSource = readFileSync("packages/db/drizzle/0009_optimal_james_howlett.sql", "utf8")

  assert.match(schemaSource, /joinAccessMode/)
  assert.match(schemaSource, /events_join_access_mode_check/)
  assert.match(schemaSource, /participantEventAccess/)
  assert.match(schemaSource, /participant_event_access_event_token_unique/)
  assert.match(migrationSource, /ALTER TABLE "events" ADD COLUMN "join_access_mode" text DEFAULT 'open' NOT NULL/)
  assert.match(
    migrationSource,
    /CONSTRAINT "events_join_access_mode_check" CHECK \("events"\."join_access_mode" in \('open', 'invite_required'\)\)/
  )
  assert.match(migrationSource, /CREATE TABLE "participant_event_access"/)
  assert.match(migrationSource, /CONSTRAINT "participant_event_access_event_token_unique" UNIQUE\("event_id","participant_token_hash"\)/)
  assert.match(migrationSource, /REFERENCES "public"."events"\("id"\) ON DELETE cascade/)
  assert.match(migrationSource, /REFERENCES "public"."event_invites"\("id"\) ON DELETE set null/)
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
        url: `/public/events/${ACTIVE_EVENT_PUBLIC_ID}/requests`,
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
    const response = await app.inject({ method: "GET", url: `/public/events/${ACTIVE_EVENT_PUBLIC_ID}/queue` })
    const body = response.json()

    assert.equal(response.statusCode, 200)
    assert.equal(body.event.publicId, ACTIVE_EVENT_PUBLIC_ID)
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
    assert.equal(response.body.includes(ACTIVE_EVENT_ID), false)
  } finally {
    await app.close()
  }
})

test("event-first public queue does not accept internal event UUID as public id", async () => {
  const app = await createTestApp()
  try {
    const response = await app.inject({ method: "GET", url: `/public/events/${ACTIVE_EVENT_ID}/queue` })

    assert.equal(response.statusCode, 404)
    assert.equal(response.json().error.code, "NOT_FOUND")
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
    const response = await app.inject({ method: "GET", url: `/public/events/${ACTIVE_EVENT_PUBLIC_ID}/queue` })

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
      const response = await app.inject({ method: "GET", url: `/public/events/${ACTIVE_EVENT_PUBLIC_ID}/queue` })

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
      const eventId = await app.inject({ method: "GET", url: `/public/events/${ACTIVE_EVENT_PUBLIC_ID}/queue` })

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
      const response = await app.inject({ method: "GET", url: `/public/events/${ACTIVE_EVENT_PUBLIC_ID}/queue` })

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
      const response = await app.inject({ method: "GET", url: `/public/events/${ACTIVE_EVENT_PUBLIC_ID}/queue` })

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
      const eventId = await app.inject({ method: "GET", url: `/public/events/${ACTIVE_EVENT_PUBLIC_ID}/queue` })

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
    const response = await app.inject({ method: "GET", url: `/public/events/${PAUSED_EVENT_PUBLIC_ID}/queue` })
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
    assert.equal(body.activeEvent.publicId, "activeEvent1")
    assert.equal(body.event.publicId, ACTIVE_EVENT_PUBLIC_ID)
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
  events: Map<string, { id: string; publicId: string; name: string; status: string }>
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
      [ACTIVE_EVENT_ID, { id: ACTIVE_EVENT_ID, publicId: ACTIVE_EVENT_PUBLIC_ID, name: "Active Event", status: "active" }],
      [PAUSED_EVENT_ID, { id: PAUSED_EVENT_ID, publicId: PAUSED_EVENT_PUBLIC_ID, name: "Paused Event", status: "paused" }],
      [
        SCHEDULED_EVENT_ID,
        { id: SCHEDULED_EVENT_ID, publicId: SCHEDULED_EVENT_PUBLIC_ID, name: "Scheduled Event", status: "scheduled" }
      ],
      [CLOSED_EVENT_ID, { id: CLOSED_EVENT_ID, publicId: CLOSED_EVENT_PUBLIC_ID, name: "Closed Event", status: "closed" }]
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
        event: {
          publicId: event.publicId,
          name: event.name,
          status: event.status
        },
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
    resolvePublicEventByPublicId: async (eventPublicId: string) => {
      const event = findPublicEventResolution(eventPublicId)
      if (event) {
        return event
      }
      const lookup = "lookup" in options ? options.lookup : makePublicLookup(makePublicEvent(ACTIVE_EVENT_ID, "active"))
      const activeEvent = lookup?.activeEvent
      if (activeEvent?.publicId === eventPublicId) {
        return {
          id: activeEvent.id,
          publicId: activeEvent.publicId,
          venueId: activeEvent.venueId,
          status: activeEvent.status,
          publicJoinEnabled: activeEvent.publicJoinEnabled,
          publicQueueEnabled: activeEvent.publicQueueEnabled,
          joinAccessMode: activeEvent.joinAccessMode
        }
      }
      return null
    },
    getPublicActiveEventByVenueSlug: async () =>
      "lookup" in options ? options.lookup : makePublicLookup(makePublicEvent(ACTIVE_EVENT_ID, "active"))
  } as unknown as ApiModuleServices["events"]
}

function findPublicEventResolution(eventPublicId: string) {
  const events = [
    { id: ACTIVE_EVENT_ID, publicId: ACTIVE_EVENT_PUBLIC_ID, status: "active" },
    { id: PAUSED_EVENT_ID, publicId: PAUSED_EVENT_PUBLIC_ID, status: "paused" },
    { id: SCHEDULED_EVENT_ID, publicId: SCHEDULED_EVENT_PUBLIC_ID, status: "scheduled" },
    { id: CLOSED_EVENT_ID, publicId: CLOSED_EVENT_PUBLIC_ID, status: "closed" }
  ]
  const event = events.find((candidate) => candidate.publicId === eventPublicId)
  return event
    ? {
        id: event.id,
        publicId: event.publicId,
        venueId: VENUE_ID,
        status: event.status,
        publicJoinEnabled: true,
        publicQueueEnabled: true,
        joinAccessMode: "open"
      }
    : null
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
    publicId: `${status}Event1`,
    venueId: VENUE_ID,
    operatedByOrganizationId: "77777777-7777-4777-8777-777777777777",
    createdByUserId: USER_ID,
    name: `${status} Event`,
    slug: `${status}-event`,
    status,
    startsAt: null,
    endsAt: null,
    publicJoinEnabled: true,
    publicQueueEnabled: true,
    joinAccessMode: "open"
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

type ParticipantAccessRow = {
  eventId: string
  participantTokenHash: string
  grantedByInviteId: string | null
}

function fakeDbForQueueSubmit(options: {
  status?: string
  publicJoinEnabled?: boolean
  publicQueueEnabled?: boolean
  joinAccessMode: "open" | "invite_required"
  accessRows?: ParticipantAccessRow[]
}): DbResources & {
  state: {
    events: Map<string, { id: string; publicId: string; name: string; status: string }>
    requests: QueueSongRequest[]
    queueEvents: Array<{ eventId: string; requestId: string; type: string }>
  }
} {
  const state = {
    events: new Map([
      [ACTIVE_EVENT_ID, { id: ACTIVE_EVENT_ID, publicId: ACTIVE_EVENT_PUBLIC_ID, name: "Active Event", status: options.status ?? "active" }]
    ]),
    requests: [] as QueueSongRequest[],
    queueEvents: [] as Array<{ eventId: string; requestId: string; type: string }>
  }
  let idOnlySelectCount = 0
  const accessRows = options.accessRows ?? []
  const db = {
    execute: async () => [],
    select: (selection?: Record<string, unknown>) => {
      if (selection && "event" in selection) {
        return queryChain([
          {
            event: {
              id: ACTIVE_EVENT_ID,
              publicId: ACTIVE_EVENT_PUBLIC_ID,
              venueId: VENUE_ID,
              operatedByOrganizationId: "77777777-7777-4777-8777-777777777777",
              name: "Active Event",
              status: options.status ?? "active",
              publicJoinEnabled: options.publicJoinEnabled ?? true,
              publicQueueEnabled: options.publicQueueEnabled ?? true,
              joinAccessMode: options.joinAccessMode
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

      if (selection && "status" in selection && "requestedAt" in selection) {
        return queryChain([])
      }

      if (selection && "id" in selection) {
        idOnlySelectCount += 1
        if (options.joinAccessMode === "invite_required" && idOnlySelectCount === 1) {
          return queryChain(accessRows.length > 0 ? [{ id: "participant-access-1" }] : [])
        }
        return queryChain([{ id: "ising" }])
      }

      return queryChain([])
    },
    insert: (table: unknown) => ({
      values: (value: any) => {
        if (table === songRequests) {
          return {
            returning: () => {
              const request = addRequestToState(state, ACTIVE_EVENT_ID, "pending", {
                ...value,
                id: `66666666-6666-4666-8666-${String(state.requests.length + 1).padStart(12, "0")}`,
                createdAt: new Date(),
                updatedAt: new Date(),
                requestedAt: new Date()
              })
              return [request]
            }
          }
        }

        if (table === queueEvents) {
          state.queueEvents.push({ eventId: value.eventId, requestId: value.requestId, type: value.type })
          return undefined
        }

        throw new Error("Unexpected insert")
      }
    })
  } as unknown as DbResources["db"]

  return {
    db,
    pool: {
      end: async () => undefined
    } as unknown as DbResources["pool"],
    state
  }
}

function fakeDbForQueueEventContext(event: {
  status: string
  publicJoinEnabled: boolean
  publicQueueEnabled: boolean
  joinAccessMode?: "open" | "invite_required"
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
            publicId: ACTIVE_EVENT_PUBLIC_ID,
            venueId: VENUE_ID,
            operatedByOrganizationId: "77777777-7777-4777-8777-777777777777",
            name: "Active Event",
            ...event,
            joinAccessMode: event.joinAccessMode ?? "open"
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
              publicId: ACTIVE_EVENT_PUBLIC_ID,
              venueId: VENUE_ID,
              operatedByOrganizationId: "77777777-7777-4777-8777-777777777777",
              name: "Public Queue Event",
              status,
              publicJoinEnabled: true,
              publicQueueEnabled: true,
              joinAccessMode: "open"
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
  joinAccessMode?: "open" | "invite_required"
  participantAccess?: boolean
  venueStatus?: string
  venueVerificationStatus?: string
  organizationStatus?: string
}): DbResources {
  let selectCount = 0
  return fakeDbResourcesWithClient({
    select: () => {
      selectCount += 1
      if (selectCount === 1) {
        return queryChain([
          {
            event: {
              id: ACTIVE_EVENT_ID,
              publicId: ACTIVE_EVENT_PUBLIC_ID,
              name: "Active Event",
              slug: "active-event",
              status: event.status,
              startsAt: null,
              endsAt: null,
              publicJoinEnabled: event.publicJoinEnabled,
              publicQueueEnabled: event.publicQueueEnabled,
              joinAccessMode: event.joinAccessMode ?? "open"
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
      }

      return queryChain(event.participantAccess ? [{ id: "participant-access-1" }] : [])
    }
  } as unknown as DbResources["db"])
}

function fakeDbForInviteMutation(options: {
  status?: string
  joinAccessMode: "open" | "invite_required"
  accessRows?: ParticipantAccessRow[]
}): DbResources & {
  state: {
    invites: Array<{ id: string; eventId: string; code: string; status: string; expiresAt: Date | null }>
  }
} {
  const accessRows = [...(options.accessRows ?? [])]
  const state = {
    invites: [
      {
        id: "invite-1",
        eventId: ACTIVE_EVENT_ID,
        code: "inviteCode1",
        status: "active",
        expiresAt: null
      }
    ]
  }
  const event = {
    id: ACTIVE_EVENT_ID,
    publicId: ACTIVE_EVENT_PUBLIC_ID,
    venueId: VENUE_ID,
    operatedByOrganizationId: "77777777-7777-4777-8777-777777777777",
    createdByUserId: USER_ID,
    name: "Active Event",
    slug: "active-event",
    status: options.status ?? "active",
    startsAt: null,
    endsAt: null,
    publicJoinEnabled: true,
    publicQueueEnabled: true,
    joinAccessMode: options.joinAccessMode
  }
  const client = {
    transaction: async <T>(action: (tx: DbResources["db"]) => Promise<T>) => action(client as unknown as DbResources["db"]),
    select: (selection?: Record<string, unknown>) => {
      if (selection && "invite" in selection) {
        return queryChainWithWhere((condition) => {
          const code = extractSqlStringParam(condition)
          const invite = state.invites.find((candidate) => candidate.code === code)
          return invite
            ? [
                {
                  invite: {
                    id: invite.id,
                    status: invite.status,
                    expiresAt: invite.expiresAt
                  },
                  event,
                  venue: {
                    status: "active",
                    verificationStatus: "verified"
                  },
                  organization: {
                    status: "active"
                  }
                }
              ]
            : []
        })
      }

      if (selection && "publicId" in selection && "venueId" in selection) {
        return queryChain([event])
      }

      return queryChain([])
    },
    update: (table: unknown) => ({
      set: (values: { status?: string }) => ({
        where: () => {
          if (table === eventInvites && values.status === "revoked") {
            for (const invite of state.invites) {
              if (invite.eventId === ACTIVE_EVENT_ID && invite.status === "active") {
                invite.status = "revoked"
              }
            }
          }
          return []
        }
      })
    }),
    insert: (table: unknown) => ({
      values: (value: { eventId: string; code?: string; status?: string; participantTokenHash?: string; grantedByInviteId?: string | null }) => {
        if (table === eventInvites) {
          state.invites.push({
            id: `invite-${state.invites.length + 1}`,
            eventId: value.eventId,
            code: value.code ?? `invite-${state.invites.length + 1}`,
            status: value.status ?? "active",
            expiresAt: null
          })
          return undefined
        }

        if (table === participantEventAccess) {
          return {
            onConflictDoNothing: async () => {
              if (
                value.participantTokenHash &&
                !accessRows.some((row) => row.eventId === value.eventId && row.participantTokenHash === value.participantTokenHash)
              ) {
                accessRows.push({
                  eventId: value.eventId,
                  participantTokenHash: value.participantTokenHash,
                  grantedByInviteId: value.grantedByInviteId ?? null
                })
              }
            }
          }
        }

        throw new Error("Unexpected insert")
      }
    }),
    accessRows
  }

  return {
    db: Object.assign({ execute: async () => [] }, client) as unknown as DbResources["db"],
    pool: {
      end: async () => undefined
    } as unknown as DbResources["pool"],
    state
  }
}

function fakeDbForPublicInviteClaim(event: {
  status: string
  inviteStatus?: string
  expiresAt?: Date | null
  venueStatus?: string
  venueVerificationStatus?: string
  organizationStatus?: string
  joinAccessMode?: "open" | "invite_required"
}): DbResources {
  const accessRows: Array<{ eventId: string; participantTokenHash: string; grantedByInviteId: string | null }> = []
  return fakeDbResourcesWithClient({
    select: () =>
      queryChain([
        {
          invite: {
            id: "99999999-9999-4999-8999-999999999999",
            status: event.inviteStatus ?? "active",
            expiresAt: event.expiresAt ?? null
          },
          event: {
            id: ACTIVE_EVENT_ID,
            publicId: ACTIVE_EVENT_PUBLIC_ID,
            status: event.status,
            publicJoinEnabled: true,
            publicQueueEnabled: true,
            joinAccessMode: event.joinAccessMode ?? "open"
          },
          venue: {
            status: event.venueStatus ?? "active",
            verificationStatus: event.venueVerificationStatus ?? "verified"
          },
          organization: {
            status: event.organizationStatus ?? "active"
          }
        }
      ]),
    insert: (table: unknown) => ({
      values: (value: { eventId: string; participantTokenHash: string; grantedByInviteId?: string | null }) => {
        if (table === participantEventAccess) {
          return {
            onConflictDoNothing: async () => {
              if (!accessRows.some((row) => row.eventId === value.eventId && row.participantTokenHash === value.participantTokenHash)) {
                accessRows.push({
                  eventId: value.eventId,
                  participantTokenHash: value.participantTokenHash,
                  grantedByInviteId: value.grantedByInviteId ?? null
                })
              }
            }
          }
        }

        throw new Error("Unexpected insert")
      }
    }),
    accessRows
  } as unknown as DbResources["db"] & { accessRows: typeof accessRows })
}

function readAccessRows(db: DbResources): ParticipantAccessRow[] {
  return (db.db as unknown as { accessRows: ParticipantAccessRow[] }).accessRows
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
    leftJoin() {
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

function queryChainWithWhere<T>(resolve: (condition: unknown) => T[]) {
  let result: T[] = []
  return {
    from() {
      return this
    },
    innerJoin() {
      return this
    },
    leftJoin() {
      return this
    },
    where(condition: unknown) {
      result = resolve(condition)
      return this
    },
    limit() {
      return result
    }
  }
}

function extractSqlStringParam(condition: unknown): string | undefined {
  const chunks = (condition as { queryChunks?: Array<{ value?: unknown }> } | null)?.queryChunks
  return chunks?.find((chunk) => typeof chunk.value === "string")?.value as string | undefined
}

function fakeAuth() {
  return {
    handler: async () => new Response(null, { status: 404 }),
    api: {
      getSession: async () => null
    }
  } as any
}
