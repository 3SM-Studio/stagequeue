import { createClient } from "@redis/client"
import rateLimit from "@fastify/rate-limit"
import type { FastifyInstance } from "fastify"
import type { ApiConfig } from "../config.ts"

type RateLimitCallback = (error: Error | null, result?: { current: number; ttl: number }) => void

type FastifyRateLimitStoreOptions = {
  continueExceeding?: boolean
  exponentialBackoff?: boolean
  routeInfo?: {
    method?: string
    url?: string
  }
}

export type FastifyRateLimitStore = {
  // @fastify/rate-limit types expose incr(key, callback), but v10 runtime passes timeWindow and max too.
  incr(key: string, callback: RateLimitCallback, timeWindow?: number, max?: number): void
  child(routeOptions: unknown): FastifyRateLimitStore
}

type FastifyRateLimitStoreCtor = new (options: FastifyRateLimitStoreOptions) => FastifyRateLimitStore

export type RedisRateLimitClient = {
  connect(): Promise<unknown>
  eval<T = unknown>(
    script: string,
    options: { keys: string[]; arguments: string[] }
  ): Promise<T>
  quit?(): Promise<unknown>
  close?(): Promise<unknown>
  destroy?(): void
}

export type RateLimitOptions = {
  createRedisClient?: (url: string) => RedisRateLimitClient
}

export type RedisRateLimitResources = {
  store: FastifyRateLimitStoreCtor
  close(): Promise<void>
}

const REDIS_RATE_LIMIT_SCRIPT = `
  local key = KEYS[1]
  local timeWindow = tonumber(ARGV[1])
  local max = tonumber(ARGV[2])
  local continueExceeding = ARGV[3] == 'true'
  local exponentialBackoff = ARGV[4] == 'true'
  local maxSafeInteger = (2^53) - 1

  local current = redis.call('INCR', key)

  if current == 1 or (continueExceeding and current > max) then
    redis.call('PEXPIRE', key, timeWindow)
  elseif exponentialBackoff and current > max then
    local backoffExponent = current - max - 1
    timeWindow = math.min(timeWindow * (2 ^ backoffExponent), maxSafeInteger)
    redis.call('PEXPIRE', key, timeWindow)
  else
    timeWindow = redis.call('PTTL', key)
  end

  return {current, timeWindow}
`

export async function registerRateLimit(
  app: FastifyInstance,
  config: ApiConfig,
  options: RateLimitOptions = {}
): Promise<void> {
  const redisResources = config.redisUrl ? createRedisRateLimitResources(config.redisUrl, options) : undefined
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
    skipOnError: false,
    ...(redisResources ? { store: redisResources.store } : {})
  })
  if (redisResources) {
    app.addHook("onClose", async () => {
      await redisResources.close()
    })
  }
}

export function createRedisRateLimitResources(redisUrl: string, options: RateLimitOptions = {}): RedisRateLimitResources {
  const client = options.createRedisClient?.(redisUrl) ?? (createClient({ url: redisUrl }) as RedisRateLimitClient)
  let connection: Promise<unknown> | null = null
  let closePromise: Promise<void> | null = null

  function ensureConnected(): Promise<unknown> {
    connection ??= client.connect().catch((error) => {
      connection = null
      throw error
    })
    return connection
  }

  class RedisRateLimitStore implements FastifyRateLimitStore {
    private readonly storeOptions: FastifyRateLimitStoreOptions
    private readonly prefix: string

    constructor(storeOptions: FastifyRateLimitStoreOptions, prefix = "stagequeue:rate-limit:") {
      this.storeOptions = storeOptions
      this.prefix = prefix
    }

    incr(key: string, callback: RateLimitCallback, timeWindow = 60_000, max = 1): void {
      void this.increment(key, timeWindow, max).then(
        (result) => callback(null, result),
        (error: unknown) => callback(error instanceof Error ? error : new Error("Redis rate limit failed"))
      )
    }

    child(routeOptions: unknown): FastifyRateLimitStore {
      const childOptions = readStoreOptions(routeOptions)
      const routeInfo = childOptions.routeInfo
      const routePrefix =
        routeInfo?.method && routeInfo.url ? `${this.prefix}${routeInfo.method}${routeInfo.url}:` : this.prefix
      return new RedisRateLimitStore(childOptions, routePrefix)
    }

    private async increment(key: string, timeWindow: number, max: number): Promise<{ current: number; ttl: number }> {
      await ensureConnected()
      const result = await client.eval<[number | string, number | string]>(REDIS_RATE_LIMIT_SCRIPT, {
        keys: [`${this.prefix}${key}`],
        arguments: [
          String(timeWindow),
          String(max),
          String(this.storeOptions.continueExceeding === true),
          String(this.storeOptions.exponentialBackoff === true)
        ]
      })

      return {
        current: Number(result[0]),
        ttl: Number(result[1])
      }
    }
  }

  return {
    store: RedisRateLimitStore,
    async close() {
      closePromise ??= (async () => {
        if (client.close) {
          await client.close()
        } else {
          await client.quit?.()
        }
        try {
          client.destroy?.()
        } catch {
          // @redis/client may reject destroy after a graceful close; app.close() should remain safe.
        }
      })()
      await closePromise
    }
  }
}

function readStoreOptions(value: unknown): FastifyRateLimitStoreOptions {
  if (typeof value !== "object" || value === null) {
    return {}
  }
  const input = value as {
    continueExceeding?: unknown
    exponentialBackoff?: unknown
    routeInfo?: { method?: unknown; url?: unknown }
  }
  const options: FastifyRateLimitStoreOptions = {}
  if (typeof input.continueExceeding === "boolean") {
    options.continueExceeding = input.continueExceeding
  }
  if (typeof input.exponentialBackoff === "boolean") {
    options.exponentialBackoff = input.exponentialBackoff
  }
  if (typeof input.routeInfo === "object" && input.routeInfo !== null) {
    const method = typeof input.routeInfo.method === "string" ? input.routeInfo.method : undefined
    const url = typeof input.routeInfo.url === "string" ? input.routeInfo.url : undefined
    if (method !== undefined || url !== undefined) {
      options.routeInfo = {
        ...(method !== undefined ? { method } : {}),
        ...(url !== undefined ? { url } : {})
      }
    }
  }
  return options
}
