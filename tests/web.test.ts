import assert from "node:assert/strict";
import test from "node:test";
import { buildApiUrl, createApiClient, validateSubmitRequest, type SearchResultDto } from "../apps/web/src/lib/apiClient.ts";

test("web API client builds URLs against the configured API base", () => {
  const url = buildApiUrl("http://127.0.0.1:4321", "/api/search", { q: "krolowa lez", limit: "10" });

  assert.equal(url, "http://127.0.0.1:4321/api/search?q=krolowa+lez&limit=10");
});

test("participant submit validation requires singerName", () => {
  assert.equal(validateSubmitRequest({ singerName: "", song: fixtureSong() }), "Podaj imię.");
});

test("participant submit validation requires selected song", () => {
  assert.equal(validateSubmitRequest({ singerName: "Michał", song: null }), "Wybierz piosenkę.");
});

test("web API client refuses iSing URLs", () => {
  assert.throws(() => createApiClient("https://api.ising.pl/v2"), /cannot use iSing URL/);
});

test("web API client does not send Content-Type for GET requests", async () => {
  const originalFetch = globalThis.fetch;
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedInit = init;
    return new Response(JSON.stringify({ query: "krolowa", results: [] }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }) as typeof fetch;

  try {
    await createApiClient("http://127.0.0.1:4321").searchSongs("krolowa");

    assert.equal(capturedInit?.headers, undefined);
    assert.equal(capturedInit?.body, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function fixtureSong(): SearchResultDto {
  return {
    source: "ising",
    sourceSongId: "9053",
    title: "Królowa Łez",
    artist: "Agnieszka Chylińska",
    url: "https://ising.pl/agnieszka-chylinska-krolowa-lez-piosenka",
    score: 95
  };
}
