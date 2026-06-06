import assert from "node:assert/strict"
import test from "node:test"
import { createApiApp } from "../apps/api/src/app.ts"
import type { AuthenticatedDomainUser } from "../apps/api/src/auth/access.ts"
import type { ApiConfig } from "../apps/api/src/config.ts"
import { ApiHttpError } from "../apps/api/src/errors.ts"
import { createEventsService, mapEventLifecycleError } from "../apps/api/src/modules/events/service.ts"
import type { ApiModuleServices } from "../apps/api/src/plugins/modules.ts"
import type { DbResources } from "../apps/api/src/plugins/db.ts"
import type { PermissionService } from "../apps/api/src/permissions/service.ts"
import type {
  DashboardEventSummary,
  EventStaffAssignmentSummary,
  EventSummary,
  EventsService,
  LifecycleAction,
  PublicActiveEventLookup
} from "../apps/api/src/modules/events/service.ts"

const USER_ID = "11111111-1111-4111-8111-111111111111"
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222"
const ORG_ID = "33333333-3333-4333-8333-333333333333"
const VENUE_ID = "44444444-4444-4444-8444-444444444444"
const EVENT_ID = "55555555-5555-4555-8555-555555555555"

test("organization with venue access can create an event", async () => {
  const events = createInMemoryEventsService()
  const app = await createTestApp({ events, permissions: fakePermissions({ venue: new Set(["venue.create_event"]) }) })
  try {
    const response = await app.inject({
      method: "POST",
      url: "/dashboard/events",
      payload: eventPayload("friday")
    })

    assert.equal(response.statusCode, 201)
    assert.equal(response.json().event.slug, "friday")
    assert.equal(events.state.events.size, 1)
  } finally {
    await app.close()
  }
})

test("platform owner can create an event without operatedByOrganizationId", async () => {
  const events = createInMemoryEventsService()
  const app = await createTestApp({ events, permissions: fakePermissions({ platform: new Set(["platform.manage_venues"]) }) })
  try {
    const response = await app.inject({
      method: "POST",
      url: "/dashboard/events",
      payload: {
        venueId: VENUE_ID,
        name: "Test Karaoke",
        slug: "test-karaoke",
        status: "draft",
        publicJoinEnabled: false,
        publicQueueEnabled: false
      }
    })
    const body = response.json()

    assert.equal(response.statusCode, 201)
    assert.equal(body.event.slug, "test-karaoke")
    assert.equal(body.event.status, "draft")
    assert.equal(body.event.publicJoinEnabled, false)
    assert.equal(body.event.publicQueueEnabled, false)
    assert.equal(body.event.venue.name, "Demo Klub")
    assert.equal(body.event.operatedByOrganization.name, "Poza Nuta Demo")
  } finally {
    await app.close()
  }
})

test("create event validates required fields and status", async () => {
  const events = createInMemoryEventsService()
  const app = await createTestApp({ events, permissions: fakePermissions({ platform: new Set(["platform.manage_venues"]) }) })
  try {
    const missingVenue = await app.inject({
      method: "POST",
      url: "/dashboard/events",
      payload: { name: "Test", slug: "test", status: "draft" }
    })
    const missingName = await app.inject({
      method: "POST",
      url: "/dashboard/events",
      payload: { venueId: VENUE_ID, slug: "test", status: "draft" }
    })
    const missingSlug = await app.inject({
      method: "POST",
      url: "/dashboard/events",
      payload: { venueId: VENUE_ID, name: "Test", status: "draft" }
    })
    const invalidStatus = await app.inject({
      method: "POST",
      url: "/dashboard/events",
      payload: { venueId: VENUE_ID, name: "Test", slug: "test", status: "paused" }
    })

    assert.equal(missingVenue.statusCode, 400)
    assert.equal(missingName.statusCode, 400)
    assert.equal(missingSlug.statusCode, 400)
    assert.equal(invalidStatus.statusCode, 400)
  } finally {
    await app.close()
  }
})

