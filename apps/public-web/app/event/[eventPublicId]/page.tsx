import Link from "next/link"
import { notFound } from "next/navigation"
import { ApiErrorPanel } from "../../../components/StatePanels"
import { getPublicEventPageData } from "../../../lib/pageData"
import { getPublicEventPageState } from "../../../lib/publicEventPageState"

type PublicEventPageProps = {
  params: Promise<{ eventPublicId: string }>
}

export default async function PublicEventPage({ params }: PublicEventPageProps) {
  const { eventPublicId } = await params
  const data = await getPublicEventPageData(eventPublicId)

  if (data.kind === "not-found") {
    notFound()
  }

  if (data.kind === "api-error") {
    return <ApiErrorPanel message={data.message} />
  }

  const { detail } = data
  const state = getPublicEventPageState(detail)

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="panel hero-copy">
          <p className="eyebrow">{state.venueLabel}</p>
          <h1>{state.title}</h1>
          <p className="lead">Sprawdz status wydarzenia karaoke, dostepnosc zgloszen i publiczna kolejke.</p>
          <div className="actions">
            {state.showQueueLink ? (
              <Link className="button secondary" href={`/event/${detail.event.publicId}#queue`}>
                Zobacz kolejke
              </Link>
            ) : null}
          </div>
        </div>
        <div className="panel venue-facts">
          <div className="fact">
            <span>Status</span>
            <strong>{state.statusLabel}</strong>
          </div>
          <div className="fact">
            <span>Zgloszenia</span>
            <strong>{state.submissionsLabel}</strong>
          </div>
          <div className="fact">
            <span>Kolejka publiczna</span>
            <strong>{state.queueLabel}</strong>
          </div>
          <div className="fact">
            <span>Organizator</span>
            <strong>{detail.operatedByOrganization.name}</strong>
          </div>
        </div>
      </section>

      <section id="queue" className="panel state-panel">
        <p className="eyebrow">Kolejka</p>
        <h2>{state.queueLabel}</h2>
        <p className="muted">Szczegoly kolejki sa pokazywane zgodnie z publiczna widocznoscia wydarzenia.</p>
      </section>
    </main>
  )
}
