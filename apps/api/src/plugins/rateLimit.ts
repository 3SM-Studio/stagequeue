import rateLimit from "@fastify/rate-limit"
import type { FastifyInstance } from "fastify"

export async function registerRateLimit(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute"
  })
}
