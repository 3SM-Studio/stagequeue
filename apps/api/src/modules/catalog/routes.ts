import type { FastifyInstance } from "fastify"
import { requirePlatformPermissionForRequest } from "../../permissions/request.ts"
import { readParamUuid } from "../http/validation.ts"
import { startEventStream } from "../streams/eventStreams.ts"

export async function registerCatalogPlatformRoutes(app: FastifyInstance): Promise<void> {
  app.get("/platform/catalog/import-runs/:runId/stream", async (request, reply) => {
    await requirePlatformPermissionForRequest(request, "platform.manage_catalog")
    const runId = readParamUuid(request.params, "runId")

    return startEventStream(app, reply, {
      channel: app.eventBus.catalogImportRunChannel(runId),
      connected: { scope: "platform.catalog.import-run", importRunId: runId }
    })
  })
}
