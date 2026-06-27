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
  const submissionsMessage = detail.submissions.enabled
    ? "Możesz przejść do sesji i dodać piosenkę."
    : detail.submissions.reason === "ACCESS_REQUIRED"
      ? "Zeskanuj QR w lokalu, aby dołączyć do sesji."
      : "Zgłoszenia są zamknięte"

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="panel hero-copy">
          <p className="eyebrow">{location}</p>
          <h1>{detail.event.name}</h1>
          <p className="lead">
            {startsAt ? `${startsAt}. ` : ""}
            Karaoke organizuje {detail.operatedByOrganization.name}.
          </p>
          <div className="actions">
            <Link className="button primary" href={`/event/${eventPublicId}/session`}>
              {detail.submissions.enabled ? "Dołącz do sesji" : "Zobacz sesję"}
            </Link>
          </div>
        </div>

        <div className="panel venue-facts">
          <div className="fact">
            <span>Status</span>
            <strong>{state.statusLabel}</strong>
          </div>
          <div className="fact">
            <span>Zgłoszenia</span>
            <strong>{submissionsMessage}</strong>
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
