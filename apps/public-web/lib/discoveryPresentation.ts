import type { PublicDiscoveryJoinState } from "./apiClient.ts"

const discoveryJoinLabels: Record<PublicDiscoveryJoinState, string> = {
  open: "Otwarte zgłoszenia",
  invite_required: "Dołącz przez QR w lokalu",
  closed: "Zgłoszenia zamknięte"
}

export function getDiscoveryJoinLabel(joinState: PublicDiscoveryJoinState): string {
  return discoveryJoinLabels[joinState]
}

export function formatDiscoveryStart(startsAt: string | null, timezone: string): string | null {
  if (!startsAt) {
    return null
  }

  try {
    return new Intl.DateTimeFormat("pl-PL", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone
    }).format(new Date(startsAt))
  } catch {
    return null
  }
}
