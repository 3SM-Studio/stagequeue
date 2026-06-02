import type { DashboardMeResponse } from "./apiClient.ts"

export type DashboardViewState =
  | {
      kind: "unauthenticated"
      title: string
      message: string
    }
  | {
      kind: "access-denied"
      title: string
      message: string
      reason: string
    }
  | {
      kind: "allowed"
      title: string
      userEmail: string
      userName: string | null
      platformRoles: string[]
    }

export function getDashboardViewState(me: DashboardMeResponse): DashboardViewState {
  if (!me.authenticated) {
    return {
      kind: "unauthenticated",
      title: "Zaloguj sie do dashboardu",
      message: "Dashboard Poza Nuta jest dostepny dla zaakceptowanych operatorow i wlascicieli platformy."
    }
  }

  if (!me.access.dashboardAllowed) {
    return {
      kind: "access-denied",
      title: "Brak dostepu do dashboardu",
      message: accessDeniedMessage(me.access.reason),
      reason: me.access.reason
    }
  }

  return {
    kind: "allowed",
    title: "Dashboard Poza Nuta",
    userEmail: me.user.email,
    userName: me.user.name,
    platformRoles: me.platform.roles
  }
}

function accessDeniedMessage(reason: string): string {
  if (reason === "disabled") {
    return "Twoje konto jest wylaczone. Skontaktuj sie z administratorem platformy."
  }

  return "Twoj dostep czeka na akceptacje w ramach closed beta."
}
