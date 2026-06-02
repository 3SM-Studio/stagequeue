import type { FastifyInstance, FastifyReply } from "fastify"

const KEEPALIVE_INTERVAL_MS = 20_000

export function startEventStream(
  app: FastifyInstance,
  reply: FastifyReply,
  options: {
    channel: string
    connected: Record<string, unknown>
  }
): FastifyReply {
  reply.hijack()
  app.writeSse(reply, {
    event: "connected",
    data: {
      ...options.connected,
      at: new Date().toISOString()
    }
  })

  const unsubscribe = app.eventBus.subscribe(options.channel, (event) => {
    app.writeSse(reply, { event: event.type, data: event })
  })

  const keepalive = setInterval(() => {
    reply.raw.write(": ping\n\n")
  }, KEEPALIVE_INTERVAL_MS)
  keepalive.unref()

  reply.raw.on("close", () => {
    clearInterval(keepalive)
    unsubscribe()
  })

  return reply
}
