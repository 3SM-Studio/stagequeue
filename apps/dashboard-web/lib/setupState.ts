import type { DashboardMeResponse, PlatformSetupStatusResponse } from "./apiClient.ts"

export type PlatformSetupViewState =
  | {
      kind: "completed"
      title: string
      message: string
      showClaimForm: false
      showGoogleSignIn: false
    }
  | {
      kind: "unauthenticated"
      title: string
      message: string
      showClaimForm: false
      showGoogleSignIn: true
    }
  | {
      kind: "claim"
      title: string
      message: string
      userEmail: string
      showClaimForm: true
      showGoogleSignIn: false
    }

export function getPlatformSetupViewState(
  status: PlatformSetupStatusResponse,
  me: DashboardMeResponse
): PlatformSetupViewState {
  if (!status.setupRequired) {
    return {
      kind: "completed",
      title: "Setup zakonczony",
      message: "Pierwszy platform owner jest juz zapisany w bazie. Kolejne role platformowe beda zarzadzane z panelu platformy.",
      showClaimForm: false,
      showGoogleSignIn: false
    }
  }

  if (!me.authenticated) {
    return {
      kind: "unauthenticated",
      title: "Zaloguj sie, zeby dokonczyc setup",
      message: "Pierwszy platform owner musi byc zalogowany przez Better Auth. Token setupu wpiszesz po zalogowaniu.",
      showClaimForm: false,
      showGoogleSignIn: true
    }
  }

  return {
    kind: "claim",
    title: "Nadaj pierwszego platform ownera",
    message: "Wpisz jednorazowy token setupu z konfiguracji API. Po pierwszym poprawnym claimie setup zostanie zamkniety.",
    userEmail: me.user.email,
    showClaimForm: true,
    showGoogleSignIn: false
  }
}
