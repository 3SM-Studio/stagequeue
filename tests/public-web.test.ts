import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildPublicApiUrl,
  buildPublicEventStreamUrl,
  buildPublicVenueStreamUrl,
  claimPublicInvite,
  getBrowserApiBaseUrl,
  getMyRequestsByEventPublicId,
  getMyRequestsByVenueSlug,
  getPublicEventDetail,
  getPublicQueue,
  getPublicQueueByVenueSlug,
  type PublicDiscoveryResponse,
  type PublicEventDetail,
  type PublicMyRequest,
  submitSongRequest,
  submitSongRequestByVenueSlug,
} from "../apps/public-web/lib/apiClient.ts";
import {
  assertActiveEventResponse,
  assertMyRequestsResponse,
  assertPublicDiscoveryResponse,
  assertPublicEventDetailResponse,
  assertPublicInviteClaimResponse,
  assertPublicQueueResponse,
  assertSubmitRequestResponse,
  assertVenueResponse,
} from "../apps/public-web/lib/apiValidation.ts";
import {
  formatDiscoveryStart,
  getDiscoveryJoinLabel,
} from "../apps/public-web/lib/discoveryPresentation.ts";
import {
  getPublicJoinStreamErrorState,
  getPublicJoinViewState,
  getPublicVenueStreamKey,
  shouldRefetchPublicJoinOnSse,
} from "../apps/public-web/lib/joinState.ts";
import { getJoinVisibility } from "../apps/public-web/lib/joinVisibility.ts";
import {
  joinPageMetadata,
  noindexMetadata,
  queuePageMetadata,
  venuePageMetadata,
} from "../apps/public-web/lib/metadata.ts";
import {
  createMyRequestsRefreshController,
  getMyRequestStatusMessage,
  getTrackedRequest,
  shouldRefreshMyRequestsOnFocus,
} from "../apps/public-web/lib/myRequestsState.ts";
import {
  getPublicDiscoveryPageData,
  getPublicEventLandingPageData,
  getPublicEventSessionPageData,
  getVenueMetadataData,
  getVenuePageData,
} from "../apps/public-web/lib/pageData.ts";
import { getPublicEventPageState } from "../apps/public-web/lib/publicEventPageState.ts";
import {
  createPublicQueueStream,
  type PublicQueueEventSource,
} from "../apps/public-web/lib/publicQueueStream.ts";
import { shouldRefetchQueue } from "../apps/public-web/lib/queueRefresh.ts";
import { createRefetchScheduler as createPublicRefetchScheduler } from "../apps/public-web/lib/refetchScheduler.ts";
import {
  fetchPublicDiscovery,
  getServerApiBaseUrl,
  getServerPublicQueueByVenueSlug,
} from "../apps/public-web/lib/serverApiClient.ts";
import { isReservedPublicPathSlug } from "../apps/public-web/lib/staticSlugGuard.ts";
import { validateSubmitSongRequest } from "../apps/public-web/lib/submitValidation.ts";

test("public-web API client builds URLs against NEXT_PUBLIC_API_URL", () => {
  const previous = process.env.NEXT_PUBLIC_API_URL;
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:4321/";
  try {
    assert.equal(
      buildPublicApiUrl("/public/venues/klub-x"),
      "http://localhost:4321/public/venues/klub-x",
    );
  } finally {
    restoreEnv("NEXT_PUBLIC_API_URL", previous);
  }
});

test("public-web API client builds venue-first queue request and stream URLs", () => {
  const previous = process.env.NEXT_PUBLIC_API_URL;
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:4321/";
  try {
    assert.equal(
      buildPublicApiUrl("/public/venues/klub-x/queue"),
      "http://localhost:4321/public/venues/klub-x/queue",
    );
    assert.equal(
      buildPublicApiUrl("/public/venues/klub-x/requests"),
      "http://localhost:4321/public/venues/klub-x/requests",
    );
    assert.equal(
      buildPublicVenueStreamUrl("klub-x"),
      "http://localhost:4321/public/venues/klub-x/stream",
    );
  } finally {
    restoreEnv("NEXT_PUBLIC_API_URL", previous);
  }
});

