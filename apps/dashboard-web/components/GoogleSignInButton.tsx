"use client"

import { useState } from "react"
import { signInWithGoogle } from "../lib/authClient"

export function GoogleSignInButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="sign-in-box">
      <button
        className="button"
        disabled={loading}
        type="button"
        onClick={async () => {
          setLoading(true)
          setError(null)
          try {
            await signInWithGoogle()
          } catch (signInError) {
            setError(signInError instanceof Error ? signInError.message : "Nie udalo sie rozpoczac logowania przez Google.")
          } finally {
            setLoading(false)
          }
        }}
      >
        {loading ? "Przekierowanie..." : "Zaloguj przez Google"}
      </button>
      {error ? <p className="form-errors">{error}</p> : null}
    </div>
  )
}
