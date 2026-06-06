import { createHash } from "node:crypto"
import { pathToFileURL } from "node:url"
import { and, eq, inArray, sql } from "drizzle-orm"
import { createDbClient, type DbClient } from "./client.ts"
import {
  events,
  organizations,
  queueEvents,
  songRequests,
  songSources,
  venues,
  venueOrganizationAccess
} from "./schema.ts"

const localDatabaseUrl = "postgres://poza_nuta:poza_nuta@localhost:5432/poza_nuta"

export type DemoSeedData = ReturnType<typeof buildDemoSeedData>

type EntityId = {
  id: string
}

export type DemoEventRecord = EntityId & {
  slug: string
  status: string
}

type DemoOrganizationInput = {
  slug: string
  name: string
  type: string
  status: string
}

type DemoVenueInput = {
  slug: string
  name: string
  city: string
  country: string
  timezone: string
  status: string
  verificationStatus: string
  claimedByOrganizationId: string
}

type DemoVenueAccessInput = {
  venueId: string
  organizationId: string
  role: string
  status: string
}

type DemoEventInput = {
  venueId: string
  operatedByOrganizationId: string
  publicId: string
  slug: string
  name: string
  status: string
  publicJoinEnabled: boolean
  publicQueueEnabled: boolean
}

type DemoSongRequestInput = {
  venueId: string
  eventId: string
  singerName: string
  displayName: string
  participantTokenHash: string
  sourceId: string
  sourceTrackId: string
  songTitle: string
  songArtist: string
  songUrl: string
  note: string
  status: string
  position: number | null
}

type DemoQueueEventInput = {
  venueId: string
  eventId: string
  requestId: string | null
  actorOrganizationId: string
  actorKind: "participant" | "operator" | "system"
  type: string
  payload: Record<string, unknown>
}

export type DemoSeedRepository = {
  upsertCatalogSources(): Promise<void>
  upsertOrganization(input: DemoOrganizationInput): Promise<EntityId>
  upsertVenue(input: DemoVenueInput): Promise<EntityId>
  upsertVenueAccess(input: DemoVenueAccessInput): Promise<void>
  findEventByVenueSlug(venueId: string, slug: string): Promise<DemoEventRecord | null>
  findRunningEventForVenue(venueId: string): Promise<DemoEventRecord | null>
  insertEvent(input: DemoEventInput): Promise<DemoEventRecord>
  updateEvent(eventId: string, input: Partial<DemoEventInput> & { status?: string }): Promise<DemoEventRecord>
  resetQueue(eventId: string): Promise<void>
  insertSongRequest(input: DemoSongRequestInput): Promise<EntityId>
  insertQueueEvent(input: DemoQueueEventInput): Promise<void>
}

export type DemoSeedResult = {
  organizationId: string
  venueId: string
  eventId: string
  requestCount: number
}

export function buildDemoSeedData() {
  return {
    organization: {
      slug: "poza-nuta-demo",
      name: "Poza Nutą Demo",
      type: "karaoke_company",
      status: "active"
    },
    venue: {
      slug: "demo-klub",
      name: "Demo Klub",
      city: "Warszawa",
      country: "PL",
      timezone: "Europe/Warsaw",
      status: "active",
      verificationStatus: "verified"
    },
    access: {
      role: "owner",
      status: "active"
    },
    event: {
      publicId: "demoKaraoke1",
      slug: "demo-karaoke",
      name: "Demo Karaoke Night",
      status: "active",
      publicJoinEnabled: true,
      publicQueueEnabled: true
    },
    requests: [
      {
        singerName: "Alicja",
        sourceId: "ising",
        sourceTrackId: "demo-dancing-queen",
        songTitle: "Dancing Queen",
        songArtist: "ABBA",
        songUrl: "https://ising.pl/abba-dancing-queen-piosenka",
        status: "now",
        position: null
      },
      {
        singerName: "Bartek",
        sourceId: "ising",
        sourceTrackId: "demo-krolowa-lez",
        songTitle: "Królowa Łez",
        songArtist: "Agnieszka Chylińska",
        songUrl: "https://ising.pl/agnieszka-chylinska-krolowa-lez-piosenka",
        status: "approved",
        position: 1
      },
      {
        singerName: "Celina",
        sourceId: "ising",
        sourceTrackId: "demo-chodz-pomaluj-moj-swiat",
        songTitle: "Chodź, pomaluj mój świat",
        songArtist: "2 plus 1",
        songUrl: "https://ising.pl/2-plus-1-chodz-pomaluj-moj-swiat-piosenka",
        status: "approved",
        position: 2
      },
      {
        singerName: "Dawid",
        sourceId: "ising",
        sourceTrackId: "demo-bye-bye-bye",
        songTitle: "Bye Bye Bye",
        songArtist: "NSYNC",
        songUrl: "https://ising.pl/nsync-bye-bye-bye-piosenka",
        status: "pending",
        position: null
      },
      {
        singerName: "Ewa",
        sourceId: "ising",
        sourceTrackId: "demo-waterloo",
        songTitle: "Waterloo",
        songArtist: "ABBA",
        songUrl: "https://ising.pl/abba-waterloo-piosenka",
        status: "done",
        position: null
      }
    ]
  } as const
}

