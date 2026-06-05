import type { PublicMyRequest } from "./apiClient.ts"

export const PUBLIC_MY_REQUESTS_REFRESH_INTERVAL_MS = 5000
export const PUBLIC_MY_REQUESTS_REFRESH_ERROR_MESSAGE = "Nie udalo sie odswiezyc statusu zgloszenia."

const activeTrackedStatuses: readonly PublicMyRequest["status"][] = ["pending", "approved", "now"]

export function getTrackedRequest(requests: PublicMyRequest[], trackedRequestId: string | null): PublicMyRequest | null {
  if (!trackedRequestId) {
    return null
  }

  return requests.find((request) => request.id === trackedRequestId) ?? null
}

export function shouldPollMyRequests(request: PublicMyRequest | null, visibilityState: string): boolean {
  return visibilityState === "visible" && request !== null && activeTrackedStatuses.includes(request.status)
}

export function getMyRequestStatusMessage(status: PublicMyRequest["status"]): string {
  if (status === "approved") {
    return "Zgloszenie zatwierdzone. Jestes w kolejce."
  }
  if (status === "now") {
    return "Teraz twoja kolej."
  }
  if (status === "rejected") {
    return "Zgloszenie odrzucone."
  }
  if (status === "skipped") {
    return "Zgloszenie pominiete."
  }
  if (status === "done") {
    return "Wystep zakonczony."
  }

  return "Poczekaj na zatwierdzenie prowadzacego."
}

export function createMyRequestsRefreshController({
  fetchRequests,
  trackedRequestId
}: {
  fetchRequests: () => Promise<PublicMyRequest[]>
  trackedRequestId: string | null
}) {
  let inFlight: Promise<PublicMyRequest | null> | null = null
  let currentRequest: PublicMyRequest | null = null
  let error: string | null = null

  return {
    getError: () => error,
    getRequest: () => currentRequest,
    refresh: () => {
      if (!trackedRequestId) {
        currentRequest = null
        return Promise.resolve(null)
      }

      if (inFlight) {
        return inFlight
      }

      inFlight = fetchRequests()
        .then((requests) => {
          currentRequest = getTrackedRequest(requests, trackedRequestId)
          error = null
          return currentRequest
        })
        .catch(() => {
          error = PUBLIC_MY_REQUESTS_REFRESH_ERROR_MESSAGE
          return currentRequest
        })
        .finally(() => {
          inFlight = null
        })

      return inFlight
    }
  }
}
