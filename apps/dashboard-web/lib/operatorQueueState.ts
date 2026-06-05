import type { DashboardApiError, DashboardEventDetail, OperatorQueueResponse } from "./apiClient.ts"

export type OperatorQueueErrorState = {
  kind: "login" | "forbidden" | "not-found" | "conflict" | "validation" | "error"
  title: string
  message: string
}

export type OperatorQueueSnapshot = {
  eventDetail: DashboardEventDetail | null
  queue: OperatorQueueResponse | null
}

export type OperatorQueueRefreshState = {
  error: string | null
  isRefreshing: boolean
  snapshot: OperatorQueueSnapshot
}

export const OPERATOR_QUEUE_REFRESH_INTERVAL_MS = 5000
export const OPERATOR_QUEUE_REFRESH_ERROR_MESSAGE = "Nie udalo sie odswiezyc kolejki."

export const operatorQueueRefetchEvents = [
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
] as const

export function shouldRefetchOperatorQueue(eventType: string): boolean {
  return (operatorQueueRefetchEvents as readonly string[]).includes(eventType)
}

export function shouldPollOperatorQueue(visibilityState: string, pendingAction: string | null): boolean {
  return visibilityState === "visible" && pendingAction === null
}

export function createOperatorQueueRefreshController({
  fetchSnapshot,
  initialSnapshot
}: {
  fetchSnapshot: () => Promise<OperatorQueueSnapshot>
  initialSnapshot: OperatorQueueSnapshot
}) {
  let state: OperatorQueueRefreshState = {
    error: null,
    isRefreshing: false,
    snapshot: initialSnapshot
  }
  let inFlight: Promise<OperatorQueueRefreshState> | null = null

  return {
    getState: () => state,
    refresh: () => {
      if (inFlight) {
        return inFlight
      }

      state = {
        ...state,
        error: null,
        isRefreshing: true
      }
      inFlight = fetchSnapshot()
        .then((snapshot) => {
          state = {
            error: null,
            isRefreshing: false,
            snapshot
          }
          return state
        })
        .catch(() => {
          state = {
            ...state,
            error: OPERATOR_QUEUE_REFRESH_ERROR_MESSAGE,
            isRefreshing: false
          }
          return state
        })
        .finally(() => {
          inFlight = null
        })

      return inFlight
    }
  }
}

export async function runOperatorMutationWithRefresh(
  mutate: () => Promise<unknown>,
  refresh: () => Promise<unknown>
): Promise<void> {
  await mutate()
  await refresh()
}

export async function runOperatorActionWithPending({
  handleError,
  label,
  mutate,
  refresh,
  setPendingAction
}: {
  handleError: (error: unknown) => void
  label: string
  mutate: () => Promise<unknown>
  refresh: () => Promise<unknown>
  setPendingAction: (label: string | null) => void
}): Promise<void> {
  setPendingAction(label)
  try {
    await runOperatorMutationWithRefresh(mutate, refresh)
  } catch (error) {
    handleError(error)
  } finally {
    setPendingAction(null)
  }
}

export function getOperatorQueueErrorState(error: unknown): OperatorQueueErrorState {
  if (isDashboardApiErrorLike(error)) {
    if (error.status === 0) {
      return {
        kind: "error",
        title: "Operacja przekroczyla limit czasu",
        message: error.message || "Nie udalo sie wykonac operacji. Sprobuj ponownie."
      }
    }

    if (error.status === 401) {
      return {
        kind: "login",
        title: "Zaloguj sie",
        message: "Musisz byc zalogowany, zeby obslugiwac kolejke."
      }
    }

    if (error.status === 403) {
      return {
        kind: "forbidden",
        title: "Brak uprawnien",
        message: "Brak uprawnien do obslugi tej kolejki."
      }
    }

    if (error.status === 404) {
      return {
        kind: "not-found",
        title: "Nie znaleziono eventu",
        message: "Ten event nie istnieje albo nie jest dostepny."
      }
    }

    if (error.status === 409) {
      return {
        kind: "conflict",
        title: "Konflikt kolejki",
        message: error.message || "Kolejka zmienila sie w trakcie operacji. Odswiez widok i sprobuj ponownie."
      }
    }

    if (error.status === 400) {
      return {
        kind: "validation",
        title: "Niepoprawne dane",
        message: error.message || "Sprawdz dane i sprobuj ponownie."
      }
    }
  }

  return {
    kind: "error",
    title: "Blad kolejki",
    message: error instanceof Error ? error.message : "Nie udalo sie pobrac albo zmienic kolejki."
  }
}

function isDashboardApiErrorLike(error: unknown): error is DashboardApiError {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  )
}
