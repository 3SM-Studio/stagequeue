import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { CreateEventForm } from "../../../../components/CreateEventForm"
import { GoogleSignInButton } from "../../../../components/GoogleSignInButton"
import { listDashboardVenues } from "../../../../lib/apiClient.ts"
import { getDashboardGateRedirect, readDashboardGate } from "../../../../lib/dashboardGate.ts"
import { getDashboardEventsErrorState } from "../../../../lib/eventsState.ts"

export const metadata = {
  title: "Nowe wydarzenie"
}

export default async function NewDashboardEventPage() {
  const cookieHeader = (await cookies()).toString()
  const gate = await readDashboardGate({ cookieHeader })
  const redirectTarget = getDashboardGateRedirect(gate, "/dashboard/events/new")

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
    const { venues } = await listDashboardVenues({ cookieHeader })
    return (
      <main className="page-shell">
        <CreateEventForm venues={venues} />
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
              <GoogleSignInButton callbackPath="/dashboard/events/new" />
            </div>
          ) : null}
        </section>
      </main>
    )
  }
}
