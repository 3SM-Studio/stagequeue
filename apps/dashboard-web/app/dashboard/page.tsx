import { cookies } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"
import { getDashboardGateRedirect, readDashboardGate } from "../../lib/dashboardGate.ts"

export const metadata = {
  title: "Dashboard"
}

export default async function DashboardPage() {
  const cookieHeader = (await cookies()).toString()
  const state = await readDashboardGate({ cookieHeader })
  const redirectTarget = getDashboardGateRedirect(state, "/dashboard")

  if (redirectTarget) {
    redirect(redirectTarget)
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

  if (state.kind !== "allowed") {
    redirect("/sign-in")
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="panel">
          <h1>{state.title}</h1>
          <p className="lead">Fundament panelu jest gotowy. Kolejne kroki dodadza operacje eventow i kolejki.</p>
          <div className="identity-box">
            <strong>{state.userName ?? state.userEmail}</strong>
            <span className="muted">{state.userEmail}</span>
            <div className="pill-row">
              {state.platformRoles.length > 0 ? (
                state.platformRoles.map((role) => (
                  <span className="pill" key={role}>
                    {role}
                  </span>
                ))
              ) : (
                <span className="pill">active_user</span>
              )}
            </div>
          </div>
        </div>
        <aside className="panel">
          <h2>Nastepne obszary</h2>
          <p className="muted">D1 nie zawiera jeszcze operator queue actions ani CRUD. To shell pod dalsze fazy.</p>
        </aside>
      </section>
      <section className="dashboard-grid" aria-label="Dashboard sections">
        <Link className="dashboard-card" href="/dashboard/organizations">
          <strong>Organizacje</strong>
          <span className="muted">Czlonkostwa i dostep organizacji.</span>
        </Link>
        <Link className="dashboard-card" href="/dashboard/venues">
          <strong>Lokale</strong>
          <span className="muted">Venue-first operacje i dostepy.</span>
        </Link>
        <Link className="dashboard-card" href="/dashboard/events">
          <strong>Wydarzenia</strong>
          <span className="muted">Eventy i przyszly panel operatora.</span>
        </Link>
      </section>
    </main>
  )
}
