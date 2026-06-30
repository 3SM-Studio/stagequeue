import Link from "next/link"
import type { PublicEventDetail } from "../lib/apiClient"
import { formatDiscoveryStart } from "../lib/discoveryPresentation"
import { getPublicEventPageState } from "../lib/publicEventPageState"

export function PublicEventLandingView({
  eventPublicId,
  detail
}: {
  eventPublicId: string
  detail: PublicEventDetail
}) {
  const state = getPublicEventPageState(detail)
  const location = [detail.venue.name, detail.venue.city].filter(Boolean).join(" · ")
  const startsAt = formatDiscoveryStart(detail.event.startsAt, detail.venue.timezone)

  return (
    <main className="page-shell">
      {state.isClosed ? (
        <section className="panel state-panel event-state-panel" aria-labelledby="closed-event-heading">
          <p className="eyebrow">Status wydarzenia</p>
          <h2 id="closed-event-heading">Wydarzenie zakończone</h2>
          <p className="lead">Zgłoszenia są zamknięte</p>
        </section>
      ) : null}

      <section className="hero">
        <div className="panel hero-copy">
          <p className="eyebrow">{location}</p>
          <h1>{detail.event.name}</h1>
          <p className="lead">
            {startsAt ? `${startsAt}. ` : ""}
            Karaoke organizuje {detail.operatedByOrganization.name}.
          </p>
          {state.landingActionLabel ? (
            <div className="actions">
              <Link className="button primary" href={`/event/${eventPublicId}/session`}>
                {state.landingActionLabel}
              </Link>
            </div>
          ) : state.isClosed ? (
            <p className="muted">Końcowa kolejka nie jest publiczna.</p>
          ) : null}
        </div>

        <div className="panel venue-facts">
          <div className="fact">
            <span>Status</span>
            <strong>{state.statusLabel}</strong>
          </div>
          <div className="fact">
            <span>Zgłoszenia</span>
            <strong>{state.landingMessage}</strong>
          </div>
          <div className="fact">
            <span>Kolejka publiczna</span>
            <strong>{state.queueLabel}</strong>
          </div>
          <div className="fact">
            <span>Lokal</span>
            <strong>{detail.venue.name}</strong>
          </div>
        </div>
      </section>
    </main>
  )
}
