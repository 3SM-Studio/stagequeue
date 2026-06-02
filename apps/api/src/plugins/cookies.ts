import cookie from "@fastify/cookie"
import type { FastifyInstance } from "fastify"

export async function registerCookies(app: FastifyInstance): Promise<void> {
  await app.register(cookie)
}
