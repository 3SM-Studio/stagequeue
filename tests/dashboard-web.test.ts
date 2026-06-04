import assert from "node:assert/strict"
import test from "node:test"
import {
  approveRequest,
  assertOperatorQueueResponse,
  assertMeResponse,
  assertPlatformSetupStatusResponse,
  buildDashboardEventStreamUrl,
  buildDashboardApiUrl,
  claimPlatformOwner,
  doneRequest,
  getDashboardApiBaseUrl,
  getMe,
  getOperatorQueue,
  getPlatformSetupStatus,
  moveRequest,
  type OperatorQueueItem,
  rejectRequest,
  skipRequest,
  startRequest,
  type DashboardFetch
} from "../apps/dashboard-web/lib/apiClient.ts"
import {
  buildGoogleSignInOptions,
  DASHBOARD_AUTH_BASE_PATH,
  getDashboardAuthClientBaseUrl,
  getGoogleSignInCallbackUrl,
  getGoogleSignInErrorMessage,
  signInWithGoogle
} from "../apps/dashboard-web/lib/authClient.ts"
import { getDashboardViewState } from "../apps/dashboard-web/lib/dashboardState.ts"
import { getOperatorQueueErrorState, shouldRefetchOperatorQueue } from "../apps/dashboard-web/lib/operatorQueueState.ts"
import { getPlatformSetupViewState } from "../apps/dashboard-web/lib/setupState.ts"

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
      await signInWithGoogle({
        signIn: {
          social: async (options) => {
            requestedOptions = options
            return { error: null }
          }
        }
      })
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
      assert.equal(JSON.stringify(buildGoogleSignInOptions()).includes("/auth/sign-in/social"), false)
    }
  )
})

test("dashboard-web maps Better Auth social sign-in errors to readable messages", async () => {
  assert.equal(getGoogleSignInErrorMessage({ error: { message: "Google OAuth is not configured" } }), "Google OAuth is not configured")
  await assert.rejects(
    () =>
      signInWithGoogle({
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

test("dashboard-web setup state asks unauthenticated users to sign in", () => {
  const state = getPlatformSetupViewState({ setupRequired: true }, { authenticated: false })

  assert.equal(state.kind, "unauthenticated")
  assert.equal(state.showClaimForm, false)
  assert.equal(state.showGoogleSignIn, true)
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
  if (state.kind === "claim") {
    assert.equal(state.userEmail, "owner@example.com")
  }
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
  const calls: Array<{ method: string | undefined; credentials: RequestCredentials | undefined; url: string }> = []
  const fetchImpl: DashboardFetch = async (input, init) => {
    calls.push({ credentials: init?.credentials, method: init?.method, url: String(input) })
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

function operatorQueuePayload() {
  return {
    event: {
      id: "event-1",
      name: "Demo Karaoke Night",
      status: "active"
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
