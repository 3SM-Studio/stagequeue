import assert from "node:assert/strict"
import test from "node:test"
import {
  approveRequest,
  archiveDashboardEvent,
  assertDashboardEventResponse,
  assertDashboardCreatedEventResponse,
  assertOperatorQueueResponse,
  assertMeResponse,
  assertPlatformSetupStatusResponse,
  assertDashboardEventsResponse,
  assertDashboardVenuesResponse,
  buildDashboardEventStreamUrl,
  buildDashboardApiUrl,
  buildDashboardEventQueuePath,
  cancelDashboardEvent,
  claimPlatformOwner,
  closeDashboardEvent,
  createDashboardEvent,
  DASHBOARD_MUTATION_TIMEOUT_MESSAGE,
  DashboardApiError,
  doneRequest,
  getDashboardEvent,
  getDashboardApiBaseUrl,
  getMe,
  getOperatorQueue,
  getPlatformSetupStatus,
  listDashboardEvents,
  listDashboardVenues,
  moveRequest,
  pauseDashboardEvent,
  type DashboardEventDetail,
  type DashboardMeResponse,
  type DashboardEventSummary,
  type OperatorQueueItem,
  rejectRequest,
  resumeDashboardEvent,
  skipRequest,
  startDashboardEvent,
  startRequest,
  type DashboardFetch,
  updateDashboardEventFlags
} from "../apps/dashboard-web/lib/apiClient.ts"
import {
  buildGoogleSignInOptions,
  DASHBOARD_AUTH_BASE_PATH,
  getDashboardAuthClientBaseUrl,
  getGoogleSignInCallbackUrl,
  getGoogleSignInErrorMessage,
  type GoogleSignInOptions,
  signInWithGoogle
} from "../apps/dashboard-web/lib/authClient.ts"
import { getDashboardGateRedirect, getDashboardGateState } from "../apps/dashboard-web/lib/dashboardGate.ts"
import { getDashboardViewState } from "../apps/dashboard-web/lib/dashboardState.ts"
import {
  buildCreatedEventQueuePath,
  generateEventSlug,
  mapCreateEventError,
  validateCreateEventInput
} from "../apps/dashboard-web/lib/createEventState.ts"
import {
  createDashboardEventsRefreshController,
  filterDashboardEvents,
  DASHBOARD_EVENTS_LIST_REFRESH_MODE,
  DASHBOARD_EVENTS_LIST_USES_EVENT_STREAMS,
  DASHBOARD_EVENTS_REFRESH_ERROR_MESSAGE,
  DASHBOARD_EVENTS_REFRESH_INTERVAL_MS,
  getDashboardEventStreamKey,
  getDashboardEventStreamSubscriptions,
  getDashboardEventGroup,
  getDashboardEventGroupsForFilter,
  getDashboardEventsErrorState,
  getDashboardEventsStreamErrorState,
  groupDashboardEvents,
  MANUAL_EVENT_ID_FALLBACK_DESCRIPTION,
  MANUAL_EVENT_ID_FALLBACK_TITLE,
  shouldRefetchDashboardEventsOnSse,
  shouldPollDashboardEvents,
  shouldRefreshDashboardEventsOnFocus
} from "../apps/dashboard-web/lib/eventsState.ts"
import {
  getDashboardLifecycleErrorState,
  getLifecycleActionModels,
  getLifecycleActionsForStatus,
  isPublicQueueVisibleForDashboard,
  isPublicSubmitAvailable
} from "../apps/dashboard-web/lib/eventLifecycleState.ts"
import {
  createOperatorQueueRefreshController,
  getOperatorQueueStreamErrorState,
  getOperatorQueueStreamKey,
  getOperatorQueueStreamSubscriptions,
  getOperatorQueueErrorState,
  OPERATOR_QUEUE_REFRESH_ERROR_MESSAGE,
  OPERATOR_QUEUE_REFRESH_INTERVAL_MS,
  operatorQueueRefetchEvents,
  runOperatorActionWithPending,
  runOperatorMutationWithRefresh,
  shouldPollOperatorQueue,
  shouldRefetchOperatorQueue
} from "../apps/dashboard-web/lib/operatorQueueState.ts"
import { createOperatorQueueStream, type DashboardEventSource } from "../apps/dashboard-web/lib/operatorQueueStream.ts"
import { createRefetchScheduler as createDashboardRefetchScheduler } from "../apps/dashboard-web/lib/refetchScheduler.ts"
import {
  getPlatformSetupRedirect,
  getPlatformSetupUnavailableState,
  getPlatformSetupViewState
} from "../apps/dashboard-web/lib/setupState.ts"

test("dashboard-web API client builds URLs against NEXT_PUBLIC_API_URL", () => {
  withDashboardEnv({ NEXT_PUBLIC_API_URL: "http://localhost:4321/" }, () => {
    assert.equal(getDashboardApiBaseUrl(), "http://localhost:4321")
    assert.equal(buildDashboardApiUrl("/me"), "http://localhost:4321/me")
  })
})

test("dashboard-web getMe uses credentials include", async () => {
  let requestedCredentials: RequestCredentials | undefined
  let requestedCookie: string | null = null

  const result = await getMe({
    cookieHeader: "session=abc",
    fetchImpl: async (_input, init) => {
      requestedCredentials = init?.credentials
      const headers = new Headers(init?.headers)
      requestedCookie = headers.get("Cookie")
      return jsonResponse({ authenticated: false })
    }
  })

  assert.deepEqual(result, { authenticated: false })
  assert.equal(requestedCredentials, "include")
  assert.equal(requestedCookie, "session=abc")
})

test("dashboard-web auth client base URL uses NEXT_PUBLIC_API_URL", () => {
  withDashboardEnv(
    {
      NEXT_PUBLIC_API_URL: "http://localhost:4321/",
      NEXT_PUBLIC_DASHBOARD_URL: "http://localhost:3001/"
    },
    () => {
      assert.equal(getDashboardAuthClientBaseUrl(), "http://localhost:4321")
    }
  )
})

test("dashboard-web auth client uses Fastify Better Auth base path", () => {
  assert.equal(DASHBOARD_AUTH_BASE_PATH, "/auth")
})

test("dashboard-web Google sign-in helper uses Better Auth social options", async () => {
  let requestedOptions: unknown

  await withDashboardEnvAsync(
    {
      NEXT_PUBLIC_API_URL: "http://localhost:4321/",
      NEXT_PUBLIC_DASHBOARD_URL: "http://localhost:3001/"
    },
    async () => {
      await signInWithGoogle(
        {},
        {
          signIn: {
            social: async (options) => {
              requestedOptions = options
              return { error: null }
            }
          }
        }
      )
    }
  )

  assert.deepEqual(requestedOptions, {
    provider: "google",
    callbackURL: "http://localhost:3001/dashboard"
  })
})

test("dashboard-web Google sign-in helpers keep callback URL and do not build a GET auth URL", () => {
  withDashboardEnv(
    {
      NEXT_PUBLIC_API_URL: "http://localhost:4321/",
      NEXT_PUBLIC_DASHBOARD_URL: "http://localhost:3001/"
    },
    () => {
      assert.equal(getGoogleSignInCallbackUrl(), "http://localhost:3001/dashboard")
      assert.deepEqual(buildGoogleSignInOptions(), {
        provider: "google",
        callbackURL: "http://localhost:3001/dashboard"
      })
      assert.deepEqual(buildGoogleSignInOptions({ callbackPath: "/setup" }), {
        provider: "google",
        callbackURL: "http://localhost:3001/setup"
      })
      assert.equal(JSON.stringify(buildGoogleSignInOptions()).includes("/auth/sign-in/social"), false)
    }
  )
})

