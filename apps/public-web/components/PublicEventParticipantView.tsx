"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  getMyRequestsByEventPublicId,
  getPublicEventDetail,
  getPublicQueue,
  type PublicEventDetail,
  type PublicMyRequest,
  type PublicQueue
} from "../lib/apiClient"
import { getMyRequestStatusMessage } from "../lib/myRequestsState"
import { getPublicEventPageState } from "../lib/publicEventPageState"
import { JoinForm } from "./JoinForm"
import { PublicQueueView } from "./PublicQueueView"

export function PublicEventParticipantView({
  eventPublicId,
  initialDetail,
  initialQueue
}: {
  eventPublicId: string
  initialDetail: PublicEventDetail
  initialQueue: PublicQueue | null
}) {
  const [detail, setDetail] = useState(initialDetail)
  const [queue, setQueue] = useState(initialQueue)
  const [myRequests, setMyRequests] = useState<PublicMyRequest[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const inFlightRefresh = useRef<Promise<void> | null>(null)
  const state = getPublicEventPageState(detail)

  const refresh = useCallback(async () => {
    if (inFlightRefresh.current) {
      return inFlightRefresh.current
    }

    setRefreshing(true)
    const request = Promise.all([
      getPublicEventDetail(eventPublicId),
      detail.publicQueue.visible ? getPublicQueue(eventPublicId).catch(() => null) : Promise.resolve(null),
      getMyRequestsByEventPublicId(eventPublicId)
    ])
      .then(([nextDetail, nextQueue, nextMyRequests]) => {
        setDetail(nextDetail)
        setQueue(nextQueue)
        setMyRequests(nextMyRequests.requests)
        setRefreshError(null)
      })
      .catch(() => {
        setRefreshError("Nie udalo sie odswiezyc strony wydarzenia.")
      })
      .finally(() => {
        setRefreshing(false)
        inFlightRefresh.current = null
      })

    inFlightRefresh.current = request
    return request
  }, [detail.publicQueue.visible, eventPublicId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="panel hero-copy">
          <p className="eyebrow">{state.venueLabel}</p>
          <h1>{state.title}</h1>
          <p className="lead">Sprawdz status wydarzenia karaoke, dostepnosc zgloszen i publiczna kolejke.</p>
          <div className="actions">
            {state.showQueueLink ? (
              <Link className="button primary" href={`/event/${eventPublicId}/queue`}>
                Kolejka wydarzenia
              </Link>
            ) : null}
            <button className="button secondary" disabled={refreshing} type="button" onClick={() => void refresh()}>
              {refreshing ? "Odswiezanie..." : "Odswiez"}
            </button>
          </div>
          {refreshError ? <p className="form-errors">{refreshError}</p> : null}
        </div>
        <div className="panel venue-facts">
          <div className="fact">
            <span>Status</span>
            <strong>{state.statusLabel}</strong>
          </div>
          <div className="fact">
            <span>Zgloszenia</span>
            <strong>{state.submissionsLabel}</strong>
          </div>
          <div className="fact">
            <span>Kolejka publiczna</span>
            <strong>{state.queueLabel}</strong>
          </div>
          <div className="fact">
            <span>Organizator</span>
            <strong>{detail.operatedByOrganization.name}</strong>
          </div>
        </div>
      </section>

      <section className="state-panel">
        <p className="eyebrow">Zgloszenia</p>
        {detail.submissions.enabled ? (
          <>
            <h2>Zglos piosenke</h2>
            <JoinForm eventPublicId={eventPublicId} />
          </>
        ) : detail.submissions.reason === "ACCESS_REQUIRED" ? (
          <>
            <h2>Wymagane zaproszenie</h2>
            <p>{state.submissionsLabel}</p>
          </>
        ) : (
          <>
            <h2>Zgloszenia sa zamkniete</h2>
            <p>{state.submissionsLabel}</p>
          </>
        )}
      </section>

      <section className="panel state-panel">
        <p className="eyebrow">Twoje zgloszenia</p>
        <h2>Status zgloszen z tej przegladarki</h2>
        {myRequests.length > 0 ? (
          <ul className="queue-list">
            {myRequests.map((request) => (
              <li key={request.id}>
                <span>
                  <strong>{request.title}</strong>
                  <small>
                    {request.artist} - {getMyRequestStatusMessage(request.status)}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">Brak zgloszen powiazanych z ta przegladarka.</p>
        )}
      </section>

      <section id="queue">
        {detail.publicQueue.visible && queue ? (
          <PublicQueueView eventPublicId={eventPublicId} initialQueue={queue} />
        ) : (
          <div className="panel state-panel">
            <p className="eyebrow">Kolejka</p>
            <h2>{state.queueLabel}</h2>
            <p className="muted">Kolejka nie jest teraz publicznie widoczna.</p>
          </div>
        )}
      </section>
    </main>
  )
}
