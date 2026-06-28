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

export function PublicEventSessionView({
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
  const inFlightParticipantRefresh = useRef<Promise<void> | null>(null)
  const inFlightMyRequests = useRef<Promise<PublicMyRequest[]> | null>(null)
  const state = getPublicEventPageState(detail)

  const loadMyRequests = useCallback(() => {
    if (inFlightMyRequests.current) {
      return inFlightMyRequests.current
    }

    const request = getMyRequestsByEventPublicId(eventPublicId)
      .then((response) => response.requests)
      .finally(() => {
        inFlightMyRequests.current = null
      })

    inFlightMyRequests.current = request
    return request
  }, [eventPublicId])

  const refresh = useCallback(async () => {
    if (inFlightRefresh.current) {
      return inFlightRefresh.current
    }

    setRefreshing(true)
    const request = Promise.all([
      getPublicEventDetail(eventPublicId),
      detail.publicQueue.visible ? getPublicQueue(eventPublicId).catch(() => null) : Promise.resolve(null),
      loadMyRequests()
    ])
      .then(([nextDetail, nextQueue, nextMyRequests]) => {
        setDetail(nextDetail)
        setQueue(nextQueue)
        setMyRequests(nextMyRequests)
        setRefreshError(null)
      })
      .catch(() => {
        setRefreshError("Nie udało się odświeżyć sesji wydarzenia.")
      })
      .finally(() => {
        setRefreshing(false)
        inFlightRefresh.current = null
      })

    inFlightRefresh.current = request
    return request
  }, [detail.publicQueue.visible, eventPublicId, loadMyRequests])

  const refreshParticipantState = useCallback(async () => {
    if (inFlightParticipantRefresh.current) {
      return inFlightParticipantRefresh.current
    }

    const request = Promise.all([
      getPublicEventDetail(eventPublicId),
      loadMyRequests()
    ])
      .then(([nextDetail, nextMyRequests]) => {
        setDetail(nextDetail)
        setMyRequests(nextMyRequests)
        setRefreshError(null)
      })
      .catch(() => {
        setRefreshError("Nie udało się odświeżyć sesji wydarzenia.")
      })
      .finally(() => {
        inFlightParticipantRefresh.current = null
      })

    inFlightParticipantRefresh.current = request
    return request
  }, [eventPublicId, loadMyRequests])

  useEffect(() => {
    void loadMyRequests()
      .then((nextMyRequests) => {
        setMyRequests(nextMyRequests)
      })
      .catch(() => {
        setRefreshError("Nie udało się odświeżyć zgłoszeń uczestnika.")
      })
  }, [loadMyRequests])

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="panel hero-copy">
          <p className="eyebrow">Sesja uczestnika · {state.venueLabel}</p>
          <h1>{state.title}</h1>
          <p className="lead">Dodaj piosenkę, śledź swoje zgłoszenia i obserwuj kolejkę wydarzenia na żywo.</p>
          <div className="actions">
            <Link className="button secondary" href={`/event/${eventPublicId}`}>
              Wróć do wydarzenia
            </Link>
            <button className="button secondary" disabled={refreshing} type="button" onClick={() => void refresh()}>
              {refreshing ? "Odświeżanie..." : "Odśwież"}
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
        <p className="eyebrow">Zgłoszenia</p>
        {detail.submissions.enabled ? (
          <>
            <h2>Zgłoś piosenkę</h2>
            <JoinForm eventPublicId={eventPublicId} requests={myRequests} />
          </>
        ) : detail.submissions.reason === "ACCESS_REQUIRED" ? (
          <>
            <h2>Wymagane zaproszenie</h2>
            <p>Zeskanuj QR w lokalu, aby dołączyć do sesji.</p>
          </>
        ) : (
          <>
            <h2>Zgłoszenia są zamknięte</h2>
            <p>{state.submissionsLabel}</p>
          </>
        )}
      </section>

      <section className="panel state-panel">
        <p className="eyebrow">Twoje zgłoszenia</p>
        <h2>Status zgłoszeń z tej przeglądarki</h2>
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
          <p className="empty">Brak zgłoszeń powiązanych z tą przeglądarką.</p>
        )}
      </section>

      <section id="queue">
        {detail.publicQueue.visible && queue ? (
          <PublicQueueView
            eventPublicId={eventPublicId}
            initialQueue={queue}
            onRealtimeRefresh={refreshParticipantState}
          />
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
