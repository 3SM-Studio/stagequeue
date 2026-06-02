import { checkDbConnection } from "@poza-nuta/db"
import type { FastifyInstance } from "fastify"
import type { ApiConfig } from "../config.ts"

export async function registerHealthRoutes(app: FastifyInstance, config: ApiConfig): Promise<void> {
  app.get("/health", async (_request, reply) => {
    const db = await checkDatabase(app)
    const status = db.ok ? 200 : 503

    return reply.code(status).send({
      ok: db.ok,
      service: "poza-nuta-api",
      environment: config.nodeEnv,
      db
    })
  })
}

async function checkDatabase(app: FastifyInstance): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await checkDbConnection(app.db)
    return { ok: true }
  } catch {
    return { ok: false, message: "Database connection failed" }
  }
}
