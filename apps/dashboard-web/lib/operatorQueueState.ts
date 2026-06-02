import type { DashboardApiError } from "./apiClient.ts"

export type OperatorQueueErrorState = {
  kind: "login" | "forbidden" | "not-found" | "conflict" | "validation" | "error"
  title: string
  message: string
}

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
  "event.closed"
] as const

export function shouldRefetchOperatorQueue(eventType: string): boolean {
  return (operatorQueueRefetchEvents as readonly string[]).includes(eventType)
}

export function getOperatorQueueErrorState(error: unknown): OperatorQueueErrorState {
  if (isDashboardApiErrorLike(error)) {
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