test("dashboard-web Google sign-in helper supports setup and dashboard callbacks", async () => {
  const requestedOptions: unknown[] = []

  await withDashboardEnvAsync(
    {
      NEXT_PUBLIC_API_URL: "http://localhost:4321/",
      NEXT_PUBLIC_DASHBOARD_URL: "http://localhost:3001/"
    },
    async () => {
      const client = {
        signIn: {
          social: async (options: GoogleSignInOptions) => {
            requestedOptions.push(options)
            return { error: null }
          }
        }
      }

      await signInWithGoogle({ callbackPath: "/setup" }, client)
      await signInWithGoogle({ callbackPath: "/dashboard" }, client)
    }
  )

  assert.deepEqual(requestedOptions, [
    {
      provider: "google",
      callbackURL: "http://localhost:3001/setup"
    },
    {
      provider: "google",
      callbackURL: "http://localhost:3001/dashboard"
    }
  ])
})

test("dashboard-web maps Better Auth social sign-in errors to readable messages", async () => {
  assert.equal(getGoogleSignInErrorMessage({ error: { message: "Google OAuth is not configured" } }), "Google OAuth is not configured")
  await assert.rejects(
    () =>
      signInWithGoogle({
        callbackPath: "/dashboard"
      }, {
        signIn: {
          social: async () => ({ error: { message: "Google OAuth is not configured" } })
        }
      }),
    /Google OAuth is not configured/
  )
})

test("dashboard-web unauthenticated /me state shows login CTA state", () => {
  const state = getDashboardViewState({ authenticated: false })

  assert.equal(state.kind, "unauthenticated")
  assert.match(state.title, /Zaloguj/)
})

test("dashboard-web access denied state shows no-access message", () => {
  const state = getDashboardViewState({
    authenticated: true,
    user: {
      id: "user-1",
      email: "pending@example.com",
      name: null,
      status: "pending"
    },
    platform: {
      roles: []
    },
    access: {
      dashboardAllowed: false,
      reason: "pending_approval"
    }
  })

  assert.equal(state.kind, "access-denied")
  if (state.kind === "access-denied") {
    assert.match(state.message, /czeka/)
  }
})

test("dashboard-web allowed state exposes shell and nav data", () => {
  const state = getDashboardViewState({
    authenticated: true,
    user: {
      id: "user-1",
      email: "owner@example.com",
      name: "Owner",
      status: "active"
    },
    platform: {
      roles: ["platform_owner"]
    },
    access: {
      dashboardAllowed: true,
      reason: "platform_role"
    }
  })

  assert.equal(state.kind, "allowed")
  if (state.kind === "allowed") {
    assert.equal(state.userEmail, "owner@example.com")
    assert.deepEqual(state.platformRoles, ["platform_owner"])
  }
})

test("dashboard-web validates /me response shape", () => {
  assert.deepEqual(assertMeResponse({ authenticated: false }), { authenticated: false })
  assert.throws(() => assertMeResponse({ authenticated: true, user: {} }), /Invalid dashboard API response: me/)
})

test("dashboard-web setup state maps completed setup", () => {
  const state = getPlatformSetupViewState({ setupRequired: false }, { authenticated: false })

  assert.equal(state.kind, "completed")
  assert.equal(state.showClaimForm, false)
  assert.equal(state.showGoogleSignIn, false)
})

test("dashboard-web setup redirects completed setup users by access state", () => {
  assert.equal(getPlatformSetupRedirect({ setupRequired: false }, allowedDashboardMe()), "/dashboard")
  assert.equal(getPlatformSetupRedirect({ setupRequired: false }, { authenticated: false }), "/sign-in")
  assert.equal(getPlatformSetupRedirect({ setupRequired: false }, pendingDashboardMe()), "/dashboard/access")
})

test("dashboard-web setup completed state never shows token form", () => {
  const states = [
    getPlatformSetupViewState({ setupRequired: false }, allowedDashboardMe()),
    getPlatformSetupViewState({ setupRequired: false }, { authenticated: false }),
    getPlatformSetupViewState({ setupRequired: false }, pendingDashboardMe())
  ]

  assert.equal(states.every((state) => state.showClaimForm === false), true)
  assert.equal(states.some((state) => state.kind === "claim"), false)
})

test("dashboard-web setup state asks unauthenticated users to sign in", () => {
  const state = getPlatformSetupViewState({ setupRequired: true }, { authenticated: false })

  assert.equal(state.kind, "unauthenticated")
  assert.equal(state.showClaimForm, false)
  assert.equal(state.showGoogleSignIn, true)
  assert.equal(getPlatformSetupRedirect({ setupRequired: true }, { authenticated: false }), null)
})

test("dashboard-web setup state shows claim form only after authentication", () => {
  const state = getPlatformSetupViewState(
    { setupRequired: true },
    {
      authenticated: true,
      user: {
        id: "user-1",
        email: "owner@example.com",
        name: null,
        status: "pending"
      },
      platform: {
        roles: []
      },
      access: {
        dashboardAllowed: false,
        reason: "pending_approval"
      }
    }
  )

  assert.equal(state.kind, "claim")
  assert.equal(state.showClaimForm, true)
  assert.equal(state.showGoogleSignIn, false)
  assert.equal(getPlatformSetupRedirect({ setupRequired: true }, pendingDashboardMe()), null)
  if (state.kind === "claim") {
    assert.equal(state.userEmail, "owner@example.com")
  }
})

test("dashboard-web setup unavailable state is terminal and does not imply redirect", () => {
  const state = getPlatformSetupUnavailableState()

  assert.equal(state.kind, "unavailable")
  assert.equal(state.showClaimForm, false)
  assert.equal(state.showGoogleSignIn, false)
  assert.match(state.message, /API dziala/)
})

test("dashboard gate sends setup-required users to setup before pending approval", () => {
  const unauthenticated = getDashboardGateState({
    me: { authenticated: false },
    setupStatus: { setupRequired: true }
  })
  const authenticated = getDashboardGateState({
    me: pendingDashboardMe(),
    setupStatus: { setupRequired: true }
  })

  assert.equal(unauthenticated.kind, "setup_required")
  assert.equal(authenticated.kind, "setup_required")
  assert.equal(getDashboardGateRedirect(unauthenticated, "/dashboard"), "/setup")
  assert.equal(getDashboardGateRedirect(authenticated, "/dashboard/events"), "/setup")
})

test("dashboard gate sends unauthenticated users to sign-in only after setup is complete", () => {
  const state = getDashboardGateState({
    me: { authenticated: false },
    setupStatus: { setupRequired: false }
  })

  assert.equal(state.kind, "unauthenticated")
  assert.equal(getDashboardGateRedirect(state, "/dashboard"), "/sign-in")
  assert.equal(getDashboardGateRedirect(state, "/sign-in"), null)
})

test("dashboard gate sends pending approval to access only after setup is complete", () => {
  const state = getDashboardGateState({
    me: pendingDashboardMe(),
    setupStatus: { setupRequired: false }
  })

  assert.equal(state.kind, "access_denied")
  assert.equal(getDashboardGateRedirect(state, "/dashboard"), "/dashboard/access")
  assert.equal(getDashboardGateRedirect(state, "/dashboard/access"), null)
})

