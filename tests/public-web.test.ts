import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  buildPublicApiUrl,
  buildPublicVenueStreamUrl,
  getBrowserApiBaseUrl,
  getPublicQueueByVenueSlug,
  submitSongRequestByVenueSlug
} from "../apps/public-web/lib/apiClient.ts"
import { getJoinVisibility } from "../apps/public-web/lib/joinVisibility.ts"
import { joinPageMetadata, noindexMetadata, queuePageMetadata, venuePageMetadata } from "../apps/public-web/lib/metadata.ts"
import { getVenueMetadataData, getVenuePageData } from "../apps/public-web/lib/pageData.ts"
import { shouldRefetchQueue } from "../apps/public-web/lib/queueRefresh.ts"
import { getServerApiBaseUrl, getServerPublicQueueByVenueSlug } from "../apps/public-web/lib/serverApiClient.ts"
import { isReservedPublicPathSlug } from "../apps/public-web/lib/staticSlugGuard.ts"
import { validateSubmitSongRequest } from "../apps/public-web/lib/submitValidation.ts"
import {
  assertActiveEventResponse,
  assertPublicQueueResponse,
  assertSubmitRequestResponse,
  assertVenueResponse
} from "../apps/public-web/lib/apiValidation.ts"

test("public-web API client builds URLs against NEXT_PUBLIC_API_URL", () => {
  const previous = process.env.NEXT_PUBLIC_API_URL
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:4321/"
  try {
    assert.equal(buildPublicApiUrl("/public/venues/klub-x"), "http://localhost:4321/public/venues/klub-x")
  } finally {
    restoreEnv("NEXT_PUBLIC_API_URL", previous)
  }
})

test("public-web API client builds venue-first queue request and stream URLs", () => {
  const previous = process.env.NEXT_PUBLIC_API_URL
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:4321/"
  try {
    assert.equal(buildPublicApiUrl("/public/venues/klub-x/queue"), "http://localhost:4321/public/venues/klub-x/queue")
    assert.equal(buildPublicApiUrl("/public/venues/klub-x/requests"), "http://localhost:4321/public/venues/klub-x/requests")
    assert.equal(buildPublicVenueStreamUrl("klub-x"), "http://localhost:4321/public/venues/klub-x/stream")
  } finally {
    restoreEnv("NEXT_PUBLIC_API_URL", previous)
  }
})

test("public-web server API base URL prefers API_INTERNAL_URL", () => {
  withApiEnv({ API_INTERNAL_URL: "http://api:4321/", NEXT_PUBLIC_API_URL: "https://public-api.example.com/" }, () => {
    assert.equal(getServerApiBaseUrl(), "http://api:4321")
  })
})

test("public-web server API base URL falls back to NEXT_PUBLIC_API_URL", () => {
  withApiEnv({ API_INTERNAL_URL: undefined, NEXT_PUBLIC_API_URL: "https://public-api.example.com/" }, () => {
    assert.equal(getServerApiBaseUrl(), "https://public-api.example.com")
  })
})

test("public-web server API base URL falls back to the local default", () => {
  withApiEnv({ API_INTERNAL_URL: undefined, NEXT_PUBLIC_API_URL: undefined }, () => {
    assert.equal(getServerApiBaseUrl(), "http://localhost:4321")
  })
})

test("public-web browser API base URL uses NEXT_PUBLIC_API_URL and ignores API_INTERNAL_URL", () => {
  withApiEnv({ API_INTERNAL_URL: "http://api:4321/", NEXT_PUBLIC_API_URL: "https://public-api.example.com/" }, () => {
    assert.equal(getBrowserApiBaseUrl(), "https://public-api.example.com")
  })
})

test("public-web browser API base URL falls back to the local default", () => {
  withApiEnv({ API_INTERNAL_URL: "http://api:4321/", NEXT_PUBLIC_API_URL: undefined }, () => {
    assert.equal(getBrowserApiBaseUrl(), "http://localhost:4321")
  })
})

test("public-web venue loader handles inactive state", async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.endsWith("/public/venues/klub-x")) {
      return jsonResponse({
        venue: {
          id: "venue-1",
          slug: "klub-x",
          name: "Klub X",
          address: null,
          city: "Warszawa",
          country: "PL",
          timezone: "Europe/Warsaw",
          status: "active",
          verificationStatus: "verified"
        }
      })
    }
    if (url.endsWith("/public/venues/klub-x/active-event")) {
      return jsonResponse({
        venue: { id: "venue-1", slug: "klub-x", name: "Klub X", city: "Warszawa", timezone: "Europe/Warsaw" },
        activeEvent: null
      })
    }
    return jsonResponse({ error: { code: "NOT_FOUND", message: "Missing" } }, 404)
  }

  try {
    const data = await getVenuePageData("klub-x")

    assert.equal(data.kind, "ready")
    if (data.kind === "ready") {
      assert.equal(data.active.activeEvent, null)
      assert.equal(data.venue.name, "Klub X")
    }
  } finally {
    globalThis.fetch = previousFetch
  }
})

