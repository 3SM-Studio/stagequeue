import Link from "next/link"
import { ApiErrorPanel } from "../components/StatePanels"
import type { PublicDiscoveryEvent, PublicDiscoveryVenue } from "../lib/apiClient"
import { formatDiscoveryStart, getDiscoveryJoinLabel } from "../lib/discoveryPresentation"
import { getPublicDiscoveryPageData } from "../lib/pageData"

export default async function HomePage() {
  const data = await getPublicDiscoveryPageData()
  if (data.kind === "api-error") {
    return <ApiErrorPanel message={data.message} />
  }

  return (
    <main className="page-shell discovery-page">
      <header className="discovery-header">
        <p className="eyebrow">Poza Nutą</p>
        <h1>Publiczne wydarzenia karaoke</h1>
        <p>Wybierz wydarzenie lub sprawdź, co dzieje się w lokalach.</p>
      </header>

      <section className="discovery-section" aria-labelledby="now-heading">
        <div className="discovery-section-heading">
          <p className="eyebrow">Na żywo</p>
          <h2 id="now-heading">Trwa teraz</h2>
        </div>
        {data.discovery.now.length > 0 ? (
          <ul className="discovery-grid">
            {data.discovery.now.map((event) => (
              <li key={event.eventPublicId}>
                <DiscoveryEventCard event={event} />
              </li>
            ))}
          </ul>
        ) : (
          <DiscoveryEmptyState message="Aktualnie nie trwa żadne publiczne wydarzenie." />
        )}
      </section>

      <section className="discovery-section" aria-labelledby="upcoming-heading">
        <div className="discovery-section-heading">
          <p className="eyebrow">Kalendarz</p>
          <h2 id="upcoming-heading">Nadchodzące</h2>
        </div>
        {data.discovery.upcoming.length > 0 ? (
          <ul className="discovery-grid">
            {data.discovery.upcoming.map((event) => (
              <li key={event.eventPublicId}>
                <DiscoveryEventCard event={event} />
              </li>
            ))}
          </ul>
        ) : (
          <DiscoveryEmptyState message="Brak zaplanowanych publicznych wydarzeń." />
        )}
      </section>

      <section className="discovery-section" aria-labelledby="venues-heading">
        <div className="discovery-section-heading">
          <p className="eyebrow">Miejsca</p>
          <h2 id="venues-heading">Lokale</h2>
        </div>
        {data.discovery.venues.length > 0 ? (
          <ul className="discovery-grid">
            {data.discovery.venues.map((venue) => (
              <li key={venue.slug}>
                <DiscoveryVenueCard venue={venue} />
              </li>
            ))}
          </ul>
        ) : (
          <DiscoveryEmptyState message="Brak publicznych lokali." />
        )}
      </section>
    </main>
  )
}

function DiscoveryEventCard({ event }: { event: PublicDiscoveryEvent }) {
  const startsAt = formatDiscoveryStart(event.startsAt, event.venue.timezone)

  return (
    <article className="panel discovery-card">
      <div>
        <p className="discovery-location">
          {event.venue.name}
          {event.venue.city ? ` · ${event.venue.city}` : ""}
        </p>
        <h3>{event.name}</h3>
        {startsAt ? <p className="discovery-time">{startsAt}</p> : null}
      </div>
      <div className="discovery-card-footer">
        <span className={`discovery-join-state ${event.joinState}`}>{getDiscoveryJoinLabel(event.joinState)}</span>
        <Link className="button secondary compact" href={`/event/${event.eventPublicId}`}>
          Zobacz wydarzenie
        </Link>
      </div>
    </article>
  )
}

function DiscoveryVenueCard({ venue }: { venue: PublicDiscoveryVenue }) {
  return (
    <article className="panel discovery-card">
      <div>
        <p className="discovery-location">{venue.city ?? "Lokal karaoke"}</p>
        <h3>{venue.name}</h3>
      </div>
      {venue.activeEvent ? (
        <div className="discovery-active-event">
          <p>{venue.activeEvent.name}</p>
          <span className={`discovery-join-state ${venue.activeEvent.joinState}`}>
            {getDiscoveryJoinLabel(venue.activeEvent.joinState)}
          </span>
          <Link className="button secondary compact" href={`/event/${venue.activeEvent.eventPublicId}`}>
            Zobacz wydarzenie
          </Link>
        </div>
      ) : (
        <p className="empty">Brak aktywnego wydarzenia</p>
      )}
      <Link className="discovery-venue-link" href={`/${venue.slug}`}>
        Zobacz lokal
      </Link>
    </article>
  )
}

function DiscoveryEmptyState({ message }: { message: string }) {
  return <p className="panel discovery-empty">{message}</p>
}