test("dashboard gate allows approved dashboard users after setup is complete", () => {
  const state = getDashboardGateState({
    me: allowedDashboardMe(),
    setupStatus: { setupRequired: false }
  })

  assert.equal(state.kind, "allowed")
  assert.equal(getDashboardGateRedirect(state, "/dashboard/events"), null)
  assert.equal(getDashboardGateRedirect(state, "/dashboard/access"), "/dashboard")
})

test("dashboard gate treats API failures as unavailable, not setup required", () => {
  const state = getDashboardGateState({ error: new Error("fetch failed") })

  assert.equal(state.kind, "api_unavailable")
  assert.equal(getDashboardGateRedirect(state, "/dashboard"), null)
})

test("dashboard-web setup status client fetches setup status", async () => {
  let requestedUrl = ""
  let requestedCredentials: RequestCredentials | undefined

  const result = await getPlatformSetupStatus({
    fetchImpl: async (input, init) => {
      requestedUrl = String(input)
      requestedCredentials = init?.credentials
      return jsonResponse({ setupRequired: true })
    }
  })

  assert.equal(requestedUrl, "http://localhost:4321/setup/status")
  assert.equal(requestedCredentials, "include")
  assert.deepEqual(result, { setupRequired: true })
})

test("dashboard-web setup token submit uses credentials include", async () => {
  let requestedUrl = ""
  let requestedMethod = ""
  let requestedCredentials: RequestCredentials | undefined
  let requestedBody = ""

  const result = await claimPlatformOwner("setup-secret", {
    fetchImpl: async (input, init) => {
      requestedUrl = String(input)
      requestedMethod = init?.method ?? ""
      requestedCredentials = init?.credentials
      requestedBody = String(init?.body)
      return jsonResponse({
        platform: {
          roles: ["platform_owner"]
        },
        user: {
          id: "user-1",
          email: "owner@example.com",
          name: null,
          status: "active"
        }
      })
    }
  })

  assert.equal(requestedUrl, "http://localhost:4321/setup/claim-platform-owner")
  assert.equal(requestedMethod, "POST")
  assert.equal(requestedCredentials, "include")
  assert.deepEqual(JSON.parse(requestedBody), { setupToken: "setup-secret" })
  assert.deepEqual(result.platform.roles, ["platform_owner"])
})

test("dashboard-web validates setup status response shape", () => {
  assert.deepEqual(assertPlatformSetupStatusResponse({ setupRequired: false }), { setupRequired: false })
  assert.throws(() => assertPlatformSetupStatusResponse({}), /Invalid dashboard API response: setup status/)
})

test("dashboard-web listDashboardEvents uses GET /dashboard/events and credentials include", async () => {
  let requestedUrl = ""
  let requestedCredentials: RequestCredentials | undefined
  let requestedMethod: string | undefined

  const result = await listDashboardEvents({
    fetchImpl: async (input, init) => {
      requestedUrl = String(input)
      requestedCredentials = init?.credentials
      requestedMethod = init?.method
      return jsonResponse({ events: [dashboardEvent("active")] })
    }
  })

  assert.equal(requestedUrl, "http://localhost:4321/dashboard/events")
  assert.equal(requestedCredentials, "include")
  assert.equal(requestedMethod, undefined)
  assert.equal(result.events[0]?.status, "active")
})

test("dashboard-web validates dashboard event list response shape", () => {
  const valid = { events: [dashboardEvent("scheduled")] }

  assert.equal(assertDashboardEventsResponse(valid).events[0]?.venue.name, "Demo Klub")
  assert.throws(() => assertDashboardEventsResponse({ events: [{ id: "event-1" }] }), /Invalid dashboard API response: events/)
})

test("dashboard-web listDashboardVenues uses credentials include", async () => {
  let requestedUrl = ""
  let requestedCredentials: RequestCredentials | undefined
  let requestedMethod: string | undefined

  const result = await listDashboardVenues({
    fetchImpl: async (input, init) => {
      requestedUrl = String(input)
      requestedCredentials = init?.credentials
      requestedMethod = init?.method
      return jsonResponse({
        venues: [
          {
            id: "venue-1",
            name: "Demo Klub",
            slug: "demo-klub"
          }
        ]
      })
    }
  })

  assert.equal(requestedUrl, "http://localhost:4321/dashboard/venues")
  assert.equal(requestedCredentials, "include")
  assert.equal(requestedMethod, undefined)
  assert.equal(result.venues[0]?.slug, "demo-klub")
})

test("dashboard-web validates dashboard venues response shape", () => {
  assert.equal(
    assertDashboardVenuesResponse({
      venues: [{ id: "venue-1", name: "Demo Klub", slug: "demo-klub" }]
    }).venues[0]?.name,
    "Demo Klub"
  )
  assert.throws(() => assertDashboardVenuesResponse({ venues: [{ id: "venue-1" }] }), /Invalid dashboard API response: venues/)
})

test("dashboard-web createDashboardEvent uses POST endpoint and credentials include", async () => {
  let requestedUrl = ""
  let requestedCredentials: RequestCredentials | undefined
  let requestedMethod = ""
  let requestedContentType = ""
  let requestedBody = ""

  const result = await createDashboardEvent(
    {
      name: "Test Karaoke",
      publicJoinEnabled: true,
      publicQueueEnabled: true,
      slug: "test-karaoke",
      status: "draft",
      venueId: "venue-1"
    },
    {
      fetchImpl: async (input, init) => {
        requestedUrl = String(input)
        requestedCredentials = init?.credentials
        requestedMethod = init?.method ?? ""
        requestedContentType = new Headers(init?.headers).get("Content-Type") ?? ""
        requestedBody = String(init?.body)
        return jsonResponse({ event: dashboardEvent("draft", { id: "created-event" }) }, 201)
      }
    }
  )

  assert.equal(requestedUrl, "http://localhost:4321/dashboard/events")
  assert.equal(requestedCredentials, "include")
  assert.equal(requestedMethod, "POST")
  assert.equal(requestedContentType, "application/json")
  assert.deepEqual(JSON.parse(requestedBody), {
    name: "Test Karaoke",
    publicJoinEnabled: true,
    publicQueueEnabled: true,
    slug: "test-karaoke",
    status: "draft",
    venueId: "venue-1"
  })
  assert.equal(result.event.id, "created-event")
})

test("dashboard-web createDashboardEvent timeout maps to readable error", async () => {
  await assert.rejects(
    () =>
      createDashboardEvent(
        {
          name: "Test",
          slug: "test",
          venueId: "venue-1"
        },
        {
          fetchImpl: async (_input, init) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })
            }),
          timeoutMs: 1
        }
      ),
    (error: unknown) => {
      assert.equal(error instanceof DashboardApiError, true)
      const apiError = error as DashboardApiError
      assert.equal(apiError.status, 0)
      assert.equal(apiError.code, "REQUEST_TIMEOUT")
      assert.equal(mapCreateEventError(apiError), "Nie udalo sie utworzyc wydarzenia. Sprobuj ponownie.")
      return true
    }
  )
})

test("dashboard-web validates created event response shape", () => {
  assert.equal(assertDashboardCreatedEventResponse({ event: dashboardEvent("draft") }).event.venue.slug, "demo-klub")
  assert.throws(() => assertDashboardCreatedEventResponse({ event: dashboardEventDetail("draft") }), /Invalid dashboard API response/)
})