test("public-web reserved static slugs do not call the public venue API", async () => {
  const previousFetch = globalThis.fetch
  const reservedSlugs = ["sw.js", "favicon.ico", "robots.txt", "sitemap.xml", "manifest.webmanifest", "_next", "assets"]
  let fetchCount = 0
  globalThis.fetch = async () => {
    fetchCount += 1
    throw new Error("Reserved static slug should not call fetch")
  }

  try {
    for (const slug of reservedSlugs) {
      assert.equal(isReservedPublicPathSlug(slug), true)

      const pageData = await getVenuePageData(slug)
      assert.deepEqual(pageData, { kind: "not-found" })

      const metadataData = await getVenueMetadataData(slug)
      assert.equal(metadataData, null)

      await assert.rejects(() => getServerPublicQueueByVenueSlug(slug), {
        name: "PublicApiError",
        status: 404,
        code: "NOT_FOUND"
      })
    }

    assert.equal(fetchCount, 0)
  } finally {
    globalThis.fetch = previousFetch
  }
})

test("public-web validates venue API responses", () => {
  assert.equal(assertVenueResponse(validVenueResponse()).venue.name, "Klub X")
  assert.throws(() => assertVenueResponse({ venue: { id: "venue-1" } }), /Invalid public API response: venue/)
})

test("public-web validates active event API responses", () => {
  assert.equal(assertActiveEventResponse(validActiveEventResponse()).activeEvent?.id, "event-1")
  assert.throws(
    () => assertActiveEventResponse({ venue: validActiveEventResponse().venue, activeEvent: { id: "event-1" } }),
    /Invalid public API response: active event/
  )
})

test("public-web validates public queue API responses", () => {
  assert.equal(assertPublicQueueResponse(validPublicQueueResponse()).queue[0].singerName, "Michał")
  assert.throws(
    () => assertPublicQueueResponse({ ...validPublicQueueResponse(), queue: [{ id: "request-1" }] }),
    /Invalid public API response: public queue/
  )
})

test("public-web validates inactive venue-first queue API response", () => {
  assert.equal(assertPublicQueueResponse(validInactiveVenueQueueResponse()).event, null)
})

test("public-web queue flow fetches venue-first snapshot without eventId", async () => {
  const previousFetch = globalThis.fetch
  let requestedUrl = ""
  globalThis.fetch = async (input) => {
    requestedUrl = String(input)
    return jsonResponse(validPublicQueueResponse())
  }

  try {
    const queue = await getPublicQueueByVenueSlug("klub-x")

    assert.equal(queue.event?.id, "event-1")
    assert.equal(requestedUrl.endsWith("/public/venues/klub-x/queue"), true)
  } finally {
    globalThis.fetch = previousFetch
  }
})

test("public-web join flow submits venue-first request without eventId", async () => {
  const previousFetch = globalThis.fetch
  let requestedUrl = ""
  let requestedCredentials: RequestCredentials | undefined
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input)
    requestedCredentials = init?.credentials
    return jsonResponse(validSubmitResponse(), 201)
  }

  try {
    const result = await submitSongRequestByVenueSlug("klub-x", {
      singerName: "Michal",
      sourceId: "ising",
      sourceTrackId: "9053",
      songTitle: "Krolowa Lez",
      songArtist: "Agnieszka Chylinska",
      songUrl: "",
      note: ""
    })

    assert.equal(result.request.status, "pending")
    assert.equal(requestedUrl.endsWith("/public/venues/klub-x/requests"), true)
    assert.equal(requestedCredentials, "include")
  } finally {
    globalThis.fetch = previousFetch
  }
})

test("public-web validates submit request API responses", () => {
  assert.equal(assertSubmitRequestResponse(validSubmitResponse()).request.status, "pending")
  assert.throws(
    () => assertSubmitRequestResponse({ request: { ...validSubmitResponse().request, sourceTrackId: null } }),
    /Invalid public API response: submit request/
  )
})

test("public-web queue refetch helper reacts to queue.updated", () => {
  assert.equal(shouldRefetchQueue("queue.updated"), true)
  assert.equal(shouldRefetchQueue("request.approved"), true)
  assert.equal(shouldRefetchQueue("connected"), false)
})

test("public-web submit validation requires singer and song fields", () => {
  const missing = validateSubmitSongRequest({
    singerName: "",
    sourceId: "ising",
    songTitle: "",
    songArtist: "",
    sourceTrackId: "",
    songUrl: "",
    note: ""
  })

  assert.equal(missing.ok, false)
  if (!missing.ok) {
    assert.ok(missing.errors.some((error) => error.includes("Imię")))
    assert.ok(missing.errors.some((error) => error.includes("Tytuł")))
    assert.ok(missing.errors.some((error) => error.includes("Wykonawca")))
  }

  const valid = validateSubmitSongRequest({
    singerName: "Michał",
    sourceId: "ising",
    songTitle: "Królowa Łez",
    songArtist: "Agnieszka Chylińska",
    sourceTrackId: "9053",
    songUrl: "",
    note: ""
  })

  assert.equal(valid.ok, true)
})

