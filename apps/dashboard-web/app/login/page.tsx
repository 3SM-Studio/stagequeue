import Link from "next/link"
import { GoogleSignInButton } from "../../components/GoogleSignInButton"

export const metadata = {
  title: "Logowanie"
}

export default function LoginPage() {
  return (
    <main className="page-shell narrow">
      <section className="panel">
        <h1>Zaloguj sie</h1>
        <p className="lead">Dashboard uzywa Better Auth w API. Google OAuth potwierdza tozsamosc, a API decyduje o dostepie.</p>
        <div className="actions">
          <GoogleSignInButton />
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
