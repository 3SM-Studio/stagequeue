import cors from "@fastify/cors"
import type { FastifyInstance } from "fastify"
import type { ApiConfig } from "../config.ts"

export async function registerCors(app: FastifyInstance, config: ApiConfig): Promise<void> {
  const allowedOrigins = new Set([config.publicWebUrl, config.dashboardWebUrl])

  await app.register(cors, {
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true)
        return
      }

      callback(null, allowedOrigins.has(origin) ? origin : false)
    }
  })
}
