import type { PublicEvent } from "./apiClient.ts"

export type JoinVisibility =
  | { kind: "open" }
  | { kind: "paused" }
  | { kind: "closed"; message: string }

export function getJoinVisibility(event: PublicEvent): JoinVisibility {
  if (event.status === "paused") {
    return { kind: "paused" }
  }

  if (event.status !== "active" || !event.publicJoinEnabled) {
    return {
      kind: "closed",
      message: "Zgloszenia piosenek sa teraz zamkniete."
    }
  }

  return { kind: "open" }
}
