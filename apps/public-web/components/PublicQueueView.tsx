"use client"

import { useCallback, useEffect, useState } from "react"
import {
  buildPublicEventStreamUrl,
  buildPublicVenueStreamUrl,
  getPublicQueue,
  getPublicQueueByVenueSlug,
  type PublicQueue
} from "../lib/apiClient"
import { shouldRefetchQueue } from "../lib/queueRefresh"
import { createRefetchScheduler } from "../lib/refetchScheduler"

type PublicQueueViewProps =
  | {
      eventPublicId: string
      initialQueue: PublicQueue
      venueSlug?: never
    }
  | {
      eventPublicId?: never
      initialQueue: PublicQueue
      venueSlug: string
    }

export function PublicQueueView(props: PublicQueueViewProps) {
  const { initialQueue } = props
  const scopeKind = props.eventPublicId !== undefined ? "event" : "venue"
  const eventPublicId = props.eventPublicId ?? ""
  const venueSlug = props.venueSlug ?? ""
  const [queue, setQueue] = useState(initialQueue)
  const [status, setStatus] = useState<"connected" | "connecting" | "stale">("connecting")
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setQueue(scopeKind === "event" ? await getPublicQueue(eventPublicId) : await getPublicQueueByVenueSlug(venueSlug))
      setError(null)
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Nie udało się odświeżyć kolejki.")
      setStatus("stale")
    }
  }, [eventPublicId, scopeKind, venueSlug])

  useEffect(() => {
    const scheduler = createRefetchScheduler(refresh)
    const source = new EventSource(
      scopeKind === "event" ? buildPublicEventStreamUrl(eventPublicId) : buildPublicVenueStreamUrl(venueSlug),
      { withCredentials: true }
    )
    source.addEventListener("open", () => setStatus("connected"))
    source.addEventListener("error", () => setStatus("stale"))

    const onMessage = (event: MessageEvent) => {
      if (shouldRefetchQueue(event.type)) {
        scheduler.schedule()
      }
    }

    for (const eventType of [
      "queue.updated",
      "request.created",
      "request.approved",
      "request.rejected",
      "request.started",
      "request.done",
      "request.skipped",
      "request.moved",
      "event.started",
      "event.paused",
      "event.resumed",
      "event.closed",
      "event.archived",
      "event.cancelled"
    ]) {
      source.addEventListener(eventType, onMessage)
    }

    return () => {
      scheduler.cancel()
      source.close()
    }
  }, [eventPublicId, scopeKind, refresh, venueSlug])

  return (
    <section className="queue-layout">
      <div className="panel now-panel">
        <div className="queue-header">
          <div>
            <p className="eyebrow">Teraz</p>
            <h1>{queue.now ? queue.now.singerName : "Nikt aktualnie nie śpiewa"}</h1>
          </div>
          <span className={`stream-pill ${status}`}>{statusLabel(status)}</span>
        </div>
        {queue.now ? (
          <p className="song-line">
            {queue.now.songArtist} - {queue.now.songTitle}
          </p>
        ) : (
          <p className="muted">Prowadzący wkrótce rozpocznie kolejny utwór.</p>
        )}
      </div>

      <div className="panel">
        <div className="queue-header">
          <div>
            <p className="eyebrow">Kolejka</p>
            <h2>Następne zgłoszenia</h2>
          </div>
          <button className="button secondary compact" type="button" onClick={() => void refresh()}>
            Odśwież
          </button>
        </div>

        {error ? <p className="form-errors">{error}</p> : null}

        {queue.submissions.enabled ? (
          <p className="muted">Zgłoszenia są otwarte.</p>
        ) : (
          <p className="muted">Zgłoszenia są teraz wstrzymane.</p>
        )}

        {queue.queue.length > 0 ? (
          <ol className="queue-list">
            {queue.queue.map((item) => (
              <li key={item.id}>
                <span className="position">{item.position ?? "?"}</span>
                <span>
                  <strong>{item.singerName}</strong>
                  <small>
                    {item.songArtist} - {item.songTitle}
                  </small>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty">Brak zatwierdzonych zgłoszeń w kolejce.</p>
        )}
      </div>
    </section>
  )
}

function statusLabel(status: "connected" | "connecting" | "stale"): string {
  if (status === "connected") {
    return "Live"
  }
  if (status === "stale") {
    return "Łączenie"
  }
  return "Start"
}
