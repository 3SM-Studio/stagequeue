import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { sql, eq } from "drizzle-orm"
import { createDbClient } from "../packages/db/src/client.ts"
import {
  events,
  organizations,
  organizationMemberships,
  queueEvents,
  songRequests,
  songSources,
  users,
  venueOrganizationAccess,
  venues
} from "../packages/db/src/schema.ts"
import { createEventsService } from "../apps/api/src/modules/events/service.ts"
import { createQueueService } from "../apps/api/src/modules/queue/service.ts"

const databaseUrl = process.env.DATABASE_URL?.trim()

if (!databaseUrl) {
  console.error("CI DB migration smoke failed: DATABASE_URL is required")
  process.exit(1)
}

const { db, pool } = createDbClient(databaseUrl)
const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`
const createdIds: {
  userId?: string
  organizationId?: string
  venueId?: string
  eventId?: string
  requestId?: string
  sourceId?: string
} = {}

try {
  const selectResult = await db.execute(sql`select 1 as ok`)
  assert.ok(selectResult, "SELECT 1 should return a result")
  console.log("CI DB smoke: connected")

  const seeded = await seedMinimalDomain(suffix)
  Object.assign(createdIds, seeded)
  console.log("CI DB smoke: seeded")

  const eventsService = createEventsService(db)
  const event = await eventsService.createEvent({
    venueId: seeded.venueId,
    operatedByOrganizationId: seeded.organizationId,
    createdByUserId: seeded.userId,
    name: `CI Smoke Event ${suffix}`,
    slug: `ci-smoke-event-${suffix}`,
    status: "active",
    publicJoinEnabled: true,
    publicQueueEnabled: true,
    joinAccessMode: "open"
  })
  createdIds.eventId = event.id
  assert.equal(event.status, "active")
  assert.equal(event.publicJoinEnabled, true)
  assert.equal(event.publicQueueEnabled, true)
  assert.equal(event.joinAccessMode, "open")
  console.log("CI DB smoke: event created")

  const queueService = createQueueService(db, undefined, {
    maxActivePerParticipant: 3,
    cooldownSeconds: 1
  })
  const request = await queueService.submitPublicRequest(event.id, {
    singerName: "CI Smoke Singer",
    participantTokenHash: `ci-smoke-participant-${suffix}`,
    sourceId: seeded.sourceId,
    sourceTrackId: `ci-track-${suffix}`,
    songTitle: "CI Smoke Song",
    songArtist: "CI Smoke Artist",
    songUrl: "https://example.invalid/ci-smoke-song"
  })
  createdIds.requestId = request.id
  assert.equal(request.status, "pending")
  assert.equal(request.eventId, event.id)
  assert.equal(request.venueId, seeded.venueId)
  console.log("CI DB smoke: request submitted")

  const publicQueue = await queueService.getPublicQueue(event.id)
  assert.equal(publicQueue.event?.publicId, event.publicId)
  assert.equal(publicQueue.event?.status, "active")
  assert.equal(publicQueue.submissions.enabled, true)
  assert.equal(publicQueue.queue.length, 0)

  const operatorQueue = await queueService.getOperatorQueue(event.id)
  assert.equal(operatorQueue.pending.length, 1)
  assert.equal(operatorQueue.pending[0].id, request.id)
  assert.equal(operatorQueue.pending[0].songTitle, "CI Smoke Song")

  const requestEvents = await db
    .select({ id: queueEvents.id })
    .from(queueEvents)
    .where(eq(queueEvents.requestId, request.id))
  assert.equal(requestEvents.length, 1)
  console.log("CI DB smoke: queue verified")
} catch (error) {
  console.error("CI DB migration smoke failed")
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  await cleanupCreatedRows()
  await pool.end()
}

async function seedMinimalDomain(uniqueSuffix: string): Promise<{
  userId: string
  organizationId: string
  venueId: string
  sourceId: string
}> {
  const [user] = await db
    .insert(users)
    .values({
      email: `ci-smoke-${uniqueSuffix}@example.invalid`,
      name: "CI Smoke User",
      status: "active"
    })
    .returning({ id: users.id })
  assert.ok(user, "user should be created")

  const [organization] = await db
    .insert(organizations)
    .values({
      slug: `ci-smoke-org-${uniqueSuffix}`,
      name: "CI Smoke Organization",
      type: "karaoke_company",
      status: "active"
    })
    .returning({ id: organizations.id })
  assert.ok(organization, "organization should be created")

  await db.insert(organizationMemberships).values({
    organizationId: organization.id,
    userId: user.id,
    role: "owner",
    status: "active"
  })

  const [venue] = await db
    .insert(venues)
    .values({
      slug: `ci-smoke-venue-${uniqueSuffix}`,
      name: "CI Smoke Venue",
      city: "Warszawa",
      status: "active",
      verificationStatus: "verified",
      claimedByOrganizationId: organization.id,
      createdByUserId: user.id
    })
    .returning({ id: venues.id })
  assert.ok(venue, "venue should be created")

  await db.insert(venueOrganizationAccess).values({
    venueId: venue.id,
    organizationId: organization.id,
    role: "event_creator",
    status: "active",
    requestedByUserId: user.id,
    grantedByUserId: user.id
  })

  const sourceId = `ci-smoke-source-${uniqueSuffix}`
  await db.insert(songSources).values({
    id: sourceId,
    name: "CI Smoke Source",
    status: "active"
  })

  return {
    userId: user.id,
    organizationId: organization.id,
    venueId: venue.id,
    sourceId
  }
}

async function cleanupCreatedRows(): Promise<void> {
  if (createdIds.eventId) {
    await db.delete(events).where(eq(events.id, createdIds.eventId))
  }
  if (createdIds.requestId) {
    await db.delete(queueEvents).where(eq(queueEvents.requestId, createdIds.requestId))
    await db.delete(songRequests).where(eq(songRequests.id, createdIds.requestId))
  }
  if (createdIds.venueId) {
    await db.delete(venues).where(eq(venues.id, createdIds.venueId))
  }
  if (createdIds.sourceId) {
    await db.delete(songSources).where(eq(songSources.id, createdIds.sourceId))
  }
  if (createdIds.organizationId) {
    await db.delete(organizations).where(eq(organizations.id, createdIds.organizationId))
  }
  if (createdIds.userId) {
    await db.delete(users).where(eq(users.id, createdIds.userId))
  }
}
