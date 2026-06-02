"use client"

import Link from "next/link"
import { useCallback, useEffect, useState, type ReactNode } from "react"
import {
  approveRequest,
  buildDashboardEventStreamUrl,
  buildGoogleSignInUrl,
  doneRequest,
  getOperatorQueue,
  type OperatorQueueItem,
  type OperatorQueueResponse,
  rejectRequest,
  skipRequest,
  startRequest,
  moveRequest
} from "../lib/apiClient"
import { getOperatorQueueErrorState, shouldRefetchOperatorQueue } from "../lib/operatorQueueState"

type StreamStatus = "connecting" | "connected" | "reconnecting" | "disconnected"

export function OperatorQueueView({ eventId }: { eventId: string }) {
  const [queue, setQueue] = useState<OperatorQueueResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [error, setError] = useState<ReturnType<typeof getOperatorQueueErrorState> | null>(null)
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("connecting")
  const streamEnabled =
    queue !== null && error?.kind !== "login" && error?.kind !== "forbidden" && error?.kind !== "not-found"

  const refresh = useCallback(async () => {
    try {
      setQueue(await getOperatorQueue(eventId))
      setError(null)
    } catch (queueError) {
      setError(getOperatorQueueErrorState(queueError))
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!streamEnabled) {
      setStreamStatus("disconnected")
      return
    }

    const source = new EventSource(buildDashboardEventStreamUrl(eventId), { withCredentials: true })
    setStreamStatus("connecting")

    source.addEventListener("open", () => setStreamStatus("connected"))
    source.addEventListener("error", () => setStreamStatus((status) => (status === "connected" ? "reconnecting" : "disconnected")))

    const onMessage = (event: MessageEvent) => {
      if (shouldRefetchOperatorQueue(event.type)) {
        void refresh()
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
      "event.closed"
    ]) {
      source.addEventListener(eventType, onMessage)
    }

    return () => {
      setStreamStatus("disconnected")
      source.close()
    }
  }, [eventId, refresh, streamEnabled])

  const runAction = async (label: string, action: () => Promise<unknown>) => {
    setBusyAction(label)
    try {
      await action()
      await refresh()
    } catch (actionError) {
      setError(getOperatorQueueErrorState(actionError))
    } finally {
      setBusyAction(null)
    }
  }

  if (loading && !queue) {
    return (
      <main className="page-shell">
        <section className="panel">
          <h1>Event queue</h1>
          <p className="lead">Ladowanie kolejki...</p>
        </section>
      </main>
    )
  }

  if (error?.kind === "login") {
    return (
      <main className="page-shell narrow">
        <section className="panel">
          <h1>{error.title}</h1>
          <p className="lead">{error.message}</p>
          <div className="actions">
            <Link className="button" href={buildGoogleSignInUrl()}>
              Zaloguj przez Google
            </Link>
          </div>
        </section>
      </main>
    )
  }

  if (!queue) {
    return (
      <main className="page-shell narrow">
        <section className="panel">
          <h1>{error?.title ?? "Event queue"}</h1>
          <p className="lead">{error?.message ?? "Nie udalo sie pobrac kolejki."}</p>
          <div className="actions">
            <button className="button secondary" type="button" onClick={() => void refresh()}>
              Odswiez
            </button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="page-shell">
      <section className="panel queue-dashboard-header">
        <div>
          <p className="muted">Event queue</p>
          <h1>{queue.event.name}</h1>
          <p className="muted">
            {queue.venue.name} / eventId: <code>{eventId}</code> / status: {queue.event.status}
          </p>
        </div>
        <div className="queue-header-actions">
          <span className={`stream-pill ${streamStatus}`}>{streamStatusLabel(streamStatus)}</span>
          <button className="button secondary" type="button" onClick={() => void refresh()}>
            Odswiez
          </button>
        </div>
      </section>

      {error ? (
        <section className={`notice ${error.kind}`}>
          <strong>{error.title}</strong>
          <span>{error.message}</span>
        </section>
      ) : null}

      <section className="operator-queue-grid">
        <QueueSection title="Now" empty="No current song">
          {queue.now ? (
            <RequestRow
              item={queue.now}
              meta="Aktualnie"
              actions={
                <>
                  <button
                    className="button compact"
                    disabled={busyAction !== null}
                    type="button"
                    onClick={() => void runAction("done", () => doneRequest(eventId, queue.now!.id))}
                  >
                    Done
                  </button>
                  <button
                    className="button secondary compact"
                    disabled={busyAction !== null}
                    type="button"
                    onClick={() => void runAction("skip", () => skipRequest(eventId, queue.now!.id))}
                  >
                    Skip
                  </button>
                </>
              }
            />
          ) : null}
        </QueueSection>

        <QueueSection title={`Pending (${queue.pending.length})`} empty="No pending requests">
          {queue.pending.map((item) => (
            <RequestRow
              item={item}
              key={item.id}
              meta={`Dodano: ${formatDate(item.createdAt)}`}
              actions={
                <>
                  <button
                    className="button compact"
                    disabled={busyAction !== null}
                    type="button"
                    onClick={() => void runAction("approve", () => approveRequest(eventId, item.id))}
                  >
                    Approve
                  </button>
                  <button
                    className="button secondary compact"
                    disabled={busyAction !== null}
                    type="button"
                    onClick={() => void runAction("reject", () => rejectRequest(eventId, item.id))}
                  >
                    Reject
                  </button>
                </>
              }
            />
          ))}
        </QueueSection>

        <QueueSection title={`Approved queue (${queue.approved.length})`} empty="No approved requests">
          {queue.approved.map((item) => (
            <RequestRow
              item={item}
              key={item.id}
              meta={`Pozycja ${item.position ?? "?"}`}
              actions={
                <>
                  <button
                    className="button compact"
                    disabled={busyAction !== null}
                    type="button"
                    onClick={() => void runAction("start", () => startRequest(eventId, item.id))}
                  >
                    Start
                  </button>
                  <button
                    className="button secondary compact"
                    disabled={busyAction !== null}
                    type="button"
                    onClick={() => void runAction("skip", () => skipRequest(eventId, item.id))}
                  >
                    Skip
                  </button>
                  <MoveToPositionForm
                    disabled={busyAction !== null}
                    currentPosition={item.position ?? 1}
                    onMove={(position) => runAction("move", () => moveRequest(eventId, item.id, position))}
                  />
                </>
              }
            />
          ))}
        </QueueSection>
      </section>

      <section className="operator-history-grid">
        <HistorySection items={queue.done} title="Done" />
        <HistorySection items={queue.rejected} title="Rejected" />
        <HistorySection items={queue.skipped} title="Skipped" />
      </section>
    </main>
  )
}

function QueueSection({ children, empty, title }: { children: ReactNode; empty: string; title: string }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children)
  return (
    <section className="panel queue-section">
      <h2>{title}</h2>
      <div className="queue-card-list">{hasChildren ? children : <p className="empty">{empty}</p>}</div>
    </section>
  )
}

