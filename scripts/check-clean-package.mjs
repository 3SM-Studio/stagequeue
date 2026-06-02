import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"

const packagePath = process.argv[2]
const source = packagePath ? listZipEntries(packagePath) : listWorkspaceEntries()
const violations = source.filter(isForbiddenPath)

if (violations.length > 0) {
  console.error("Source package hygiene check failed.")
  console.error("Forbidden runtime/build artifacts found:")
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

const label = packagePath ? packagePath : "workspace source paths"
console.log(`Source package hygiene check passed for ${label}.`)

function listWorkspaceEntries() {
  const entries = []
  walk(".", entries)
  return entries
}

function walk(directory, entries) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const path = normalizePath(`${directory}/${item.name}`)
    if (shouldSkipWorkspacePath(path, item.name)) {
      continue
    }

    entries.push(path)
    if (item.isDirectory()) {
      walk(path, entries)
    }
  }
}

function shouldSkipWorkspacePath(path, name) {
  if (name === ".env" || (name.startsWith(".env.") && name !== ".env.example")) {
    return true
  }
  if (name.endsWith(".zip") || name.endsWith(".log") || name === ".DS_Store") {
    return true
  }
  if (name.endsWith(".dump") || name.endsWith(".backup")) {
    return true
  }
  if ([".git", "node_modules", "dist", "build", "coverage", ".turbo"].includes(name) || name.startsWith(".next")) {
    return true
  }
  return statSync(path).isDirectory() && (path === "data/imports" || path === "data/events" || path === "data/dumps")
}

function listZipEntries(path) {
  if (!existsSync(path)) {
    throw new Error(`Missing source package: ${path}`)
  }

  const buffer = readFileSync(path)
  const eocdOffset = findEndOfCentralDirectory(buffer)
  const entryCount = buffer.readUInt16LE(eocdOffset + 10)
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16)
  const entries = []
  let offset = centralDirectoryOffset

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("Invalid ZIP central directory")
    }

    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const nameStart = offset + 46
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString("utf8")
    entries.push(name)
    offset = nameStart + nameLength + extraLength + commentLength
  }

  return entries
}

function findEndOfCentralDirectory(buffer) {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset
    }
  }
  throw new Error("Invalid ZIP file: missing end of central directory")
}

function isForbiddenPath(input) {
  const path = normalizePath(input)
  const name = path.split("/").at(-1) ?? path
  const segments = path.split("/")

  if (name === ".env.example") {
    return false
  }
  if (name === ".env" || (name.startsWith(".env.") && name !== ".env.example")) {
    return true
  }
  if (name === ".DS_Store" || name.endsWith(".log") || name.endsWith(".zip")) {
    return true
  }
  if (name.endsWith(".dump") || name.endsWith(".backup")) {
    return true
  }
  if (path.startsWith("data/imports/") && path.endsWith(".json")) {
    return true
  }
  if (path.startsWith("data/events/") && path.endsWith(".json")) {
    return true
  }
  if (path.startsWith("data/dumps/") || path.startsWith("data_old/")) {
    return true
  }

  return segments.some(
    (segment) => ["node_modules", "dist", "build", "coverage", ".turbo"].includes(segment) || segment.startsWith(".next")
  )
}

function normalizePath(path) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "")
}
