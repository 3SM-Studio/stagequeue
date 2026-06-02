import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { JoinForm } from "../../../components/JoinForm"
import { ApiErrorPanel, InactiveQueuePanel, PausedQueuePanel } from "../../../components/StatePanels"
import { getJoinVisibility } from "../../../lib/joinVisibility"
import { joinPageMetadata } from "../../../lib/metadata"
import { getVenueMetadataData, getVenuePageData } from "../../../lib/pageData"

type JoinPageProps = {
  params: Promise<{ venueSlug: string }>
}

export async function generateMetadata({ params }: JoinPageProps): Promise<Metadata> {
  const { venueSlug } = await params
  return joinPageMetadata(await getVenueMetadataData(venueSlug))
}

export default async function JoinPage({ params }: JoinPageProps) {
  const { venueSlug } = await params
  const data = await getVenuePageData(venueSlug)

  if (data.kind === "not-found") {
    notFound()
  }

  if (data.kind === "api-error") {
    return <ApiErrorPanel message={data.message} />
  }

  const activeEvent = data.active.activeEvent
  if (!activeEvent) {
    return (
      <main className="page-shell narrow">
        <InactiveQueuePanel venue={data.venue} />
      </main>
    )
  }

  const joinVisibility = getJoinVisibility(activeEvent)
  if (joinVisibility.kind === "paused") {
    return (
      <main className="page-shell narrow">
        <PausedQueuePanel active={data.active} />
      </main>
    )
  }

  if (joinVisibility.kind === "closed") {
    return (
      <main className="page-shell narrow">
        <section className="state-panel">
          <p className="eyebrow">{data.venue.name}</p>
          <h1>Zgloszenia sa zamkniete.</h1>
          <p>{joinVisibility.message}</p>
        </section>
      </main>
    )
  }

  return (
    <main className="page-shell narrow">
      <section className="state-panel">
        <p className="eyebrow">{data.venue.name}</p>
        <h1>Zglos piosenke do kolejki.</h1>
        <p>Wypelnij recznie dane utworu. Wyszukiwarka katalogu wroci w nastepnym etapie.</p>
      </section>
      <JoinForm venueSlug={venueSlug} />
    </main>
  )
}