function RequestRow({ actions, item, meta }: { actions: ReactNode; item: OperatorQueueItem; meta: string }) {
  return (
    <article className="queue-request-card">
      <div>
        <strong>{item.singerName}</strong>
        <p>
          {item.songArtist} - {item.songTitle}
        </p>
        <p className="muted">
          {item.sourceId}
          {item.sourceTrackId ? ` / ${item.sourceTrackId}` : ""} / {meta}
        </p>
        {item.note ? <p className="operator-note">{item.note}</p> : null}
        {item.songUrl ? (
          <a className="muted inline-link" href={item.songUrl} rel="noreferrer" target="_blank">
            Source URL
          </a>
        ) : null}
      </div>
      <div className="queue-row-actions">{actions}</div>
    </article>
  )
}

function MoveToPositionForm({
  currentPosition,
  disabled,
  onMove
}: {
  currentPosition: number
  disabled: boolean
  onMove: (position: number) => Promise<unknown>
}) {
  const [position, setPosition] = useState(String(currentPosition))

  return (
    <form
      className="move-form"
      onSubmit={(event) => {
        event.preventDefault()
        const parsed = Number.parseInt(position, 10)
        if (Number.isInteger(parsed)) {
          void onMove(parsed)
        }
      }}
    >
      <input
        aria-label="Move to position"
        min="1"
        type="number"
        value={position}
        onChange={(event) => setPosition(event.target.value)}
      />
      <button className="button secondary compact" disabled={disabled} type="submit">
        Move
      </button>
    </form>
  )
}

function HistorySection({ items, title }: { items: OperatorQueueItem[]; title: string }) {
  return (
    <section className="panel history-section">
      <h2>
        {title} ({items.length})
      </h2>
      {items.length > 0 ? (
        <ul className="history-list">
          {items.map((item) => (
            <li key={item.id}>
              <strong>{item.singerName}</strong>
              <span>
                {item.songArtist} - {item.songTitle}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">No entries</p>
      )}
    </section>
  )
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString("pl-PL")
}

function streamStatusLabel(status: StreamStatus): string {
  if (status === "connected") {
    return "connected"
  }
  if (status === "reconnecting") {
    return "reconnecting"
  }
  if (status === "disconnected") {
    return "disconnected"
  }
  return "connecting"
}
