import type { FastifyInstance, FastifyReply } from "fastify"

export type SseEvent = {
  event?: string
  id?: string
  retry?: number
  data: unknown
}

declare module "fastify" {
  interface FastifyInstance {
    writeSse: (reply: FastifyReply, event: SseEvent) => void
  }
}

export async function registerSse(app: FastifyInstance): Promise<void> {
  app.decorate("writeSse", (reply: FastifyReply, event: SseEvent) => {
    if (!reply.raw.headersSent) {
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        ...readSseCorsHeaders(reply)
      })
    }

    reply.raw.write(formatSseEvent(event))
  })
}

function readSseCorsHeaders(reply: FastifyReply): Record<string, string> {
  const origin = reply.request.headers.origin
  if (typeof origin !== "string") {
    return {}
  }

  const allowedOrigins = new Set([reply.server.config.publicWebUrl, reply.server.config.dashboardWebUrl])
  if (!allowedOrigins.has(origin)) {
    return {}
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin"
  }
}

function formatSseEvent(event: SseEvent): string {
  const lines: string[] = []

  if (event.id) {
    lines.push(`id: ${event.id}`)
  }
  if (event.event) {
    lines.push(`event: ${event.event}`)
  }
  if (event.retry) {
    lines.push(`retry: ${event.retry}`)
  }

  for (const line of JSON.stringify(event.data).split(/\r?\n/)) {
    lines.push(`data: ${line}`)
  }

  return `${lines.join("\n")}\n\n`
}
