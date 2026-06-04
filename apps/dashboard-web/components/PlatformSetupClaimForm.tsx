"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { claimPlatformOwner, DashboardApiError } from "../lib/apiClient"

export function PlatformSetupClaimForm() {
  const router = useRouter()
  const [setupToken, setSetupToken] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      className="inline-form"
      onSubmit={async (event) => {
        event.preventDefault()
        setLoading(true)
        setError(null)

        try {
          await claimPlatformOwner(setupToken)
          router.push("/dashboard")
          router.refresh()
        } catch (claimError) {
          setError(getClaimErrorMessage(claimError))
        } finally {
          setLoading(false)
        }
      }}
    >
      <label htmlFor="setup-token">Platform setup token</label>
      <div className="inline-form-row">
        <input
          autoComplete="off"
          id="setup-token"
          name="setupToken"
          onChange={(event) => setSetupToken(event.target.value)}
          placeholder="Wpisz token setupu"
          type="password"
          value={setupToken}
        />
        <button className="button" disabled={loading || !setupToken.trim()} type="submit">
          {loading ? "Sprawdzanie..." : "Nadaj ownera"}
        </button>
      </div>
      {error ? <p className="form-errors">{error}</p> : null}
    </form>
  )
}

function getClaimErrorMessage(error: unknown): string {
  if (error instanceof DashboardApiError) {
    if (error.status === 401) {
      return "Zaloguj sie przez Google przed wykonaniem setupu."
    }
    if (error.status === 403) {
      return "Token setupu jest niepoprawny albo setup jest wylaczony."
    }
    if (error.status === 409) {
      return "Setup platformy zostal juz zakonczony."
    }

    return error.message
  }

  return error instanceof Error ? error.message : "Nie udalo sie wykonac setupu platformy."
}
