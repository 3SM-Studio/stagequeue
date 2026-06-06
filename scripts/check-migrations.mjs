import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const drizzleDir = join(process.cwd(), "packages", "db", "drizzle")
const metaDir = join(drizzleDir, "meta")
const journalPath = join(metaDir, "_journal.json")

const errors = []

function main() {
  assertExists(drizzleDir, "Missing Drizzle migrations directory")
  assertExists(metaDir, "Missing Drizzle meta directory")
  assertExists(journalPath, "Missing Drizzle journal")
  failIfNeeded()

  const migrationFiles = readdirSync(drizzleDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
  const snapshotFiles = readdirSync(metaDir)
    .filter((file) => /^\d{4}_snapshot\.json$/.test(file))
    .sort()
  const journal = readJson(journalPath, "Invalid Drizzle journal JSON")
  const entries = Array.isArray(journal.entries) ? journal.entries : []

  if (entries.length === 0) {
    errors.push("Drizzle journal has no entries")
  }

  const migrationTags = migrationFiles.map((file) => file.slice(0, -".sql".length))
  const snapshotPrefixes = snapshotFiles.map((file) => file.slice(0, 4))
  const journalTags = entries.map((entry) => readJournalTag(entry))

  assertSequentialMigrations(migrationFiles)
  assertJournalEntries(entries)
  assertNoDuplicates(migrationTags, "Duplicate SQL migration tag")
  assertNoDuplicates(snapshotPrefixes, "Duplicate Drizzle snapshot prefix")
  assertNoDuplicates(journalTags, "Duplicate Drizzle journal tag")

  for (const tag of migrationTags) {
    if (!journalTags.includes(tag)) {
      errors.push(`Migration ${tag}.sql is missing from Drizzle journal`)
    }
    if (!snapshotPrefixes.includes(tag.slice(0, 4))) {
      errors.push(`Migration ${tag}.sql is missing matching ${tag.slice(0, 4)}_snapshot.json`)
    }
  }

  for (const tag of journalTags) {
    if (!migrationTags.includes(tag)) {
      errors.push(`Drizzle journal entry ${tag} has no matching SQL migration`)
    }
  }

  for (const prefix of snapshotPrefixes) {
    if (!migrationTags.some((tag) => tag.startsWith(`${prefix}_`))) {
      errors.push(`Snapshot ${prefix}_snapshot.json has no matching SQL migration`)
    }
  }

  for (const snapshotFile of snapshotFiles) {
    readJson(join(metaDir, snapshotFile), `Invalid Drizzle snapshot JSON: ${snapshotFile}`)
  }

  if (errors.length > 0) {
    failIfNeeded()
  }

  console.log(`Migration integrity check passed (${migrationFiles.length} migrations checked)`)
}

function failIfNeeded() {
  if (errors.length === 0) {
    return
  }

  console.error("Migration integrity check failed:")
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

function assertExists(path, message) {
  if (!existsSync(path)) {
    errors.push(message)
  }
}

function readJson(path, message) {
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch {
    errors.push(message)
    return {}
  }
}

function assertSequentialMigrations(migrationFiles) {
  for (const [index, file] of migrationFiles.entries()) {
    if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(file)) {
      errors.push(`Invalid migration filename: ${file}`)
      continue
    }

    const expectedPrefix = String(index).padStart(4, "0")
    if (!file.startsWith(`${expectedPrefix}_`)) {
      errors.push(`Migration numbering is not sequential: expected ${expectedPrefix}_*.sql, got ${file}`)
    }
  }
}

function assertJournalEntries(entries) {
  for (const [index, entry] of entries.entries()) {
    const tag = readJournalTag(entry)
    const expectedPrefix = String(index).padStart(4, "0")

    if (!Number.isInteger(entry?.idx)) {
      errors.push(`Drizzle journal entry ${index} is missing numeric idx`)
    } else if (entry.idx !== index) {
      errors.push(`Drizzle journal idx mismatch for ${tag || `entry ${index}`}: expected ${index}, got ${entry.idx}`)
    }

    if (!tag) {
      errors.push(`Drizzle journal entry ${index} is missing tag`)
    } else if (!tag.startsWith(`${expectedPrefix}_`)) {
      errors.push(`Drizzle journal tag numbering mismatch: expected ${expectedPrefix}_*, got ${tag}`)
    }
  }
}

function readJournalTag(entry) {
  return typeof entry?.tag === "string" ? entry.tag : ""
}

function assertNoDuplicates(values, message) {
  const seen = new Set()
  for (const value of values) {
    if (!value) {
      continue
    }
    if (seen.has(value)) {
      errors.push(`${message}: ${value}`)
    }
    seen.add(value)
  }
}

main()
