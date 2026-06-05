import { getMe, getPlatformSetupStatus, type DashboardFetch, type DashboardMeResponse, type PlatformSetupStatusResponse } from "./apiClient.ts"

export type DashboardGateState =
  | {
      kind: "setup_required"
      title: string
      message: string
    }
  | {
      kind: "unauthenticated"
      title: string
      message: string
    }
  | {
      kind: "access_denied"
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
  | {
      kind: "api_unavailable"
      title: string
      message: string
    }

export function getDashboardGateState(input: {
  error?: unknown
  me?: DashboardMeResponse | null
  setupStatus?: PlatformSetupStatusResponse | null
}): DashboardGateState {
  if (input.error || !input.setupStatus || !input.me) {
    return {
      kind: "api_unavailable",
      title: "Dashboard chwilowo niedostepny",
      message: "Nie udalo sie sprawdzic stanu setupu albo sesji. Sprawdz, czy API dziala."
    }
  }

  if (input.setupStatus.setupRequired) {
    return {
      kind: "setup_required",
      title: "Wymagany setup platformy",
      message: "Platforma nie ma jeszcze pierwszego ownera. Dokoncz setup zanim wejdziesz do dashboardu."
    }
  }

  if (!input.me.authenticated) {
    return {
      kind: "unauthenticated",
      title: "Zaloguj sie do dashboardu",
      message: "Dashboard Poza Nuta jest dostepny dla zaakceptowanych operatorow i wlascicieli platformy."
    }
  }

  if (!input.me.access.dashboardAllowed) {
    return {
      kind: "access_denied",
      title: "Brak dostepu do dashboardu",
      message: accessDeniedMessage(input.me.access.reason),
      reason: input.me.access.reason
    }
  }

  return {
    kind: "allowed",
    title: "Dashboard Poza Nuta",
    userEmail: input.me.user.email,
    userName: input.me.user.name,
    platformRoles: input.me.platform.roles
  }
}

export function getDashboardGateRedirect(state: DashboardGateState, currentPath: string): string | null {
  if (state.kind === "setup_required") {
    return currentPath === "/setup" ? null : "/setup"
  }

  if (state.kind === "unauthenticated") {
    return currentPath === "/sign-in" ? null : "/sign-in"
  }

  if (state.kind === "access_denied" && currentPath !== "/dashboard/access") {
    return "/dashboard/access"
  }

  if (state.kind === "allowed" && currentPath === "/dashboard/access") {
    return "/dashboard"
  }

  return null
}

export async function readDashboardGate(options: { cookieHeader?: string; fetchImpl?: DashboardFetch } = {}): Promise<DashboardGateState> {
  try {
    const setupOptions = options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}
    const meOptions = {
      ...(options.cookieHeader ? { cookieHeader: options.cookieHeader } : {}),
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {})
    }
    const [setupStatus, me] = await Promise.all([
      getPlatformSetupStatus(setupOptions),
      getMe(meOptions)
    ])

    return getDashboardGateState({ me, setupStatus })
  } catch (error) {
    return getDashboardGateState({ error })
  }
}

function accessDeniedMessage(reason: string): string {
  if (reason === "disabled") {
    return "Twoje konto jest wylaczone. Skontaktuj sie z administratorem platformy."
  }

  return "Twoj dostep czeka na akceptacje w ramach closed beta."
}