test("create event maps duplicate venue slug to controlled conflict", async () => {
  const events = createInMemoryEventsService()
  events.addSeedEvent("test-karaoke", "draft")
  const app = await createTestApp({ events, permissions: fakePermissions({ platform: new Set(["platform.manage_venues"]) }) })
  try {
    const response = await app.inject({
      method: "POST",
      url: "/dashboard/events",
      payload: {
        venueId: VENUE_ID,
        name: "Test Karaoke Again",
        slug: "test-karaoke",
        status: "draft"
      }
    })

    assert.equal(response.statusCode, 409)
    assert.equal(response.json().error.code, "EVENT_SLUG_CONFLICT")
  } finally {
    await app.close()
  }
})

test("user without create permission cannot create an event", async () => {
  const events = createInMemoryEventsService()
  const app = await createTestApp({ events, permissions: fakePermissions() })
  try {
    const response = await app.inject({
      method: "POST",
      url: "/dashboard/events",
      payload: eventPayload("blocked")
    })

    assert.equal(response.statusCode, 403)
    assert.equal(response.json().error.code, "FORBIDDEN")
  } finally {
    await app.close()
  }
})

test("dashboard events list includes venue and operated organization context", async () => {
  const events = createInMemoryEventsService()
  events.addSeedEvent("demo-karaoke", "active")
  const app = await createTestApp({ events })
  try {
    const response = await app.inject({ method: "GET", url: "/dashboard/events" })
    const body = response.json()

    assert.equal(response.statusCode, 200)
    assert.equal(body.events[0].slug, "demo-karaoke")
    assert.deepEqual(body.events[0].venue, {
      id: VENUE_ID,
      name: "Demo Klub",
      slug: "demo-klub"
    })
    assert.deepEqual(body.events[0].operatedByOrganization, {
      id: ORG_ID,
      name: "Poza Nuta Demo",
      slug: "poza-nuta-demo"
    })
  } finally {
    await app.close()
  }
})

test("organization without venue access cannot create an event", async () => {
  const events = createInMemoryEventsService({ organizationHasAccess: false })
  const app = await createTestApp({ events, permissions: fakePermissions({ venue: new Set(["venue.create_event"]) }) })
  try {
    const response = await app.inject({
      method: "POST",
      url: "/dashboard/events",
      payload: eventPayload("friday")
    })

    assert.equal(response.statusCode, 403)
    assert.equal(response.json().error.code, "FORBIDDEN")
  } finally {
    await app.close()
  }
})

test("venue can have multiple scheduled events", async () => {
  const events = createInMemoryEventsService()
  const app = await createTestApp({ events, permissions: fakePermissions({ venue: new Set(["venue.create_event"]) }) })
  try {
    const first = await app.inject({ method: "POST", url: "/dashboard/events", payload: eventPayload("friday", "scheduled") })
    const second = await app.inject({ method: "POST", url: "/dashboard/events", payload: eventPayload("saturday", "scheduled") })

    assert.equal(first.statusCode, 201)
    assert.equal(second.statusCode, 201)
    assert.equal([...events.state.events.values()].filter((event) => event.status === "scheduled").length, 2)
  } finally {
    await app.close()
  }
})

test("start event sets active and blocks another active event in the same venue", async () => {
  const events = createInMemoryEventsService()
  const first = events.addSeedEvent("friday", "scheduled")
  const second = events.addSeedEvent("saturday", "scheduled")
  const app = await createTestApp({ events, permissions: fakePermissions({ event: new Set(["event.manage"]) }) })
  try {
    const startFirst = await app.inject({ method: "POST", url: `/dashboard/events/${first.id}/start` })
    const startSecond = await app.inject({ method: "POST", url: `/dashboard/events/${second.id}/start` })

    assert.equal(startFirst.statusCode, 200)
    assert.equal(startFirst.json().event.status, "active")
    assert.equal(startSecond.statusCode, 409)
    assert.equal(startSecond.json().error.code, "CONFLICT")
  } finally {
    await app.close()
  }
})

test("lifecycle unique running-event conflict maps to controlled 409", async () => {
  const db = fakeDbForLifecycleUniqueRunningEventConflict()
  const app = await createTestApp({
    events: createEventsService(db.db),
    permissions: fakePermissions({ event: new Set(["event.manage"]) })
  })
  try {
    const response = await app.inject({ method: "POST", url: `/dashboard/events/${EVENT_ID}/start` })
    const body = response.json()

    assert.equal(response.statusCode, 409)
    assert.equal(body.error.code, "VENUE_HAS_ACTIVE_EVENT")
    assert.equal(body.error.message, "Venue already has an active or paused event")
    assert.equal(JSON.stringify(body).includes("events_one_active_or_paused_per_venue_unique"), false)
  } finally {
    await app.close()
  }
})

