import { NextResponse, type NextRequest } from "next/server"
import { claimPublicInviteServer } from "../../../lib/serverApiClient"

type InviteRouteContext = {
  params: Promise<{ inviteCode: string }>
}

export async function GET(request: NextRequest, context: InviteRouteContext) {
  const { inviteCode } = await context.params

  try {
    const claim = await claimPublicInviteServer(inviteCode, request.headers.get("cookie"))
    const response = NextResponse.redirect(new URL(claim.body.redirectTo, request.url))
    for (const setCookie of claim.setCookieHeaders) {
      response.headers.append("Set-Cookie", setCookie)
    }
    return response
  } catch (error) {
    const status = error instanceof Error && "status" in error && typeof error.status === "number" ? error.status : 502
    return new Response(renderInviteErrorHtml(status), {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8"
      }
    })
  }
}

function renderInviteErrorHtml(status: number): string {
  const title = status === 404 ? "Zaproszenie jest nieprawidlowe albo wygaslo" : "Nie udalo sie sprawdzic zaproszenia"
  return `<!doctype html>
<html lang="pl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} | Poza Nuta</title>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p>Popros prowadzacego o nowy link do wydarzenia.</p>
    </main>
  </body>
</html>`
}