export async function seedDemoWithRepository(
  repository: DemoSeedRepository,
  data: DemoSeedData = buildDemoSeedData()
): Promise<DemoSeedResult> {
  await repository.upsertCatalogSources()

  const organization = await repository.upsertOrganization(data.organization)
  const venue = await repository.upsertVenue({
    ...data.venue,
    claimedByOrganizationId: organization.id
  })
  await repository.upsertVenueAccess({
    venueId: venue.id,
    organizationId: organization.id,
    role: data.access.role,
    status: data.access.status
  })

  const demoEvent = await repository.findEventByVenueSlug(venue.id, data.event.slug)
  const runningEvent = await repository.findRunningEventForVenue(venue.id)
  if (runningEvent && runningEvent.id !== demoEvent?.id) {
    await repository.updateEvent(runningEvent.id, { status: "closed" })
  }

  const event =
    demoEvent === null
      ? await repository.insertEvent({
          venueId: venue.id,
          operatedByOrganizationId: organization.id,
          ...data.event
        })
      : await repository.updateEvent(demoEvent.id, {
          venueId: venue.id,
          operatedByOrganizationId: organization.id,
          ...data.event
        })

  await repository.resetQueue(event.id)
  await repository.insertQueueEvent({
    venueId: venue.id,
    eventId: event.id,
    requestId: null,
    actorOrganizationId: organization.id,
    actorKind: "system",
    type: "event.started",
    payload: { seed: "demo", status: event.status }
  })

  const insertedRequests = []
  for (const request of data.requests) {
    const inserted = await repository.insertSongRequest({
      venueId: venue.id,
      eventId: event.id,
      singerName: request.singerName,
      displayName: request.singerName,
      participantTokenHash: demoParticipantTokenHash(request.singerName),
      sourceId: request.sourceId,
      sourceTrackId: request.sourceTrackId,
      songTitle: request.songTitle,
      songArtist: request.songArtist,
      songUrl: request.songUrl,
      note: `demo-seed:${request.status}`,
      status: request.status,
      position: request.position
    })
    insertedRequests.push(inserted)
    await repository.insertQueueEvent({
      venueId: venue.id,
      eventId: event.id,
      requestId: inserted.id,
      actorOrganizationId: organization.id,
      actorKind: "participant",
      type: "request.created",
      payload: { seed: "demo", status: request.status }
    })
    if (request.status === "approved" || request.status === "now") {
      await repository.insertQueueEvent({
        venueId: venue.id,
        eventId: event.id,
        requestId: inserted.id,
        actorOrganizationId: organization.id,
        actorKind: "operator",
        type: "request.approved",
        payload: { seed: "demo", position: request.position }
      })
    }
    if (request.status === "now") {
      await repository.insertQueueEvent({
        venueId: venue.id,
        eventId: event.id,
        requestId: inserted.id,
        actorOrganizationId: organization.id,
        actorKind: "operator",
        type: "request.started",
        payload: { seed: "demo" }
      })
    }
    if (request.status === "done") {
      await repository.insertQueueEvent({
        venueId: venue.id,
        eventId: event.id,
        requestId: inserted.id,
        actorOrganizationId: organization.id,
        actorKind: "operator",
        type: "request.done",
        payload: { seed: "demo" }
      })
    }
  }

  return {
    organizationId: organization.id,
    venueId: venue.id,
    eventId: event.id,
    requestCount: insertedRequests.length
  }
}

