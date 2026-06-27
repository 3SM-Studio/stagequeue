import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ApiErrorPanel, InactiveQueuePanel } from "../../components/StatePanels"
import { venuePageMetadata } from "../../lib/metadata"
import { getVenueMetadataData, getVenuePageData } from "../../lib/pageData"

type VenuePageProps = {
  params: Promise<{ venueSlug: string }>
}

export async function generateMetadata({ params }: VenuePageProps): Promise<Metadata> {
  const { venueSlug } = await params
  return venuePageMetadata(await getVenueMetadataData(venueSlug))
}

export default async function VenuePage({ params }: VenuePageProps) {
  const { venueSlug } = await params
  const data = await getVenuePageData(venueSlug)

  if (data.kind === "not-found") {
    notFound()
  }

  if (data.kind === "api-error") {
    return <ApiErrorPanel message={data.message} />
  }

  const { venue, active } = data
  const activeEvent = active.activeEvent

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="panel hero-copy">
          <p className="eyebrow">{venue.city ?? venue.country}</p>
          <h1>{venue.name}</h1>
          <p className="lead">
            Stały publiczny profil lokalu. Kolejka pojawi się tutaj tylko dla aktywnego wydarzenia karaoke.
          </p>
          {activeEvent ? (
            <div className="actions">
              <Link className="button primary" href={`/event/${activeEvent.publicId}`}>
                Zobacz wydarzenie
              </Link>
            </div>
          ) : null}
        </div>
        <div className="panel venue-facts">
          <div className="fact">
            <span>Status wydarzenia</span>
            <strong>{activeEvent ? statusLabel(activeEvent.status) : "Brak aktywnej kolejki"}</strong>
          </div>
          <div className="fact">
            <span>Strefa czasu</span>
            <strong>{venue.timezone}</strong>
          </div>
          <div className="fact">
            <span>Adres</span>
            <strong>{[venue.address, venue.city].filter(Boolean).join(", ") || "Nie podano"}</strong>
          </div>
        </div>
      </section>

      {!activeEvent ? (
        <div className="page-shell narrow">
          <InactiveQueuePanel venue={venue} />
        </div>
      ) : null}
    </main>
  )
}

function statusLabel(status: string): string {
  if (status === "active") {
    return "Kolejka aktywna"
  }
  if (status === "paused") {
    return "Kolejka wstrzymana"
  }
  return status
}
