import type { DashboardApiError, DashboardEventStatus } from "./apiClient.ts"

export type DashboardLifecycleAction = "start" | "pause" | "resume" | "close" | "archive" | "cancel"

export type DashboardLifecycleActionModel = {
  action: DashboardLifecycleAction
  label: string
  tone: "primary" | "secondary" | "danger"
}

export type DashboardLifecycleEventState = {
  status: DashboardEventStatus
  publicJoinEnabled: boolean
  publicQueueEnabled: boolean
}

export type DashboardLifecycleErrorState = {
  kind: "login" | "forbidden" | "not-found" | "conflict" | "validation" | "error"
  title: string
  message: string
}

const lifecycleActionsByStatus: Record<DashboardEventStatus, readonly DashboardLifecycleAction[]> = {
  draft: ["start", "cancel"],
  scheduled: ["start", "cancel"],
  active: ["pause", "close"],
  paused: ["resume", "close"],
  closed: ["archive"],
  cancelled: ["archive"],
  archived: []
}

const lifecycleActionLabels: Record<DashboardLifecycleAction, string> = {
  start: "Start",
  pause: "Pauza",
  resume: "Wznow",
  close: "Zamknij",
  archive: "Archiwizuj",
  cancel: "Anuluj"
}

const lifecycleActionTones: Record<DashboardLifecycleAction, DashboardLifecycleActionModel["tone"]> = {
  start: "primary",
  pause: "secondary",
  resume: "primary",
  close: "secondary",
  archive: "secondary",
  cancel: "danger"
}

export function getLifecycleActionsForStatus(status: DashboardEventStatus): readonly DashboardLifecycleAction[] {
  return lifecycleActionsByStatus[status]
}

export function getLifecycleActionModels(status: DashboardEventStatus): DashboardLifecycleActionModel[] {
  return getLifecycleActionsForStatus(status).map((action) => ({
    action,
    label: lifecycleActionLabels[action],
    tone: lifecycleActionTones[action]
  }))
}

export function getEventStatusDescription(status: DashboardEventStatus): string {
  if (status === "active") {
    return "Event jest aktywny. Publiczne zgloszenia moga dzialac, jesli sa wlaczone."
  }
  if (status === "paused") {
    return "Event jest w pauzie. Publiczna kolejka moze byc widoczna, ale nowe zgloszenia sa wstrzymane."
  }
  if (status === "closed") {
    return "Event jest zamkniety. Kolejka zostaje historia wieczoru."
  }
  if (status === "archived") {
    return "Event jest zarchiwizowany i nie ma juz akcji operacyjnych."
  }
  if (status === "cancelled") {
    return "Event zostal anulowany. Mozna go tylko zarchiwizowac."
  }
  return "Event nie zostal jeszcze uruchomiony."
}

export function isPublicSubmitAvailable(event: DashboardLifecycleEventState): boolean {
  return event.status === "active" && event.publicJoinEnabled
}

export function isPublicQueueVisibleForDashboard(event: DashboardLifecycleEventState): boolean {
  return (event.status === "active" || event.status === "paused") && event.publicQueueEnabled
}

export function getPublicJoinLabel(enabled: boolean): string {
  return enabled ? "Wylacz zgloszenia publiczne" : "Wlacz zgloszenia publiczne"
}

export function getPublicQueueLabel(enabled: boolean): string {
  return enabled ? "Ukryj kolejke publiczna" : "Pokaz kolejke publicznie"
}

export function getDashboardLifecycleErrorState(error: unknown): DashboardLifecycleErrorState {
  if (isDashboardApiErrorLike(error)) {
    if (error.status === 0) {
      return {
        kind: "error",
        title: "Nie udalo sie zmienic statusu",
        message: "Nie udalo sie zmienic statusu wydarzenia. Sprobuj ponownie."
      }
    }

    if (error.status === 401) {
      return {
        kind: "login",
        title: "Zaloguj sie",
        message: "Musisz byc zalogowany, zeby sterowac wydarzeniem."
      }
    }

    if (error.status === 403) {
      return {
        kind: "forbidden",
        title: "Brak uprawnien",
        message: "Brak uprawnien do sterowania tym wydarzeniem."
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
        title: "Zmiana niedozwolona",
        message: "Ta zmiana statusu nie jest teraz dozwolona. Odswiez widok i sprobuj ponownie."
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
    title: "Blad wydarzenia",
    message: error instanceof Error ? error.message : "Nie udalo sie pobrac albo zmienic wydarzenia."
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
