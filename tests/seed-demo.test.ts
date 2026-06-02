import assert from "node:assert/strict"
import test from "node:test"
import {
  buildDemoSeedData,
  seedDemoWithRepository,
  type DemoEventRecord,
  type DemoSeedRepository
} from "../packages/db/src/seedDemo.ts"

test("demo seed data describes the public QA happy path", () => {
  const data = buildDemoSeedData()

  assert.equal(data.organization.slug, "poza-nuta-demo")
  assert.equal(data.organization.status, "active")
  assert.equal(data.venue.slug, "demo-klub")
  assert.equal(data.venue.status, "active")
  assert.equal(data.venue.verificationStatus, "verified")
  assert.equal(data.event.slug, "demo-karaoke")
  assert.equal(data.event.status, "active")
  assert.equal(data.event.publicJoinEnabled, true)
  assert.equal(data.event.publicQueueEnabled, true)
  assert.deepEqual(
    data.requests.map((request) => [request.singerName, request.status, request.position]),
    [
      ["Alicja", "now", null],
      ["Bartek", "approved", 1],
      ["Celina", "approved", 2],
      ["Dawid", "pending", null],
      ["Ewa", "done", null]
    ]
  )
})

test("demo seed repository orchestration is idempotent", async () => {
  const repository = createInMemoryDemoSeedRepository()
  const first = await seedDemoWithRepository(repository)
  const second = await seedDemoWithRepository(repository)

  assert.equal(first.organizationId, second.organizationId)
  assert.equal(first.venueId, second.venueId)
  assert.equal(first.eventId, second.eventId)
  assert.equal(first.requestCount, 5)
  assert.equal(second.requestCount, 5)
  assert.equal(repository.state.organizations.size, 1)
  assert.equal(repository.state.venues.size, 1)
  assert.equal(repository.state.access.size, 1)
  assert.equal(repository.state.events.length, 1)
  assert.equal(repository.state.events[0]?.slug, "demo-karaoke")
  assert.equal(repository.state.events[0]?.status, "active")
  assert.equal(repository.state.requests.length, 5)
  assert.equal(repository.state.queueEvents.length, 11)
})

function createInMemoryDemoSeedRepository() {
  const state = {
    organizations: new Map<string, { id: string; slug: string; name: string; type: string; status: string }>(),
    venues: new Map<
      string,
      {
        id: string
        slug: string
        name: string
        city: string
        country: string
        timezone: string
        status: string
        verificationStatus: string
        claimedByOrganizationId: string
      }
    >(),
    access: new Map<string, { venueId: string; organizationId: string; role: string; status: string }>(),
    events: [] as Array<
      DemoEventRecord & {
        venueId: string
        operatedByOrganizationId: string
        name: string
        publicJoinEnabled: boolean
        publicQueueEnabled: boolean
      }
    >,
    requests: [] as Array<{ id: string; eventId: string; status: string; position: number | null; singerName: string }>,
    queueEvents: [] as Array<{ eventId: string; requestId: string | null; type: string }>
  }

  const repository: DemoSeedRepository & { state: typeof state } = {
    state,
    async upsertCatalogSources() {
      return undefined
    },
    async upsertOrganization(input) {
      const existing = state.organizations.get(input.slug)
      if (existing) {
        Object.assign(existing, input)
        return { id: existing.id }
      }
      const row = { id: `org-${state.organizations.size + 1}`, ...input }
      state.organizations.set(input.slug, row)
      return { id: row.id }
    },
    async upsertVenue(input) {
      const existing = state.venues.get(input.slug)
      if (existing) {
        Object.assign(existing, input)
        return { id: existing.id }
      }
      const row = { id: `venue-${state.venues.size + 1}`, ...input }
      state.venues.set(input.slug, row)
      return { id: row.id }
    },
    async upsertVenueAccess(input) {
      state.access.set(`${input.venueId}:${input.organizationId}:${input.role}`, input)
    },
    async findEventByVenueSlug(venueId, slug) {
      return state.events.find((event) => event.venueId === venueId && event.slug === slug) ?? null
    },
    async findRunningEventForVenue(venueId) {
      return state.events.find((event) => event.venueId === venueId && ["active", "paused"].includes(event.status)) ?? null
    },
    async insertEvent(input) {
      const row = { id: `event-${state.events.length + 1}`, ...input }
      state.events.push(row)
      return row
    },
    async updateEvent(eventId, input) {
      const event = state.events.find((candidate) => candidate.id === eventId)
      if (!event) {
        throw new Error(`Missing event: ${eventId}`)
      }
      Object.assign(event, input)
      return event
    },
    async resetQueue(eventId) {
      state.queueEvents = state.queueEvents.filter((event) => event.eventId !== eventId)
      state.requests = state.requests.filter((request) => request.eventId !== eventId)
    },
    async insertSongRequest(input) {
      const row = {
        id: `request-${state.requests.length + 1}`,
        eventId: input.eventId,
        status: input.status,
        position: input.position,
        singerName: input.singerName
      }
      state.requests.push(row)
      return { id: row.id }
    },
    async insertQueueEvent(input) {
      state.queueEvents.push({
        eventId: input.eventId,
        requestId: input.requestId,
        type: input.type
      })
    }
  }

  return repository
}
