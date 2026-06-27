"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { DashboardEventFilter } from "../lib/eventsState"
import type { DashboardEventSummary } from "../lib/apiClient"
import { EventQueueOpenForm } from "./EventQueueOpenForm"
import {
  applyDashboardEventsRefreshFailure,
  applyDashboardEventsRefreshStart,
  applyDashboardEventsRefreshSuccess,
  createDashboardEventsRefreshState,
  filterDashboardEvents,
  getDashboardEventGroupsForFilter,
  groupDashboardEvents,
  isOperationalEvent,
  MANUAL_EVENT_ID_FALLBACK_DESCRIPTION,
  MANUAL_EVENT_ID_FALLBACK_TITLE,
  shouldRefreshDashboardEventsOnFocus
} from "../lib/eventsState"
import { buildDashboardEventQueuePath, listDashboardEvents } from "../lib/apiClient"

type DashboardEventsViewProps = {
  events: DashboardEventSummary[]
}

const filters: Array<{ label: string; value: DashboardEventFilter }> = [
  { label: "Wszystkie", value: "all" },
  { label: "Aktywne", value: "active" },
  { label: "Nadchodzace", value: "upcoming" },
  { label: "Zakonczone", value: "finished" }
]

const sectionLabels = {
  active: {
    title: "Aktywne teraz",
    empty: "Brak aktywnych albo wstrzymanych wydarzen."
  },
  upcoming: {
    title: "Nadchodzace / robocze",
    empty: "Brak zaplanowanych albo roboczych wydarzen."
  },
  finished: {
    title: "Zakonczone",
    empty: "Brak zakonczonych wydarzen."
  }
} as const

export function DashboardEventsView({ events: initialEvents }: DashboardEventsViewProps) {
  const [refreshState, setRefreshState] = useState(() => createDashboardEventsRefreshState(initialEvents))
  const [filter, setFilter] = useState<DashboardEventFilter>("all")
  const inFlightRefresh = useRef<Promise<void> | null>(null)
  const events = refreshState.events
  const visibleEvents = useMemo(() => filterDashboardEvents(events, filter), [events, filter])
  const grouped = useMemo(() => groupDashboardEvents(visibleEvents), [visibleEvents])
  const visibleGroups = useMemo(() => getDashboardEventGroupsForFilter(filter), [filter])

  const refresh = useCallback(async () => {
    if (inFlightRefresh.current) {
      return inFlightRefresh.current
    }

    setRefreshState((state) => applyDashboardEventsRefreshStart(state))
    const request = listDashboardEvents()
      .then((next) => {
        setRefreshState((state) => applyDashboardEventsRefreshSuccess(state, next.events, new Date()))
      })
      .catch(() => {
        setRefreshState((state) => applyDashboardEventsRefreshFailure(state))
      })
      .finally(() => {
        inFlightRefresh.current = null
      })

    inFlightRefresh.current = request
    return request
  }, [])

  useEffect(() => {
    const onFocus = () => {
      if (shouldRefreshDashboardEventsOnFocus("focus")) {
        void refresh()
      }
    }
    const onVisibilityChange = () => {
      if (shouldRefreshDashboardEventsOnFocus("visibilitychange", document.visibilityState)) {
        void refresh()
      }
    }

    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [refresh])

  return (
    <>
      <section className="panel">
        <div className="queue-dashboard-header">
          <div>
            <h1>Wydarzenia</h1>
            <p className="lead">
              Wybierz wydarzenie dostepne dla Twojego konta i otworz kolejke operatora. Active i paused sa pokazane
              jako pierwsze.
            </p>
          </div>
          <div className="queue-header-actions">
            <span className="muted">{refreshState.isRefreshing ? "Odswiezanie..." : formatLastRefreshedAt(refreshState.lastRefreshedAt)}</span>
            <Link className="button" href="/dashboard/events/new">
              Nowe wydarzenie
            </Link>
            <button className="button secondary" disabled={refreshState.isRefreshing} type="button" onClick={() => void refresh()}>
              Odswiez
            </button>
          </div>
        </div>

        <div className="segmented-control" aria-label="Filtr wydarzen">
          {filters.map((option) => (
            <button
              aria-pressed={filter === option.value}
              className={filter === option.value ? "segment active" : "segment"}
              key={option.value}
              onClick={() => setFilter(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>

        <p className="muted">
          Lista odswieza sie recznie i jednorazowo po powrocie do karty. Nie jest widokiem live.
        </p>
        {refreshState.error ? (
          <p className="notice warning" role="status">
            {refreshState.error}
          </p>
        ) : null}
      </section>

      {events.length === 0 ? (
        <section className="panel subtle-panel">
          <h2>Brak wydarzen</h2>
          <p className="muted">Brak wydarzen dostepnych dla Twojego konta.</p>
        </section>
      ) : (
        <>
          {visibleGroups.map((group) => (
            <EventsSection events={grouped[group]} group={group} key={group} />
          ))}
        </>
      )}

      <section className="panel subtle-panel">
        <h2>{MANUAL_EVENT_ID_FALLBACK_TITLE}</h2>
        <p className="muted">{MANUAL_EVENT_ID_FALLBACK_DESCRIPTION}</p>
        <EventQueueOpenForm />
      </section>
    </>
  )
}

function EventsSection({ events, group }: { events: DashboardEventSummary[]; group: "active" | "upcoming" | "finished" }) {
  const labels = sectionLabels[group]

  if (events.length === 0) {
    return (
      <section className="event-section compact-section">
        <h2>{labels.title}</h2>
        <p className="muted">{labels.empty}</p>
      </section>
    )
  }

  return (
    <section className="event-section">
      <h2>{labels.title}</h2>
      <div className="event-list">
        {events.map((event) => (
          <EventCard event={event} key={event.id} />
        ))}
      </div>
    </section>
  )
}

function EventCard({ event }: { event: DashboardEventSummary }) {
  const operational = isOperationalEvent(event.status)

  return (
    <article className={operational ? "event-card event-card-operational" : "event-card"}>
      <div className="event-card-main">
        <div>
          <div className="event-card-title-row">
            <h3>{event.name}</h3>
            <span className={`status-badge status-${event.status}`}>{event.status}</span>
          </div>
          <p className="muted">
            {event.venue.name} / {event.operatedByOrganization.name}
          </p>
        </div>
        <Link className={operational ? "button" : "button secondary"} href={buildDashboardEventQueuePath(event.id)}>
          {operational ? "Otworz kolejke" : "Podglad kolejki"}
        </Link>
      </div>
      <dl className="event-meta-grid">
        <EventMeta label="Start" value={formatDate(event.startsAt)} />
        <EventMeta label="Koniec" value={formatDate(event.endsAt)} />
        <EventMeta label="Join" value={event.publicJoinEnabled ? "on" : "off"} />
        <EventMeta label="Public queue" value={event.publicQueueEnabled ? "on" : "off"} />
      </dl>
    </article>
  )
}

function EventMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function formatDate(value: string | null): string {
  if (!value) {
    return "brak"
  }

  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value))
}

function formatLastRefreshedAt(value: Date | null): string {
  if (!value) {
    return "Ostatnio odswiezono: jeszcze nie"
  }

  return `Ostatnio odswiezono: ${new Intl.DateTimeFormat("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(value)}`
}
