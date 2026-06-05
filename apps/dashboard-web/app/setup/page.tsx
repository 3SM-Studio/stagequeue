import { cookies } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"
import { GoogleSignInButton } from "../../components/GoogleSignInButton"
import { PlatformSetupClaimForm } from "../../components/PlatformSetupClaimForm"
import { getMe, getPlatformSetupStatus } from "../../lib/apiClient.ts"
import { getPlatformSetupRedirect, getPlatformSetupUnavailableState, getPlatformSetupViewState } from "../../lib/setupState.ts"

export const metadata = {
  title: "Platform setup"
}

type PlatformSetupPageData = [Awaited<ReturnType<typeof getPlatformSetupStatus>>, Awaited<ReturnType<typeof getMe>>]

export default async function PlatformSetupPage() {
  const cookieHeader = (await cookies()).toString()
  let pageData: PlatformSetupPageData

  try {
    pageData = await Promise.all([getPlatformSetupStatus(), getMe({ cookieHeader })])
  } catch {
    const state = getPlatformSetupUnavailableState()
    return (
      <main className="page-shell narrow">
        <section className="panel">
          <h1>{state.title}</h1>
          <p className="lead">{state.message}</p>
        </section>
      </main>
    )
  }

  const [status, me] = pageData
  const redirectTarget = getPlatformSetupRedirect(status, me)
  if (redirectTarget) {
    redirect(redirectTarget)
  }

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
            <Link className="button secondary" href="/sign-in">
              Przejdz do logowania
            </Link>
          </div>
        ) : null}

        {state.kind === "unauthenticated" ? (
          <div className="actions">
            <GoogleSignInButton callbackPath="/setup" />
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