export function createDrizzleDemoSeedRepository(db: DbClient): DemoSeedRepository {
  return {
    async upsertCatalogSources() {
      await db
        .insert(songSources)
        .values([
          { id: "ising", name: "iSing", status: "active" },
          { id: "karafun", name: "KaraFun", status: "active" }
        ])
        .onConflictDoUpdate({
          target: songSources.id,
          set: {
            name: sql`excluded.name`,
            status: sql`excluded.status`,
            updatedAt: sql`now()`
          }
        })
    },
    async upsertOrganization(input) {
      const [row] = await db
        .insert(organizations)
        .values(input)
        .onConflictDoUpdate({
          target: organizations.slug,
          set: {
            name: sql`excluded.name`,
            type: sql`excluded.type`,
            status: sql`excluded.status`,
            updatedAt: sql`now()`
          }
        })
        .returning({ id: organizations.id })

      return requireRow(row, "organization")
    },
    async upsertVenue(input) {
      const [row] = await db
        .insert(venues)
        .values(input)
        .onConflictDoUpdate({
          target: venues.slug,
          set: {
            name: sql`excluded.name`,
            city: sql`excluded.city`,
            country: sql`excluded.country`,
            timezone: sql`excluded.timezone`,
            status: sql`excluded.status`,
            verificationStatus: sql`excluded.verification_status`,
            claimedByOrganizationId: sql`excluded.claimed_by_organization_id`,
            updatedAt: sql`now()`
          }
        })
        .returning({ id: venues.id })

      return requireRow(row, "venue")
    },
    async upsertVenueAccess(input) {
      await db
        .insert(venueOrganizationAccess)
        .values(input)
        .onConflictDoUpdate({
          target: [
            venueOrganizationAccess.venueId,
            venueOrganizationAccess.organizationId,
            venueOrganizationAccess.role
          ],
          set: {
            status: sql`excluded.status`,
            updatedAt: sql`now()`
          }
        })
    },
    async findEventByVenueSlug(venueId, slug) {
      const [row] = await db
        .select({ id: events.id, slug: events.slug, status: events.status })
        .from(events)
        .where(and(eq(events.venueId, venueId), eq(events.slug, slug)))
        .limit(1)

      return row ?? null
    },
    async findRunningEventForVenue(venueId) {
      const [row] = await db
        .select({ id: events.id, slug: events.slug, status: events.status })
        .from(events)
        .where(and(eq(events.venueId, venueId), inArray(events.status, ["active", "paused"])))
        .limit(1)

      return row ?? null
    },
    async insertEvent(input) {
      const [row] = await db
        .insert(events)
        .values(input)
        .returning({ id: events.id, slug: events.slug, status: events.status })

      return requireRow(row, "event")
    },
    async updateEvent(eventId, input) {
      const [row] = await db
        .update(events)
        .set({ ...input, updatedAt: sql`now()` })
        .where(eq(events.id, eventId))
        .returning({ id: events.id, slug: events.slug, status: events.status })

      return requireRow(row, "event")
    },
    async resetQueue(eventId) {
      await db.delete(queueEvents).where(eq(queueEvents.eventId, eventId))
      await db.delete(songRequests).where(eq(songRequests.eventId, eventId))
    },
    async insertSongRequest(input) {
      const [row] = await db.insert(songRequests).values(input).returning({ id: songRequests.id })

      return requireRow(row, "song request")
    },
    async insertQueueEvent(input) {
      await db.insert(queueEvents).values(input)
    }
  }
}

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) {
    throw new Error(`Failed to seed demo ${label}`)
  }

  return row
}

function demoParticipantTokenHash(value: string): string {
  return createHash("sha256").update(`poza-nuta-demo:${value}`).digest("hex")
}

async function run(): Promise<void> {
  const { db, pool } = createDbClient(process.env.DATABASE_URL ?? localDatabaseUrl)
  try {
    const result = await seedDemoWithRepository(createDrizzleDemoSeedRepository(db))
    console.log("Seeded demo data")
    console.log(`Organization: poza-nuta-demo (${result.organizationId})`)
    console.log(`Venue: demo-klub (${result.venueId})`)
    console.log(`Event: demo-karaoke (${result.eventId})`)
    console.log(`Song requests: ${result.requestCount}`)
  } finally {
    await pool.end()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run()
}