test("lifecycle error mapper does not mask unknown database errors", () => {
  const unknown = { code: "23505", constraint: "some_other_unique_constraint" }

  assert.equal(mapEventLifecycleError(unknown), unknown)
})

test("patch event rejects a start date that makes the merged date range invalid", async () => {
  const db = fakeDbForPatchEvent(makeEventWithDates("2026-06-10T20:00:00.000Z", "2026-06-10T23:00:00.000Z"))
  const app = await createTestApp({
    events: createEventsService(db.db),
    permissions: fakePermissions({ event: new Set(["event.manage"]) })
  })
  try {
    const response = await app.inject({
      method: "PATCH",
      url: `/dashboard/events/${EVENT_ID}`,
      payload: { startsAt: "2026-06-11T00:00:00.000Z" }
    })

    assert.equal(response.statusCode, 400)
    assert.equal(response.json().error.code, "BAD_REQUEST")
    assert.equal(response.json().error.message, "endsAt must be after startsAt")
    assert.equal(db.updated, false)
  } finally {
    await app.close()
  }
})

test("patch event rejects an end date that makes the merged date range invalid", async () => {
  const db = fakeDbForPatchEvent(makeEventWithDates("2026-06-10T20:00:00.000Z", "2026-06-10T23:00:00.000Z"))
  const app = await createTestApp({
    events: createEventsService(db.db),
    permissions: fakePermissions({ event: new Set(["event.manage"]) })
  })
  try {
    const response = await app.inject({
      method: "PATCH",
      url: `/dashboard/events/${EVENT_ID}`,
      payload: { endsAt: "2026-06-10T19:00:00.000Z" }
    })

    assert.equal(response.statusCode, 400)
    assert.equal(response.json().error.code, "BAD_REQUEST")
    assert.equal(response.json().error.message, "endsAt must be after startsAt")
    assert.equal(db.updated, false)
  } finally {
    await app.close()
  }
})

test("patch event accepts a valid merged date range when both dates change", async () => {
  const db = fakeDbForPatchEvent(makeEventWithDates("2026-06-10T20:00:00.000Z", "2026-06-10T23:00:00.000Z"))
  const app = await createTestApp({
    events: createEventsService(db.db),
    permissions: fakePermissions({ event: new Set(["event.manage"]) })
  })
  try {
    const response = await app.inject({
      method: "PATCH",
      url: `/dashboard/events/${EVENT_ID}`,
      payload: {
        startsAt: "2026-06-11T20:00:00.000Z",
        endsAt: "2026-06-11T23:00:00.000Z"
      }
    })

    assert.equal(response.statusCode, 200)
    assert.equal(response.json().event.startsAt, "2026-06-11T20:00:00.000Z")
    assert.equal(response.json().event.endsAt, "2026-06-11T23:00:00.000Z")
    assert.equal(db.updated, true)
  } finally {
    await app.close()
  }
})

test("pause, resume and close follow allowed lifecycle transitions", async () => {
  const events = createInMemoryEventsService()
  const event = events.addSeedEvent("friday", "scheduled")
  const app = await createTestApp({ events, permissions: fakePermissions({ event: new Set(["event.manage"]) }) })
  try {
    assert.equal((await app.inject({ method: "POST", url: `/dashboard/events/${event.id}/start` })).json().event.status, "active")
    assert.equal((await app.inject({ method: "POST", url: `/dashboard/events/${event.id}/pause` })).json().event.status, "paused")
    assert.equal((await app.inject({ method: "POST", url: `/dashboard/events/${event.id}/resume` })).json().event.status, "active")
    assert.equal((await app.inject({ method: "POST", url: `/dashboard/events/${event.id}/close` })).json().event.status, "closed")
  } finally {
    await app.close()
  }
})

