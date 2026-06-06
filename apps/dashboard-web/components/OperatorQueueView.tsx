"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import {
  approveRequest,
  archiveDashboardEvent,
  cancelDashboardEvent,
  closeDashboardEvent,
  doneRequest,
  buildDashboardEventStreamUrl,
  getDashboardEvent,
  getOperatorQueue,
  moveRequest,
  pauseDashboardEvent,
  type DashboardEventDetail,
  type OperatorQueueItem,
  type OperatorQueueResponse,
  rejectRequest,
  resumeDashboardEvent,
  skipRequest,
  startDashboardEvent,
  startRequest,
  updateDashboardEventFlags
} from "../lib/apiClient"
import {
  getDashboardLifecycleErrorState,
  getEventStatusDescription,
  getLifecycleActionModels,
  getPublicJoinLabel,
  getPublicQueueLabel,
  isPublicQueueVisibleForDashboard,
  isPublicSubmitAvailable,
  type DashboardLifecycleAction
} from "../lib/eventLifecycleState"
import {
  getOperatorQueueStreamErrorState,
  getOperatorQueueErrorState,
  type OperatorQueueStreamStatus,
  OPERATOR_QUEUE_REFRESH_ERROR_MESSAGE,
  OPERATOR_QUEUE_REFRESH_INTERVAL_MS,
  runOperatorActionWithPending,
  shouldPollOperatorQueue
} from "../lib/operatorQueueState"
import { createOperatorQueueStream } from "../lib/operatorQueueStream"
import { createRefetchScheduler } from "../lib/refetchScheduler"
import { GoogleSignInButton } from "./GoogleSignInButton"

