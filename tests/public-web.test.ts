import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  buildPublicApiUrl,
  buildPublicVenueStreamUrl,
  getBrowserApiBaseUrl,
  getMyRequestsByVenueSlug,
  getPublicEventDetail,
  getPublicQueueByVenueSlug,
  type PublicEventDetail,
  type PublicMyRequest,
  submitSongRequestByVenueSlug
} from "../apps/public-web/lib/apiClient.ts"
import { getJoinVisibility } from "../apps/public-web/lib/joinVisibility.ts"
import {
  getPublicJoinStreamErrorState,
  getPublicVenueStreamKey,
  getPublicJoinViewState,
  shouldRefetchPublicJoinOnSse
} from "../apps/public-web/lib/joinState.ts"
import { joinPageMetadata, noindexMetadata, queuePageMetadata, venuePageMetadata } from "../apps/public-web/lib/metadata.ts"
import {
  createMyRequestsRefreshController,
  getMyRequestStatusMessage,
  getTrackedRequest,
  PUBLIC_MY_REQUESTS_REFRESH_INTERVAL_MS,
  shouldPollMyRequests
} from "../apps/public-web/lib/myRequestsState.ts"
import { getVenueMetadataData, getVenuePageData } from "../apps/public-web/lib/pageData.ts"
import { getPublicEventPageState } from "../apps/public-web/lib/publicEventPageState.ts"
import { shouldRefetchQueue } from "../apps/public-web/lib/queueRefresh.ts"
import { createRefetchScheduler as createPublicRefetchScheduler } from "../apps/public-web/lib/refetchScheduler.ts"
import { getServerApiBaseUrl, getServerPublicQueueByVenueSlug } from "../apps/public-web/lib/serverApiClient.ts"
import { isReservedPublicPathSlug } from "../apps/public-web/lib/staticSlugGuard.ts"
import { validateSubmitSongRequest } from "../apps/public-web/lib/submitValidation.ts"
import {
  assertActiveEventResponse,
  assertMyRequestsResponse,
  assertPublicEventDetailResponse,
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

test("public-web API client builds event-first public event detail URL", async () => {
  const previousFetch = globalThis.fetch
  let requestedUrl = ""
  globalThis.fetch = async (input) => {
    requestedUrl = String(input)
    return jsonResponse(validPublicEventDetailResponse())
  }

  try {
    const detail = await getPublicEventDetail("33333333-3333-4333-8333-333333333333")

    assert.equal(detail.event.name, "Friday Karaoke")
    assert.equal(requestedUrl.endsWith("/public/events/33333333-3333-4333-8333-333333333333"), true)
  } finally {
    globalThis.fetch = previousFetch
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

test("public-web validates public event detail API responses", () => {
  assert.equal(assertPublicEventDetailResponse(validPublicEventDetailResponse()).event.publicId, "event-1")
  assert.throws(
    () =>
      assertPublicEventDetailResponse({
        ...validPublicEventDetailResponse(),
        publicQueue: { visible: "yes" }
      }),
    /Invalid public API response: public event detail/
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

test("public-web my-requests client uses venue-first URL and credentials include", async () => {
  const previousFetch = globalThis.fetch
  let requestedUrl = ""
  let requestedCredentials: RequestCredentials | undefined
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input)
    requestedCredentials = init?.credentials
    return jsonResponse(validMyRequestsResponse("pending"))
  }

  try {
    const result = await getMyRequestsByVenueSlug("klub-x")

    assert.equal(result.requests[0]?.status, "pending")
    assert.equal(requestedUrl.endsWith("/public/venues/klub-x/my-requests"), true)
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

test("public-web validates my-requests API responses", () => {
  assert.equal(assertMyRequestsResponse(validMyRequestsResponse("approved")).requests[0]?.status, "approved")
  assert.throws(
    () => assertMyRequestsResponse({ requests: [{ id: "request-1", status: "approved" }] }),
    /Invalid public API response: my requests/
  )
})

test("public-web queue refetch helper reacts to queue.updated", () => {
  assert.equal(shouldRefetchQueue("queue.updated"), true)
  assert.equal(shouldRefetchQueue("request.approved"), true)
  assert.equal(shouldRefetchQueue("connected"), false)
})

test("public-web join refetch helper reacts to lifecycle and queue events", () => {
  for (const eventType of [
    "event.started",
    "event.paused",
    "event.resumed",
    "event.closed",
    "event.archived",
    "event.cancelled",
    "queue.updated"
  ]) {
    assert.equal(shouldRefetchPublicJoinOnSse(eventType), true)
  }

  assert.equal(shouldRefetchPublicJoinOnSse("request.approved"), false)
  assert.equal(shouldRefetchPublicJoinOnSse("connected"), false)
})

test("public-web venue stream key is stable and deduplicates same slug", () => {
  assert.equal(getPublicVenueStreamKey("demo-klub"), "public-venue:demo-klub")
  assert.equal(getPublicVenueStreamKey("demo-klub"), getPublicVenueStreamKey("demo-klub"))
})

test("public-web refetch scheduler coalesces burst lifecycle events", async () => {
  const timers: Array<() => void> = []
  let refetchCount = 0
  const scheduler = createPublicRefetchScheduler(
    async () => {
      refetchCount += 1
    },
    {
      setTimeoutFn: (callback) => {
        timers.push(callback)
        return timers.length
      },
      clearTimeoutFn: () => undefined
    }
  )

  scheduler.schedule()
  scheduler.schedule()
  scheduler.schedule()
  assert.equal(timers.length, 1)

  timers[0]?.()
  await Promise.resolve()

  assert.equal(refetchCount, 1)
  scheduler.cancel()
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

test("public-web event-first page maps detail response to view state", () => {
  const state = getPublicEventPageState(validPublicEventDetailResponse())

  assert.equal(state.title, "Friday Karaoke")
  assert.equal(state.venueLabel, "Klub X")
  assert.equal(state.statusLabel, "Wydarzenie aktywne")
  assert.equal(state.submissionsLabel, "Zgloszenia sa otwarte")
  assert.equal(state.queueLabel, "Kolejka publiczna jest widoczna")
  assert.equal(state.showQueueLink, true)
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

test("public-web join view state disables submit for paused active event", () => {
  const state = getPublicJoinViewState(activeEventLookup({ status: "paused", publicJoinEnabled: true }))

  assert.equal(state.kind, "paused")
})

test("public-web join view state enables submit for resumed active event", () => {
  const state = getPublicJoinViewState(activeEventLookup({ status: "active", publicJoinEnabled: true }))

  assert.equal(state.kind, "open")
})

test("public-web join view state maps no active event to inactive", () => {
  const state = getPublicJoinViewState({
    venue: validActiveEventResponse().venue,
    activeEvent: null
  })

  assert.equal(state.kind, "inactive")
})

test("public-web join stream errors are non-fatal", () => {
  const state = getPublicJoinStreamErrorState()

  assert.equal(state.kind, "stale")
  assert.equal(state.fatal, false)
})

test("public-web my request statuses map to participant-facing messages", () => {
  assert.match(getMyRequestStatusMessage("pending"), /Poczekaj/)
  assert.match(getMyRequestStatusMessage("approved"), /zatwierdzone/)
  assert.match(getMyRequestStatusMessage("now"), /Teraz/)
  assert.match(getMyRequestStatusMessage("rejected"), /odrzucone/)
  assert.match(getMyRequestStatusMessage("skipped"), /pominiete/)
  assert.match(getMyRequestStatusMessage("done"), /zakonczony/)
})

test("public-web tracked request helper finds own request and handles missing cookie state", () => {
  assert.deepEqual(getTrackedRequest([myRequest("pending")], "request-1"), myRequest("pending"))
  assert.equal(getTrackedRequest([myRequest("pending")], "other-request"), null)
  assert.equal(getTrackedRequest([myRequest("pending")], null), null)
  assert.equal(getTrackedRequest([], "request-1"), null)
})

test("public-web my-requests polling runs only while there is an active tracked request", () => {
  assert.equal(PUBLIC_MY_REQUESTS_REFRESH_INTERVAL_MS, 5000)
  assert.equal(shouldPollMyRequests(myRequest("pending"), "visible"), true)
  assert.equal(shouldPollMyRequests(myRequest("approved"), "visible"), true)
  assert.equal(shouldPollMyRequests(myRequest("now"), "visible"), true)
  assert.equal(shouldPollMyRequests(myRequest("done"), "visible"), false)
  assert.equal(shouldPollMyRequests(myRequest("rejected"), "visible"), false)
  assert.equal(shouldPollMyRequests(myRequest("pending"), "hidden"), false)
  assert.equal(shouldPollMyRequests(null, "visible"), false)
})

test("public-web my-requests refresh controller blocks overlapping refreshes", async () => {
  let calls = 0
  let resolveFetch: (requests: PublicMyRequest[]) => void = () => undefined
  const controller = createMyRequestsRefreshController({
    fetchRequests: async () => {
      calls += 1
      return await new Promise<PublicMyRequest[]>((resolve) => {
        resolveFetch = resolve
      })
    },
    trackedRequestId: "request-1"
  })

  const first = controller.refresh()
  const second = controller.refresh()

  assert.equal(calls, 1)
  assert.strictEqual(first, second)

  resolveFetch([myRequest("approved")])
  const request = await first

  assert.equal(request?.status, "approved")
  assert.equal(controller.getError(), null)
})

test("public-web my-requests refresh controller is non-fatal on fetch errors", async () => {
  const controller = createMyRequestsRefreshController({
    fetchRequests: async () => {
      throw new Error("stream disconnected")
    },
    trackedRequestId: "request-1"
  })

  const request = await controller.refresh()

  assert.equal(request, null)
  assert.match(controller.getError() ?? "", /odswiezyc/)
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

function validPublicEventDetailResponse(): PublicEventDetail {
  return {
    event: {
      id: "event-1",
      publicId: "event-1",
      name: "Friday Karaoke",
      slug: "friday-karaoke",
      status: "active",
      startsAt: null,
      endsAt: null,
      publicJoinEnabled: true,
      publicQueueEnabled: true
    },
    venue: {
      id: "venue-1",
      slug: "klub-x",
      name: "Klub X",
      city: "Warszawa",
      timezone: "Europe/Warsaw"
    },
    operatedByOrganization: {
      id: "org-1",
      slug: "poza-nuta-demo",
      name: "Poza Nuta Demo"
    },
    submissions: {
      enabled: true
    },
    publicQueue: {
      visible: true
    }
  }
}

function activeEventLookup(overrides: Partial<NonNullable<ReturnType<typeof validActiveEventResponse>["activeEvent"]>> = {}) {
  const response = validActiveEventResponse()
  return {
    ...response,
    activeEvent: {
      ...response.activeEvent,
      ...overrides
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

function validMyRequestsResponse(status: PublicMyRequest["status"] = "pending") {
  return {
    requests: [myRequest(status)]
  }
}

function myRequest(status: PublicMyRequest["status"], overrides: Partial<PublicMyRequest> = {}): PublicMyRequest {
  return {
    id: "request-1",
    status,
    singerName: "Michal",
    artist: "ABBA",
    title: "Dancing Queen",
    position: status === "approved" ? 1 : null,
    createdAt: "2026-06-05T12:00:00.000Z",
    ...overrides
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
