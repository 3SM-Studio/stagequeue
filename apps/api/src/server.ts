import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { addRequest, approveRequest, completeCurrentRequest, createEvent, getOperatorQueue, getPublicQueue, QueueOperationError, rejectRequest, skipRequest, startRequest } from "../../../src/queue/queueService.ts";
import { loadQueueState, MissingQueueStateError, saveQueueState } from "../../../src/queue/localQueueStore.ts";
import { MissingLocalSongIndexError, readLocalSongIndex } from "../../../src/search/localSongIndex.ts";
import { searchSongs } from "../../../src/search/songSearch.ts";
import type { LocalSong } from "../../../src/importers/ising/types.ts";
import type { QueueState, SongRequest } from "../../../src/queue/types.ts";

export type ApiConfig = {
  host: string;
  port: number;
  adminToken?: string;
  eventsDir: string;
  songIndexPath: string;
  allowedOrigins?: string[];
};

type ApiErrorCode = "bad_request" | "unauthorized" | "not_found" | "conflict" | "missing_song_index" | "internal_error";

class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const DEFAULT_CONFIG: ApiConfig = {
  host: "127.0.0.1",
  port: 4321,
  eventsDir: "data/events",
  songIndexPath: "data/imports/ising-songs.json",
  allowedOrigins: ["http://127.0.0.1:5173", "http://localhost:5173"]
};

const MAX_SEARCH_LIMIT = 20;

export function createApiServer(config: Partial<ApiConfig> = {}): Server {
  const resolvedConfig: ApiConfig = {
    ...DEFAULT_CONFIG,
    ...config
  };

  return createServer(async (request, response) => {
    try {
      await routeRequest(request, response, resolvedConfig);
    } catch (error) {
      sendError(response, toApiError(error));
    }
  });
}

export async function loadApiConfig(envPath = ".env"): Promise<ApiConfig> {
  const env = { ...(await readEnvFile(envPath)), ...process.env };

  return {
    host: env.API_HOST || DEFAULT_CONFIG.host,
    port: parsePort(env.API_PORT, DEFAULT_CONFIG.port),
    adminToken: optionalText(env.API_ADMIN_TOKEN),
    eventsDir: DEFAULT_CONFIG.eventsDir,
    songIndexPath: DEFAULT_CONFIG.songIndexPath,
    allowedOrigins: DEFAULT_CONFIG.allowedOrigins
  };
}

async function routeRequest(request: IncomingMessage, response: ServerResponse, config: ApiConfig): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${config.host}:${config.port}`}`);
  const pathParts = url.pathname.split("/").filter(Boolean);

  applyCors(request, response, config);

  if (method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (method === "GET" && url.pathname === "/api/search") {
    await handleSearch(response, url, config);
    return;
  }

  if (method === "POST" && url.pathname === "/api/events") {
    requireAdmin(request, config);
    await handleCreateEvent(request, response, config);
    return;
  }

  if (pathParts[0] === "api" && pathParts[1] === "events" && pathParts[2]) {
    const eventId = parseEventId(pathParts[2]);

    if (method === "GET" && pathParts.length === 4 && pathParts[3] === "public-queue") {
      await handlePublicQueue(response, url, config, eventId);
      return;
    }

    if (method === "GET" && pathParts.length === 4 && pathParts[3] === "operator-queue") {
      requireAdmin(request, config);
      await handleOperatorQueue(response, config, eventId);
      return;
    }

    if (method === "POST" && pathParts.length === 4 && pathParts[3] === "requests") {
      await handleParticipantRequest(request, response, config, eventId);
      return;
    }

    if (method === "POST" && pathParts.length === 4 && pathParts[3] === "done") {
      requireAdmin(request, config);
      await handleQueueAction(response, config, eventId, completeCurrentRequest);
      return;
    }

    if (method === "POST" && pathParts.length === 6 && pathParts[3] === "requests") {
      requireAdmin(request, config);
      const requestId = pathParts[4];
      const action = pathParts[5];
      await handleRequestAction(response, config, eventId, requestId, action);
      return;
    }
  }

  throw new ApiError(404, "not_found", "Route not found");
}

