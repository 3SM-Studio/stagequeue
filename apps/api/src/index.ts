import { pathToFileURL } from "node:url"
import { createApiApp } from "./app.ts"
import { loadApiConfig } from "./config.ts"

export async function startApi(): Promise<void> {
  const config = await loadApiConfig()
  const app = await createApiApp({ config })

  try {
    await app.listen({ host: config.host, port: config.port })
    app.log.info(`[api] listening on ${config.apiUrl}`)
  } catch (error) {
    handleStartupError(error, config)
  }
}

function handleStartupError(error: unknown, config: { host: string; port: number }): never {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined

  if (code === "EADDRINUSE") {
    console.error(`[api:error] Port ${config.port} is already in use on ${config.host}.`)
    console.error("[api:error] Stop the previous API process or set a different API_PORT.")
    process.exit(1)
  }

  const message = error instanceof Error ? error.message : "Unknown API startup error"
  console.error(`[api:error] Failed to start API: ${message}`)
  process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startApi()
}
