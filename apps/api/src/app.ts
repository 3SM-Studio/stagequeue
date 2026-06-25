import { randomUUID } from "node:crypto"
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify"
import type { BetterAuthInstance } from "./auth/betterAuth.ts"
import { type ApiConfig, parseApiConfig } from "./config.ts"
import { installErrorHandlers } from "./errors.ts"
import { registerAuth } from "./plugins/auth.ts"
import { registerCookies } from "./plugins/cookies.ts"
import { registerCors } from "./plugins/cors.ts"
import { type DbResources, registerDb } from "./plugins/db.ts"
import { type DomainEventBus, registerEventBus } from "./plugins/eventBus.ts"
import { registerPermissions } from "./plugins/permissions.ts"
import { registerRateLimit } from "./plugins/rateLimit.ts"
import { registerRequestId } from "./plugins/requestId.ts"
import { registerSse } from "./plugins/sse.ts"
import { registerDashboardRoutes } from "./routes/dashboard.ts"
import { registerHealthRoutes } from "./routes/health.ts"
import { registerMeRoutes } from "./routes/me.ts"
import { registerPlatformRoutes } from "./routes/platform.ts"
import { registerPublicRoutes } from "./routes/public.ts"
import { registerSetupRoutes } from "./modules/setup/routes.ts"
import type { CurrentUserResolver } from "./permissions/request.ts"
import type { PermissionService } from "./permissions/service.ts"
import { registerModuleServices, type ApiModuleServices } from "./plugins/modules.ts"

export type CreateApiAppOptions = {
  config?: ApiConfig
  db?: DbResources
  auth?: BetterAuthInstance
  currentUserResolver?: CurrentUserResolver
  permissions?: PermissionService
  eventBus?: DomainEventBus
  services?: Partial<ApiModuleServices>
  logger?: NonNullable<FastifyServerOptions["logger"]>
}

export async function createApiApp(options: CreateApiAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? parseApiConfig(process.env)
  const fastifyOptions: FastifyServerOptions = {
    logger: options.logger ?? createLoggerConfig(config),
    genReqId: () => randomUUID(),
    requestIdHeader: false,
    bodyLimit: 1_000_000,
    disableRequestLogging: config.logLevel === "silent"
  }
  const app: FastifyInstance = Fastify(fastifyOptions)

  app.decorate("config", config)
  if (options.currentUserResolver) {
    app.decorate("currentUserResolver", options.currentUserResolver)
  }
  installErrorHandlers(app, config.nodeEnv)

  await registerRequestId(app)
  await registerDb(app, config, options.db)
  await registerPermissions(app, options.permissions)
  await registerSse(app)
  await registerEventBus(app, config, options.eventBus)
  await registerModuleServices(app, options.services)
  await registerCors(app, config)
  await registerCookies(app)
  await registerRateLimit(app)
  await registerAuth(app, config, options.auth)

  await registerHealthRoutes(app, config)
  await registerMeRoutes(app)
  await registerSetupRoutes(app)
  await registerPublicRoutes(app)
  await registerDashboardRoutes(app)
  await registerPlatformRoutes(app)

  return app
}

declare module "fastify" {
  interface FastifyInstance {
    config: ApiConfig
  }
}

function createLoggerConfig(config: ApiConfig): NonNullable<FastifyServerOptions["logger"]> {
  if (config.logLevel === "silent" || config.nodeEnv === "test") {
    return false
  }

  return {
    level: config.logLevel,
    redact: ["req.headers.authorization", "request.headers.authorization", "headers.authorization"]
  }
}