test("dashboard-web event creation helpers validate input and redirect target", () => {
  assert.equal(generateEventSlug("Karaoke Piątek Łódź"), "karaoke-piatek-lodz")
  assert.equal(generateEventSlug("  Test !!! Karaoke  "), "test-karaoke")

  const missing = validateCreateEventInput({
    name: "",
    publicJoinEnabled: false,
    publicQueueEnabled: false,
    slug: "",
    status: "draft",
    venueId: ""
  })
  assert.equal(missing.ok, false)
  if (!missing.ok) {
    assert.equal(missing.errors.length, 3)
  }

  const valid = validateCreateEventInput({
    name: "  Test Karaoke  ",
    publicJoinEnabled: true,
    publicQueueEnabled: true,
    slug: "  test-karaoke  ",
    status: "active",
    venueId: " venue-1 "
  })
  assert.equal(valid.ok, true)
  if (valid.ok) {
    assert.deepEqual(valid.value, {
      name: "Test Karaoke",
      publicJoinEnabled: true,
      publicQueueEnabled: true,
      slug: "test-karaoke",
      status: "active",
      venueId: "venue-1"
    })
    assert.equal(buildCreatedEventQueuePath("event-1"), "/dashboard/events/event-1/queue")
  }
})

test("dashboard-web create success maps to queue redirect target", () => {
  const response = assertDashboardCreatedEventResponse({ event: dashboardEvent("draft", { id: "created-event" }) })

  assert.equal(buildCreatedEventQueuePath(response.event.id), "/dashboard/events/created-event/queue")
})

test("dashboard-web builds operator queue path from event id", () => {
  assert.equal(buildDashboardEventQueuePath("event-1"), "/dashboard/events/event-1/queue")
  assert.equal(buildDashboardEventQueuePath("event 1"), "/dashboard/events/event%201/queue")
})

test("dashboard-web getDashboardEvent uses GET event endpoint and credentials include", async () => {
  let requestedUrl = ""
  let requestedCredentials: RequestCredentials | undefined
  let requestedMethod: string | undefined

  const result = await getDashboardEvent("event-1", {
    fetchImpl: async (input, init) => {
      requestedUrl = String(input)
      requestedCredentials = init?.credentials
      requestedMethod = init?.method
      return jsonResponse({ event: dashboardEventDetail("active") })
    }
  })

  assert.equal(requestedUrl, "http://localhost:4321/dashboard/events/event-1")
  assert.equal(requestedCredentials, "include")
  assert.equal(requestedMethod, undefined)
  assert.equal(result.event.publicJoinEnabled, true)
})

test("dashboard-web lifecycle helpers use POST endpoints and credentials include", async () => {
  const calls: Array<{ credentials: RequestCredentials | undefined; method: string | undefined; signal: AbortSignal | null | undefined; url: string }> = []
  const fetchImpl: DashboardFetch = async (input, init) => {
    calls.push({ credentials: init?.credentials, method: init?.method, signal: init?.signal, url: String(input) })
    return jsonResponse({ event: dashboardEventDetail("active") })
  }

  await startDashboardEvent("event-1", { fetchImpl })
  await pauseDashboardEvent("event-1", { fetchImpl })
  await resumeDashboardEvent("event-1", { fetchImpl })
  await closeDashboardEvent("event-1", { fetchImpl })
  await archiveDashboardEvent("event-1", { fetchImpl })
  await cancelDashboardEvent("event-1", { fetchImpl })

  assert.deepEqual(
    calls.map((call) => call.url),
    [
      "http://localhost:4321/dashboard/events/event-1/start",
      "http://localhost:4321/dashboard/events/event-1/pause",
      "http://localhost:4321/dashboard/events/event-1/resume",
      "http://localhost:4321/dashboard/events/event-1/close",
      "http://localhost:4321/dashboard/events/event-1/archive",
      "http://localhost:4321/dashboard/events/event-1/cancel"
    ]
  )
  assert.deepEqual(calls.map((call) => call.method), ["POST", "POST", "POST", "POST", "POST", "POST"])
  assert.deepEqual(calls.map((call) => call.credentials), ["include", "include", "include", "include", "include", "include"])
  assert.equal(calls.every((call) => call.signal instanceof AbortSignal), true)
})

test("dashboard-web lifecycle mutation aborts with readable timeout error", async () => {
  await assert.rejects(
    () =>
      pauseDashboardEvent("event-1", {
        fetchImpl: async (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => {
                reject(new DOMException("The operation was aborted.", "AbortError"))
              },
              { once: true }
            )
          }),
        timeoutMs: 1
      }),
    (error: unknown) => {
      assert.equal(error instanceof DashboardApiError, true)
      const apiError = error as DashboardApiError
      assert.equal(apiError.status, 0)
      assert.equal(apiError.code, "REQUEST_TIMEOUT")
      assert.equal(apiError.message, DASHBOARD_MUTATION_TIMEOUT_MESSAGE)
      return true
    }
  )
})

test("dashboard-web update event flags uses PATCH event endpoint and credentials include", async () => {
  let requestedUrl = ""
  let requestedMethod = ""
  let requestedCredentials: RequestCredentials | undefined
  let requestedBody = ""

  await updateDashboardEventFlags("event-1", { publicJoinEnabled: false, publicQueueEnabled: true }, {
    fetchImpl: async (input, init) => {
      requestedUrl = String(input)
      requestedMethod = init?.method ?? ""
      requestedCredentials = init?.credentials
      requestedBody = String(init?.body)
      return jsonResponse({ event: dashboardEventDetail("active") })
    }
  })

  assert.equal(requestedUrl, "http://localhost:4321/dashboard/events/event-1")
  assert.equal(requestedMethod, "PATCH")
  assert.equal(requestedCredentials, "include")
  assert.deepEqual(JSON.parse(requestedBody), { publicJoinEnabled: false, publicQueueEnabled: true })
})

test("dashboard-web validates dashboard event detail response shape", () => {
  assert.equal(assertDashboardEventResponse({ event: dashboardEventDetail("paused") }).event.status, "paused")
  assert.throws(() => assertDashboardEventResponse({ event: { id: "event-1" } }), /Invalid dashboard API response: event/)
})

test("dashboard-web groups events by operational phase", () => {
  assert.equal(getDashboardEventGroup("active"), "active")
  assert.equal(getDashboardEventGroup("paused"), "active")
  assert.equal(getDashboardEventGroup("scheduled"), "upcoming")
  assert.equal(getDashboardEventGroup("draft"), "upcoming")
  assert.equal(getDashboardEventGroup("closed"), "finished")
  assert.equal(getDashboardEventGroup("archived"), "finished")
  assert.equal(getDashboardEventGroup("cancelled"), "finished")
})

test("dashboard-web event filters keep all active upcoming and finished views", () => {
  const events = [
    dashboardEvent("active", { id: "active-1" }),
    dashboardEvent("scheduled", { id: "scheduled-1" }),
    dashboardEvent("closed", { id: "closed-1" })
  ]

  assert.deepEqual(
    filterDashboardEvents(events, "all").map((event) => event.id),
    ["active-1", "scheduled-1", "closed-1"]
  )
  assert.deepEqual(
    filterDashboardEvents(events, "active").map((event) => event.id),
    ["active-1"]
  )
  assert.deepEqual(
    filterDashboardEvents(events, "upcoming").map((event) => event.id),
    ["scheduled-1"]
  )
  assert.deepEqual(
    filterDashboardEvents(events, "finished").map((event) => event.id),
    ["closed-1"]
  )
})

