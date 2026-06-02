import { cookies } from "next/headers"
import Link from "next/link"
import { buildGoogleSignInUrl, getMe } from "../../lib/apiClient.ts"
import { getDashboardViewState } from "../../lib/dashboardState.ts"

export const metadata = {
  title: "Dashboard"
}

export default async function DashboardPage() {
  const cookieHeader = (await cookies()).toString()
  const state = getDashboardViewState(await getMe({ cookieHeader }))

  if (state.kind === "unauthenticated") {
    return (
      <main className="page-shell narrow">
        <section className="panel">
          <h1>{state.title}</h1>
          <p className="lead">{state.message}</p>
          <div className="actions">
            <Link className="button" href={buildGoogleSignInUrl()}>
              Zaloguj przez Google
            </Link>
          </div>
        </section>
      </main>
    )
  }

  if (state.kind === "access-denied") {
    return (
      <main className="page-shell narrow">
        <section className="panel">
          <h1>{state.title}</h1>
          <p className="lead">{state.message}</p>
          <p className="muted">Status dostepu: {state.reason}</p>
          <div className="actions">
            <Link className="button secondary" href="/dashboard/access">
              Szczegoly dostepu
            </Link>
          </div>
        </section>
      </main>
    )
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