test("public-web API client builds event-first public event detail URL", async () => {
  const previousFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return jsonResponse(validPublicEventDetailResponse());
  };

  try {
    const detail = await getPublicEventDetail("ka2Md-d1das");

    assert.equal(detail.event.name, "Friday Karaoke");
    assert.equal(requestedUrl.endsWith("/public/events/ka2Md-d1das"), true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("public-web server client fetches the discovery endpoint", async () => {
  const previousFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return jsonResponse(validPublicDiscoveryResponse());
  };

  try {
    const discovery = await fetchPublicDiscovery();

    assert.equal(requestedUrl.endsWith("/public/discovery"), true);
    assert.equal(discovery.now[0]?.eventPublicId, "active-public-event");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("public-web API client builds event-first queue and stream URLs", async () => {
  const previousFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestedCredentials: RequestCredentials | undefined;
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedCredentials = init?.credentials;
    return jsonResponse(validPublicQueueResponse());
  };

  try {
    const queue = await getPublicQueue("ka2Md-d1das");

    assert.equal(queue.event?.publicId, "ka2Md-d1das");
    assert.equal(
      requestedUrl.endsWith("/public/events/ka2Md-d1das/queue"),
      true,
    );
    assert.equal(requestedCredentials, "include");
    assert.equal(
      buildPublicEventStreamUrl("ka2Md-d1das").endsWith(
        "/public/events/ka2Md-d1das/stream",
      ),
      true,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("public-web invite claim client posts invite code with credentials include", async () => {
  const previousFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestedMethod: string | undefined;
  let requestedCredentials: RequestCredentials | undefined;
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedMethod = init?.method;
    requestedCredentials = init?.credentials;
    return jsonResponse(validInviteClaimResponse());
  };

  try {
    const claim = await claimPublicInvite("inviteCode1");

    assert.equal(claim.redirectTo, "/event/ka2Md-d1das/session");
    assert.equal(
      requestedUrl.endsWith("/public/invites/inviteCode1/claim"),
      true,
    );
    assert.equal(requestedMethod, "POST");
    assert.equal(requestedCredentials, "include");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("public-web server API base URL prefers API_INTERNAL_URL", () => {
  withApiEnv(
    {
      API_INTERNAL_URL: "http://api:4321/",
      NEXT_PUBLIC_API_URL: "https://public-api.example.com/",
    },
    () => {
      assert.equal(getServerApiBaseUrl(), "http://api:4321");
    },
  );
});

test("public-web server API base URL falls back to NEXT_PUBLIC_API_URL", () => {
  withApiEnv(
    {
      API_INTERNAL_URL: undefined,
      NEXT_PUBLIC_API_URL: "https://public-api.example.com/",
    },
    () => {
      assert.equal(getServerApiBaseUrl(), "https://public-api.example.com");
    },
  );
});

test("public-web server API base URL falls back to the local default", () => {
  withApiEnv(
    { API_INTERNAL_URL: undefined, NEXT_PUBLIC_API_URL: undefined },
    () => {
      assert.equal(getServerApiBaseUrl(), "http://localhost:4321");
    },
  );
});

test("public-web browser API base URL uses NEXT_PUBLIC_API_URL and ignores API_INTERNAL_URL", () => {
  withApiEnv(
    {
      API_INTERNAL_URL: "http://api:4321/",
      NEXT_PUBLIC_API_URL: "https://public-api.example.com/",
    },
    () => {
      assert.equal(getBrowserApiBaseUrl(), "https://public-api.example.com");
    },
  );
});

test("public-web browser API base URL falls back to the local default", () => {
  withApiEnv(
    { API_INTERNAL_URL: "http://api:4321/", NEXT_PUBLIC_API_URL: undefined },
    () => {
      assert.equal(getBrowserApiBaseUrl(), "http://localhost:4321");
    },
  );
});

test("public-web venue loader handles inactive state", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
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
          verificationStatus: "verified",
        },
      });
    }
    if (url.endsWith("/public/venues/klub-x/active-event")) {
      return jsonResponse({
        venue: {
          id: "venue-1",
          slug: "klub-x",
          name: "Klub X",
          city: "Warszawa",
          timezone: "Europe/Warsaw",
        },
        activeEvent: null,
      });
    }
    return jsonResponse(
      { error: { code: "NOT_FOUND", message: "Missing" } },
      404,
    );
  };

  try {
    const data = await getVenuePageData("klub-x");

    assert.equal(data.kind, "ready");
    if (data.kind === "ready") {
      assert.equal(data.active.activeEvent, null);
      assert.equal(data.venue.name, "Klub X");
    }
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("public-web event session loader forwards participant cookie to event detail", async () => {
  const previousFetch = globalThis.fetch;
  let eventDetailCookie: string | undefined;
  const requestedPaths: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requestedPaths.push(new URL(url).pathname);
    const headers = init?.headers as Record<string, string> | undefined;
    if (url.endsWith("/public/events/ka2Md-d1das")) {
      eventDetailCookie = headers?.cookie;
      return jsonResponse(validPublicEventDetailResponse());
    }
    if (url.endsWith("/public/events/ka2Md-d1das/queue")) {
      return jsonResponse(validPublicQueueResponse());
    }
    return jsonResponse(
      { error: { code: "NOT_FOUND", message: "Missing" } },
      404,
    );
  };

  try {
    const data = await getPublicEventSessionPageData(
      "ka2Md-d1das",
      "pn_participant=participant-token",
    );

    assert.equal(data.kind, "ready");
    assert.equal(eventDetailCookie, "pn_participant=participant-token");
    assert.deepEqual(requestedPaths, [
      "/public/events/ka2Md-d1das",
      "/public/events/ka2Md-d1das/queue",
    ]);
    if (data.kind === "ready") {
      assert.equal(data.detail.event.publicId, "ka2Md-d1das");
      assert.equal(data.queue?.event?.publicId, "ka2Md-d1das");
    }
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("public-web event session loader maps private event response to controlled 404 state", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    jsonResponse(
      { error: { code: "NOT_FOUND", message: "Missing event" } },
      404,
    );

  try {
    const data = await getPublicEventSessionPageData("privateEvent1");

    assert.deepEqual(data, { kind: "not-found" });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("public event landing loader fetches only event detail and forwards participant cookie", async () => {
  const previousFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  let eventDetailCookie: string | undefined;
  globalThis.fetch = async (input, init) => {
    requestedUrls.push(String(input));
    eventDetailCookie = (init?.headers as Record<string, string> | undefined)
      ?.cookie;
    return jsonResponse(validPublicEventDetailResponse());
  };

  try {
    const data = await getPublicEventLandingPageData(
      "ka2Md-d1das",
      "pn_participant=participant-token",
    );

    assert.equal(data.kind, "ready");
    assert.deepEqual(
      requestedUrls.map((url) => new URL(url).pathname),
      ["/public/events/ka2Md-d1das"],
    );
    assert.equal(eventDetailCookie, "pn_participant=participant-token");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("public event landing loader keeps hidden events on the controlled 404 path", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    jsonResponse(
      { error: { code: "NOT_FOUND", message: "Missing event" } },
      404,
    );

  try {
    assert.deepEqual(await getPublicEventLandingPageData("privateEvent1"), {
      kind: "not-found",
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("public-web discovery page data maps API failure to controlled error state", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    jsonResponse(
      { error: { code: "API_UNAVAILABLE", message: "Unavailable" } },
      503,
    );

  try {
    const data = await getPublicDiscoveryPageData();

    assert.deepEqual(data, {
      kind: "api-error",
      message: "Spróbuj odświeżyć stronę za chwilę.",
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("public-web reserved static slugs do not call the public venue API", async () => {
  const previousFetch = globalThis.fetch;
  const reservedSlugs = [
    "sw.js",
    "favicon.ico",
    "robots.txt",
    "sitemap.xml",
    "manifest.webmanifest",
    "_next",
    "assets",
  ];
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    throw new Error("Reserved static slug should not call fetch");
  };

  try {
    for (const slug of reservedSlugs) {
      assert.equal(isReservedPublicPathSlug(slug), true);

      const pageData = await getVenuePageData(slug);
      assert.deepEqual(pageData, { kind: "not-found" });

      const metadataData = await getVenueMetadataData(slug);
      assert.equal(metadataData, null);

      await assert.rejects(() => getServerPublicQueueByVenueSlug(slug), {
        name: "PublicApiError",
        status: 404,
        code: "NOT_FOUND",
      });
    }

    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("legacy venue join queue and event-slug routes are hard not-found pages", () => {
  const removedRouteFiles = [
    "apps/public-web/app/[venueSlug]/join/page.tsx",
    "apps/public-web/app/[venueSlug]/queue/page.tsx",
    "apps/public-web/app/[venueSlug]/events/[eventSlug]/page.tsx",
    "apps/public-web/app/[venueSlug]/events/[eventSlug]/join/page.tsx",
    "apps/public-web/app/[venueSlug]/events/[eventSlug]/queue/page.tsx",
  ];

  for (const routeFile of removedRouteFiles) {
    const source = readFileSync(routeFile, "utf8");
    assert.match(
      source,
      /notFound\(\)/,
      `${routeFile} should return Next.js not found`,
    );
    assert.doesNotMatch(
      source,
      /\bredirect\(|<Link|fetch\(|getVenue|getActiveEvent|PublicJoinView|PublicQueueView/,
    );
  }
});

test("legacy venue page links its active event only through eventPublicId", () => {
  const source = readFileSync(
    "apps/public-web/app/[venueSlug]/page.tsx",
    "utf8",
  );
  const statePanelsSource = readFileSync(
    "apps/public-web/components/StatePanels.tsx",
    "utf8",
  );

  assert.match(source, /href=\{`\/event\/\$\{activeEvent\.publicId\}`\}/);
  assert.doesNotMatch(source, /venue\.slug}\/(?:join|queue)/);
  assert.doesNotMatch(statePanelsSource, /active\.venue\.slug}\/queue/);
});

test("canonical landing, session, and invite routes remain event-scoped", () => {
  const eventPageSource = readFileSync(
    "apps/public-web/app/event/[eventPublicId]/page.tsx",
    "utf8",
  );
  const eventSessionPageSource = readFileSync(
    "apps/public-web/app/event/[eventPublicId]/session/page.tsx",
    "utf8",
  );
  const eventQueuePageSource = readFileSync(
    "apps/public-web/app/event/[eventPublicId]/queue/page.tsx",
    "utf8",
  );
  const eventLandingSource = readFileSync(
    "apps/public-web/components/PublicEventLandingView.tsx",
    "utf8",
  );
  const eventSessionSource = readFileSync(
    "apps/public-web/components/PublicEventSessionView.tsx",
    "utf8",
  );
  const inviteRouteSource = readFileSync(
    "apps/public-web/app/invite/[inviteCode]/route.ts",
    "utf8",
  );

  assert.match(
    eventPageSource,
    /getPublicEventLandingPageData\(eventPublicId/,
  );
  assert.match(
    eventPageSource,
    /<PublicEventLandingView eventPublicId=\{eventPublicId\}/,
  );
  assert.match(
    eventSessionPageSource,
    /getPublicEventSessionPageData\(eventPublicId/,
  );
  assert.match(
    eventSessionPageSource,
    /<PublicEventSessionView eventPublicId=\{eventPublicId\}/,
  );
  assert.match(eventQueuePageSource, /notFound\(\)/);
  assert.match(
    eventLandingSource,
    /href=\{`\/event\/\$\{eventPublicId\}\/session`\}/,
  );
  assert.doesNotMatch(eventLandingSource, /^"use client"/);
  assert.doesNotMatch(
    eventLandingSource,
    /JoinForm|PublicQueueView|EventSource|claimPublicInvite/,
  );
  assert.doesNotMatch(eventLandingSource, /\/queue/);
  assert.match(eventLandingSource, /Zeskanuj QR w lokalu/);
  assert.match(eventSessionSource, /<JoinForm eventPublicId=\{eventPublicId\}/);
  assert.match(
    eventSessionSource,
    /<PublicQueueView[\s\S]*eventPublicId=\{eventPublicId\}/,
  );
  assert.equal(eventSessionSource.match(/<PublicQueueView/g)?.length, 1);
  assert.doesNotMatch(eventSessionSource, /new EventSource/);
  assert.doesNotMatch(
    eventSessionSource,
    /setInterval|clearInterval|refetchInterval|REFRESH_INTERVAL/,
  );
  assert.match(eventSessionSource, /Zgłoszenia są zamknięte/);
  assert.doesNotMatch(eventSessionSource, /\/queue`/);
  assert.doesNotMatch(eventQueuePageSource, /PublicQueueView|JoinForm|fetch/);
  assert.match(inviteRouteSource, /claimPublicInviteServer\(inviteCode/);
  assert.match(
    inviteRouteSource,
    /NextResponse\.redirect\(new URL\(claim\.body\.redirectTo, request\.url\)\)/,
  );
});

test("public-web validates venue API responses", () => {
  assert.equal(assertVenueResponse(validVenueResponse()).venue.name, "Klub X");
  assert.throws(
    () => assertVenueResponse({ venue: { id: "venue-1" } }),
    /Invalid public API response: venue/,
  );
});

test("public-web validates active event API responses", () => {
  assert.equal(
    assertActiveEventResponse(validActiveEventResponse()).activeEvent?.publicId,
    "ka2Md-d1das",
  );
  assert.throws(
    () =>
      assertActiveEventResponse({
        venue: validActiveEventResponse().venue,
        activeEvent: { id: "event-1" },
      }),
    /Invalid public API response: active event/,
  );
});

test("public-web validates public event detail API responses", () => {
  assert.equal(
    assertPublicEventDetailResponse(validPublicEventDetailResponse()).event
      .publicId,
    "ka2Md-d1das",
  );
  assert.throws(
    () =>
      assertPublicEventDetailResponse({
        ...validPublicEventDetailResponse(),
        publicQueue: { visible: "yes" },
      }),
    /Invalid public API response: public event detail/,
  );
});

test("public-web validates discovery response and rejects internal identifiers", () => {
  const discovery = assertPublicDiscoveryResponse(
    validPublicDiscoveryResponse(),
  );

  assert.equal(discovery.now[0]?.joinState, "open");
  assert.equal(discovery.upcoming[0]?.joinState, "closed");
  assert.throws(
    () =>
      assertPublicDiscoveryResponse({
        ...validPublicDiscoveryResponse(),
        now: [
          {
            ...validPublicDiscoveryResponse().now[0],
            id: "11111111-1111-4111-8111-111111111111",
          },
        ],
      }),
    /Invalid public API response: public discovery/,
  );
});

test("public-web validates public queue API responses", () => {
  assert.equal(
    assertPublicQueueResponse(validPublicQueueResponse()).queue[0].singerName,
    "Michał",
  );
  assert.throws(
    () =>
      assertPublicQueueResponse({
        ...validPublicQueueResponse(),
        queue: [{ id: "request-1" }],
      }),
    /Invalid public API response: public queue/,
  );
});

test("public-web validates inactive venue-first queue API response", () => {
  assert.equal(
    assertPublicQueueResponse(validInactiveVenueQueueResponse()).event,
    null,
  );
});

test("public-web queue flow fetches venue-first snapshot without eventId", async () => {
  const previousFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return jsonResponse(validPublicQueueResponse());
  };

  try {
    const queue = await getPublicQueueByVenueSlug("klub-x");

    assert.equal(queue.event?.publicId, "ka2Md-d1das");
    assert.equal(requestedUrl.endsWith("/public/venues/klub-x/queue"), true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("public-web event-first join flow submits by publicId", async () => {
  const previousFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestedCredentials: RequestCredentials | undefined;
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedCredentials = init?.credentials;
    return jsonResponse(validSubmitResponse(), 201);
  };

  try {
    const result = await submitSongRequest("ka2Md-d1das", {
      singerName: "Michal",
      sourceId: "ising",
      sourceTrackId: "9053",
      songTitle: "Krolowa Lez",
      songArtist: "Agnieszka Chylinska",
      songUrl: "",
      note: "",
    });

    assert.equal(result.request.status, "pending");
    assert.equal(
      requestedUrl.endsWith("/public/events/ka2Md-d1das/requests"),
      true,
    );
    assert.equal(requestedCredentials, "include");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("public-web invite claim redirects to participant session before event-first submit", async () => {
  const previousFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  const requestedCredentials: Array<RequestCredentials | undefined> = [];
  globalThis.fetch = async (input, init) => {
    requestedUrls.push(String(input));
    requestedCredentials.push(init?.credentials);
    if (String(input).endsWith("/public/invites/inviteCode1/claim")) {
      return jsonResponse(validInviteClaimResponse());
    }
    return jsonResponse(validSubmitResponse(), 201);
  };

  try {
    const claim = await claimPublicInvite("inviteCode1");
    const submit = await submitSongRequest(claim.eventPublicId, {
      singerName: "Michal",
      sourceId: "ising",
      sourceTrackId: "9053",
      songTitle: "Krolowa Lez",
      songArtist: "Agnieszka Chylinska",
      songUrl: "",
      note: "",
    });

    assert.equal(claim.redirectTo, "/event/ka2Md-d1das/session");
    assert.equal(submit.request.status, "pending");
    assert.equal(
      requestedUrls[0]?.endsWith("/public/invites/inviteCode1/claim"),
      true,
    );
    assert.equal(
      requestedUrls[1]?.endsWith("/public/events/ka2Md-d1das/requests"),
      true,
    );
    assert.deepEqual(requestedCredentials, ["include", "include"]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("public-web join flow submits venue-first request without eventId", async () => {
  const previousFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestedCredentials: RequestCredentials | undefined;
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedCredentials = init?.credentials;
    return jsonResponse(validSubmitResponse(), 201);
  };

  try {
    const result = await submitSongRequestByVenueSlug("klub-x", {
      singerName: "Michal",
      sourceId: "ising",
      sourceTrackId: "9053",
      songTitle: "Krolowa Lez",
      songArtist: "Agnieszka Chylinska",
      songUrl: "",
      note: "",
    });

    assert.equal(result.request.status, "pending");
    assert.equal(requestedUrl.endsWith("/public/venues/klub-x/requests"), true);
    assert.equal(requestedCredentials, "include");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("public-web my-requests client uses venue-first URL and credentials include", async () => {
  const previousFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestedCredentials: RequestCredentials | undefined;
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedCredentials = init?.credentials;
    return jsonResponse(validMyRequestsResponse("pending"));
  };

  try {
    const result = await getMyRequestsByVenueSlug("klub-x");

    assert.equal(result.requests[0]?.status, "pending");
    assert.equal(
      requestedUrl.endsWith("/public/venues/klub-x/my-requests"),
      true,
    );
    assert.equal(requestedCredentials, "include");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("public-web my-requests client uses event-first publicId URL and credentials include", async () => {
  const previousFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestedCredentials: RequestCredentials | undefined;
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedCredentials = init?.credentials;
    return jsonResponse(validMyRequestsResponse("approved"));
  };

  try {
    const result = await getMyRequestsByEventPublicId("ka2Md-d1das");

    assert.equal(result.requests[0]?.status, "approved");
    assert.equal(
      requestedUrl.endsWith("/public/events/ka2Md-d1das/my-requests"),
      true,
    );
    assert.equal(requestedCredentials, "include");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("public-web validates submit request API responses", () => {
  assert.equal(
    assertSubmitRequestResponse(validSubmitResponse()).request.status,
    "pending",
  );
  assert.throws(
    () =>
      assertSubmitRequestResponse({
        request: { ...validSubmitResponse().request, sourceTrackId: null },
      }),
    /Invalid public API response: submit request/,
  );
});

test("public-web validates my-requests API responses", () => {
  assert.equal(
    assertMyRequestsResponse(validMyRequestsResponse("approved")).requests[0]
      ?.status,
    "approved",
  );
  assert.throws(
    () =>
      assertMyRequestsResponse({
        requests: [{ id: "request-1", status: "approved" }],
      }),
    /Invalid public API response: my requests/,
  );
});

test("public-web validates invite claim API responses", () => {
  assert.equal(
    assertPublicInviteClaimResponse(validInviteClaimResponse()).eventPublicId,
    "ka2Md-d1das",
  );
  assert.throws(
    () =>
      assertPublicInviteClaimResponse({
        eventPublicId: "ka2Md-d1das",
        redirectTo: 123,
      }),
    /Invalid public API response: public invite claim/,
  );
});

test("public-web queue refetch helper reacts to queue.updated", () => {
  assert.equal(shouldRefetchQueue("queue.updated"), true);
  assert.equal(shouldRefetchQueue("request.created"), true);
  assert.equal(shouldRefetchQueue("request.approved"), true);
  assert.equal(shouldRefetchQueue("connected"), false);
});

test("public queue stream uses one event source and refetches after events and reconnect open", () => {
  const source = new FakePublicQueueEventSource();
  const statuses: string[] = [];
  const eventTypes: string[] = [];
  let factoryCalls = 0;
  let connectedCount = 0;
  let openCount = 0;
  let refetchCount = 0;
  let requestedUrl = "";
  let withCredentials = false;

  const stream = createPublicQueueStream({
    eventSourceFactory: (url, init) => {
      factoryCalls += 1;
      requestedUrl = url;
      withCredentials = init.withCredentials;
      return source;
    },
    onConnected: () => {
      connectedCount += 1;
    },
    onEvent: (eventType) => eventTypes.push(eventType),
    onOpen: () => {
      openCount += 1;
    },
    onRefetch: () => {
      refetchCount += 1;
    },
    onStatusChange: (status) => statuses.push(status),
    streamUrl: "http://localhost:4321/public/events/ka2Md-d1das/stream",
  });

  source.open();
  source.onerror?.(new Event("error"));
  source.emit("connected");
  source.onerror?.(new Event("error"));
  source.emit("request.created");
  source.open();

  assert.equal(factoryCalls, 1);
  assert.equal(
    requestedUrl,
    "http://localhost:4321/public/events/ka2Md-d1das/stream",
  );
  assert.equal(withCredentials, true);
  assert.equal(refetchCount, 4);
  assert.equal(connectedCount, 1);
  assert.equal(openCount, 2);
  assert.deepEqual(eventTypes, ["request.created"]);
  assert.deepEqual(statuses, [
    "connecting",
    "connected",
    "reconnecting",
    "connected",
    "reconnecting",
    "connected",
    "connected",
  ]);

  stream.close();
  assert.equal(source.closeCalls, 1);
  assert.equal(statuses.at(-1), "reconnecting");
});

test("participant session uses canonical public queue stream lifecycle and visibility fallback", () => {
  const source = readFileSync(
    "apps/public-web/components/PublicQueueView.tsx",
    "utf8",
  );
  const eventPageSource = readFileSync(
    "apps/public-web/components/PublicEventSessionView.tsx",
    "utf8",
  );

  assert.match(source, /buildPublicEventStreamUrl\(eventPublicId\)/);
  assert.match(source, /createPublicQueueStream/);
  assert.match(source, /window\.addEventListener\("focus"/);
  assert.match(source, /document\.addEventListener\("visibilitychange"/);
  assert.doesNotMatch(source, /buildPublicVenueStreamUrl|venueSlug/);
  assert.doesNotMatch(
    source,
    /setInterval|clearInterval|refetchInterval|REFRESH_INTERVAL/,
  );
  assert.match(
    eventPageSource,
    /onRealtimeRefresh=\{refreshParticipantState\}/,
  );
  assert.match(source, /onConnected: onRealtimeRefresh/);
  assert.match(eventPageSource, /requests=\{myRequests\}/);

  const mountEffect = eventPageSource.slice(
    eventPageSource.indexOf("useEffect(() =>"),
    eventPageSource.indexOf("return (", eventPageSource.indexOf("useEffect(() =>")),
  );
  assert.match(mountEffect, /void loadMyRequests\(\)/);
  assert.doesNotMatch(
    mountEffect,
    /getPublicEventDetail|getPublicQueue|void refresh\(\)/,
  );
  assert.match(
    eventPageSource,
    /onClick=\{\(\) => void refresh\(\)\}/,
  );
});

test("public-web join refetch helper reacts to lifecycle and queue events", () => {
  for (const eventType of [
    "event.started",
    "event.paused",
    "event.resumed",
    "event.closed",
    "event.archived",
    "event.cancelled",
    "queue.updated",
  ]) {
    assert.equal(shouldRefetchPublicJoinOnSse(eventType), true);
  }

  assert.equal(shouldRefetchPublicJoinOnSse("request.approved"), false);
  assert.equal(shouldRefetchPublicJoinOnSse("connected"), false);
});

test("public-web venue stream key is stable and deduplicates same slug", () => {
  assert.equal(getPublicVenueStreamKey("demo-klub"), "public-venue:demo-klub");
  assert.equal(
    getPublicVenueStreamKey("demo-klub"),
    getPublicVenueStreamKey("demo-klub"),
  );
});

test("public-web refetch scheduler coalesces burst lifecycle events", async () => {
  const timers: Array<() => void> = [];
  let refetchCount = 0;
  const scheduler = createPublicRefetchScheduler(
    async () => {
      refetchCount += 1;
    },
    {
      setTimeoutFn: (callback) => {
        timers.push(callback);
        return timers.length;
      },
      clearTimeoutFn: () => undefined,
    },
  );

  scheduler.schedule();
  scheduler.schedule();
  scheduler.schedule();
  assert.equal(timers.length, 1);

  timers[0]?.();
  await Promise.resolve();

  assert.equal(refetchCount, 1);
  scheduler.cancel();
});

test("public-web submit validation requires singer and song fields", () => {
  const missing = validateSubmitSongRequest({
    singerName: "",
    sourceId: "ising",
    songTitle: "",
    songArtist: "",
    sourceTrackId: "",
    songUrl: "",
    note: "",
  });

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.ok(missing.errors.some((error) => error.includes("Imię")));
    assert.ok(missing.errors.some((error) => error.includes("Tytuł")));
    assert.ok(missing.errors.some((error) => error.includes("Wykonawca")));
  }

  const valid = validateSubmitSongRequest({
    singerName: "Michał",
    sourceId: "ising",
    songTitle: "Królowa Łez",
    songArtist: "Agnieszka Chylińska",
    sourceTrackId: "9053",
    songUrl: "",
    note: "",
  });

  assert.equal(valid.ok, true);
});

test("public-web join page policy closes the form when publicJoinEnabled is false", () => {
  const visibility = getJoinVisibility({
    publicId: "ka2Md-d1das",
    name: "Closed Join",
    slug: "closed-join",
    status: "active",
    visibility: "public",
    startsAt: null,
    endsAt: null,
    publicJoinEnabled: false,
    publicQueueEnabled: true,
    joinAccessMode: "open",
  });

  assert.equal(visibility.kind, "closed");
});

test("public-web event-first page maps detail response to view state", () => {
  const state = getPublicEventPageState(validPublicEventDetailResponse());

  assert.equal(state.title, "Friday Karaoke");
  assert.equal(state.venueLabel, "Klub X");
  assert.equal(state.statusLabel, "Wydarzenie aktywne");
  assert.equal(state.submissionsLabel, "Zgloszenia sa otwarte");
  assert.equal(state.queueLabel, "Kolejka publiczna jest widoczna");
});

test("public-web event state keeps queue visibility separate from submit access", () => {
  const detail = validPublicEventDetailResponse();
  const state = getPublicEventPageState({
    ...detail,
    event: {
      ...detail.event,
      publicQueueEnabled: false,
    },
    publicQueue: {
      visible: false,
      reason: "PUBLIC_QUEUE_DISABLED",
    },
  });

  assert.equal(state.queueLabel, "Kolejka publiczna jest ukryta");
});

test("public-web invite-required event without access maps to access required state", () => {
  const state = getPublicEventPageState({
    ...validPublicEventDetailResponse(),
    event: {
      ...validPublicEventDetailResponse().event,
      joinAccessMode: "invite_required",
    },
    submissions: {
      enabled: false,
      reason: "ACCESS_REQUIRED",
    },
  });

  assert.equal(
    state.submissionsLabel,
    "Zeskanuj QR w lokalu, aby dołączyć do sesji.",
  );
});

test("public-web invite-required state renders QR guidance instead of JoinForm", () => {
  const source = readFileSync(
    "apps/public-web/components/PublicEventSessionView.tsx",
    "utf8",
  );
  const accessRequiredBranch = source.slice(
    source.indexOf('detail.submissions.reason === "ACCESS_REQUIRED"'),
    source.indexOf(
      ") : (",
      source.indexOf('detail.submissions.reason === "ACCESS_REQUIRED"'),
    ),
  );

  assert.match(
    accessRequiredBranch,
    /Zeskanuj QR w lokalu, aby dołączyć do sesji\./,
  );
  assert.doesNotMatch(accessRequiredBranch, /<JoinForm/);
});

test("public-web closed session state does not render JoinForm", () => {
  const source = readFileSync(
    "apps/public-web/components/PublicEventSessionView.tsx",
    "utf8",
  );
  const accessRequiredIndex = source.indexOf(
    'detail.submissions.reason === "ACCESS_REQUIRED"',
  );
  const closedBranchStart = source.indexOf(") : (", accessRequiredIndex);
  const closedBranch = source.slice(
    closedBranchStart,
    source.indexOf("</section>", closedBranchStart),
  );

  assert.match(closedBranch, /Zgłoszenia są zamknięte/);
  assert.doesNotMatch(closedBranch, /<JoinForm/);
});

test("public-web join disabled stays disabled even for invite-required event", () => {
  const state = getPublicEventPageState({
    ...validPublicEventDetailResponse(),
    event: {
      ...validPublicEventDetailResponse().event,
      publicJoinEnabled: false,
      joinAccessMode: "invite_required",
    },
    submissions: {
      enabled: false,
      reason: "PUBLIC_JOIN_DISABLED",
    },
  });

  assert.equal(state.submissionsLabel, "Zgloszenia publiczne sa wylaczone");
});

test("public-web join page policy does not open the form for paused events", () => {
  const visibility = getJoinVisibility({
    publicId: "ka2Md-d1das",
    name: "Paused Join",
    slug: "paused-join",
    status: "paused",
    visibility: "public",
    startsAt: null,
    endsAt: null,
    publicJoinEnabled: true,
    publicQueueEnabled: true,
    joinAccessMode: "open",
  });

  assert.equal(visibility.kind, "paused");
});

test("public-web join view state disables submit for paused active event", () => {
  const state = getPublicJoinViewState(
    activeEventLookup({ status: "paused", publicJoinEnabled: true }),
  );

  assert.equal(state.kind, "paused");
});

test("public-web join view state enables submit for resumed active event", () => {
  const state = getPublicJoinViewState(
    activeEventLookup({ status: "active", publicJoinEnabled: true }),
  );

  assert.equal(state.kind, "open");
});

test("public-web join view state maps no active event to inactive", () => {
  const state = getPublicJoinViewState({
    venue: validActiveEventResponse().venue,
    activeEvent: null,
  });

  assert.equal(state.kind, "inactive");
});

test("public-web join stream errors are non-fatal", () => {
  const state = getPublicJoinStreamErrorState();

  assert.equal(state.kind, "stale");
  assert.equal(state.fatal, false);
});

test("public-web my request statuses map to participant-facing messages", () => {
  assert.match(getMyRequestStatusMessage("pending"), /Poczekaj/);
  assert.match(getMyRequestStatusMessage("approved"), /zatwierdzone/);
  assert.match(getMyRequestStatusMessage("now"), /Teraz/);
  assert.match(getMyRequestStatusMessage("rejected"), /odrzucone/);
  assert.match(getMyRequestStatusMessage("skipped"), /pominiete/);
  assert.match(getMyRequestStatusMessage("done"), /zakonczony/);
});

test("public-web tracked request helper finds own request and handles missing cookie state", () => {
  assert.deepEqual(
    getTrackedRequest([myRequest("pending")], "request-1"),
    myRequest("pending"),
  );
  assert.equal(
    getTrackedRequest([myRequest("pending")], "other-request"),
    null,
  );
  assert.equal(getTrackedRequest([myRequest("pending")], null), null);
  assert.equal(getTrackedRequest([], "request-1"), null);
});

test("public-web my-requests uses one-shot focus refresh without cyclic polling", () => {
  assert.equal(
    shouldRefreshMyRequestsOnFocus(myRequest("pending"), "visible"),
    true,
  );
  assert.equal(
    shouldRefreshMyRequestsOnFocus(myRequest("approved"), "visible"),
    true,
  );
  assert.equal(
    shouldRefreshMyRequestsOnFocus(myRequest("now"), "visible"),
    true,
  );
  assert.equal(
    shouldRefreshMyRequestsOnFocus(myRequest("done"), "visible"),
    false,
  );
  assert.equal(
    shouldRefreshMyRequestsOnFocus(myRequest("rejected"), "visible"),
    false,
  );
  assert.equal(
    shouldRefreshMyRequestsOnFocus(myRequest("pending"), "hidden"),
    false,
  );
  assert.equal(shouldRefreshMyRequestsOnFocus(null, "visible"), false);

  const source = readFileSync(
    "apps/public-web/components/JoinForm.tsx",
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /setInterval|clearInterval|refetchInterval|REFRESH_INTERVAL/,
  );
});

test("browser live views contain no interval polling transport", () => {
  for (const path of [
    "apps/public-web/components/JoinForm.tsx",
    "apps/public-web/components/PublicEventSessionView.tsx",
    "apps/public-web/components/PublicQueueView.tsx",
    "apps/dashboard-web/components/DashboardEventsView.tsx",
    "apps/dashboard-web/components/OperatorQueueView.tsx",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(
      source,
      /setInterval|clearInterval|refetchInterval|usePolling|REFRESH_INTERVAL/,
      path,
    );
  }
});

test("public-web my-requests refresh controller blocks overlapping refreshes", async () => {
  let calls = 0;
  let resolveFetch: (requests: PublicMyRequest[]) => void = () => undefined;
  const controller = createMyRequestsRefreshController({
    fetchRequests: async () => {
      calls += 1;
      return await new Promise<PublicMyRequest[]>((resolve) => {
        resolveFetch = resolve;
      });
    },
    trackedRequestId: "request-1",
  });

  const first = controller.refresh();
  const second = controller.refresh();

  assert.equal(calls, 1);
  assert.strictEqual(first, second);

  resolveFetch([myRequest("approved")]);
  const request = await first;

  assert.equal(request?.status, "approved");
  assert.equal(controller.getError(), null);
});

test("public-web my-requests refresh controller is non-fatal on fetch errors", async () => {
  const controller = createMyRequestsRefreshController({
    fetchRequests: async () => {
      throw new Error("stream disconnected");
    },
    trackedRequestId: "request-1",
  });

  const request = await controller.refresh();

  assert.equal(request, null);
  assert.match(controller.getError() ?? "", /odswiezyc/);
});

test("public-web noindex metadata is available for join and queue pages", () => {
  assert.deepEqual(noindexMetadata.robots, {
    index: false,
    follow: false,
  });
});

test("public-web venue metadata uses venue name", () => {
  const metadata = venuePageMetadata({ name: "Klub X" });

  assert.equal(metadata.title, "Karaoke w Klub X | Poza Nutą");
  assert.equal(
    metadata.description,
    "Dołącz do karaoke i sprawdź aktualną kolejkę w Klub X.",
  );
});

test("public-web join and queue metadata keep noindex and use venue name", () => {
  const join = joinPageMetadata({ name: "Klub X" });
  const queue = queuePageMetadata({ name: "Klub X" });

  assert.equal(join.title, "Dołącz do karaoke | Klub X");
  assert.deepEqual(join.robots, noindexMetadata.robots);
  assert.equal(queue.title, "Kolejka karaoke | Klub X");
  assert.deepEqual(queue.robots, noindexMetadata.robots);
});

test("public-web metadata has safe fallbacks without venue name", () => {
  assert.equal(venuePageMetadata(null).title, "Karaoke | Poza Nutą");
  assert.equal(joinPageMetadata(null).title, "Dołącz do karaoke | Poza Nutą");
  assert.equal(queuePageMetadata(null).title, "Kolejka karaoke | Poza Nutą");
});

test("public-web homepage does not link to the missing demo venue", () => {
  const source = readFileSync("apps/public-web/app/page.tsx", "utf8");

  assert.equal(source.includes('href="/demo"'), false);
});

test("public-web discovery homepage exposes sections safe CTAs and empty states", () => {
  const source = readFileSync("apps/public-web/app/page.tsx", "utf8");

  for (const heading of ["Trwa teraz", "Nadchodzące", "Lokale"]) {
    assert.match(source, new RegExp(`>${heading}<`));
  }
  for (const emptyState of [
    "Aktualnie nie trwa żadne publiczne wydarzenie.",
    "Brak zaplanowanych publicznych wydarzeń.",
    "Brak publicznych lokali.",
    "Brak aktywnego wydarzenia",
  ]) {
    assert.equal(source.includes(emptyState), true);
  }
  assert.equal(source.includes("Zobacz wydarzenie"), true);
  assert.match(source, /href=\{`\/event\/\$\{event\.eventPublicId\}`\}/);
  assert.equal(source.includes("Dodaj piosenkę"), false);
  assert.equal(source.includes("Venue-first MVP"), false);
});

test("public-web discovery presentation maps join labels and venue timezone", () => {
  assert.equal(getDiscoveryJoinLabel("open"), "Otwarte zgłoszenia");
  assert.equal(
    getDiscoveryJoinLabel("invite_required"),
    "Dołącz przez QR w lokalu",
  );
  assert.equal(getDiscoveryJoinLabel("closed"), "Zgłoszenia zamknięte");
  assert.match(
    formatDiscoveryStart("2026-07-01T18:00:00.000Z", "Europe/Warsaw") ?? "",
    /20:00/,
  );
  assert.equal(formatDiscoveryStart(null, "Europe/Warsaw"), null);
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
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
      verificationStatus: "verified",
    },
  };
}

function validActiveEventResponse() {
  return {
    venue: {
      id: "venue-1",
      slug: "klub-x",
      name: "Klub X",
      city: "Warszawa",
      timezone: "Europe/Warsaw",
    },
    activeEvent: {
      id: "event-1",
      publicId: "ka2Md-d1das",
      venueId: "venue-1",
      operatedByOrganizationId: "org-1",
      createdByUserId: null,
      name: "Friday Karaoke",
      slug: "friday-karaoke",
      status: "active",
      visibility: "public" as const,
      startsAt: null,
      endsAt: null,
      publicJoinEnabled: true,
      publicQueueEnabled: true,
      joinAccessMode: "open" as const,
    },
  };
}

function validPublicEventDetailResponse(): PublicEventDetail {
  return {
    event: {
      publicId: "ka2Md-d1das",
      name: "Friday Karaoke",
      slug: "friday-karaoke",
      status: "active",
      visibility: "public",
      startsAt: null,
      endsAt: null,
      publicJoinEnabled: true,
      publicQueueEnabled: true,
      joinAccessMode: "open",
    },
    venue: {
      slug: "klub-x",
      name: "Klub X",
      city: "Warszawa",
      timezone: "Europe/Warsaw",
    },
    operatedByOrganization: {
      slug: "poza-nuta-demo",
      name: "Poza Nuta Demo",
    },
    submissions: {
      enabled: true,
    },
    publicQueue: {
      visible: true,
    },
  };
}

function validPublicDiscoveryResponse(): PublicDiscoveryResponse {
  return {
    now: [
      {
        eventPublicId: "active-public-event",
        name: "Friday Karaoke",
        status: "active",
        startsAt: "2026-07-01T18:00:00.000Z",
        venue: {
          slug: "klub-x",
          name: "Klub X",
          city: "Warszawa",
          timezone: "Europe/Warsaw",
        },
        joinState: "open",
      },
      {
        eventPublicId: "invite-public-event",
        name: "QR Karaoke",
        status: "active",
        startsAt: null,
        venue: {
          slug: "klub-y",
          name: "Klub Y",
          city: null,
          timezone: "Europe/Warsaw",
        },
        joinState: "invite_required",
      },
    ],
    upcoming: [
      {
        eventPublicId: "scheduled-public-event",
        name: "Saturday Karaoke",
        status: "scheduled",
        startsAt: "2026-07-02T18:00:00.000Z",
        venue: {
          slug: "klub-x",
          name: "Klub X",
          city: "Warszawa",
          timezone: "Europe/Warsaw",
        },
        joinState: "closed",
      },
    ],
    venues: [
      {
        slug: "klub-x",
        name: "Klub X",
        city: "Warszawa",
        timezone: "Europe/Warsaw",
        activeEvent: {
          eventPublicId: "active-public-event",
          name: "Friday Karaoke",
          joinState: "open",
        },
      },
      {
        slug: "klub-y",
        name: "Klub Y",
        city: null,
        timezone: "Europe/Warsaw",
        activeEvent: null,
      },
    ],
  };
}

function activeEventLookup(
  overrides: Partial<
    NonNullable<ReturnType<typeof validActiveEventResponse>["activeEvent"]>
  > = {},
) {
  const response = validActiveEventResponse();
  return {
    ...response,
    activeEvent: {
      ...response.activeEvent,
      ...overrides,
    },
  };
}

function validPublicQueueResponse() {
  return {
    event: {
      publicId: "ka2Md-d1das",
      name: "Friday Karaoke",
      status: "active",
    },
    venue: {
      id: "venue-1",
      name: "Klub X",
      slug: "klub-x",
    },
    now: null,
    queue: [
      {
        id: "request-1",
        singerName: "Michał",
        songTitle: "Królowa Łez",
        songArtist: "Agnieszka Chylińska",
        position: 1,
      },
    ],
    submissions: {
      enabled: true,
    },
  };
}

function validInactiveVenueQueueResponse() {
  return {
    venue: {
      id: "venue-1",
      name: "Klub X",
      slug: "klub-x",
    },
    activeEvent: null,
    event: null,
    now: null,
    queue: [],
    submissions: {
      enabled: false,
      reason: "NO_ACTIVE_EVENT",
    },
  };
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
      sourceTrackId: "9053",
    },
  };
}

function validMyRequestsResponse(
  status: PublicMyRequest["status"] = "pending",
) {
  return {
    requests: [myRequest(status)],
  };
}

function validInviteClaimResponse() {
  return {
    eventPublicId: "ka2Md-d1das",
    redirectTo: "/event/ka2Md-d1das/session",
  };
}

function myRequest(
  status: PublicMyRequest["status"],
  overrides: Partial<PublicMyRequest> = {},
): PublicMyRequest {
  return {
    id: "request-1",
    status,
    singerName: "Michal",
    artist: "ABBA",
    title: "Dancing Queen",
    position: status === "approved" ? 1 : null,
    createdAt: "2026-06-05T12:00:00.000Z",
    ...overrides,
  };
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function withApiEnv(
  env: {
    API_INTERNAL_URL?: string | undefined;
    NEXT_PUBLIC_API_URL?: string | undefined;
  },
  action: () => void,
): void {
  const previousInternal = process.env.API_INTERNAL_URL;
  const previousPublic = process.env.NEXT_PUBLIC_API_URL;
  try {
    restoreEnv("API_INTERNAL_URL", env.API_INTERNAL_URL);
    restoreEnv("NEXT_PUBLIC_API_URL", env.NEXT_PUBLIC_API_URL);
    action();
  } finally {
    restoreEnv("API_INTERNAL_URL", previousInternal);
    restoreEnv("NEXT_PUBLIC_API_URL", previousPublic);
  }
}

class FakePublicQueueEventSource implements PublicQueueEventSource {
  closeCalls = 0;
  listeners = new Map<string, Array<(event: MessageEvent) => void>>();
  onerror: ((event: Event) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;

  addEventListener(
    type: string,
    listener: (event: MessageEvent) => void,
  ): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  close(): void {
    this.closeCalls += 1;
  }

  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new MessageEvent(type));
    }
  }

  open(): void {
    this.onopen?.(new Event("open"));
  }
}
