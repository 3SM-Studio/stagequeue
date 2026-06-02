import { fromNodeHeaders } from "better-auth/node"
import type { FastifyInstance, FastifyReply } from "fastify"
import { createBetterAuth, type BetterAuthInstance } from "../auth/betterAuth.ts"
import type { ApiConfig } from "../config.ts"

declare module "fastify" {
  interface FastifyInstance {
    auth: BetterAuthInstance
  }
}

export async function registerAuth(app: FastifyInstance, config: ApiConfig, authInstance?: BetterAuthInstance): Promise<void> {
  const auth = authInstance ?? createBetterAuth(config, app.db)
  app.decorate("auth", auth)

  app.route({
    method: ["GET", "POST"],
    url: "/auth/*",
    async handler(request, reply) {
      try {
        const url = new URL(request.url, config.apiUrl)
        const body = request.body === undefined ? undefined : JSON.stringify(request.body)
        const requestInit: RequestInit = {
          method: request.method,
          headers: fromNodeHeaders(request.headers)
        }
        if (body !== undefined) {
          requestInit.body = body
        }
        const authRequest = new Request(url.toString(), requestInit)
        const response = await auth.handler(authRequest)

        await sendBetterAuthResponse(reply, response)
      } catch (error) {
        request.log.error({ err: error, requestId: request.id }, "authentication handler failed")
        reply.code(500).send({
          error: {
            code: "AUTH_FAILURE",
            message: "Internal authentication error",
            requestId: request.id
          }
        })
      }
    }
  })
}

async function sendBetterAuthResponse(reply: FastifyReply, response: Response): Promise<void> {
  reply.status(response.status)

  const setCookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : []
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") {
      reply.header(key, value)
    }
  })
  if (setCookies.length > 0) {
    reply.header("set-cookie", setCookies)
  }

  const text = await response.text()
  reply.send(text || null)
}