test("platform owner lifecycle support access uses explicit support override", async () => {
  const events = createInMemoryEventsService()
  const event = events.addSeedEvent("friday", "scheduled")
  const app = await createTestApp({ events, permissions: fakePermissions({ platformOwner: true }) })
  try {
    const response = await app.inject({ method: "POST", url: `/dashboard/events/${event.id}/start` })

    assert.equal(response.statusCode, 200)
    assert.equal(response.json().event.status, "active")
  } finally {
    await app.close()
  }
})

test("closed event cannot return to active", async () => {
  const events = createInMemoryEventsService()
  const event = events.addSeedEvent("friday", "closed")
  const app = await createTestApp({ events, permissions: fakePermissions({ event: new Set(["event.manage"]) }) })
  try {
    const response = await app.inject({ method: "POST", url: `/dashboard/events/${event.id}/start` })

    assert.equal(response.statusCode, 409)
    assert.match(response.json().error.message, /Cannot start/)
  } finally {
    await app.close()
  }
})

test("lifecycle writes queue_events entries", async () => {
  const events = createInMemoryEventsService()
  const event = events.addSeedEvent("friday", "scheduled")
  const app = await createTestApp({ events, permissions: fakePermissions({ event: new Set(["event.manage"]) }) })
  try {
    await app.inject({ method: "POST", url: `/dashboard/events/${event.id}/start` })
    await app.inject({ method: "POST", url: `/dashboard/events/${event.id}/pause` })

    assert.deepEqual(events.state.queueEvents.map((entry) => entry.type), ["event.started", "event.paused"])
  } finally {
    await app.close()
  }
})

test("removed organization member cannot be assigned as event staff", async () => {
  const events = createInMemoryEventsService({ activeMembers: new Set([USER_ID]) })
  const event = events.addSeedEvent("friday", "scheduled")
  const app = await createTestApp({ events, permissions: fakePermissions({ event: new Set(["event.manage"]) }) })
  try {
    const response = await app.inject({
      method: "POST",
      url: `/dashboard/events/${event.id}/staff`,
      payload: { userId: OTHER_USER_ID, role: "lead_host" }
    })

    assert.equal(response.statusCode, 400)
    assert.equal(response.json().error.code, "BAD_REQUEST")
  } finally {
    await app.close()
  }
})

test("staff assignment cannot be patched through another event URL", async () => {
  const events = createInMemoryEventsService()
  const firstEvent = events.addSeedEvent("friday", "scheduled")
  const secondEvent = events.addSeedEvent("saturday", "scheduled")
  const assignment = await events.assignStaff({
    eventId: secondEvent.id,
    userId: USER_ID,
    role: "queue_operator",
    assignedByUserId: USER_ID
  })
  const app = await createTestApp({ events, permissions: fakePermissions({ event: new Set(["event.manage"]) }) })
  try {
    const response = await app.inject({
      method: "PATCH",
      url: `/dashboard/events/${firstEvent.id}/staff/${assignment.id}`,
      payload: { role: "lead_host" }
    })

    assert.equal(response.statusCode, 404)
    assert.equal(response.json().error.code, "NOT_FOUND")
    assert.equal(events.state.staff.get(assignment.id)?.role, "queue_operator")
  } finally {
    await app.close()
  }
})

test("staff assignment can be patched through its own event URL", async () => {
  const events = createInMemoryEventsService()
  const event = events.addSeedEvent("friday", "scheduled")
  const assignment = await events.assignStaff({
    eventId: event.id,
    userId: USER_ID,
    role: "queue_operator",
    assignedByUserId: USER_ID
  })
  const app = await createTestApp({ events, permissions: fakePermissions({ event: new Set(["event.manage"]) }) })
  try {
    const response = await app.inject({
      method: "PATCH",
      url: `/dashboard/events/${event.id}/staff/${assignment.id}`,
      payload: { role: "lead_host" }
    })

    assert.equal(response.statusCode, 200)
    assert.equal(response.json().assignment.role, "lead_host")
  } finally {
    await app.close()
  }
})

test("public active-event returns null when venue has no active event", async () => {
  const events = createInMemoryEventsService()
  events.addSeedEvent("friday", "scheduled")
  const app = await createTestApp({ events })
  try {
    const response = await app.inject({ method: "GET", url: "/public/venues/klub-x/active-event" })
    const body = response.json()

    assert.equal(response.statusCode, 200)
    assert.equal(body.venue.id, VENUE_ID)
    assert.equal(body.venue.slug, "klub-x")
    assert.equal(body.venue.name, "Klub X")
    assert.equal(body.activeEvent, null)
  } finally {
    await app.close()
  }
})

