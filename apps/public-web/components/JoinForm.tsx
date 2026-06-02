"use client"

import { useState } from "react"
import { submitSongRequestByVenueSlug } from "../lib/apiClient"
import { validateSubmitSongRequest } from "../lib/submitValidation"

export function JoinForm({ venueSlug }: { venueSlug: string }) {
  const [errors, setErrors] = useState<string[]>([])
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle")
  const [submittedSong, setSubmittedSong] = useState<string | null>(null)

  async function onSubmit(formData: FormData) {
    setErrors([])
    const validation = validateSubmitSongRequest({
      singerName: String(formData.get("singerName") ?? ""),
      sourceId: String(formData.get("sourceId") ?? ""),
      sourceTrackId: String(formData.get("sourceTrackId") ?? ""),
      songTitle: String(formData.get("songTitle") ?? ""),
      songArtist: String(formData.get("songArtist") ?? ""),
      songUrl: String(formData.get("songUrl") ?? ""),
      note: String(formData.get("note") ?? "")
    })

    if (!validation.ok) {
      setErrors(validation.errors)
      return
    }

    setStatus("submitting")
    try {
      const result = await submitSongRequestByVenueSlug(venueSlug, validation.value)
      setSubmittedSong(`${result.request.songArtist} - ${result.request.songTitle}`)
      setStatus("success")
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "Nie udało się wysłać zgłoszenia."])
      setStatus("idle")
    }
  }

  if (status === "success") {
    return (
      <section className="panel state-panel success-panel">
        <p className="eyebrow">Zgłoszenie wysłane</p>
        <h1>Poczekaj na zatwierdzenie prowadzącego.</h1>
        {submittedSong ? <p>{submittedSong}</p> : null}
      </section>
    )
  }

  return (
    <form className="panel join-form" action={onSubmit}>
      <div className="form-grid">
        <label>
          <span>Imię</span>
          <input name="singerName" autoComplete="name" maxLength={80} required />
        </label>
        <label>
          <span>Źródło</span>
          <select name="sourceId" defaultValue="ising" required>
            <option value="ising">iSing</option>
            <option value="karafun">KaraFun</option>
          </select>
        </label>
        <label>
          <span>Tytuł piosenki</span>
          <input name="songTitle" maxLength={200} required />
        </label>
        <label>
          <span>Wykonawca</span>
          <input name="songArtist" maxLength={200} required />
        </label>
        <label>
          <span>ID utworu</span>
          <input name="sourceTrackId" maxLength={120} />
        </label>
        <label>
          <span>Link</span>
          <input name="songUrl" type="url" maxLength={1000} />
        </label>
        <label className="full">
          <span>Notatka dla prowadzącego</span>
          <textarea name="note" maxLength={500} rows={4} />
        </label>
      </div>

      {errors.length > 0 ? (
        <div className="form-errors" role="alert">
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : null}

      <button className="button primary" type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Wysyłanie..." : "Wyślij zgłoszenie"}
      </button>
    </form>
  )
}
