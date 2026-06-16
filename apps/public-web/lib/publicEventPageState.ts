import type { PublicEventDetail } from "./apiClient.ts"

export type PublicEventPageState = {
  title: string
  venueLabel: string
  statusLabel: string
  submissionsLabel: string
  queueLabel: string
  showQueueLink: boolean
}

export function getPublicEventPageState(detail: PublicEventDetail): PublicEventPageState {
  return {
    title: detail.event.name,
    venueLabel: detail.venue.name,
    statusLabel: eventStatusLabel(detail.event.status),
    submissionsLabel: detail.submissions.enabled ? "Zgloszenia sa otwarte" : submissionsClosedLabel(detail.submissions.reason),
    queueLabel: detail.publicQueue.visible ? "Kolejka publiczna jest widoczna" : publicQueueHiddenLabel(detail.publicQueue.reason),
    showQueueLink: detail.publicQueue.visible
  }
}

function eventStatusLabel(status: string): string {
  if (status === "scheduled") {
    return "Wydarzenie zaplanowane"
  }
  if (status === "active") {
    return "Wydarzenie aktywne"
  }
  if (status === "paused") {
    return "Wydarzenie wstrzymane"
  }
  if (status === "closed") {
    return "Wydarzenie zakonczone"
  }

  return status
}

function submissionsClosedLabel(reason: string | undefined): string {
  if (reason === "EVENT_NOT_ACTIVE") {
    return "Zgloszenia nie sa teraz przyjmowane"
  }
  if (reason === "PUBLIC_JOIN_DISABLED") {
    return "Zgloszenia publiczne sa wylaczone"
  }
  if (reason === "ACCESS_REQUIRED") {
    return "Zgloszenia wymagaja linku z zaproszeniem"
  }

  return "Zgloszenia sa zamkniete"
}

function publicQueueHiddenLabel(reason: string | undefined): string {
  if (reason === "PUBLIC_QUEUE_DISABLED") {
    return "Kolejka publiczna jest ukryta"
  }
  if (reason === "QUEUE_NOT_VISIBLE") {
    return "Kolejka nie jest teraz publicznie widoczna"
  }

  return "Kolejka publiczna jest niedostepna"
}