export function OperatorQueueView({ eventId }: { eventId: string }) {
  const [queue, setQueue] = useState<OperatorQueueResponse | null>(null)
  const [eventDetail, setEventDetail] = useState<DashboardEventDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [error, setError] = useState<ReturnType<typeof getOperatorQueueErrorState> | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [streamStatus, setStreamStatus] = useState<OperatorQueueStreamStatus>("connecting")
  const inFlightRefresh = useRef<Promise<void> | null>(null)
  const busyActionRef = useRef<string | null>(null)
  const queueRef = useRef<OperatorQueueResponse | null>(null)

  useEffect(() => {
    busyActionRef.current = busyAction
  }, [busyAction])

  useEffect(() => {
    queueRef.current = queue
  }, [queue])

  const refresh = useCallback(async (options: { skipWhenBusy?: boolean } = {}) => {
    if (options.skipWhenBusy && busyActionRef.current !== null) {
      return
    }

    if (inFlightRefresh.current) {
      return inFlightRefresh.current
    }

    setRefreshing(true)
    const request = Promise.all([getOperatorQueue(eventId), getDashboardEvent(eventId)])
      .then(([nextQueue, nextEvent]) => {
        setQueue(nextQueue)
        setEventDetail(nextEvent.event)
        setError(null)
        setRefreshError(null)
      })
      .catch((queueError) => {
        if (queueRef.current) {
          setRefreshError(OPERATOR_QUEUE_REFRESH_ERROR_MESSAGE)
        } else {
          setError(getOperatorQueueErrorState(queueError))
        }
      })
      .finally(() => {
        setLoading(false)
        setRefreshing(false)
        inFlightRefresh.current = null
      })

    inFlightRefresh.current = request
    return request
  }, [eventId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (typeof EventSource === "undefined") {
      setStreamStatus("disconnected")
      return
    }

    let mounted = true
    const setMountedStreamStatus = (status: OperatorQueueStreamStatus) => {
      if (mounted) {
        setStreamStatus(status)
      }
    }
    const scheduler = createRefetchScheduler(() => refresh({ skipWhenBusy: true }))
    const stream = createOperatorQueueStream({
      eventSourceFactory: (url, init) => new EventSource(url, init),
      onRefetch: scheduler.schedule,
      onStatusChange: setMountedStreamStatus,
      streamUrl: buildDashboardEventStreamUrl(eventId)
    })

    return () => {
      mounted = false
      scheduler.cancel()
      stream.close()
    }
  }, [eventId, refresh])

  useEffect(() => {
    const onFocus = () => {
      if (shouldPollOperatorQueue(document.visibilityState, busyActionRef.current)) {
        void refresh({ skipWhenBusy: true })
      }
    }
    const onVisibilityChange = () => {
      if (shouldPollOperatorQueue(document.visibilityState, busyActionRef.current)) {
        void refresh({ skipWhenBusy: true })
      }
    }
    const interval = window.setInterval(() => {
      if (shouldPollOperatorQueue(document.visibilityState, busyActionRef.current)) {
        void refresh({ skipWhenBusy: true })
      }
    }, OPERATOR_QUEUE_REFRESH_INTERVAL_MS)

    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisibilityChange)
      window.clearInterval(interval)
    }
  }, [refresh])

  const runAction = async (
    label: string,
    action: () => Promise<unknown>,
    mapError: (error: unknown) => ReturnType<typeof getOperatorQueueErrorState> = getOperatorQueueErrorState
  ) => {
    await runOperatorActionWithPending({
      handleError: (actionError) => setError(mapError(actionError)),
      label,
      mutate: action,
      refresh,
      setPendingAction: setBusyAction
    })
  }

  const runLifecycleAction = (action: DashboardLifecycleAction) =>
    runAction(
      action,
      async () => {
        await lifecycleAction(eventId, action)
      },
      getDashboardLifecycleErrorState
    )

  const runFlagAction = (flags: { publicJoinEnabled?: boolean; publicQueueEnabled?: boolean }) =>
    runAction(
      "flags",
      async () => {
        await updateDashboardEventFlags(eventId, flags)
      },
      getDashboardLifecycleErrorState
    )

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
            <GoogleSignInButton callbackPath={`/dashboard/events/${eventId}/queue`} />
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
          <span className={`stream-pill ${streamStatus === "connected" ? "connected" : "disconnected"}`}>
            {streamStatus === "connected" ? "live" : streamStatus === "connecting" ? "connecting" : "live disconnected"}
          </span>
          <button className="button secondary" disabled={refreshing || busyAction !== null} type="button" onClick={() => void refresh()}>
            {refreshing ? "Odswiezanie..." : "Odswiez kolejke"}
          </button>
        </div>
      </section>

      {eventDetail ? (
        <EventLifecyclePanel
          busyAction={busyAction}
          event={eventDetail}
          venueName={queue.venue.name}
          onFlagAction={runFlagAction}
          onLifecycleAction={runLifecycleAction}
        />
      ) : null}

      {error ? (
        <section className={`notice ${error.kind}`}>
          <strong>{error.title}</strong>
          <span>{error.message}</span>
        </section>
      ) : null}

      {refreshError ? (
        <section className="notice warning">
          <span>{refreshError}</span>
        </section>
      ) : null}

      {streamStatus === "disconnected" ? (
        <section className="notice warning">
          <span>{getOperatorQueueStreamErrorState().message}</span>
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

async function lifecycleAction(eventId: string, action: DashboardLifecycleAction): Promise<unknown> {
  if (action === "start") {
    return startDashboardEvent(eventId)
  }
  if (action === "pause") {
    return pauseDashboardEvent(eventId)
  }
  if (action === "resume") {
    return resumeDashboardEvent(eventId)
  }
  if (action === "close") {
    return closeDashboardEvent(eventId)
  }
  if (action === "archive") {
    return archiveDashboardEvent(eventId)
  }
  return cancelDashboardEvent(eventId)
}

function EventLifecyclePanel({
  busyAction,
  event,
  onFlagAction,
  onLifecycleAction,
  venueName
}: {
  busyAction: string | null
  event: DashboardEventDetail
  onFlagAction: (flags: { publicJoinEnabled?: boolean; publicQueueEnabled?: boolean }) => Promise<unknown>
  onLifecycleAction: (action: DashboardLifecycleAction) => Promise<unknown>
  venueName: string
}) {
  const actions = getLifecycleActionModels(event.status)
  const submitAvailable = isPublicSubmitAvailable(event)
  const queueVisible = isPublicQueueVisibleForDashboard(event)

  return (
    <section className="panel event-control-panel">
      <div className="event-control-main">
        <div>
          <p className="muted">Wydarzenie</p>
          <h2>{event.name}</h2>
          <p className="muted">{venueName}</p>
          <p>{getEventStatusDescription(event.status)}</p>
        </div>
        <div className="event-control-status">
          <span className={`status-badge status-${event.status}`}>{event.status}</span>
          <span className={`pill ${submitAvailable ? "pill-ok" : ""}`}>
            Public join: {event.publicJoinEnabled ? "on" : "off"}
          </span>
          <span className={`pill ${queueVisible ? "pill-ok" : ""}`}>
            Public queue: {event.publicQueueEnabled ? "on" : "off"}
          </span>
        </div>
      </div>

      <div className="event-control-actions">
        {actions.length > 0 ? (
          actions.map((model) => (
            <button
              className={`button compact ${model.tone === "secondary" ? "secondary" : ""} ${model.tone === "danger" ? "danger" : ""}`}
              disabled={busyAction !== null}
              key={model.action}
              type="button"
              onClick={() => void onLifecycleAction(model.action)}
            >
              {model.label}
            </button>
          ))
        ) : (
          <span className="empty">Brak akcji lifecycle dla tego statusu.</span>
        )}
      </div>

      <div className="event-control-actions">
        <button
          className="button secondary compact"
          disabled={busyAction !== null}
          type="button"
          onClick={() => void onFlagAction({ publicJoinEnabled: !event.publicJoinEnabled })}
        >
          {getPublicJoinLabel(event.publicJoinEnabled)}
        </button>
        <button
          className="button secondary compact"
          disabled={busyAction !== null}
          type="button"
          onClick={() => void onFlagAction({ publicQueueEnabled: !event.publicQueueEnabled })}
        >
          {getPublicQueueLabel(event.publicQueueEnabled)}
        </button>
      </div>
    </section>
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
