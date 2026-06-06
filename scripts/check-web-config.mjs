#!/usr/bin/env node

import { pathToFileURL } from "node:url"

const STRICT_ENV_VALUES = new Set(["production", "staging"])
const REQUIRED_PUBLIC_URLS = ["API_URL", "PUBLIC_WEB_URL", "DASHBOARD_WEB_URL", "NEXT_PUBLIC_API_URL"]
const OPTIONAL_PUBLIC_URLS = ["NEXT_PUBLIC_DASHBOARD_URL"]
const OPTIONAL_URLS = ["API_INTERNAL_URL"]
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"])

export function validateWebConfigEnv(env = process.env, options = {}) {
  const strict = options.strict ?? isStrictMode(env)
  const errors = []
  const warnings = []

  if (strict) {
    for (const name of REQUIRED_PUBLIC_URLS) {
      if (!readEnv(env, name)) {
        errors.push(`${name} is required for production-like web config.`)
      }
    }
  } else if (!REQUIRED_PUBLIC_URLS.some((name) => readEnv(env, name))) {
    warnings.push(
      "Production-like web config is not active; set WEB_CONFIG_ENV=production or WEB_CONFIG_STRICT=true to require deployment URLs."
    )
  }

  for (const name of [...REQUIRED_PUBLIC_URLS, ...OPTIONAL_PUBLIC_URLS]) {
    const value = readEnv(env, name)
    if (!value) {
      continue
    }

    const url = parseUrl(name, value, errors)
    if (!url) {
      continue
    }

    if (strict && url.protocol !== "https:") {
      errors.push(`${name} must use HTTPS for production-like public web config.`)
    }

    if (strict && LOCAL_HOSTNAMES.has(url.hostname)) {
      errors.push(`${name} must not point to localhost for production-like public web config.`)
    }
  }

  for (const name of OPTIONAL_URLS) {
    const value = readEnv(env, name)
    if (value) {
      parseUrl(name, value, errors)
    }
  }

  const publicWebUrl = readEnv(env, "PUBLIC_WEB_URL")
  const dashboardWebUrl = readEnv(env, "DASHBOARD_WEB_URL")
  if (publicWebUrl && dashboardWebUrl && sameUrl(publicWebUrl, dashboardWebUrl)) {
    warnings.push(
      "PUBLIC_WEB_URL and DASHBOARD_WEB_URL are identical; split public and dashboard origins are expected unless this deployment intentionally shares one origin."
    )
  }

  return {
    ok: errors.length === 0,
    strict,
    errors,
    warnings
  }
}

function isStrictMode(env) {
  if (env.WEB_CONFIG_STRICT === "true") {
    return true
  }

  return STRICT_ENV_VALUES.has(env.WEB_CONFIG_ENV ?? "") || env.NODE_ENV === "production"
}

function readEnv(env, name) {
  const value = env[name]
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined
}

function parseUrl(name, value, errors) {
  try {
    return new URL(value)
  } catch {
    errors.push(`${name} must be a valid URL.`)
    return null
  }
}

function sameUrl(first, second) {
  try {
    const firstUrl = new URL(first)
    const secondUrl = new URL(second)

    return normalizeUrl(firstUrl) === normalizeUrl(secondUrl)
  } catch {
    return false
  }
}

function normalizeUrl(url) {
  const path = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "")
  return `${url.protocol}//${url.host}${path}`
}

function main() {
  const result = validateWebConfigEnv(process.env)

  for (const warning of result.warnings) {
    console.warn(`Warning: ${warning}`)
  }

  if (!result.ok) {
    console.error("Web config check failed:")
    for (const error of result.errors) {
      console.error(`- ${error}`)
    }
    process.exitCode = 1
    return
  }

  console.log(`Web config check passed (${result.strict ? "strict production-like mode" : "non-strict mode"}).`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
