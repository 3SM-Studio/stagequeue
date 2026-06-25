import type { FastifyInstance } from "fastify"
import { createClient } from "@redis/client"
import type { ApiConfig } from "../config.ts"

export type DomainEventType =
  | "queue.updated"
  | "event.started"
  | "event.paused"
  | "event.resumed"
  | "event.closed"
  | "event.archived"
  | "event.cancelled"
  | "request.created"
  | "request.approved"
  | "request.rejected"
  | "request.started"
  | "request.done"
  | "request.skipped"
  | "request.moved"
  | "catalog.import.updated"

export type DomainEventPayload = {
  type: DomainEventType
  eventId?: string
  venueId?: string
  requestId?: string
  importRunId?: string
  at: string
}

export type DomainEventBus = {
  publish(event: Omit<DomainEventPayload, "at"> & { at?: string }): void
  subscribe(channel: string, listener: (event: DomainEventPayload) => void): () => void
  subscribeToEvent(eventId: string, listener: (event: DomainEventPayload) => void): () => void
  subscribeToCatalogImportRun(importRunId: string, listener: (event: DomainEventPayload) => void): () => void
  eventChannel(eventId: string): string
  catalogImportRunChannel(importRunId: string): string
  subscriberCount(channel: string): number
  close?(): void | Promise<void>
}

type RedisEventBusClient = {
  connect(): Promise<unknown>
  publish(channel: string, message: string): Promise<unknown>
  subscribe(channel: string, listener: (message: string, channel: string) => void): Promise<unknown>
  unsubscribe(channel: string): Promise<unknown>
  quit(): Promise<unknown>
  destroy?(): void
}

type RedisEventBusOptions = {
  createRedisClient?: (url: string) => RedisEventBusClient
  onError?: (error: unknown) => void
}

declare module "fastify" {
  interface FastifyInstance {
    eventBus: DomainEventBus
  }
}

export async function registerEventBus(app: FastifyInstance, config: ApiConfig, override?: DomainEventBus): Promise<void> {
  const eventBus = override ?? createDomainEventBus(config)
  app.decorate("eventBus", eventBus)
  app.addHook("onClose", async () => {
    await eventBus.close?.()
  })
}

export function createDomainEventBus(config: ApiConfig, options: RedisEventBusOptions = {}): DomainEventBus {
  return config.redisUrl ? createRedisDomainEventBus(config.redisUrl, options) : createInMemoryDomainEventBus()
}

export function createInMemoryDomainEventBus(): DomainEventBus {
  const subscribers = new Map<string, Set<(event: DomainEventPayload) => void>>()

  function subscribe(channel: string, listener: (event: DomainEventPayload) => void): () => void {
    const channelSubscribers = subscribers.get(channel) ?? new Set()
    channelSubscribers.add(listener)
    subscribers.set(channel, channelSubscribers)

    return () => {
      channelSubscribers.delete(listener)
      if (channelSubscribers.size === 0) {
        subscribers.delete(channel)
      }
    }
  }

  function publishToChannel(channel: string, event: DomainEventPayload): void {
    for (const listener of subscribers.get(channel) ?? []) {
      listener(event)
    }
  }

  return {
    publish(event) {
      const payload = { ...event, at: event.at ?? new Date().toISOString() }
      if (payload.eventId) {
        publishToChannel(eventChannel(payload.eventId), payload)
      }
      if (payload.importRunId) {
        publishToChannel(catalogImportRunChannel(payload.importRunId), payload)
      }
    },
    subscribe,
    subscribeToEvent(eventId, listener) {
      return subscribe(eventChannel(eventId), listener)
    },
    subscribeToCatalogImportRun(importRunId, listener) {
      return subscribe(catalogImportRunChannel(importRunId), listener)
    },
    eventChannel,
    catalogImportRunChannel,
    subscriberCount(channel) {
      return subscribers.get(channel)?.size ?? 0
    },
    close() {
      subscribers.clear()
    }
  }
}

