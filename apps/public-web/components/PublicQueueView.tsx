"use client"

import { useCallback, useEffect, useState } from "react"
import { buildPublicEventStreamUrl, getPublicQueue, type PublicQueue } from "../lib/apiClient"
import { createPublicQueueStream, type PublicQueueStreamStatus } from "../lib/publicQueueStream"
import { createRefetchScheduler } from "../lib/refetchScheduler"

export function PublicQueueView({
  eventPublicId,
  initialQueue,
  onRealtimeRefresh
}: {
  eventPublicId: string
  initialQueue: PublicQueue
  onRealtimeRefresh?: () => void
}) {
  const [queue, setQueue] = useState(initialQueue)
  const [status, setStatus] = useState<PublicQueueStreamStatus>("connecting")
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setQueue(await getPublicQueue(eventPublicId))
      setError(null)
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Nie udało się odświeżyć kolejki.")
    }
  }, [eventPublicId])

  useEffect(() => {
    setQueue(initialQueue)
  }, [initialQueue])

  useEffect(() => {
    let mounted = true
    const scheduler = createRefetchScheduler(refresh)
    const stream = createPublicQueueStream({
      eventSourceFactory: (url, init) => new EventSource(url, init),
      ...(onRealtimeRefresh
        ? {
            onEvent: onRealtimeRefresh,
            onOpen: onRealtimeRefresh
          }
        : {}),
      onRefetch: scheduler.schedule,
      onStatusChange: (nextStatus) => {
        if (mounted) {
          setStatus(nextStatus)
        }
      },
      streamUrl: buildPublicEventStreamUrl(eventPublicId)
    })

    return () => {
      mounted = false
      scheduler.cancel()
      stream.close()
    }
  }, [eventPublicId, onRealtimeRefresh, refresh])

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void refresh()
      }
    }

    window.addEventListener("focus", refreshWhenVisible)
    document.addEventListener("visibilitychange", refreshWhenVisible)
    return () => {
      window.removeEventListener("focus", refreshWhenVisible)
      document.removeEventListener("visibilitychange", refreshWhenVisible)
    }
  }, [refresh])

  return (
    <section className="queue-layout">
      <div className="panel now-panel">
        <div className="queue-header">
          <div>
            <p className="eyebrow">Teraz</p>
            <h2>{queue.now ? queue.now.singerName : "Nikt aktualnie nie śpiewa"}</h2>
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

function statusLabel(status: PublicQueueStreamStatus): string {
  if (status === "connected") {
    return "Live"
  }
  if (status === "reconnecting") {
    return "Ponowne łączenie"
  }
  return "Łączenie"
}
