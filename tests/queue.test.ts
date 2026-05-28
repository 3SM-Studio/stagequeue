import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runQueueCli } from "../src/queue/cli.ts";
import { loadQueueState, saveQueueState } from "../src/queue/localQueueStore.ts";
import { addRequest, approveRequest, completeCurrentRequest, createEvent, getPublicQueue, moveRequest, rejectRequest, skipRequest, startRequest } from "../src/queue/queueService.ts";
import type { QueueState } from "../src/queue/types.ts";

test("createEvent creates an empty queue", () => {
  const state = createEvent({ id: "test-event", name: "Poza Nutą Test" });

  assert.equal(state.event.id, "test-event");
  assert.equal(state.event.name, "Poza Nutą Test");
  assert.equal(state.event.status, "draft");
  assert.deepEqual(state.requests, []);
});

test("addRequest adds a pending request", () => {
  const state = addRequest(createTestEvent(), requestInput("Michał", "Królowa Łez", "Agnieszka Chylińska"));
  const request = state.requests[0];

  assert.equal(request.status, "pending");
  assert.equal(request.position, null);
  assert.equal(request.singerName, "Michał");
  assert.equal(request.displayName, "Michał");
});

test("approveRequest assigns position 1", () => {
  const pending = addRequest(createTestEvent(), requestInput("Michał", "Królowa Łez", "Agnieszka Chylińska"));
  const approved = approveRequest(pending, pending.requests[0].id);

  assert.equal(approved.requests[0].status, "approved");
  assert.equal(approved.requests[0].position, 1);
});

test("successive approveRequest calls assign positions 1, 2, 3", () => {
  const state = approveAll(addThreeRequests());

  assert.deepEqual(approvedPositions(state), [1, 2, 3]);
});

test("moveRequest renumbers the approved queue", () => {
  const state = approveAll(addThreeRequests());
  const moved = moveRequest(state, state.requests[2].id, 1);

  assert.deepEqual(approvedNames(moved), ["Ola", "Michał", "Kasia"]);
  assert.deepEqual(approvedPositions(moved), [1, 2, 3]);
});

test("startRequest sets only one request as now", () => {
  const state = approveAll(addThreeRequests());
  const started = startRequest(state, state.requests[0].id);

  assert.equal(started.requests.filter((request) => request.status === "now").length, 1);
  assert.equal(started.requests[0].status, "now");
  assert.equal(started.requests[0].position, null);
  assert.deepEqual(approvedPositions(started), [1, 2]);
});

test("startRequest throws when another request is already now", () => {
  const state = approveAll(addThreeRequests());
  const started = startRequest(state, state.requests[0].id);

  assert.throws(() => startRequest(started, started.requests[1].id), /already marked as now/);
});

test("completeCurrentRequest moves now to done", () => {
  const state = approveAll(addThreeRequests());
  const started = startRequest(state, state.requests[0].id);
  const completed = completeCurrentRequest(started);

  assert.equal(completed.requests[0].status, "done");
  assert.equal(completed.requests[0].position, null);
  assert.equal(completed.requests.filter((request) => request.status === "now").length, 0);
});

test("skipRequest removes request from active queue and renumbers approved", () => {
  const state = approveAll(addThreeRequests());
  const skipped = skipRequest(state, state.requests[1].id);

  assert.equal(skipped.requests[1].status, "skipped");
  assert.equal(skipped.requests[1].position, null);
  assert.deepEqual(approvedNames(skipped), ["Michał", "Ola"]);
  assert.deepEqual(approvedPositions(skipped), [1, 2]);
});

test("rejectRequest works for pending and approved requests", () => {
  const state = addThreeRequests();
  const approved = approveRequest(state, state.requests[0].id);
  const rejectedApproved = rejectRequest(approved, approved.requests[0].id);
  const rejectedPending = rejectRequest(rejectedApproved, rejectedApproved.requests[1].id);

  assert.equal(rejectedPending.requests[0].status, "rejected");
  assert.equal(rejectedPending.requests[0].position, null);
  assert.equal(rejectedPending.requests[1].status, "rejected");
});

