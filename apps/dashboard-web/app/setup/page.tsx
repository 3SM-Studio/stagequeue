import { cookies } from "next/headers"
import Link from "next/link"
import { GoogleSignInButton } from "../../components/GoogleSignInButton"
import { PlatformSetupClaimForm } from "../../components/PlatformSetupClaimForm"
import { getMe, getPlatformSetupStatus } from "../../lib/apiClient.ts"
import { getPlatformSetupViewState } from "../../lib/setupState.ts"

export const metadata = {
  title: "Platform setup"
}

export default async function PlatformSetupPage() {
  const cookieHeader = (await cookies()).toString()
  const [status, me] = await Promise.all([getPlatformSetupStatus(), getMe({ cookieHeader })])
  const state = getPlatformSetupViewState(status, me)

  return (
    <main className="page-shell narrow">
      <section className="panel">
        <h1>{state.title}</h1>
        <p className="lead">{state.message}</p>

        {state.kind === "completed" ? (
          <div className="actions">
            <Link className="button" href="/dashboard">
              Przejdz do dashboardu
            </Link>
          </div>
        ) : null}

        {state.kind === "unauthenticated" ? (
          <div className="actions">
            <GoogleSignInButton />
          </div>
        ) : null}

        {state.kind === "claim" ? (
          <>
            <p className="muted">Zalogowany user: {state.userEmail}</p>
            <PlatformSetupClaimForm />
          </>
        ) : null}
      </section>
    </main>
  )
}