export function createRedisDomainEventBus(redisUrl: string, options: RedisEventBusOptions = {}): DomainEventBus {
  const publisher = options.createRedisClient?.(redisUrl) ?? (createClient({ url: redisUrl }) as RedisEventBusClient)
  const subscriber = options.createRedisClient?.(redisUrl) ?? (createClient({ url: redisUrl }) as RedisEventBusClient)
  const subscribers = new Map<string, Set<(event: DomainEventPayload) => void>>()
  const subscribedChannels = new Set<string>()
  const subscribingChannels = new Set<string>()
  let publisherConnection: Promise<unknown> | null = null
  let subscriberConnection: Promise<unknown> | null = null
  let closePromise: Promise<void> | null = null
  let closed = false

  function reportError(error: unknown): void {
    options.onError?.(error)
  }

  function ensurePublisherConnected(): Promise<unknown> {
    publisherConnection ??= publisher.connect().catch((error) => {
      publisherConnection = null
      throw error
    })
    return publisherConnection
  }

  function ensureSubscriberConnected(): Promise<unknown> {
    subscriberConnection ??= subscriber.connect().catch((error) => {
      subscriberConnection = null
      throw error
    })
    return subscriberConnection
  }

  function dispatch(channel: string, message: string): void {
    let payload: DomainEventPayload
    try {
      payload = JSON.parse(message) as DomainEventPayload
    } catch (error) {
      reportError(error)
      return
    }

    for (const listener of subscribers.get(channel) ?? []) {
      listener(payload)
    }
  }

  async function subscribeRedisChannel(channel: string): Promise<void> {
    if (closed || subscribedChannels.has(channel) || subscribingChannels.has(channel)) {
      return
    }
    subscribingChannels.add(channel)
    try {
      await ensureSubscriberConnected()
      await subscriber.subscribe(channel, (message, receivedChannel) => {
        dispatch(receivedChannel, message)
      })
      subscribedChannels.add(channel)
      if (!subscribers.has(channel)) {
        await unsubscribeRedisChannel(channel)
      }
    } catch (error) {
      reportError(error)
    } finally {
      subscribingChannels.delete(channel)
    }
  }

  async function unsubscribeRedisChannel(channel: string): Promise<void> {
    if (closed || !subscribedChannels.has(channel)) {
      return
    }
    try {
      await subscriber.unsubscribe(channel)
      subscribedChannels.delete(channel)
    } catch (error) {
      reportError(error)
    }
  }

  function subscribe(channel: string, listener: (event: DomainEventPayload) => void): () => void {
    if (closed) {
      return () => undefined
    }
    const channelSubscribers = subscribers.get(channel) ?? new Set()
    const shouldSubscribe = channelSubscribers.size === 0
    channelSubscribers.add(listener)
    subscribers.set(channel, channelSubscribers)

    if (shouldSubscribe) {
      void subscribeRedisChannel(channel)
    }

    return () => {
      channelSubscribers.delete(listener)
      if (channelSubscribers.size === 0) {
        subscribers.delete(channel)
        void unsubscribeRedisChannel(channel)
      }
    }
  }

  function publishToChannel(channel: string, event: DomainEventPayload): void {
    if (closed) {
      return
    }
    void ensurePublisherConnected()
      .then(() => publisher.publish(channel, JSON.stringify(event)))
      .catch(reportError)
  }

  return {
    publish(event) {
      const payload = { ...event, at: event.at ?? new Date().toISOString() }
      if (payload.eventId) {
        publishToChannel(eventChannel(payload.eventId), payload)
      }
      if (payload.importRunId) {
        publishToChannel(catalogImportRunChannel(payload.importRunId), payload)
      }
    },
    subscribe,
    subscribeToEvent(eventId, listener) {
      return subscribe(eventChannel(eventId), listener)
    },
    subscribeToCatalogImportRun(importRunId, listener) {
      return subscribe(catalogImportRunChannel(importRunId), listener)
    },
    eventChannel,
    catalogImportRunChannel,
    subscriberCount(channel) {
      return subscribers.get(channel)?.size ?? 0
    },
    async close() {
      closePromise ??= (async () => {
        closed = true
        subscribers.clear()
        subscribedChannels.clear()
        subscribingChannels.clear()
        await Promise.allSettled([publisher.quit(), subscriber.quit()])
        publisher.destroy?.()
        subscriber.destroy?.()
      })()
      await closePromise
    }
  }
}

function eventChannel(eventId: string): string {
  return `event:${eventId}`
}

function catalogImportRunChannel(importRunId: string): string {
  return `catalog-import:${importRunId}`
}
