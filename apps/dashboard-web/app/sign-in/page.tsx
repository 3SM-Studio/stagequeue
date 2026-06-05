import { cookies } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"
import { GoogleSignInButton } from "../../components/GoogleSignInButton"
import { getDashboardGateRedirect, readDashboardGate } from "../../lib/dashboardGate.ts"

export const metadata = {
  title: "Logowanie"
}

export default async function SignInPage() {
  const cookieHeader = (await cookies()).toString()
  const gate = await readDashboardGate({ cookieHeader })
  const redirectTarget = getDashboardGateRedirect(gate, "/sign-in")

  if (redirectTarget) {
    redirect(redirectTarget)
  }

  if (gate.kind === "allowed") {
    redirect("/dashboard")
  }

  if (gate.kind === "access_denied") {
    redirect("/dashboard/access")
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

  return (
    <main className="page-shell narrow">
      <section className="panel">
        <h1>Zaloguj sie</h1>
        <p className="lead">Dashboard uzywa Better Auth w API. Google OAuth potwierdza tozsamosc, a API decyduje o dostepie.</p>
        <div className="actions">
          <GoogleSignInButton callbackPath="/dashboard" />
          <Link className="button secondary" href="/dashboard">
            Wroc do dashboardu
          </Link>
          <Link className="button secondary" href="/setup">
            Pierwszy setup platformy
          </Link>
        </div>
      </section>
    </main>
  )
}
