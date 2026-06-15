"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  getMyRequestsByEventPublicId,
  getMyRequestsByVenueSlug,
  submitSongRequest,
  submitSongRequestByVenueSlug,
  type PublicMyRequest
} from "../lib/apiClient"
import {
  getMyRequestStatusMessage,
  getTrackedRequest,
  PUBLIC_MY_REQUESTS_REFRESH_ERROR_MESSAGE,
  PUBLIC_MY_REQUESTS_REFRESH_INTERVAL_MS,
  shouldPollMyRequests
} from "../lib/myRequestsState"
import { validateSubmitSongRequest } from "../lib/submitValidation"

type JoinFormProps =
  | {
      eventPublicId: string
      venueSlug?: never
    }
  | {
      eventPublicId?: never
      venueSlug: string
    }

export function JoinForm(props: JoinFormProps) {
  const scopeKind = props.eventPublicId !== undefined ? "event" : "venue"
  const eventPublicId = props.eventPublicId ?? ""
  const venueSlug = props.venueSlug ?? ""
  const [errors, setErrors] = useState<string[]>([])
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle")
  const [submittedSong, setSubmittedSong] = useState<string | null>(null)
  const [trackedRequestId, setTrackedRequestId] = useState<string | null>(null)
  const [trackedRequest, setTrackedRequest] = useState<PublicMyRequest | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [refreshingStatus, setRefreshingStatus] = useState(false)
  const inFlightRefresh = useRef<Promise<void> | null>(null)

  const refreshMyRequest = useCallback(async () => {
    if (!trackedRequestId) {
      return
    }

    if (inFlightRefresh.current) {
      return inFlightRefresh.current
    }

    setRefreshingStatus(true)
    const request = (scopeKind === "event" ? getMyRequestsByEventPublicId(eventPublicId) : getMyRequestsByVenueSlug(venueSlug))
      .then((response) => {
        setTrackedRequest((current) => getTrackedRequest(response.requests, trackedRequestId) ?? current)
        setRefreshError(null)
      })
      .catch(() => {
        setRefreshError(PUBLIC_MY_REQUESTS_REFRESH_ERROR_MESSAGE)
      })
      .finally(() => {
        setRefreshingStatus(false)
        inFlightRefresh.current = null
      })

    inFlightRefresh.current = request
    return request
  }, [eventPublicId, scopeKind, trackedRequestId, venueSlug])

  useEffect(() => {
    const onFocus = () => {
      if (shouldPollMyRequests(trackedRequest, document.visibilityState)) {
        void refreshMyRequest()
      }
    }
    const onVisibilityChange = () => {
      if (shouldPollMyRequests(trackedRequest, document.visibilityState)) {
        void refreshMyRequest()
      }
    }
    const interval = window.setInterval(() => {
      if (shouldPollMyRequests(trackedRequest, document.visibilityState)) {
        void refreshMyRequest()
      }
    }, PUBLIC_MY_REQUESTS_REFRESH_INTERVAL_MS)

    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisibilityChange)
      window.clearInterval(interval)
    }
  }, [refreshMyRequest, trackedRequest])

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
      const result =
        scopeKind === "event"
          ? await submitSongRequest(eventPublicId, validation.value)
          : await submitSongRequestByVenueSlug(venueSlug, validation.value)
      setSubmittedSong(`${result.request.songArtist} - ${result.request.songTitle}`)
      setTrackedRequestId(result.request.id)
      setTrackedRequest({
        id: result.request.id,
        status: "pending",
        singerName: result.request.singerName,
        artist: result.request.songArtist,
        title: result.request.songTitle,
        position: null,
        createdAt: new Date().toISOString()
      })
      setRefreshError(null)
      setStatus("success")
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "Nie udalo sie wyslac zgloszenia."])
      setStatus("idle")
    }
  }

  if (status === "success") {
    const requestStatus = trackedRequest?.status ?? "pending"
    return (
      <section className="panel state-panel success-panel">
        <p className="eyebrow">Zgloszenie wyslane</p>
        <h1>{getMyRequestStatusMessage(requestStatus)}</h1>
        {submittedSong ? <p>{submittedSong}</p> : null}
        {trackedRequest?.position ? <p>Pozycja w kolejce: {trackedRequest.position}</p> : null}
        {refreshError ? <p className="muted">{refreshError}</p> : null}
        <button className="button secondary" disabled={refreshingStatus} type="button" onClick={() => void refreshMyRequest()}>
          {refreshingStatus ? "Odswiezanie statusu..." : "Odswiez status"}
        </button>
      </section>
    )
  }

  return (
    <form className="panel join-form" action={onSubmit}>
      <div className="form-grid">
        <label>
          <span>Imie</span>
          <input name="singerName" autoComplete="name" maxLength={80} required />
        </label>
        <label>
          <span>Zrodlo</span>
          <select name="sourceId" defaultValue="ising" required>
            <option value="ising">iSing</option>
            <option value="karafun">KaraFun</option>
          </select>
        </label>
        <label>
          <span>Tytul piosenki</span>
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
          <span>Notatka dla prowadzacego</span>
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
        {status === "submitting" ? "Wysylanie..." : "Wyslij zgloszenie"}
      </button>
    </form>
  )
}
