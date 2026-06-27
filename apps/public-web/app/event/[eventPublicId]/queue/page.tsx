import Link from "next/link"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { PublicQueueView } from "../../../../components/PublicQueueView"
import { ApiErrorPanel } from "../../../../components/StatePanels"
import { getPublicEventQueuePageData } from "../../../../lib/pageData"

type PublicEventQueuePageProps = {
  params: Promise<{ eventPublicId: string }>
}

export default async function PublicEventQueuePage({ params }: PublicEventQueuePageProps) {
  const { eventPublicId } = await params
  const requestHeaders = await headers()
  const data = await getPublicEventQueuePageData(eventPublicId, requestHeaders.get("cookie"))

  if (data.kind === "not-found") {
    notFound()
  }

  if (data.kind === "api-error") {
    return <ApiErrorPanel message={data.message} />
  }

  const eventHref = `/event/${eventPublicId}`
  const location = [data.detail.venue.name, data.detail.venue.city].filter(Boolean).join(" · ")

  return (
    <main className="page-shell">
      <header className="panel state-panel">
        <p className="eyebrow">{location}</p>
        <h1>Kolejka wydarzenia</h1>
        <p className="lead">{data.detail.event.name}</p>
        <div className="actions">
          <Link className="button secondary" href={eventHref}>
            Wróć do wydarzenia
          </Link>
        </div>
      </header>

      {data.kind === "ready" ? (
        <PublicQueueView eventPublicId={eventPublicId} initialQueue={data.queue} />
      ) : (
        <section className="panel state-panel">
          <h2>{queueUnavailableMessage(data.reason)}</h2>
          <p className="muted">Sprawdź szczegóły wydarzenia lub wróć później.</p>
        </section>
      )}
    </main>
  )
}

function queueUnavailableMessage(reason: "disabled" | "scheduled" | "unavailable"): string {
  if (reason === "disabled") {
    return "Kolejka tego wydarzenia nie jest publiczna."
  }
  if (reason === "scheduled") {
    return "Kolejka będzie dostępna po rozpoczęciu wydarzenia."
  }
  return "Kolejka tego wydarzenia nie jest teraz dostępna."
}
