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
const c18cMigrationSource = readFileSync("packages/db/drizzle/0011_aberrant_tyger_tiger.sql", "utf8")
const c20bMigrationSource = readFileSync("packages/db/drizzle/0012_nifty_shiva.sql", "utf8")
const schemaSource = readFileSync("packages/db/src/schema.ts", "utf8")
const ciSmokeSource = readFileSync("apps/api/scripts/ci-db-migration-smoke.ts", "utf8")
const snapshot = JSON.parse(readFileSync("packages/db/drizzle/meta/0010_snapshot.json", "utf8")) as Snapshot
const c18cSnapshot = JSON.parse(readFileSync("packages/db/drizzle/meta/0011_snapshot.json", "utf8")) as Snapshot
const c20bSnapshot = JSON.parse(readFileSync("packages/db/drizzle/meta/0012_snapshot.json", "utf8")) as Snapshot

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

const c18cCheckConstraints = [
  {
    table: "organizations",
    column: "type",
    name: "organizations_type_check",
    allowed: ["venue_owner", "karaoke_company", "agency", "independent_host", "platform"],
    invalid: "venue"
  },
  {
    table: "organizations",
    column: "status",
    name: "organizations_status_check",
    allowed: ["pending", "active", "suspended", "archived", "disabled"],
    invalid: "deleted"
  },
  {
    table: "song_sources",
    column: "status",
    name: "song_sources_status_check",
    allowed: ["active", "disabled"],
    invalid: "archived"
  },
  {
    table: "catalog_import_runs",
    column: "status",
    name: "catalog_import_runs_status_check",
    allowed: ["queued", "running", "succeeded", "failed", "cancelled"],
    invalid: "pending"
  },
  {
    table: "catalog_import_logs",
    column: "level",
    name: "catalog_import_logs_level_check",
    allowed: ["info", "warn", "error"],
    invalid: "debug"
  },
  {
    table: "jobs",
    column: "status",
    name: "jobs_status_check",
    allowed: ["queued", "running", "succeeded", "failed", "cancelled"],
    invalid: "pending"
  }
] as const

const eventVisibilityConstraint = {
  table: "events",
  column: "visibility",
  name: "events_visibility_check",
  allowed: ["public", "unlisted", "private"]
} as const

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

test("C18c secondary state CHECK constraints exist in schema and Drizzle snapshot", () => {
  for (const constraint of c18cCheckConstraints) {
    const snapshotCheck = c18cSnapshot.tables[`public.${constraint.table}`]?.checkConstraints?.[constraint.name]

    assert.match(schemaSource, new RegExp(`"${constraint.name}"`))
    assert.ok(snapshotCheck, `${constraint.name} should be present in the Drizzle snapshot`)
    assert.equal(snapshotCheck.name, constraint.name)
    assert.equal(snapshotCheck.value, checkExpression(constraint))
  }
})

test("C18c migration adds and validates secondary CHECK constraints", () => {
  for (const constraint of c18cCheckConstraints) {
    assert.ok(
      c18cMigrationSource.includes(
        `ALTER TABLE "${constraint.table}" ADD CONSTRAINT "${constraint.name}" CHECK (${checkExpression(
          constraint
        )}) NOT VALID;`
      ),
      `${constraint.name} should be added as NOT VALID`
    )
    assert.ok(
      c18cMigrationSource.includes(`ALTER TABLE "${constraint.table}" VALIDATE CONSTRAINT "${constraint.name}";`),
      `${constraint.name} should be validated after being added`
    )
  }
})

test("C18c representative invalid values are outside CHECK allow-lists", () => {
  for (const constraint of c18cCheckConstraints) {
    const invalidInsert = `insert into ${constraint.table} (${constraint.column}) values ('${constraint.invalid}')`
    assert.equal(
      (constraint.allowed as readonly string[]).includes(constraint.invalid),
      false,
      `${invalidInsert} should violate ${constraint.name}`
    )
    assert.doesNotMatch(checkExpression(constraint), new RegExp(`'${constraint.invalid}'`))
  }
})

test("C18c migration leaves explicitly excluded dynamic candidates out of scope", () => {
  assert.doesNotMatch(schemaSource, /pgEnum/)
  assert.doesNotMatch(c18cMigrationSource, /queue_events_.*_(type|actor_kind)_check/)
  assert.doesNotMatch(c18cMigrationSource, /jobs_type_check/)
  assert.doesNotMatch(c18cMigrationSource, /auth_accounts_provider_id_check/)
  assert.doesNotMatch(c18cMigrationSource, /song_sources_id_check/)
  assert.doesNotMatch(c18cMigrationSource, /song_source_tracks_availability_status_check/)
  assert.doesNotMatch(c18cMigrationSource, /payload.*check/i)
  assert.doesNotMatch(c18cMigrationSource, /provider.*check/i)
})

test("C20b event visibility uses a text CHECK constraint with a public default", () => {
  const snapshotCheck =
    c20bSnapshot.tables["public.events"]?.checkConstraints?.[eventVisibilityConstraint.name]

  assert.doesNotMatch(schemaSource, /pgEnum/)
  assert.match(schemaSource, /visibility: text\("visibility", \{ enum: eventVisibilities \}\)\.notNull\(\)\.default\("public"\)/)
  assert.match(schemaSource, /"events_visibility_check"/)
  assert.ok(snapshotCheck, "events_visibility_check should be present in the Drizzle snapshot")
  assert.equal(snapshotCheck.name, eventVisibilityConstraint.name)
  assert.equal(snapshotCheck.value, checkExpression(eventVisibilityConstraint))
  assert.match(
    c20bMigrationSource,
    /ADD COLUMN "visibility" text DEFAULT 'public' NOT NULL/
  )
  assert.match(
    c20bMigrationSource,
    new RegExp(
      `ADD CONSTRAINT "${eventVisibilityConstraint.name}" CHECK \\(${escapeRegExp(
        checkExpression(eventVisibilityConstraint)
      )}\\)`
    )
  )
  assert.equal((eventVisibilityConstraint.allowed as readonly string[]).includes("hidden"), false)
  assert.doesNotMatch(checkExpression(eventVisibilityConstraint), /'hidden'/)
})

test("CI DB smoke verifies CHECK constraints through pg_constraint", () => {
  assert.match(ciSmokeSource, /pg_constraint/)
  assert.match(ciSmokeSource, /convalidated = true/)
  assert.match(ciSmokeSource, /Expected CHECK constraints should exist and be validated/)
  for (const constraint of [...c18bCheckConstraints, ...c18cCheckConstraints]) {
    assert.match(ciSmokeSource, new RegExp(`"${constraint.name}"`))
  }
  assert.match(ciSmokeSource, new RegExp(`"${eventVisibilityConstraint.name}"`))
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