test("dashboard-web event filters expose only the selected dashboard sections", () => {
  assert.deepEqual(getDashboardEventGroupsForFilter("all"), ["active", "upcoming", "finished"])
  assert.deepEqual(getDashboardEventGroupsForFilter("active"), ["active"])
  assert.deepEqual(getDashboardEventGroupsForFilter("upcoming"), ["upcoming"])
  assert.deepEqual(getDashboardEventGroupsForFilter("finished"), ["finished"])
})

test("dashboard-web lifecycle actions match event statuses", () => {
  assert.deepEqual(getLifecycleActionsForStatus("draft"), ["start", "cancel"])
  assert.deepEqual(getLifecycleActionsForStatus("scheduled"), ["start", "cancel"])
  assert.deepEqual(getLifecycleActionsForStatus("active"), ["pause", "close"])
  assert.deepEqual(getLifecycleActionsForStatus("paused"), ["resume", "close"])
  assert.deepEqual(getLifecycleActionsForStatus("closed"), ["archive"])
  assert.deepEqual(getLifecycleActionsForStatus("cancelled"), ["archive"])
  assert.deepEqual(getLifecycleActionsForStatus("archived"), [])
})

test("dashboard-web lifecycle button model for active event contains Pause and Close", () => {
  assert.deepEqual(
    getLifecycleActionModels("active").map((model) => model.label),
    ["Pauza", "Zamknij"]
  )
})

test("dashboard-web public submit and queue visibility helpers follow MVP policy", () => {
  assert.equal(isPublicSubmitAvailable(dashboardEventDetail("active", { publicJoinEnabled: true })), true)
  assert.equal(isPublicSubmitAvailable(dashboardEventDetail("active", { publicJoinEnabled: false })), false)
  assert.equal(isPublicSubmitAvailable(dashboardEventDetail("paused", { publicJoinEnabled: true })), false)
  assert.equal(isPublicQueueVisibleForDashboard(dashboardEventDetail("active", { publicQueueEnabled: true })), true)
  assert.equal(isPublicQueueVisibleForDashboard(dashboardEventDetail("paused", { publicQueueEnabled: true })), true)
  assert.equal(isPublicQueueVisibleForDashboard(dashboardEventDetail("closed", { publicQueueEnabled: true })), false)
})

test("dashboard-web lifecycle errors map forbidden and conflicts to readable UI states", () => {
  const forbidden = getDashboardLifecycleErrorState({ status: 403, message: "Forbidden" })
  const conflict = getDashboardLifecycleErrorState({ status: 409, message: "Cannot pause event from status closed" })
  const timeout = getDashboardLifecycleErrorState(new DashboardApiError(0, "REQUEST_TIMEOUT", DASHBOARD_MUTATION_TIMEOUT_MESSAGE))

  assert.equal(forbidden.kind, "forbidden")
  assert.match(forbidden.message, /Brak uprawnien/)
  assert.equal(conflict.kind, "conflict")
  assert.match(conflict.message, /Ta zmiana statusu/)
  assert.equal(timeout.kind, "error")
  assert.match(timeout.message, /Nie udalo sie zmienic statusu/)
})

test("dashboard-web event grouping prioritizes active and paused before dated ordering", () => {
  const grouped = groupDashboardEvents([
    dashboardEvent("paused", { id: "paused-1", startsAt: "2026-06-02T18:00:00.000Z" }),
    dashboardEvent("active", { id: "active-late", startsAt: "2026-06-04T20:00:00.000Z" }),
    dashboardEvent("active", { id: "active-early", startsAt: "2026-06-01T20:00:00.000Z" }),
    dashboardEvent("scheduled", { id: "scheduled-no-date", startsAt: null }),
    dashboardEvent("scheduled", { id: "scheduled-dated", startsAt: "2026-06-03T20:00:00.000Z" })
  ])

  assert.deepEqual(
    grouped.active.map((event) => event.id),
    ["active-early", "active-late", "paused-1"]
  )
  assert.deepEqual(
    grouped.upcoming.map((event) => event.id),
    ["scheduled-dated", "scheduled-no-date"]
  )
})

test("dashboard-web events refetch helper reacts to lifecycle and queue events", () => {
  for (const eventType of [
    "event.started",
    "event.paused",
    "event.resumed",
    "event.closed",
    "event.archived",
    "event.cancelled",
    "queue.updated"
  ]) {
    assert.equal(shouldRefetchDashboardEventsOnSse(eventType), true)
  }

  assert.equal(shouldRefetchDashboardEventsOnSse("request.approved"), false)
  assert.equal(shouldRefetchDashboardEventsOnSse("connected"), false)
})

test("dashboard-web events list uses focus refresh fallback instead of critical SSE", () => {
  assert.equal(DASHBOARD_EVENTS_LIST_REFRESH_MODE, "focus")
  assert.equal(DASHBOARD_EVENTS_LIST_USES_EVENT_STREAMS, false)
  assert.equal(shouldRefreshDashboardEventsOnFocus("focus"), true)
  assert.equal(shouldRefreshDashboardEventsOnFocus("visibilitychange", "visible"), true)
  assert.equal(shouldRefreshDashboardEventsOnFocus("visibilitychange", "hidden"), false)
})

test("dashboard-web events safe refresh interval and polling visibility policy are explicit", () => {
  assert.equal(DASHBOARD_EVENTS_REFRESH_INTERVAL_MS, 15000)
  assert.equal(shouldPollDashboardEvents("visible"), true)
  assert.equal(shouldPollDashboardEvents("hidden"), false)
  assert.equal(shouldPollDashboardEvents("prerender"), false)
})

test("dashboard-web events refresh controller blocks overlapping list requests", async () => {
  let calls = 0
  let resolveFetch: (events: DashboardEventSummary[]) => void = () => {
    throw new Error("fetch promise was not created")
  }
  const controller = createDashboardEventsRefreshController({
    fetchEvents: () => {
      calls += 1
      return new Promise<DashboardEventSummary[]>((resolve) => {
        resolveFetch = resolve
      })
    },
    initialEvents: [dashboardEvent("active", { id: "initial" })]
  })

  const first = controller.refresh()
  const second = controller.refresh()
  assert.equal(calls, 1)
  assert.strictEqual(first, second)

  resolveFetch([dashboardEvent("paused", { id: "updated" })])
  const state = await first

  assert.equal(state.events[0]?.id, "updated")
  assert.equal(controller.getState().isRefreshing, false)
})

test("dashboard-web events manual refresh calls listDashboardEvents once", async () => {
  let calls = 0
  const controller = createDashboardEventsRefreshController({
    fetchEvents: async () => {
      calls += 1
      return [dashboardEvent("active")]
    },
    initialEvents: []
  })

  await controller.refresh()

  assert.equal(calls, 1)
  assert.equal(controller.getState().events.length, 1)
})

test("dashboard-web events failed refresh preserves previous events and sets non-fatal error", async () => {
  const controller = createDashboardEventsRefreshController({
    fetchEvents: async () => {
      throw new Error("API unavailable")
    },
    initialEvents: [dashboardEvent("active", { id: "previous" })]
  })

  const state = await controller.refresh()

  assert.equal(state.events[0]?.id, "previous")
  assert.equal(state.error, DASHBOARD_EVENTS_REFRESH_ERROR_MESSAGE)
  assert.equal(state.isRefreshing, false)
})