test("public active-event returns active event", async () => {
  const events = createInMemoryEventsService()
  events.addSeedEvent("friday", "active")
  const app = await createTestApp({ events })
  try {
    const response = await app.inject({ method: "GET", url: "/public/venues/klub-x/active-event" })
    const body = response.json()

    assert.equal(response.statusCode, 200)
    assert.equal(body.venue.id, VENUE_ID)
    assert.equal(body.venue.slug, "klub-x")
    assert.equal(body.venue.name, "Klub X")
    assert.equal(typeof body.activeEvent.id, "string")
    assert.equal(body.activeEvent.slug, "friday")
    assert.equal(body.activeEvent.status, "active")
    assert.equal(body.activeEvent.publicJoinEnabled, true)
    assert.equal(body.activeEvent.publicQueueEnabled, true)
  } finally {
    await app.close()
  }
})

test("public active-event hides invisible or missing venue", async () => {
  const events = {
    ...createInMemoryEventsService(),
    getPublicActiveEventByVenueSlug: async () => null
  }
  const app = await createTestApp({ events })
  try {
    const response = await app.inject({ method: "GET", url: "/public/venues/hidden-venue/active-event" })
    const body = response.json()

    assert.equal(response.statusCode, 404)
    assert.equal(body.error.code, "NOT_FOUND")
    assert.equal(body.error.message, "Missing venue")
  } finally {
    await app.close()
  }
})

async function createTestApp(options: {
  user?: AuthenticatedDomainUser
  permissions?: PermissionService
  events?: EventsService & { state?: InMemoryEventsState; addSeedEvent?: (slug: string, status: string) => EventSummary }
} = {}) {
  return createApiApp({
    config: testConfig(),
    db: fakeDbResources(),
    auth: fakeAuth(),
    currentUserResolver: async () =>
      options.user ?? { id: USER_ID, email: "user@example.com", name: "User", status: "active" },
    permissions: options.permissions ?? fakePermissions(),
    services: {
      organizations: fakeOrganizationsService(),
      venues: fakeVenuesService(),
      events: options.events ?? createInMemoryEventsService(),
      accessRequests: fakeAccessRequestsService()
    },
    logger: false
  })
}

type InMemoryEventsState = {
  events: Map<string, EventSummary>
  staff: Map<string, EventStaffAssignmentSummary>
  queueEvents: Array<{ eventId: string; type: string }>
  organizationHasAccess: boolean
  activeMembers: Set<string>
}

