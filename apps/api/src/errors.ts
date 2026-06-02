import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"

export class ApiHttpError extends Error {
  readonly statusCode: number
  readonly code: string

  constructor(statusCode: number, code: string, message: string) {
    super(message)
    this.name = "ApiHttpError"
    this.statusCode = statusCode
    this.code = code
  }
}

export function notImplemented(message: string): ApiHttpError {
  return new ApiHttpError(501, "NOT_IMPLEMENTED", message)
}

export function installErrorHandlers(app: FastifyInstance, nodeEnv: string): void {
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    reply.code(404).send({
      error: {
        code: "ROUTE_NOT_FOUND",
        message: "Route not found",
        requestId: request.id
      }
    })
  })

  app.setErrorHandler((error: Error & { statusCode?: number; validation?: unknown }, request: FastifyRequest, reply: FastifyReply) => {
    const statusCode = error instanceof ApiHttpError ? error.statusCode : (error.statusCode ?? 500)
    const code = error instanceof ApiHttpError ? error.code : statusCode === 400 || error.validation ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR"
    const message = statusCode >= 500 && nodeEnv === "production" ? "Internal server error" : error.message

    if (statusCode >= 500) {
      request.log.error({ err: error, requestId: request.id }, "request failed")
    } else {
      request.log.info({ requestId: request.id, statusCode, code }, "request rejected")
    }

    reply.code(statusCode).send({
      error: {
        code,
        message,
        requestId: request.id
      }
    })
  })
}
