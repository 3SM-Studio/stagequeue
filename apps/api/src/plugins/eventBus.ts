import type { FastifyInstance } from "fastify"

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
}

declare module "fastify" {
  interface FastifyInstance {
    eventBus: DomainEventBus
  }
}

export async function registerEventBus(app: FastifyInstance, override?: DomainEventBus): Promise<void> {
  app.decorate("eventBus", override ?? createInMemoryDomainEventBus())
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
    }
  }
}

function eventChannel(eventId: string): string {
  return `event:${eventId}`
}

function catalogImportRunChannel(importRunId: string): string {
  return `catalog-import:${importRunId}`
}
