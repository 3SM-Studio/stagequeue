import type { PublicEventDetail } from "./apiClient.ts"

export type PublicEventPageState = {
  title: string
  venueLabel: string
  statusLabel: string
  submissionsLabel: string
  queueLabel: string
  isClosed: boolean
  isAccessRequired: boolean
  landingMessage: string
  landingActionLabel: string | null
  sessionHeading: string
  sessionLead: string
  queueHeading: string
}

export function getPublicEventPageState(detail: PublicEventDetail): PublicEventPageState {
  const isClosed = detail.event.status === "closed"
  const isAccessRequired = detail.submissions.reason === "ACCESS_REQUIRED"

  return {
    title: detail.event.name,
    venueLabel: detail.venue.name,
    statusLabel: eventStatusLabel(detail.event.status),
    submissionsLabel: isClosed
      ? "Zgłoszenia są zamknięte"
      : detail.submissions.enabled
        ? "Zgłoszenia są otwarte"
        : submissionsClosedLabel(detail.submissions.reason),
    queueLabel: detail.publicQueue.visible
      ? "Kolejka publiczna jest widoczna"
      : publicQueueHiddenLabel(detail.publicQueue.reason),
    isClosed,
    isAccessRequired,
    landingMessage: landingMessage(detail, isClosed, isAccessRequired),
    landingActionLabel: landingActionLabel(detail, isClosed, isAccessRequired),
    sessionHeading: isClosed ? "Wydarzenie zakończone" : detail.event.name,
    sessionLead: sessionLead(detail, isClosed, isAccessRequired),
    queueHeading: isClosed ? "Końcowa kolejka" : "Następne zgłoszenia"
  }
}

function landingMessage(detail: PublicEventDetail, isClosed: boolean, isAccessRequired: boolean): string {
  if (isClosed) {
    return "Zgłoszenia są zamknięte"
  }
  if (detail.submissions.enabled) {
    return "Zgłoszenia są otwarte. Możesz przejść do sesji i dodać piosenkę."
  }
  if (isAccessRequired) {
    return "Dołączenie do kolejki wymaga kodu QR dostępnego w lokalu"
  }

  return submissionsClosedLabel(detail.submissions.reason)
}

function landingActionLabel(
  detail: PublicEventDetail,
  isClosed: boolean,
  isAccessRequired: boolean
): string | null {
  if (isClosed) {
    return detail.publicQueue.visible ? "Zobacz końcową kolejkę" : null
  }
  if (detail.submissions.enabled) {
    return "Dołącz do sesji"
  }
  if (isAccessRequired) {
    return detail.publicQueue.visible ? "Zobacz kolejkę" : null
  }

  return detail.publicQueue.visible ? "Zobacz sesję" : null
}

function sessionLead(detail: PublicEventDetail, isClosed: boolean, isAccessRequired: boolean): string {
  if (isClosed) {
    return detail.publicQueue.visible
      ? `${detail.event.name}. Zgłoszenia są zamknięte. Poniżej znajdziesz końcową kolejkę wydarzenia.`
      : `${detail.event.name}. Zgłoszenia są zamknięte. Kolejka nie jest publiczna.`
  }
  if (detail.submissions.enabled) {
    return "Dodaj piosenkę, śledź swoje zgłoszenia i obserwuj kolejkę wydarzenia na żywo."
  }
  if (isAccessRequired) {
    return detail.publicQueue.visible
      ? "Dołączenie do kolejki wymaga kodu QR dostępnego w lokalu. Publiczną kolejkę możesz oglądać bez dodawania piosenki."
      : "Dołączenie do kolejki wymaga kodu QR dostępnego w lokalu."
  }

  return detail.publicQueue.visible
    ? "Zgłoszenia nie są teraz dostępne. Nadal możesz obserwować publiczną kolejkę."
    : "Zgłoszenia nie są teraz dostępne."
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
    return "Wydarzenie zakończone"
  }

  return status
}

function submissionsClosedLabel(reason: string | undefined): string {
  if (reason === "EVENT_NOT_ACTIVE") {
    return "Zgłoszenia nie są teraz przyjmowane"
  }
  if (reason === "PUBLIC_JOIN_DISABLED") {
    return "Zgłoszenia publiczne są wyłączone"
  }
  if (reason === "ACCESS_REQUIRED") {
    return "Dołączenie do kolejki wymaga kodu QR dostępnego w lokalu"
  }

  return "Zgłoszenia są zamknięte"
}

function publicQueueHiddenLabel(reason: string | undefined): string {
  if (reason === "PUBLIC_QUEUE_DISABLED") {
    return "Kolejka publiczna jest ukryta"
  }
  if (reason === "QUEUE_NOT_VISIBLE") {
    return "Kolejka nie jest teraz publicznie widoczna"
  }

  return "Kolejka publiczna jest niedostępna"
}
