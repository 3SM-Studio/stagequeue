import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ISingImporterConfig } from "./types.ts";

export async function loadISingImporterConfig(envPath = ".env"): Promise<ISingImporterConfig> {
  const env = { ...(await readEnvFile(envPath)), ...process.env };

  return {
    apiBaseUrl: env.ISING_API_BASE_URL || "https://api.ising.pl/v2",
    clientId: requiredEnv(env.ISING_CLIENT_ID, "ISING_CLIENT_ID"),
    delayMs: parsePositiveInteger(env.ISING_IMPORT_DELAY_MS, 3000),
    tag: env.ISING_IMPORT_TAG || "",
    order: env.ISING_IMPORT_ORDER || "-artist_string",
    contactEmail: optionalEnv(env.ISING_IMPORT_CONTACT_EMAIL),
    userAgent: optionalEnv(env.ISING_IMPORT_USER_AGENT),
    outputSongsPath: resolve("data/imports/ising-songs.json"),
    outputReportPath: resolve("data/imports/ising-import-report.json"),
    timeoutMs: 15_000,
    maxNetworkRetries: 1
  };
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

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
      env[key] = value;
    }

    return env;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function requiredEnv(value: string | undefined, name: string): string {
  if (!value || value === "replace_me") {
    throw new Error(`Missing required env ${name}`);
  }
  return value;
}

function optionalEnv(value: string | undefined): string | undefined {
  return value && value.trim() ? value : undefined;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
