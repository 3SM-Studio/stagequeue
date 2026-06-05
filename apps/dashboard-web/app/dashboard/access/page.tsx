import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getDashboardGateRedirect, readDashboardGate } from "../../../lib/dashboardGate.ts"

export const metadata = {
  title: "Dostep"
}

export default async function DashboardAccessPage() {
  const cookieHeader = (await cookies()).toString()
  const state = await readDashboardGate({ cookieHeader })
  const redirectTarget = getDashboardGateRedirect(state, "/dashboard/access")

  if (redirectTarget) {
    redirect(redirectTarget)
  }

  if (state.kind === "allowed") {
    redirect("/dashboard")
  }

  if (state.kind === "api_unavailable") {
    return (
      <main className="page-shell narrow">
        <section className="panel">
          <h1>{state.title}</h1>
          <p className="lead">{state.message}</p>
        </section>
      </main>
    )
  }

  if (state.kind !== "access_denied") {
    redirect("/sign-in")
  }

  return (
    <main className="page-shell narrow">
      <section className="panel">
        <h1>{state.title}</h1>
        <p className="lead">{state.message}</p>
        <p className="muted">Status dostepu: {state.reason}</p>
      </section>
    </main>
  )
}
