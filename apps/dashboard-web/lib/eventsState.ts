import type { DashboardEventStatus, DashboardEventSummary } from "./apiClient.ts"

export type DashboardEventFilter = "all" | "active" | "upcoming" | "finished"
export type DashboardEventGroup = "active" | "upcoming" | "finished"

export const MANUAL_EVENT_ID_FALLBACK_TITLE = "Otworz kolejke po ID"
export const MANUAL_EVENT_ID_FALLBACK_DESCRIPTION = "Awaryjnie, dla QA/dev."
export const DASHBOARD_EVENTS_LIST_REFRESH_MODE = "focus" as const
export const DASHBOARD_EVENTS_LIST_USES_EVENT_STREAMS = false
export const DASHBOARD_EVENTS_REFRESH_ERROR_MESSAGE = "Nie udalo sie odswiezyc listy wydarzen."
export const MAX_DASHBOARD_EVENT_STREAM_SUBSCRIPTIONS = 1
export const dashboardEventsRefetchEvents = [
  "queue.updated",
  "event.started",
  "event.paused",
  "event.resumed",
  "event.closed",
  "event.archived",
  "event.cancelled"
] as const

export type DashboardEventsErrorState =
  | {
      kind: "login"
      title: string
      message: string
    }
  | {
      kind: "forbidden"
      title: string
      message: string
    }
  | {
      kind: "unavailable"
      title: string
      message: string
    }

export type DashboardEventsRefreshState = {
  error: string | null
  events: DashboardEventSummary[]
  isRefreshing: boolean
  lastRefreshedAt: Date | null
}

export function createDashboardEventsRefreshState(
  events: DashboardEventSummary[],
  lastRefreshedAt: Date | null = null
): DashboardEventsRefreshState {
  return {
    error: null,
    events,
    isRefreshing: false,
    lastRefreshedAt
  }
}

export function applyDashboardEventsRefreshStart(state: DashboardEventsRefreshState): DashboardEventsRefreshState {
  return {
    ...state,
    error: null,
    isRefreshing: true
  }
}

export function applyDashboardEventsRefreshSuccess(
  state: DashboardEventsRefreshState,
  events: DashboardEventSummary[],
  refreshedAt: Date
): DashboardEventsRefreshState {
  return {
    ...state,
    error: null,
    events,
    isRefreshing: false,
    lastRefreshedAt: refreshedAt
  }
}

export function applyDashboardEventsRefreshFailure(state: DashboardEventsRefreshState): DashboardEventsRefreshState {
  return {
    ...state,
    error: DASHBOARD_EVENTS_REFRESH_ERROR_MESSAGE,
    isRefreshing: false
  }
}

export function createDashboardEventsRefreshController({
  fetchEvents,
  initialEvents,
  now = () => new Date()
}: {
  fetchEvents: () => Promise<DashboardEventSummary[]>
  initialEvents: DashboardEventSummary[]
  now?: () => Date
}) {
  let state = createDashboardEventsRefreshState(initialEvents)
  let inFlight: Promise<DashboardEventsRefreshState> | null = null

  return {
    getState: () => state,
    refresh: () => {
      if (inFlight) {
        return inFlight
      }

      state = applyDashboardEventsRefreshStart(state)
      inFlight = fetchEvents()
        .then((events) => {
          state = applyDashboardEventsRefreshSuccess(state, events, now())
          return state
        })
        .catch(() => {
          state = applyDashboardEventsRefreshFailure(state)
          return state
        })
        .finally(() => {
          inFlight = null
        })

      return inFlight
    }
  }
}

export function getDashboardEventGroup(status: DashboardEventStatus): DashboardEventGroup {
  if (status === "active" || status === "paused") {
    return "active"
  }

  if (status === "scheduled" || status === "draft") {
    return "upcoming"
  }

  return "finished"
}

export function groupDashboardEvents(events: DashboardEventSummary[]): Record<DashboardEventGroup, DashboardEventSummary[]> {
  const grouped: Record<DashboardEventGroup, DashboardEventSummary[]> = {
    active: [],
    finished: [],
    upcoming: []
  }

  for (const event of events) {
    grouped[getDashboardEventGroup(event.status)].push(event)
  }

  grouped.active.sort(compareOperationalEvents)
  grouped.upcoming.sort(compareOperationalEvents)
  grouped.finished.sort(compareFinishedEvents)

  return grouped
}

