import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getDashboardGateRedirect, readDashboardGate } from "../../../lib/dashboardGate.ts"

export const metadata = {
  title: "Lokale"
}

export default async function DashboardVenuesPage() {
  const cookieHeader = (await cookies()).toString()
  const gate = await readDashboardGate({ cookieHeader })
  const redirectTarget = getDashboardGateRedirect(gate, "/dashboard/venues")

  if (redirectTarget) {
    redirect(redirectTarget)
  }

  if (gate.kind === "api_unavailable") {
    return (
      <main className="page-shell narrow">
        <section className="panel">
          <h1>{gate.title}</h1>
          <p className="lead">{gate.message}</p>
        </section>
      </main>
    )
  }

  if (gate.kind !== "allowed") {
    redirect("/sign-in")
  }

  return (
    <main className="page-shell">
      <section className="panel">
        <h1>Lokale</h1>
        <p className="lead">Placeholder D1. Dashboard nie dotyka bazy bezposrednio i bedzie czytal lokale przez Fastify API.</p>
      </section>
    </main>
  )
}