test("dashboard-web events refresh updates lastRefreshedAt after success", async () => {
  const refreshedAt = new Date("2026-06-05T12:34:56.000Z")
  const controller = createDashboardEventsRefreshController({
    fetchEvents: async () => [dashboardEvent("closed", { id: "closed-1" })],
    initialEvents: [dashboardEvent("active")],
    now: () => refreshedAt
  })

  const state = await controller.refresh()

  assert.equal(state.lastRefreshedAt, refreshedAt)
  assert.equal(state.error, null)
  assert.equal(state.events[0]?.status, "closed")
})

test("dashboard-web event list grouping changes across lifecycle statuses", () => {
  assert.equal(getDashboardEventGroup("active"), "active")
  assert.equal(getDashboardEventGroup("paused"), "active")
  assert.equal(getDashboardEventGroup("closed"), "finished")
})

test("dashboard-web event list grouping moves events after status refresh", async () => {
  const controller = createDashboardEventsRefreshController({
    fetchEvents: async () => [dashboardEvent("closed", { id: "event-1" })],
    initialEvents: [dashboardEvent("active", { id: "event-1" })]
  })

  assert.equal(groupDashboardEvents(controller.getState().events).active.length, 1)
  await controller.refresh()

  const groupedAfterRefresh = groupDashboardEvents(controller.getState().events)
  assert.equal(groupedAfterRefresh.active.length, 0)
  assert.equal(groupedAfterRefresh.finished[0]?.id, "event-1")
})

test("dashboard-web events list does not enable EventSource per-event subscriptions", () => {
  assert.equal(DASHBOARD_EVENTS_LIST_USES_EVENT_STREAMS, false)
})

test("dashboard-web event list stream subscriptions are relevant and limited", () => {
  const subscriptions = getDashboardEventStreamSubscriptions(
    [
      dashboardEvent("active", { id: "active-1" }),
      dashboardEvent("paused", { id: "paused-1" }),
      dashboardEvent("active", { id: "active-1" }),
      dashboardEvent("scheduled", { id: "scheduled-1" }),
      dashboardEvent("draft", { id: "draft-1" }),
      dashboardEvent("closed", { id: "closed-1" }),
      dashboardEvent("archived", { id: "archived-1" })
    ],
    3
  )

  assert.deepEqual(subscriptions, ["active-1", "paused-1"])
  assert.deepEqual(getDashboardEventStreamSubscriptions([dashboardEvent("active", { id: "active-1" })]), ["active-1"])
  assert.equal(getDashboardEventStreamKey("active-1"), "dashboard-event:active-1")
})

test("dashboard-web event list stream errors are non-fatal", () => {
  const state = getDashboardEventsStreamErrorState()

  assert.equal(state.kind, "stale")
  assert.equal(state.fatal, false)
})

test("dashboard-web event list stream subscriptions default to one connection", () => {
  assert.deepEqual(
    getDashboardEventStreamSubscriptions([
      dashboardEvent("active", { id: "active-1" }),
      dashboardEvent("paused", { id: "paused-1" })
    ]),
    ["active-1"]
  )
})

