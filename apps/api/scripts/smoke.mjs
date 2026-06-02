import { createApiApp } from "../src/app.ts"

const host = process.env.API_HOST || "127.0.0.1"
const port = Number(process.env.API_PORT || "4321")
const healthUrl = `http://${host}:${port}/health`
const meUrl = `http://${host}:${port}/me`
const app = await createApiApp()

try {
  await app.listen({ host, port })
  const body = await readJson(healthUrl)
  const meBody = await readJson(meUrl)
  console.log("API smoke check passed")
  console.log(`Health: ${healthUrl}`)
  console.log(JSON.stringify(body))
  console.log(`Me: ${meUrl}`)
  console.log(JSON.stringify(meBody))
} catch (error) {
  console.error("API smoke check failed")
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  await app.close()
}

async function readJson(url) {
  const response = await fetch(url)
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}: ${text}`)
  }
  return text ? JSON.parse(text) : {}
}
