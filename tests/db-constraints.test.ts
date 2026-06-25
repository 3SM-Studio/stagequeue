import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

type Snapshot = {
  tables: Record<
    string,
    {
      checkConstraints?: Record<
        string,
        {
          name: string
          value: string
        }
      >
    }
  >
}

const migrationSource = readFileSync("packages/db/drizzle/0010_even_prodigy.sql", "utf8")
const schemaSource = readFileSync("packages/db/src/schema.ts", "utf8")
const ciSmokeSource = readFileSync("apps/api/scripts/ci-db-migration-smoke.ts", "utf8")
const snapshot = JSON.parse(readFileSync("packages/db/drizzle/meta/0010_snapshot.json", "utf8")) as Snapshot

const c18bCheckConstraints = [
  {
    table: "users",
    column: "status",
    name: "users_status_check",
    allowed: ["pending", "active", "disabled"],
    invalid: "deleted"
  },
  {
    table: "platform_memberships",
    column: "role",
    name: "platform_memberships_role_check",
    allowed: ["platform_owner", "platform_admin"],
    invalid: "owner"
  },
  {
    table: "platform_memberships",
    column: "status",
    name: "platform_memberships_status_check",
    allowed: ["active", "disabled"],
    invalid: "pending"
  },
  {
    table: "organization_memberships",
    column: "role",
    name: "organization_memberships_role_check",
    allowed: ["owner", "admin", "booking_manager", "host", "operator", "viewer"],
    invalid: "platform_owner"
  },
  {
    table: "organization_memberships",
    column: "status",
    name: "organization_memberships_status_check",
    allowed: ["invited", "active", "suspended", "removed", "disabled"],
    invalid: "revoked"
  },
  {
    table: "venues",
    column: "status",
    name: "venues_status_check",
    allowed: ["draft", "active", "archived"],
    invalid: "closed"
  },
  {
    table: "venues",
    column: "verification_status",
    name: "venues_verification_status_check",
    allowed: ["unclaimed", "pending", "verified", "rejected"],
    invalid: "claimed"
  },
  {
    table: "venue_organization_access",
    column: "role",
    name: "venue_organization_access_role_check",
    allowed: ["owner", "manager", "event_creator", "karaoke_operator", "viewer"],
    invalid: "operator"
  },
  {
    table: "venue_organization_access",
    column: "status",
    name: "venue_organization_access_status_check",
    allowed: ["pending", "active", "revoked", "expired", "rejected"],
    invalid: "removed"
  },
  {
    table: "events",
    column: "status",
    name: "events_status_check",
    allowed: ["draft", "scheduled", "active", "paused", "closed", "archived", "cancelled"],
    invalid: "started"
  },
  {
    table: "event_invites",
    column: "status",
    name: "event_invites_status_check",
    allowed: ["active", "revoked"],
    invalid: "expired"
  },
  {
    table: "event_staff_assignments",
    column: "role",
    name: "event_staff_assignments_role_check",
    allowed: ["lead_host", "host", "queue_operator", "viewer"],
    invalid: "operator"
  },
  {
    table: "event_staff_assignments",
    column: "status",
    name: "event_staff_assignments_status_check",
    allowed: ["active", "removed"],
    invalid: "revoked"
  },
  {
    table: "song_requests",
    column: "status",
    name: "song_requests_status_check",
    allowed: ["pending", "approved", "now", "done", "skipped", "rejected"],
    invalid: "started"
  },
  {
    table: "access_requests",
    column: "status",
    name: "access_requests_status_check",
    allowed: ["pending", "approved", "rejected"],
    invalid: "expired"
  },
  {
    table: "access_requests",
    column: "venue_access_role",
    name: "access_requests_venue_access_role_check",
    allowed: ["owner", "manager", "event_creator", "karaoke_operator", "viewer"],
    invalid: "operator"
  }
] as const

test("C18b core state CHECK constraints exist in schema and Drizzle snapshot", () => {
  for (const constraint of c18bCheckConstraints) {
    const snapshotCheck = snapshot.tables[`public.${constraint.table}`]?.checkConstraints?.[constraint.name]

    assert.match(schemaSource, new RegExp(`"${constraint.name}"`))
    assert.ok(snapshotCheck, `${constraint.name} should be present in the Drizzle snapshot`)
    assert.equal(snapshotCheck.name, constraint.name)
    assert.equal(snapshotCheck.value, checkExpression(constraint))
  }
})

test("C18b migration adds and validates CHECK constraints for existing tables", () => {
  for (const constraint of c18bCheckConstraints) {
    assert.ok(
      migrationSource.includes(
        `ALTER TABLE "${constraint.table}" ADD CONSTRAINT "${constraint.name}" CHECK (${checkExpression(
          constraint
        )}) NOT VALID;`
      ),
      `${constraint.name} should be added as NOT VALID`
    )
    assert.ok(
      migrationSource.includes(`ALTER TABLE "${constraint.table}" VALIDATE CONSTRAINT "${constraint.name}";`),
      `${constraint.name} should be validated after being added`
    )
  }
})

test("C18b representative invalid values are outside CHECK allow-lists", () => {
  const minimumNegativeCases = [
    "events_status_check",
    "song_requests_status_check",
    "organization_memberships_role_check",
    "venue_organization_access_role_check",
    "venues_verification_status_check",
    "access_requests_status_check"
  ]

  for (const constraintName of minimumNegativeCases) {
    const constraint = c18bCheckConstraints.find(({ name }) => name === constraintName)
    assert.ok(constraint, `${constraintName} should be covered by C18b`)

    const invalidInsert = `insert into ${constraint.table} (${constraint.column}) values ('${constraint.invalid}')`
    assert.equal(
      (constraint.allowed as readonly string[]).includes(constraint.invalid),
      false,
      `${invalidInsert} should violate ${constraint.name}`
    )
    assert.doesNotMatch(checkExpression(constraint), new RegExp(`'${constraint.invalid}'`))
  }
})

test("C18b migration leaves explicitly deferred enum candidates out of scope", () => {
  assert.doesNotMatch(schemaSource, /pgEnum/)
  assert.doesNotMatch(migrationSource, /queue_events_.*_(type|actor_kind)_check/)
  assert.doesNotMatch(migrationSource, /organizations_.*_(type|status)_check/)
  assert.doesNotMatch(migrationSource, /jobs_.*_status_check/)
  assert.doesNotMatch(migrationSource, /catalog_.*_(status|level)_check/)
  assert.doesNotMatch(migrationSource, /song_sources_.*_status_check/)
  assert.doesNotMatch(migrationSource, /payload.*check/i)
  assert.doesNotMatch(migrationSource, /(provider|source).*check/i)
})

test("CI DB smoke verifies C18b CHECK constraints through pg_constraint", () => {
  assert.match(ciSmokeSource, /pg_constraint/)
  assert.match(ciSmokeSource, /convalidated = true/)
  assert.match(ciSmokeSource, /C18b CHECK constraints should exist and be validated/)
})

function checkExpression(constraint: {
  table: string
  column: string
  allowed: readonly string[]
}): string {
  return `"${constraint.table}"."${constraint.column}" in (${constraint.allowed
    .map((value) => `'${value}'`)
    .join(", ")})`
}
