import type { FastifyInstance } from "fastify"
import { createDrizzlePermissionRepository, createPermissionService, type PermissionService } from "../permissions/service.ts"

declare module "fastify" {
  interface FastifyInstance {
    permissions: PermissionService
  }
}

export async function registerPermissions(app: FastifyInstance, service?: PermissionService): Promise<void> {
  app.decorate("permissions", service ?? createPermissionService(createDrizzlePermissionRepository(app.db)))
}