test("public-web join page policy closes the form when publicJoinEnabled is false", () => {
  const visibility = getJoinVisibility({
    id: "event-1",
    venueId: "venue-1",
    operatedByOrganizationId: "org-1",
    name: "Closed Join",
    slug: "closed-join",
    status: "active",
    startsAt: null,
    endsAt: null,
    publicJoinEnabled: false,
    publicQueueEnabled: true
  })

  assert.equal(visibility.kind, "closed")
})

test("public-web join page policy does not open the form for paused events", () => {
  const visibility = getJoinVisibility({
    id: "event-1",
    venueId: "venue-1",
    operatedByOrganizationId: "org-1",
    name: "Paused Join",
    slug: "paused-join",
    status: "paused",
    startsAt: null,
    endsAt: null,
    publicJoinEnabled: true,
    publicQueueEnabled: true
  })

  assert.equal(visibility.kind, "paused")
})

test("public-web noindex metadata is available for join and queue pages", () => {
  assert.deepEqual(noindexMetadata.robots, {
    index: false,
    follow: false
  })
})

test("public-web venue metadata uses venue name", () => {
  const metadata = venuePageMetadata({ name: "Klub X" })

  assert.equal(metadata.title, "Karaoke w Klub X | Poza Nutą")
  assert.equal(metadata.description, "Dołącz do karaoke i sprawdź aktualną kolejkę w Klub X.")
})

test("public-web join and queue metadata keep noindex and use venue name", () => {
  const join = joinPageMetadata({ name: "Klub X" })
  const queue = queuePageMetadata({ name: "Klub X" })

  assert.equal(join.title, "Dołącz do karaoke | Klub X")
  assert.deepEqual(join.robots, noindexMetadata.robots)
  assert.equal(queue.title, "Kolejka karaoke | Klub X")
  assert.deepEqual(queue.robots, noindexMetadata.robots)
})

test("public-web metadata has safe fallbacks without venue name", () => {
  assert.equal(venuePageMetadata(null).title, "Karaoke | Poza Nutą")
  assert.equal(joinPageMetadata(null).title, "Dołącz do karaoke | Poza Nutą")
  assert.equal(queuePageMetadata(null).title, "Kolejka karaoke | Poza Nutą")
})

test("public-web homepage does not link to the missing demo venue", () => {
  const source = readFileSync("apps/public-web/app/page.tsx", "utf8")

  assert.equal(source.includes('href="/demo"'), false)
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  })
}

function validVenueResponse() {
  return {
    venue: {
      id: "venue-1",
      slug: "klub-x",
      name: "Klub X",
      address: null,
      city: "Warszawa",
      country: "PL",
      timezone: "Europe/Warsaw",
      status: "active",
      verificationStatus: "verified"
    }
  }
}

function validActiveEventResponse() {
  return {
    venue: {
      id: "venue-1",
      slug: "klub-x",
      name: "Klub X",
      city: "Warszawa",
      timezone: "Europe/Warsaw"
    },
    activeEvent: {
      id: "event-1",
      venueId: "venue-1",
      operatedByOrganizationId: "org-1",
      createdByUserId: null,
      name: "Friday Karaoke",
      slug: "friday-karaoke",
      status: "active",
      startsAt: null,
      endsAt: null,
      publicJoinEnabled: true,
      publicQueueEnabled: true
    }
  }
}

function validPublicQueueResponse() {
  return {
    event: {
      id: "event-1",
      name: "Friday Karaoke",
      status: "active"
    },
    venue: {
      id: "venue-1",
      name: "Klub X",
      slug: "klub-x"
    },
    now: null,
    queue: [
      {
        id: "request-1",
        singerName: "Michał",
        songTitle: "Królowa Łez",
        songArtist: "Agnieszka Chylińska",
        position: 1
      }
    ],
    submissions: {
      enabled: true
    }
  }
}

function validInactiveVenueQueueResponse() {
  return {
    venue: {
      id: "venue-1",
      name: "Klub X",
      slug: "klub-x"
    },
    activeEvent: null,
    event: null,
    now: null,
    queue: [],
    submissions: {
      enabled: false,
      reason: "NO_ACTIVE_EVENT"
    }
  }
}

function validSubmitResponse() {
  return {
    request: {
      id: "request-1",
      status: "pending",
      singerName: "Michał",
      songTitle: "Królowa Łez",
      songArtist: "Agnieszka Chylińska",
      sourceId: "ising",
      sourceTrackId: "9053"
    }
  }
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}

function withApiEnv(env: { API_INTERNAL_URL?: string | undefined; NEXT_PUBLIC_API_URL?: string | undefined }, action: () => void): void {
  const previousInternal = process.env.API_INTERNAL_URL
  const previousPublic = process.env.NEXT_PUBLIC_API_URL
  try {
    restoreEnv("API_INTERNAL_URL", env.API_INTERNAL_URL)
    restoreEnv("NEXT_PUBLIC_API_URL", env.NEXT_PUBLIC_API_URL)
    action()
  } finally {
    restoreEnv("API_INTERNAL_URL", previousInternal)
    restoreEnv("NEXT_PUBLIC_API_URL", previousPublic)
  }
}
