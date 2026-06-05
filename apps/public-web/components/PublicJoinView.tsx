"use client"

import { useCallback, useEffect, useState } from "react"
import { buildPublicVenueStreamUrl, getActiveEvent, type ActiveEventLookup, type Venue } from "../lib/apiClient"
import {
  getPublicJoinStreamErrorState,
  getPublicVenueStreamKey,
  getPublicJoinViewState,
  shouldRefetchPublicJoinOnSse
} from "../lib/joinState"
import { createRefetchScheduler } from "../lib/refetchScheduler"
import { JoinForm } from "./JoinForm"
import { InactiveQueuePanel, PausedQueuePanel } from "./StatePanels"

export function PublicJoinView({
  initialActive,
  venue,
  venueSlug
}: {
  initialActive: ActiveEventLookup
  venue: Venue
  venueSlug: string
}) {
  const [active, setActive] = useState(initialActive)
  const [streamState, setStreamState] = useState<ReturnType<typeof getPublicJoinStreamErrorState> | null>(null)
  const streamKey = getPublicVenueStreamKey(venueSlug)
  const viewState = getPublicJoinViewState(active)

  const refresh = useCallback(async () => {
    try {
      setActive(await getActiveEvent(venueSlug))
      setStreamState(null)
    } catch {
      setStreamState(getPublicJoinStreamErrorState())
    }
  }, [venueSlug])

  useEffect(() => {
    const scheduler = createRefetchScheduler(refresh)
    const source = new EventSource(buildPublicVenueStreamUrl(venueSlug), { withCredentials: true })
    source.addEventListener("open", () => setStreamState(null))
    source.addEventListener("error", () => setStreamState(getPublicJoinStreamErrorState()))

    const onMessage = (event: MessageEvent) => {
      if (shouldRefetchPublicJoinOnSse(event.type)) {
        scheduler.schedule()
      }
    }

    for (const eventType of [
      "queue.updated",
      "event.started",
      "event.paused",
      "event.resumed",
      "event.closed",
      "event.archived",
      "event.cancelled"
    ]) {
      source.addEventListener(eventType, onMessage)
    }

    return () => {
      scheduler.cancel()
      source.close()
    }
  }, [venueSlug, streamKey, refresh])

  if (viewState.kind === "inactive") {
    return <InactiveQueuePanel venue={venue} />
  }

  if (viewState.kind === "paused") {
    return <PausedQueuePanel active={viewState.active} />
  }

  if (viewState.kind === "closed") {
    return (
      <section className="panel state-panel">
        <p className="eyebrow">{venue.name}</p>
        <h1>Zgloszenia sa zamkniete.</h1>
        <p>{viewState.message}</p>
        {streamState ? <p className="muted">Polaczenie live odnowi sie automatycznie.</p> : null}
      </section>
    )
  }

  return (
    <>
      <section className="state-panel">
        <p className="eyebrow">{venue.name}</p>
        <h1>Zglos piosenke do kolejki.</h1>
        <p>Wypelnij recznie dane utworu. Wyszukiwarka katalogu wroci w nastepnym etapie.</p>
        {streamState ? <p className="muted">Polaczenie live odnowi sie automatycznie.</p> : null}
      </section>
      <JoinForm venueSlug={venueSlug} />
    </>
  )
}