test("dashboard-web refetch scheduler coalesces burst lifecycle events", async () => {
  const timers: Array<() => void> = []
  let refetchCount = 0
  const scheduler = createDashboardRefetchScheduler(
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

test("dashboard-web successful operator mutation calls explicit refetch exactly once", async () => {
  const calls: string[] = []

  await runOperatorMutationWithRefresh(
    async () => {
      calls.push("mutate")
    },
    async () => {
      calls.push("refresh")
    }
  )

  assert.deepEqual(calls, ["mutate", "refresh"])
})

test("dashboard-web lifecycle mutation sequence refetches event detail and operator queue once", async () => {
  const calls: string[] = []

  await runOperatorMutationWithRefresh(
    async () => {
      calls.push("pause")
    },
    async () => {
      calls.push("getOperatorQueue")
      calls.push("getDashboardEvent")
    }
  )

  assert.deepEqual(calls, ["pause", "getOperatorQueue", "getDashboardEvent"])
})

test("dashboard-web operator pending action clears on success failure and timeout", async () => {
  const successStates: Array<string | null> = []
  await runOperatorActionWithPending({
    handleError: () => undefined,
    label: "pause",
    mutate: async () => undefined,
    refresh: async () => undefined,
    setPendingAction: (value) => successStates.push(value)
  })
  assert.deepEqual(successStates, ["pause", null])

  const failureStates: Array<string | null> = []
  let failureMessage = ""
  await runOperatorActionWithPending({
    handleError: (error) => {
      failureMessage = error instanceof Error ? error.message : ""
    },
    label: "pause",
    mutate: async () => {
      throw new Error("failed")
    },
    refresh: async () => {
      throw new Error("refresh should not run")
    },
    setPendingAction: (value) => failureStates.push(value)
  })
  assert.deepEqual(failureStates, ["pause", null])
  assert.equal(failureMessage, "failed")

  const timeoutStates: Array<string | null> = []
  let timeoutKind = ""
  await runOperatorActionWithPending({
    handleError: (error) => {
      timeoutKind = getOperatorQueueErrorState(error).kind
    },
    label: "pause",
    mutate: async () => {
      throw new DashboardApiError(0, "REQUEST_TIMEOUT", DASHBOARD_MUTATION_TIMEOUT_MESSAGE)
    },
    refresh: async () => undefined,
    setPendingAction: (value) => timeoutStates.push(value)
  })
  assert.deepEqual(timeoutStates, ["pause", null])
  assert.equal(timeoutKind, "error")
})

test("dashboard-web active lifecycle model maps first action to pause", () => {
  const actions = getLifecycleActionModels("active")

  assert.equal(actions[0]?.action, "pause")
})

test("dashboard-web event list errors map to operator-readable states", () => {
  assert.equal(getDashboardEventsErrorState({ status: 401 }).kind, "login")
  assert.equal(getDashboardEventsErrorState({ status: 403 }).kind, "forbidden")
  const unavailable = getDashboardEventsErrorState(new Error("fetch failed"))

  assert.equal(unavailable.kind, "unavailable")
  assert.match(unavailable.message, /Nie udalo sie pobrac wydarzen/)
})

test("dashboard-web manual event id entry is explicitly a QA/dev fallback", () => {
  assert.match(MANUAL_EVENT_ID_FALLBACK_TITLE, /ID/)
  assert.match(MANUAL_EVENT_ID_FALLBACK_DESCRIPTION, /QA\/dev/)
})

test("dashboard-web API client builds operator queue URL", async () => {
  let requestedUrl = ""
  await withDashboardEnvAsync({ NEXT_PUBLIC_API_URL: "http://localhost:4321/" }, async () => {
    await getOperatorQueue("event-1", {
      fetchImpl: async (input) => {
        requestedUrl = String(input)
        return jsonResponse(operatorQueuePayload())
      }
    })
  })

  assert.equal(requestedUrl, "http://localhost:4321/dashboard/events/event-1/operator-queue")
})

test("dashboard-web getOperatorQueue uses credentials include", async () => {
  let requestedCredentials: RequestCredentials | undefined

  await getOperatorQueue("event-1", {
    fetchImpl: async (_input, init) => {
      requestedCredentials = init?.credentials
      return jsonResponse(operatorQueuePayload())
    }
  })

  assert.equal(requestedCredentials, "include")
})

test("dashboard-web queue mutation endpoints use POST and credentials include", async () => {
  const calls: Array<{ method: string | undefined; credentials: RequestCredentials | undefined; signal: AbortSignal | null | undefined; url: string }> = []
  const fetchImpl: DashboardFetch = async (input, init) => {
    calls.push({ credentials: init?.credentials, method: init?.method, signal: init?.signal, url: String(input) })
    return jsonResponse({ request: operatorQueueItem("approved") })
  }

  await approveRequest("event-1", "request-1", { fetchImpl })
  await rejectRequest("event-1", "request-1", { fetchImpl })
  await startRequest("event-1", "request-1", { fetchImpl })
  await doneRequest("event-1", "request-1", { fetchImpl })
  await skipRequest("event-1", "request-1", { fetchImpl })

  assert.deepEqual(
    calls.map((call) => call.url),
    [
      "http://localhost:4321/dashboard/events/event-1/requests/request-1/approve",
      "http://localhost:4321/dashboard/events/event-1/requests/request-1/reject",
      "http://localhost:4321/dashboard/events/event-1/requests/request-1/start",
      "http://localhost:4321/dashboard/events/event-1/requests/request-1/done",
      "http://localhost:4321/dashboard/events/event-1/requests/request-1/skip"
    ]
  )
  assert.deepEqual(calls.map((call) => call.method), ["POST", "POST", "POST", "POST", "POST"])
  assert.deepEqual(calls.map((call) => call.credentials), ["include", "include", "include", "include", "include"])
  assert.equal(calls.every((call) => call.signal instanceof AbortSignal), true)
})

test("dashboard-web moveRequest sends position JSON", async () => {
  let requestedBody = ""
  let requestedContentType = ""

  await moveRequest("event-1", "request-1", 3, {
    fetchImpl: async (_input, init) => {
      requestedBody = String(init?.body)
      requestedContentType = new Headers(init?.headers).get("Content-Type") ?? ""
      return jsonResponse({ request: operatorQueueItem("approved") })
    }
  })

  assert.deepEqual(JSON.parse(requestedBody), { position: 3 })
  assert.equal(requestedContentType, "application/json")
})

test("dashboard-web stream URL builder uses dashboard event stream endpoint", () => {
  withDashboardEnv({ NEXT_PUBLIC_API_URL: "http://localhost:4321/" }, () => {
    assert.equal(buildDashboardEventStreamUrl("event-1"), "http://localhost:4321/dashboard/events/event-1/stream")
  })
})

test("dashboard-web operator queue stream opens one event stream with credentials", () => {
  const statuses: string[] = []
  let requestedUrl = ""
  let requestedCredentials = false

  const stream = createOperatorQueueStream({
    eventSourceFactory: (url, init) => {
      requestedUrl = url
      requestedCredentials = init.withCredentials
      return new FakeDashboardEventSource()
    },
    onRefetch: () => undefined,
    onStatusChange: (status) => statuses.push(status),
    streamUrl: "http://localhost:4321/dashboard/events/event-1/stream"
  })

  assert.equal(requestedUrl, "http://localhost:4321/dashboard/events/event-1/stream")
  assert.equal(requestedCredentials, true)
  assert.deepEqual(statuses, ["connecting"])

  stream.close()
})

test("dashboard-web operator queue stream refreshes after queue update and request events", () => {
  const source = new FakeDashboardEventSource()
  let refetchCount = 0

  const stream = createOperatorQueueStream({
    eventSourceFactory: () => source,
    onRefetch: () => {
      refetchCount += 1
    },
    onStatusChange: () => undefined,
    streamUrl: "http://localhost:4321/dashboard/events/event-1/stream"
  })

  source.emit("queue.updated")
  source.emit("request.approved")
  source.emit("connected")

  assert.equal(refetchCount, 2)
  assert.equal(operatorQueueRefetchEvents.includes("queue.updated"), true)
  stream.close()
})

test("dashboard-web operator queue stream cleanup closes subscription", () => {
  const source = new FakeDashboardEventSource()
  const statuses: string[] = []

  const stream = createOperatorQueueStream({
    eventSourceFactory: () => source,
    onRefetch: () => undefined,
    onStatusChange: (status) => statuses.push(status),
    streamUrl: "http://localhost:4321/dashboard/events/event-1/stream"
  })

  stream.close()

  assert.equal(source.closeCalls, 1)
  assert.deepEqual(statuses, ["connecting", "disconnected"])
})

test("dashboard-web operator queue stream errors are non-fatal", () => {
  const source = new FakeDashboardEventSource()
  const statuses: string[] = []

  const stream = createOperatorQueueStream({
    eventSourceFactory: () => source,
    onRefetch: () => undefined,
    onStatusChange: (status) => statuses.push(status),
    streamUrl: "http://localhost:4321/dashboard/events/event-1/stream"
  })

  source.onerror?.(new Event("error"))
  const state = getOperatorQueueStreamErrorState()

  assert.equal(statuses.at(-1), "disconnected")
  assert.equal(state.fatal, false)
  assert.equal(state.kind, "stale")
  stream.close()
})

test("dashboard-web operator queue stream subscriptions dedupe by event id", () => {
  assert.deepEqual(getOperatorQueueStreamSubscriptions("event-1"), ["event-1"])
  assert.deepEqual(getOperatorQueueStreamSubscriptions(null), [])
  assert.equal(getOperatorQueueStreamKey("event-1"), getOperatorQueueStreamKey("event-1"))
})

test("dashboard-web operator queue state maps API statuses to readable UI states", () => {
  assert.equal(getOperatorQueueErrorState({ status: 401, message: "Unauthorized" }).kind, "login")
  assert.equal(getOperatorQueueErrorState({ status: 403, message: "Forbidden" }).kind, "forbidden")
  assert.equal(getOperatorQueueErrorState({ status: 409, message: "Conflict" }).kind, "conflict")
})

test("dashboard-web operator queue refetch helper reacts to queue events", () => {
  assert.equal(shouldRefetchOperatorQueue("queue.updated"), true)
  assert.equal(shouldRefetchOperatorQueue("request.created"), true)
  assert.equal(shouldRefetchOperatorQueue("event.closed"), true)
  assert.equal(shouldRefetchOperatorQueue("connected"), false)
})

test("dashboard-web operator queue safe refresh interval and visibility policy are explicit", () => {
  assert.equal(OPERATOR_QUEUE_REFRESH_INTERVAL_MS, 5000)
  assert.equal(shouldPollOperatorQueue("visible", null), true)
  assert.equal(shouldPollOperatorQueue("hidden", null), false)
  assert.equal(shouldPollOperatorQueue("visible", "pause"), false)
})

test("dashboard-web operator queue refresh controller blocks overlapping refreshes", async () => {
  let calls = 0
  let resolveFetch: (snapshot: { eventDetail: DashboardEventDetail; queue: ReturnType<typeof operatorQueuePayload> }) => void = () => {
    throw new Error("fetch promise was not created")
  }
  const controller = createOperatorQueueRefreshController({
    fetchSnapshot: () => {
      calls += 1
      return new Promise((resolve) => {
        resolveFetch = resolve
      })
    },
    initialSnapshot: {
      eventDetail: dashboardEventDetail("active"),
      queue: operatorQueuePayload()
    }
  })

  const first = controller.refresh()
  const second = controller.refresh()
  assert.equal(calls, 1)
  assert.strictEqual(first, second)

  resolveFetch({
    eventDetail: dashboardEventDetail("paused"),
    queue: operatorQueuePayload("paused")
  })
  const state = await first

  assert.equal(state.snapshot.queue?.event.status, "paused")
  assert.equal(state.isRefreshing, false)
})

test("dashboard-web operator queue manual refresh fetches queue and event detail once", async () => {
  let queueCalls = 0
  let eventCalls = 0
  const controller = createOperatorQueueRefreshController({
    fetchSnapshot: async () => {
      queueCalls += 1
      eventCalls += 1
      return {
        eventDetail: dashboardEventDetail("active"),
        queue: operatorQueuePayload()
      }
    },
    initialSnapshot: {
      eventDetail: null,
      queue: null
    }
  })

  await controller.refresh()

  assert.equal(queueCalls, 1)
  assert.equal(eventCalls, 1)
})

test("dashboard-web operator queue failed refresh preserves previous snapshot and is non-fatal", async () => {
  const previousQueue = operatorQueuePayload()
  const controller = createOperatorQueueRefreshController({
    fetchSnapshot: async () => {
      throw new Error("API unavailable")
    },
    initialSnapshot: {
      eventDetail: dashboardEventDetail("active"),
      queue: previousQueue
    }
  })

  const state = await controller.refresh()

  assert.equal(state.snapshot.queue, previousQueue)
  assert.equal(state.error, OPERATOR_QUEUE_REFRESH_ERROR_MESSAGE)
  assert.equal(state.isRefreshing, false)
})

test("dashboard-web validates operator queue response shape", () => {
  assert.deepEqual(assertOperatorQueueResponse(operatorQueuePayload()).pending[0]?.status, "pending")
  assert.throws(() => assertOperatorQueueResponse({ event: {}, pending: [] }), /Invalid dashboard API response: operator queue/)
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  })
}

class FakeDashboardEventSource implements DashboardEventSource {
  closeCalls = 0
  listeners = new Map<string, Array<() => void>>()
  onerror: ((event: Event) => void) | null = null
  onopen: ((event: Event) => void) | null = null

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  close(): void {
    this.closeCalls += 1
  }

  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener()
    }
  }
}