async function handleSearch(response: ServerResponse, url: URL, config: ApiConfig): Promise<void> {
  const query = url.searchParams.get("q") ?? "";
  const limit = parseLimit(url.searchParams.get("limit"));
  const songs = await readSongs(config.songIndexPath);
  const results = searchSongs(query, songs, { limit, source: "all" }).map((result) => ({
    source: result.song.source,
    sourceSongId: result.song.sourceSongId,
    title: result.song.title,
    artist: result.song.artist,
    url: result.song.sourceUrl,
    score: result.score
  }));

  sendJson(response, 200, {
    query,
    results
  });
}

async function handleCreateEvent(request: IncomingMessage, response: ServerResponse, config: ApiConfig): Promise<void> {
  const body = await readJsonBody(request);
  const id = parseEventId(readRequiredString(body, "id"));
  const state = createEvent({
    id,
    name: readRequiredString(body, "name"),
    venue: readOptionalString(body, "venue"),
    date: readOptionalString(body, "date"),
    status: "active"
  });

  await saveQueueState(eventPath(config, id), state);
  sendJson(response, 201, { event: state.event });
}

async function handlePublicQueue(response: ServerResponse, url: URL, config: ApiConfig, eventId: string): Promise<void> {
  const state = await loadEvent(config, eventId);
  const hideSongTitles = url.searchParams.get("hideSongTitles") === "true";
  sendJson(response, 200, getPublicQueue(state, { hideSongTitles }));
}

async function handleOperatorQueue(response: ServerResponse, config: ApiConfig, eventId: string): Promise<void> {
  const state = await loadEvent(config, eventId);
  sendJson(response, 200, getOperatorQueue(state));
}

async function handleParticipantRequest(request: IncomingMessage, response: ServerResponse, config: ApiConfig, eventId: string): Promise<void> {
  const body = await readJsonBody(request);
  const singerName = readRequiredString(body, "singerName");
  const songSource = parseSongSource(readRequiredString(body, "songSource"));
  const songSourceId = readRequiredString(body, "songSourceId");
  const state = await loadEvent(config, eventId);
  const songs = await readSongs(config.songIndexPath);
  const song = songs.find((candidate) => candidate.source === songSource && candidate.sourceSongId === songSourceId);

  if (!song) {
    throw new ApiError(404, "not_found", `Song not found in local index: ${songSource}:${songSourceId}`);
  }

  const nextState = addRequest(state, {
    singerName,
    displayName: singerName,
    songSource,
    songSourceId: song.sourceSongId,
    songTitle: song.title,
    songArtist: song.artist,
    songUrl: song.sourceUrl ?? undefined
  });
  const addedRequest = findNewestRequest(state, nextState);

  await saveQueueState(eventPath(config, eventId), nextState);
  sendJson(response, 201, { request: toParticipantRequestResponse(requiredRequest(addedRequest)) });
}

async function handleRequestAction(response: ServerResponse, config: ApiConfig, eventId: string, requestId: string, action: string): Promise<void> {
  switch (action) {
    case "approve":
      await handleQueueAction(response, config, eventId, (state) => approveRequest(state, requestId));
      return;
    case "reject":
      await handleQueueAction(response, config, eventId, (state) => rejectRequest(state, requestId));
      return;
    case "start":
      await handleQueueAction(response, config, eventId, (state) => startRequest(state, requestId));
      return;
    case "skip":
      await handleQueueAction(response, config, eventId, (state) => skipRequest(state, requestId));
      return;
    default:
      throw new ApiError(404, "not_found", "Route not found");
  }
}

async function handleQueueAction(response: ServerResponse, config: ApiConfig, eventId: string, operation: (state: QueueState) => QueueState): Promise<void> {
  const state = await loadEvent(config, eventId);
  const nextState = operation(state);
  await saveQueueState(eventPath(config, eventId), nextState);
  sendJson(response, 200, { operatorQueue: getOperatorQueue(nextState) });
}