export function filterDashboardEvents(events: DashboardEventSummary[], filter: DashboardEventFilter): DashboardEventSummary[] {
  if (filter === "all") {
    return events
  }

  return events.filter((event) => getDashboardEventGroup(event.status) === filter)
}

export function getDashboardEventGroupsForFilter(filter: DashboardEventFilter): DashboardEventGroup[] {
  if (filter === "all") {
    return ["active", "upcoming", "finished"]
  }

  return [filter]
}

export function shouldRefetchDashboardEventsOnSse(eventType: string): boolean {
  return (dashboardEventsRefetchEvents as readonly string[]).includes(eventType)
}

export function getDashboardEventStreamSubscriptions(
  events: DashboardEventSummary[],
  limit = MAX_DASHBOARD_EVENT_STREAM_SUBSCRIPTIONS
): string[] {
  const candidates = groupDashboardEvents(events)
  const relevant = candidates.active
  return [...new Set(relevant.map((event) => event.id))].slice(0, limit)
}

export function getDashboardEventStreamKey(eventId: string): string {
  return `dashboard-event:${eventId}`
}

export function getDashboardEventsStreamErrorState(): { fatal: false; kind: "stale"; message: string } {
  return {
    fatal: false,
    kind: "stale",
    message: "Live update wydarzen chwilowo odnowi polaczenie automatycznie."
  }
}

export function shouldRefreshDashboardEventsOnFocus(eventType: "focus" | "visibilitychange", visibilityState = "visible"): boolean {
  return eventType === "focus" || (eventType === "visibilitychange" && visibilityState === "visible")
}

export function getDashboardEventsErrorState(error: unknown): DashboardEventsErrorState {
  if (isStatusError(error, 401)) {
    return {
      kind: "login",
      title: "Zaloguj sie do dashboardu",
      message: "Musisz byc zalogowany, zeby zobaczyc dostepne wydarzenia."
    }
  }

  if (isStatusError(error, 403)) {
    return {
      kind: "forbidden",
      title: "Brak dostepu do wydarzen",
      message: "Twoje konto nie ma uprawnien do listy wydarzen."
    }
  }

  return {
    kind: "unavailable",
    title: "Nie udalo sie pobrac wydarzen",
    message: "Nie udalo sie pobrac wydarzen. Sprawdz, czy API dziala."
  }
}

export function isOperationalEvent(status: DashboardEventStatus): boolean {
  return status === "active" || status === "paused"
}

function compareOperationalEvents(a: DashboardEventSummary, b: DashboardEventSummary): number {
  const statusPriority = statusSortPriority(a.status) - statusSortPriority(b.status)
  if (statusPriority !== 0) {
    return statusPriority
  }

  return compareNullableDatesAscending(a.startsAt, b.startsAt) || a.name.localeCompare(b.name)
}

function compareFinishedEvents(a: DashboardEventSummary, b: DashboardEventSummary): number {
  return compareNullableDatesDescending(a.endsAt ?? a.startsAt, b.endsAt ?? b.startsAt) || a.name.localeCompare(b.name)
}

function statusSortPriority(status: DashboardEventStatus): number {
  if (status === "active") {
    return 0
  }
  if (status === "paused") {
    return 1
  }
  return 2
}

function compareNullableDatesAscending(a: string | null, b: string | null): number {
  if (a && b) {
    return Date.parse(a) - Date.parse(b)
  }
  if (a) {
    return -1
  }
  if (b) {
    return 1
  }
  return 0
}

function compareNullableDatesDescending(a: string | null, b: string | null): number {
  if (a && b) {
    return Date.parse(b) - Date.parse(a)
  }
  if (a) {
    return -1
  }
  if (b) {
    return 1
  }
  return 0
}

function isStatusError(error: unknown, status: number): boolean {
  return typeof error === "object" && error !== null && "status" in error && error.status === status
}
