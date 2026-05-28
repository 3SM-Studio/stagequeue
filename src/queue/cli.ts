import { pathToFileURL } from "node:url";
import { addRequest, approveRequest, completeCurrentRequest, createEvent, getOperatorQueue, getPublicQueue, moveRequest, QueueOperationError, rejectRequest, skipRequest, startRequest } from "./queueService.ts";
import { loadQueueState, MissingQueueStateError, saveQueueState } from "./localQueueStore.ts";
import type { QueueState, SongRequest } from "./types.ts";

type CliIO = {
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
};

type ParsedArgs = {
  command: string;
  flags: Map<string, string | boolean>;
};

const DEFAULT_EVENTS_DIR = "data/events";

export async function runQueueCli(args: string[], io: CliIO = {}): Promise<number> {
  const stdout = io.stdout ?? console.log;
  const stderr = io.stderr ?? console.error;
  const parsed = parseArgs(args);

  try {
    if (!parsed.command || parsed.command === "help" || parsed.flags.has("help")) {
      stdout(helpText());
      return 0;
    }

    switch (parsed.command) {
      case "create":
        return await createCommand(parsed, stdout);
      case "add":
        return await updateCommand(parsed, stdout, (state) =>
          addRequest(state, {
            singerName: requiredFlag(parsed, "singer"),
            displayName: optionalFlag(parsed, "display-name"),
            songTitle: requiredFlag(parsed, "title"),
            songArtist: requiredFlag(parsed, "artist"),
            songSource: parseSongSource(requiredFlag(parsed, "source")),
            songSourceId: optionalFlag(parsed, "source-id"),
            songUrl: optionalFlag(parsed, "url"),
            note: optionalFlag(parsed, "note")
          })
        );
      case "approve":
        return await updateCommand(parsed, stdout, (state) => approveRequest(state, requiredFlag(parsed, "request")));
      case "reject":
        return await updateCommand(parsed, stdout, (state) => rejectRequest(state, requiredFlag(parsed, "request")));
      case "start":
        return await updateCommand(parsed, stdout, (state) => startRequest(state, requiredFlag(parsed, "request")));
      case "done":
        return await updateCommand(parsed, stdout, completeCurrentRequest);
      case "skip":
        return await updateCommand(parsed, stdout, (state) => skipRequest(state, requiredFlag(parsed, "request")));
      case "move":
        return await updateCommand(parsed, stdout, (state) => moveRequest(state, requiredFlag(parsed, "request"), Number(requiredFlag(parsed, "position"))));
      case "show":
        return await showCommand(parsed, stdout);
      case "public":
        return await publicCommand(parsed, stdout);
      default:
        stderr(`Unknown queue command: ${parsed.command}`);
        stderr("Run: pnpm queue --help");
        return 1;
    }
  } catch (error) {
    if (error instanceof MissingQueueStateError) {
      stderr(`Missing queue state: ${error.path}`);
      stderr("Run: pnpm queue create --id <event-id> --name \"Event name\"");
      return 1;
    }

    if (error instanceof QueueOperationError || error instanceof Error) {
      stderr(error.message);
      return 1;
    }

    stderr("Queue command failed: Unknown error");
    return 1;
  }
}

async function createCommand(parsed: ParsedArgs, stdout: (message: string) => void): Promise<number> {
  const eventId = parseEventId(requiredFlag(parsed, "id"));
  const state = createEvent({
    id: eventId,
    name: requiredFlag(parsed, "name"),
    venue: optionalFlag(parsed, "venue"),
    date: optionalFlag(parsed, "date"),
    status: "active"
  });

  await saveQueueState(eventPath(eventId), state);
  stdout(`Queue event created: ${eventId}`);
  stdout(`File: ${eventPath(eventId)}`);
  return 0;
}

async function updateCommand(parsed: ParsedArgs, stdout: (message: string) => void, operation: (state: QueueState) => QueueState): Promise<number> {
  const eventId = parseEventId(requiredFlag(parsed, "event"));
  const before = await loadQueueState(eventPath(eventId));
  const after = operation(before);
  await saveQueueState(eventPath(eventId), after);
  stdout(`Queue event updated: ${eventId}`);

  const newestRequest = findNewestRequest(before, after);
  if (newestRequest) {
    stdout(`Request: ${newestRequest.id}`);
  }

  return 0;
}

