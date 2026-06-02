import Link from "next/link"
import { buildGoogleSignInUrl } from "../../lib/apiClient.ts"

export const metadata = {
  title: "Logowanie"
}

export default function LoginPage() {
  const signInUrl = buildGoogleSignInUrl()

  return (
    <main className="page-shell narrow">
      <section className="panel">
        <h1>Zaloguj sie</h1>
        <p className="lead">Dashboard uzywa Better Auth w API. Google OAuth potwierdza tozsamosc, a API decyduje o dostepie.</p>
        <div className="actions">
          <Link className="button" href={signInUrl}>
            Zaloguj przez Google
          </Link>
          <Link className="button secondary" href="/dashboard">
            Wroc do dashboardu
          </Link>
        </div>
      </section>
    </main>
  )
}
