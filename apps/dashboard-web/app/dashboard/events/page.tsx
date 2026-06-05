import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { DashboardEventsView } from "../../../components/DashboardEventsView"
import { GoogleSignInButton } from "../../../components/GoogleSignInButton"
import { listDashboardEvents } from "../../../lib/apiClient.ts"
import { getDashboardGateRedirect, readDashboardGate } from "../../../lib/dashboardGate.ts"
import { getDashboardEventsErrorState } from "../../../lib/eventsState.ts"

export const metadata = {
  title: "Wydarzenia"
}

export default async function DashboardEventsPage() {
  const cookieHeader = (await cookies()).toString()
  const gate = await readDashboardGate({ cookieHeader })
  const redirectTarget = getDashboardGateRedirect(gate, "/dashboard/events")

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

  try {
    const { events } = await listDashboardEvents({ cookieHeader })
    return (
      <main className="page-shell">
        <DashboardEventsView events={events} />
      </main>
    )
  } catch (error) {
    const state = getDashboardEventsErrorState(error)

    return (
      <main className="page-shell narrow">
        <section className="panel">
          <h1>{state.title}</h1>
          <p className="lead">{state.message}</p>
          {state.kind === "login" ? (
            <div className="actions">
              <GoogleSignInButton callbackPath="/dashboard/events" />
            </div>
          ) : null}
        </section>
      </main>
    )
  }
}