function createInMemoryEventsService(options: { organizationHasAccess?: boolean; activeMembers?: Set<string> } = {}) {
  const state: InMemoryEventsState = {
    events: new Map(),
    staff: new Map(),
    queueEvents: [],
    organizationHasAccess: options.organizationHasAccess ?? true,
    activeMembers: options.activeMembers ?? new Set([USER_ID, OTHER_USER_ID])
  }

  const service: EventsService & {
    state: InMemoryEventsState
    addSeedEvent: (slug: string, status: string) => EventSummary
  } = {
    state,
    addSeedEvent(slug, status) {
      const event = makeEvent(`aaaaaaaa-aaaa-4aaa-8aaa-${String(state.events.size + 1).padStart(12, "0")}`, slug, status)
      state.events.set(event.id, event)
      return event
    },
    async listForUser() {
      return [...state.events.values()].map(toDashboardEvent)
    },
    async getById(eventId) {
      return state.events.get(eventId) ?? null
    },
    async getDashboardById(eventId) {
      const event = state.events.get(eventId)
      return event ? toDashboardEvent(event) : null
    },
    async createEvent(input) {
      if (!state.organizationHasAccess) {
        throw new ApiHttpError(403, "FORBIDDEN", "Organization does not have active access to this venue")
      }
      if ([...state.events.values()].some((event) => event.venueId === input.venueId && event.slug === input.slug)) {
        throw new ApiHttpError(409, "EVENT_SLUG_CONFLICT", "Event slug already exists for this venue")
      }
      const event = {
        ...makeEvent(`aaaaaaaa-aaaa-4aaa-8aaa-${String(state.events.size + 1).padStart(12, "0")}`, input.slug, input.status),
        startsAt: toDateOrNull(input.startsAt),
        endsAt: toDateOrNull(input.endsAt),
        operatedByOrganizationId: input.operatedByOrganizationId ?? ORG_ID,
        publicJoinEnabled: input.publicJoinEnabled ?? false,
        publicQueueEnabled: input.publicQueueEnabled ?? false,
        venueId: input.venueId
      }
      state.events.set(event.id, event)
      return event
    },
    async patchEvent(eventId, input) {
      const event = requiredEvent(state, eventId)
      const next: EventSummary = {
        ...event,
        ...input,
        startsAt: input.startsAt === undefined ? event.startsAt : toDateOrNull(input.startsAt),
        endsAt: input.endsAt === undefined ? event.endsAt : toDateOrNull(input.endsAt)
      }
      state.events.set(eventId, next)
      return next
    },
    async changeLifecycle(eventId, action, actorUserId) {
      const event = requiredEvent(state, eventId)
      const nextStatus = transition(event.status, action)
      if ((action === "start" || action === "resume") && hasOtherRunningEvent(state, event)) {
        throw new ApiHttpError(409, "CONFLICT", "Venue already has an active or paused event")
      }

      const next = { ...event, status: nextStatus }
      state.events.set(eventId, next)
      state.queueEvents.push({ eventId, type: lifecycleEventType(action) })
      assert.equal(actorUserId, USER_ID)
      return next
    },
    async listStaff(eventId) {
      return [...state.staff.values()].filter((assignment) => assignment.eventId === eventId)
    },
    async assignStaff(input) {
      const event = requiredEvent(state, input.eventId)
      if (!state.activeMembers.has(input.userId)) {
        throw new ApiHttpError(400, "BAD_REQUEST", "Assigned user must be an active member of the event organization")
      }
      const assignment = {
        id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(state.staff.size + 1).padStart(12, "0")}`,
        eventId: event.id,
        organizationId: event.operatedByOrganizationId,
        userId: input.userId,
        role: input.role,
        status: "active"
      }
      state.staff.set(assignment.id, assignment)
      return assignment
    },
    async patchStaffAssignment(eventId, assignmentId, input) {
      const assignment = state.staff.get(assignmentId)
      if (!assignment || assignment.eventId !== eventId) {
        throw new ApiHttpError(404, "NOT_FOUND", "Missing event staff assignment")
      }
      const next = { ...assignment, ...input }
      state.staff.set(assignmentId, next)
      return next
    },
    async removeStaffAssignment(eventId, assignmentId) {
      return this.patchStaffAssignment(eventId, assignmentId, { status: "removed" })
    },
    async organizationHasActiveVenueAccess() {
      return state.organizationHasAccess
    },
    async userIsActiveOrganizationMember(userId) {
      return state.activeMembers.has(userId)
    },
    async getPublicActiveEventByVenueSlug(venueSlug): Promise<PublicActiveEventLookup | null> {
      if (venueSlug !== "klub-x") {
        return null
      }
      return {
        venue: { id: VENUE_ID, slug: "klub-x", name: "Klub X", city: "Warszawa", timezone: "Europe/Warsaw" },
        activeEvent: [...state.events.values()].find((event) => event.status === "active" || event.status === "paused") ?? null
      }
    }
  }

  return service
}

function makeEvent(id: string, slug: string, status: string): EventSummary {
  return {
    id,
    venueId: VENUE_ID,
    operatedByOrganizationId: ORG_ID,
    createdByUserId: USER_ID,
    name: `Event ${slug}`,
    slug,
    status,
    startsAt: null,
    endsAt: null,
    publicJoinEnabled: true,
    publicQueueEnabled: true
  }
}

function makeEventWithDates(startsAt: string, endsAt: string): EventSummary {
  return {
    ...makeEvent(EVENT_ID, "date-patch", "scheduled"),
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt)
  }
}

function toDashboardEvent(event: EventSummary): DashboardEventSummary {
  return {
    ...event,
    venue: {
      id: VENUE_ID,
      name: "Demo Klub",
      slug: "demo-klub"
    },
    operatedByOrganization: {
      id: ORG_ID,
      name: "Poza Nuta Demo",
      slug: "poza-nuta-demo"
    }
  }
}

function eventPayload(slug: string, status = "draft") {
  return {
    venueId: VENUE_ID,
    operatedByOrganizationId: ORG_ID,
    name: `Event ${slug}`,
    slug,
    status
  }
}

function requiredEvent(state: InMemoryEventsState, eventId: string): EventSummary {
  const event = state.events.get(eventId)
  if (!event) {
    throw new ApiHttpError(404, "NOT_FOUND", "Missing event")
  }
  return event
}

function toDateOrNull(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined) {
    return null
  }
  return value instanceof Date ? value : new Date(value)
}

function hasOtherRunningEvent(state: InMemoryEventsState, event: EventSummary): boolean {
  return [...state.events.values()].some(
    (candidate) => candidate.id !== event.id && candidate.venueId === event.venueId && ["active", "paused"].includes(candidate.status)
  )
}

function transition(status: string, action: LifecycleAction): string {
  const allowed: Record<LifecycleAction, { from: string[]; to: string }> = {
    start: { from: ["draft", "scheduled"], to: "active" },
    pause: { from: ["active"], to: "paused" },
    resume: { from: ["paused"], to: "active" },
    close: { from: ["active", "paused"], to: "closed" },
    archive: { from: ["closed", "cancelled"], to: "archived" },
    cancel: { from: ["draft", "scheduled"], to: "cancelled" }
  }
  if (!allowed[action].from.includes(status)) {
    throw new ApiHttpError(409, "CONFLICT", `Cannot ${action} event from status ${status}`)
  }
  return allowed[action].to
}

function lifecycleEventType(action: LifecycleAction): string {
  return {
    start: "event.started",
    pause: "event.paused",
    resume: "event.resumed",
    close: "event.closed",
    archive: "event.archived",
    cancel: "event.cancelled"
  }[action]
}

function fakePermissions(options: {
  platform?: Set<string>
  venue?: Set<string>
  event?: Set<string>
  platformOwner?: boolean
} = {}): PermissionService {
  const hasPlatformSupportAccess = options.platformOwner === true
  return {
    hasPlatformPermission: async (_userId, permission) => Boolean(options.platform?.has(permission)),
    requirePlatformPermission: async (_userId, permission) => requireAllowed(options.platform?.has(permission)),
    hasOrganizationPermission: async () => false,
    requireOrganizationPermission: async () => requireAllowed(false),
    hasVenuePermission: async (_userId, _venueId, permission) => Boolean(options.venue?.has(permission)),
    requireVenuePermission: async (_userId, _venueId, permission) => requireAllowed(options.venue?.has(permission)),
    hasEventPermission: async (_userId, _eventId, permission) => Boolean(options.event?.has(permission)),
    requireEventPermission: async (_userId, _eventId, permission) => requireAllowed(options.event?.has(permission)),
    hasPlatformOwnerEventSupportAccess: async () => hasPlatformSupportAccess,
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

function fakeDbForLifecycleUniqueRunningEventConflict(): DbResources {
  const event = makeEvent(EVENT_ID, "race-event", "scheduled")
  let selectCount = 0
  return {
    db: {
      select: () => {
        selectCount += 1
        return queryChain(selectCount === 1 ? [event] : [])
      },
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => {
              throw { code: "23505", constraint: "events_one_active_or_paused_per_venue_unique" }
            }
          })
        })
      }),
      insert: () => ({
        values: () => undefined
      })
    } as unknown as DbResources["db"],
    pool: {
      end: async () => undefined
    } as unknown as DbResources["pool"]
  }
}

function fakeDbForPatchEvent(initial: EventSummary): DbResources & { updated: boolean } {
  let current = initial
  const resources: DbResources & { updated: boolean } = {
    updated: false,
    db: {
      select: () => queryChain([current]),
      update: () => ({
        set: (values: Partial<EventSummary>) => ({
          where: () => ({
            returning: () => {
              resources.updated = true
              current = { ...current, ...values }
              return [current]
            }
          })
        })
      })
    } as unknown as DbResources["db"],
    pool: {
      end: async () => undefined
    } as unknown as DbResources["pool"]
  }

  return resources
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