test("getPublicQueue hides pending requests", () => {
  const pending = addThreeRequests();
  const approved = approveRequest(pending, pending.requests[0].id);
  const publicQueue = getPublicQueue(approved);

  assert.equal(publicQueue.next?.displayName, "Michał");
  assert.equal(publicQueue.upcoming.length, 0);
});

test("getPublicQueue uses next for the first approved request and leaves upcoming empty for one approved request", () => {
  const pending = addThreeRequests();
  const approved = approveRequest(pending, pending.requests[0].id);
  const publicQueue = getPublicQueue(approved);

  assert.equal(publicQueue.next?.position, 1);
  assert.equal(publicQueue.next?.displayName, "Michał");
  assert.deepEqual(publicQueue.upcoming, []);
});

test("getPublicQueue puts approved requests after next into upcoming", () => {
  const state = approveAll(addThreeRequests());
  const publicQueue = getPublicQueue(state);

  assert.equal(publicQueue.next?.position, 1);
  assert.equal(publicQueue.next?.displayName, "Michał");
  assert.deepEqual(
    publicQueue.upcoming.map((item) => item.position),
    [2, 3]
  );
  assert.deepEqual(
    publicQueue.upcoming.map((item) => item.displayName),
    ["Kasia", "Ola"]
  );
});

test("getPublicQueue can hide song titles for next and upcoming", () => {
  const state = approveAll(addThreeRequests());
  const publicQueue = getPublicQueue(state, { hideSongTitles: true });

  assert.equal(publicQueue.next?.songTitle, undefined);
  assert.equal(publicQueue.next?.songArtist, undefined);
  assert.equal(publicQueue.upcoming[0].songTitle, undefined);
  assert.equal(publicQueue.upcoming[0].songArtist, undefined);
});

test("save/load JSON preserves queue state", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "queue-store-"));
  try {
    const filePath = join(tempDir, "event.json");
    const state = approveAll(addThreeRequests());

    await saveQueueState(filePath, state);
    const loaded = await loadQueueState(filePath);

    assert.deepEqual(loaded, state);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("queue CLI does not perform HTTP requests", async () => {
  const originalFetch = globalThis.fetch;
  const stderr: string[] = [];
  globalThis.fetch = (() => {
    throw new Error("queue CLI must not call fetch");
  }) as typeof fetch;

  try {
    const exitCode = await runQueueCli(["show", "--event", "missing-event"], { stderr: (message) => stderr.push(message), stdout: () => {} });
    assert.equal(exitCode, 1);
    assert.match(stderr.join("\n"), /Missing queue state/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function createTestEvent(): QueueState {
  return createEvent({ id: "test-event", name: "Poza Nutą Test" });
}

function addThreeRequests(): QueueState {
  let state = createTestEvent();
  state = addRequest(state, requestInput("Michał", "Królowa Łez", "Agnieszka Chylińska"));
  state = addRequest(state, requestInput("Kasia", "Dancing Queen", "ABBA"));
  state = addRequest(state, requestInput("Ola", "Chodź, pomaluj mój świat", "2+1"));
  return state;
}

function approveAll(state: QueueState): QueueState {
  return state.requests.reduce((current, request) => approveRequest(current, request.id), state);
}

function requestInput(singerName: string, songTitle: string, songArtist: string) {
  return {
    singerName,
    songTitle,
    songArtist,
    songSource: "ising" as const,
    songSourceId: `${songArtist}-${songTitle}`,
    songUrl: `https://ising.pl/${songArtist}-${songTitle}`
  };
}

function approvedPositions(state: QueueState): Array<number | null> {
  return state.requests
    .filter((request) => request.status === "approved")
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((request) => request.position);
}

function approvedNames(state: QueueState): string[] {
  return state.requests
    .filter((request) => request.status === "approved")
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((request) => request.singerName);
}