async function showCommand(parsed: ParsedArgs, stdout: (message: string) => void): Promise<number> {
  const eventId = parseEventId(requiredFlag(parsed, "event"));
  const state = await loadQueueState(eventPath(eventId));
  const queue = getOperatorQueue(state);

  stdout(`${state.event.name} (${state.event.status})`);
  printGroup(stdout, "Now", queue.now);
  printGroup(stdout, "Pending", queue.pending);
  printGroup(stdout, "Approved", queue.approved);
  printGroup(stdout, "Done", queue.done);
  printGroup(stdout, "Skipped", queue.skipped);
  printGroup(stdout, "Rejected", queue.rejected);
  return 0;
}

async function publicCommand(parsed: ParsedArgs, stdout: (message: string) => void): Promise<number> {
  const eventId = parseEventId(requiredFlag(parsed, "event"));
  const state = await loadQueueState(eventPath(eventId));
  const queue = getPublicQueue(state, { hideSongTitles: parsed.flags.has("hide-song-titles") });

  stdout(`Public queue: ${state.event.name}`);
  stdout(`Now: ${formatPublicItem(queue.now)}`);
  stdout(`Next: ${formatPublicItem(queue.next)}`);
  stdout("Upcoming:");

  if (queue.upcoming.length === 0) {
    stdout("  none");
  } else {
    for (const item of queue.upcoming) {
      stdout(`  ${formatPublicItem(item)}`);
    }
  }

  return 0;
}

function printGroup(stdout: (message: string) => void, label: string, requests: SongRequest[]): void {
  stdout(`${label}:`);
  if (requests.length === 0) {
    stdout("  none");
    return;
  }

  for (const request of requests) {
    const position = request.position === null ? "-" : String(request.position);
    stdout(`  [${position}] ${request.id} ${request.displayName}: ${request.songArtist} - ${request.songTitle} (${request.status})`);
  }
}

function formatPublicItem(item: { displayName: string; position: number | null; songTitle?: string; songArtist?: string } | undefined): string {
  if (!item) {
    return "none";
  }

  const position = item.position === null ? "-" : `${item.position}.`;
  const song = item.songTitle && item.songArtist ? ` - ${item.songArtist} - ${item.songTitle}` : "";
  return `${position} ${item.displayName}${song}`;
}

function findNewestRequest(before: QueueState, after: QueueState): SongRequest | undefined {
  const beforeIds = new Set(before.requests.map((request) => request.id));
  return after.requests.find((request) => !beforeIds.has(request.id));
}

function parseArgs(args: string[]): ParsedArgs {
  const flags = new Map<string, string | boolean>();
  let command = "";

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];

    if (!command && !value.startsWith("--")) {
      command = value;
      continue;
    }

    if (!value.startsWith("--")) {
      continue;
    }

    const flagName = value.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      flags.set(flagName, true);
    } else {
      flags.set(flagName, next);
      index += 1;
    }
  }

  return { command, flags };
}

function requiredFlag(parsed: ParsedArgs, name: string): string {
  const value = parsed.flags.get(name);
  if (typeof value !== "string" || !value.trim()) {
    throw new QueueOperationError(`Missing --${name}`);
  }

  return value;
}

function optionalFlag(parsed: ParsedArgs, name: string): string | undefined {
  const value = parsed.flags.get(name);
  return typeof value === "string" && value.trim() ? value : undefined;
}

function parseEventId(value: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new QueueOperationError("Event id can only contain letters, numbers, underscores and hyphens");
  }

  return value;
}

function parseSongSource(value: string): SongRequest["songSource"] {
  if (value === "ising" || value === "karafun" || value === "manual") {
    return value;
  }

  throw new QueueOperationError("Song source must be one of: ising, karafun, manual");
}

function eventPath(eventId: string): string {
  return `${DEFAULT_EVENTS_DIR}/${eventId}.json`;
}

function helpText(): string {
  return [
    "Usage: pnpm queue <command> [options]",
    "",
    "Commands:",
    "  create --id <event-id> --name <name> [--venue <venue>] [--date <date>]",
    "  add --event <event-id> --singer <name> --title <title> --artist <artist> --source <ising|karafun|manual> [--source-id <id>] [--url <url>] [--note <note>]",
    "  approve --event <event-id> --request <request-id>",
    "  reject --event <event-id> --request <request-id>",
    "  start --event <event-id> --request <request-id>",
    "  done --event <event-id>",
    "  skip --event <event-id> --request <request-id>",
    "  move --event <event-id> --request <request-id> --position <number>",
    "  show --event <event-id>",
    "  public --event <event-id> [--hide-song-titles]"
  ].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = await runQueueCli(process.argv.slice(2));
  process.exitCode = exitCode;
}