function operatorQueuePayload(status = "active") {
  return {
    event: {
      id: "event-1",
      name: "Demo Karaoke Night",
      status
    },
    venue: {
      id: "venue-1",
      name: "Demo Klub",
      slug: "demo-klub"
    },
    pending: [operatorQueueItem("pending")],
    approved: [operatorQueueItem("approved", { position: 1 })],
    now: operatorQueueItem("now"),
    done: [operatorQueueItem("done")],
    rejected: [operatorQueueItem("rejected")],
    skipped: [operatorQueueItem("skipped")]
  }
}

function dashboardEvent(status: DashboardEventSummary["status"], overrides: Partial<DashboardEventSummary> = {}): DashboardEventSummary {
  return {
    id: "event-1",
    name: "Demo Karaoke Night",
    slug: "demo-karaoke",
    status,
    startsAt: "2026-06-02T20:00:00.000Z",
    endsAt: null,
    publicJoinEnabled: true,
    publicQueueEnabled: true,
    venue: {
      id: "venue-1",
      name: "Demo Klub",
      slug: "demo-klub"
    },
    operatedByOrganization: {
      id: "org-1",
      name: "Poza Nuta Demo",
      slug: "poza-nuta-demo"
    },
    ...overrides
  }
}

function dashboardEventDetail(
  status: DashboardEventSummary["status"],
  overrides: Partial<DashboardEventDetail> = {}
): DashboardEventDetail {
  return {
    id: "event-1",
    venueId: "venue-1",
    operatedByOrganizationId: "org-1",
    createdByUserId: "user-1",
    name: "Demo Karaoke Night",
    slug: "demo-karaoke",
    status,
    startsAt: "2026-06-02T20:00:00.000Z",
    endsAt: null,
    publicJoinEnabled: true,
    publicQueueEnabled: true,
    ...overrides
  }
}

function operatorQueueItem(status: string, overrides: Partial<OperatorQueueItem> = {}): OperatorQueueItem {
  return {
    ...baseOperatorQueueItem(),
    id: `request-${status}`,
    status,
    ...overrides
  }
}

function baseOperatorQueueItem(): OperatorQueueItem {
  return {
    id: "request-1",
    singerName: "Alicja",
    displayName: "Alicja",
    sourceId: "ising",
    sourceTrackId: "9053",
    songTitle: "Krolowa Lez",
    songArtist: "Agnieszka Chylinska",
    songUrl: "https://ising.example/song",
    note: "Operator note",
    status: "pending",
    position: null,
    requestedAt: "2026-06-02T10:00:00.000Z",
    approvedAt: null,
    startedAt: null,
    finishedAt: null,
    createdAt: "2026-06-02T10:00:00.000Z",
    updatedAt: "2026-06-02T10:00:00.000Z"
  }
}

function pendingDashboardMe(): DashboardMeResponse {
  return {
    authenticated: true,
    user: {
      id: "user-1",
      email: "pending@example.com",
      name: null,
      status: "pending"
    },
    platform: {
      roles: []
    },
    access: {
      dashboardAllowed: false,
      reason: "pending_approval"
    }
  }
}

function allowedDashboardMe(): DashboardMeResponse {
  return {
    authenticated: true,
    user: {
      id: "user-1",
      email: "owner@example.com",
      name: "Owner",
      status: "active"
    },
    platform: {
      roles: ["platform_owner"]
    },
    access: {
      dashboardAllowed: true,
      reason: "platform_role"
    }
  }
}

function withDashboardEnv(env: { NEXT_PUBLIC_API_URL?: string; NEXT_PUBLIC_DASHBOARD_URL?: string }, action: () => void): void {
  const previousApi = process.env.NEXT_PUBLIC_API_URL
  const previousDashboard = process.env.NEXT_PUBLIC_DASHBOARD_URL

  try {
    restoreEnv("NEXT_PUBLIC_API_URL", env.NEXT_PUBLIC_API_URL)
    restoreEnv("NEXT_PUBLIC_DASHBOARD_URL", env.NEXT_PUBLIC_DASHBOARD_URL)
    action()
  } finally {
    restoreEnv("NEXT_PUBLIC_API_URL", previousApi)
    restoreEnv("NEXT_PUBLIC_DASHBOARD_URL", previousDashboard)
  }
}

async function withDashboardEnvAsync(
  env: { NEXT_PUBLIC_API_URL?: string; NEXT_PUBLIC_DASHBOARD_URL?: string },
  action: () => Promise<void>
): Promise<void> {
  const previousApi = process.env.NEXT_PUBLIC_API_URL
  const previousDashboard = process.env.NEXT_PUBLIC_DASHBOARD_URL

  try {
    restoreEnv("NEXT_PUBLIC_API_URL", env.NEXT_PUBLIC_API_URL)
    restoreEnv("NEXT_PUBLIC_DASHBOARD_URL", env.NEXT_PUBLIC_DASHBOARD_URL)
    await action()
  } finally {
    restoreEnv("NEXT_PUBLIC_API_URL", previousApi)
    restoreEnv("NEXT_PUBLIC_DASHBOARD_URL", previousDashboard)
  }
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}
