import type { FastifyInstance, FastifyReply } from "fastify"
import type { DomainEventPayload } from "../../plugins/eventBus.ts"

const KEEPALIVE_INTERVAL_MS = 20_000

export type PublicStreamEventPayload = Pick<DomainEventPayload, "type" | "at">

export function startEventStream(
  app: FastifyInstance,
  reply: FastifyReply,
  options: {
    channel: string
    connected: Record<string, unknown>
    heartbeatIntervalMs?: number
    mapEventData?: (event: DomainEventPayload) => unknown
  }
): FastifyReply {
  const startedAt = Date.now()
  const logContext = createStreamLogContext(reply, options.connected)

  reply.hijack()
  app.log.debug(
    {
      event: "sse_stream_open",
      operation: "open",
      ...logContext
    },
    "SSE stream opened"
  )
  app.writeSse(reply, {
    event: "connected",
    data: {
      ...options.connected,
      at: new Date().toISOString()
    }
  })

  const unsubscribe = app.eventBus.subscribe(options.channel, (event) => {
    app.writeSse(reply, {
      event: event.type,
      data: options.mapEventData?.(event) ?? event
    })
  })

  const keepalive = setInterval(() => {
    reply.raw.write(": ping\n\n")
  }, options.heartbeatIntervalMs ?? KEEPALIVE_INTERVAL_MS)
  keepalive.unref()

  reply.raw.on("error", (error) => {
    app.log.warn(
      {
        event: "sse_stream_error",
        operation: "error",
        ...logContext,
        ...toSafeErrorFields(error)
      },
      "SSE stream error"
    )
  })

  reply.raw.on("close", () => {
    clearInterval(keepalive)
    unsubscribe()
    app.log.debug(
      {
        event: "sse_stream_close",
        operation: "close",
        ...logContext,
        durationMs: Date.now() - startedAt
      },
      "SSE stream closed"
    )
  })

  return reply
}

export function toPublicStreamEventPayload(event: DomainEventPayload): PublicStreamEventPayload {
  return {
    type: event.type,
    at: event.at
  }
}

function createStreamLogContext(reply: FastifyReply, connected: Record<string, unknown>): Record<string, unknown> {
  const context: Record<string, unknown> = {
    requestId: readReplyRequestId(reply)
  }
  const scope = connected.scope
  if (typeof scope === "string") {
    context.scope = scope
  }
  for (const key of ["eventId", "eventPublicId", "venueSlug", "importRunId"]) {
    const value = connected[key]
    if (typeof value === "string") {
      context[key] = value
    }
  }

  return context
}

function readReplyRequestId(reply: FastifyReply): string | undefined {
  const requestId = (reply as unknown as { request?: { id?: unknown } }).request?.id
  return typeof requestId === "string" ? requestId : undefined
}

function toSafeErrorFields(error: unknown): { errorName: string; errorMessage: string; errorCode?: string } {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      ...readErrorCode(error)
    }
  }

  return {
    errorName: "Error",
    errorMessage: String(error)
  }
}

function readErrorCode(error: Error): { errorCode?: string } {
  const code = (error as { code?: unknown }).code
  return typeof code === "string" ? { errorCode: code } : {}
}
