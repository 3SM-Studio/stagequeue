import type { FastifyInstance } from "fastify"
import { requireCurrentUser, requirePlatformPermissionForRequest } from "../../permissions/request.ts"
import { readParamUuid } from "../http/validation.ts"

export async function registerAccessRequestPlatformRoutes(app: FastifyInstance): Promise<void> {
  app.get("/platform/access-requests", async (request) => {
    await requirePlatformPermissionForRequest(request, "platform.manage_access")
    return { accessRequests: await app.accessRequests.listAccessRequests() }
  })

  app.post("/platform/access-requests/:accessRequestId/approve", async (request) => {
    const user = await requireCurrentUser(request)
    await requirePlatformPermissionForRequest(request, "platform.manage_access")
    const accessRequestId = readParamUuid(request.params, "accessRequestId")
    return { accessRequest: await app.accessRequests.approveAccessRequest(accessRequestId, user.id) }
  })

  app.post("/platform/access-requests/:accessRequestId/reject", async (request) => {
    const user = await requireCurrentUser(request)
    await requirePlatformPermissionForRequest(request, "platform.manage_access")
    const accessRequestId = readParamUuid(request.params, "accessRequestId")
    return { accessRequest: await app.accessRequests.rejectAccessRequest(accessRequestId, user.id) }
  })
}