async function readSongs(songIndexPath: string): Promise<LocalSong[]> {
  try {
    return await readLocalSongIndex(songIndexPath);
  } catch (error) {
    if (error instanceof MissingLocalSongIndexError) {
      throw new ApiError(409, "missing_song_index", "Missing local song index. Run pnpm import:ising.");
    }
    throw error;
  }
}

async function loadEvent(config: ApiConfig, eventId: string): Promise<QueueState> {
  try {
    return await loadQueueState(eventPath(config, eventId));
  } catch (error) {
    if (error instanceof MissingQueueStateError) {
      throw new ApiError(404, "not_found", `Missing queue event: ${eventId}`);
    }
    throw error;
  }
}

function requireAdmin(request: IncomingMessage, config: ApiConfig): void {
  if (!config.adminToken) {
    return;
  }

  if (request.headers.authorization !== `Bearer ${config.adminToken}`) {
    throw new ApiError(401, "unauthorized", "Missing or invalid admin token");
  }
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let totalLength = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalLength += buffer.length;
    if (totalLength > 1_000_000) {
      throw new ApiError(400, "bad_request", "Request body is too large");
    }
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      throw new ApiError(400, "bad_request", "JSON body must be an object");
    }
    return parsed;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(400, "bad_request", "Invalid JSON body");
  }
}

function readRequiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, "bad_request", `Missing ${key}`);
  }
  return value.trim();
}

function readOptionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseLimit(value: string | null): number {
  if (value === null) {
    return 10;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ApiError(400, "bad_request", "Invalid search limit");
  }

  return Math.min(parsed, MAX_SEARCH_LIMIT);
}

function parseSongSource(value: string): SongRequest["songSource"] {
  if (value === "ising" || value === "karafun" || value === "manual") {
    return value;
  }
  throw new ApiError(400, "bad_request", "Invalid songSource");
}

function parseEventId(value: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new ApiError(400, "bad_request", "Invalid event id");
  }
  return value;
}

function eventPath(config: ApiConfig, eventId: string): string {
  return `${config.eventsDir}/${eventId}.json`;
}

function findNewestRequest(before: QueueState, after: QueueState): SongRequest | undefined {
  const beforeIds = new Set(before.requests.map((request) => request.id));
  return after.requests.find((request) => !beforeIds.has(request.id));
}

function requiredRequest(request: SongRequest | undefined): SongRequest {
  if (!request) {
    throw new ApiError(500, "internal_error", "Request was not created");
  }
  return request;
}

function toParticipantRequestResponse(request: SongRequest): Record<string, unknown> {
  return {
    id: request.id,
    status: request.status,
    singerName: request.singerName,
    songTitle: request.songTitle,
    songArtist: request.songArtist,
    songSource: request.songSource,
    songSourceId: request.songSourceId
  };
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    ...response.getHeaders(),
    "content-type": "application/json; charset=utf-8"
  });
  response.end(`${JSON.stringify(body)}\n`);
}

function applyCors(request: IncomingMessage, response: ServerResponse, config: ApiConfig): void {
  const origin = request.headers.origin;
  const allowedOrigins = config.allowedOrigins ?? [];

  if (origin && allowedOrigins.includes(origin)) {
    response.setHeader("access-control-allow-origin", origin);
    response.setHeader("vary", "Origin");
    response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    response.setHeader("access-control-allow-headers", "Content-Type,Authorization");
  }
}

function sendError(response: ServerResponse, error: ApiError): void {
  sendJson(response, error.status, {
    error: error.code,
    message: error.message
  });
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof QueueOperationError) {
    return new ApiError(409, "conflict", error.message);
  }

  return new ApiError(500, "internal_error", "Internal server error");
}

async function readEnvFile(path: string): Promise<Record<string, string>> {
  try {
    const raw = await readFile(path, "utf8");
    const env: Record<string, string> = {};

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      env[trimmed.slice(0, separatorIndex).trim()] = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
    }

    return env;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function parsePort(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
}

function optionalText(value: string | undefined): string | undefined {
  return value && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = await loadApiConfig();
  const server = createApiServer(config);
  server.listen(config.port, config.host, () => {
    console.log(`Karaoke API listening at http://${config.host}:${config.port}`);
  });
}
