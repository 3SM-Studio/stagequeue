import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { QueueState } from "./types.ts";

export class MissingQueueStateError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`Missing queue state: ${path}`);
    this.name = "MissingQueueStateError";
    this.path = path;
  }
}

export async function saveQueueState(filePath: string, state: QueueState): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function loadQueueState(filePath: string): Promise<QueueState> {
  let raw: string;

  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      throw new MissingQueueStateError(filePath);
    }
    throw error;
  }

  const parsed: unknown = JSON.parse(raw);
  if (!isQueueState(parsed)) {
    throw new Error(`Invalid queue state: ${filePath}`);
  }

  return parsed;
}

function isQueueState(value: unknown): value is QueueState {
  return (
    typeof value === "object" &&
    value !== null &&
    "event" in value &&
    "requests" in value &&
    Array.isArray(value.requests)
  );
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
