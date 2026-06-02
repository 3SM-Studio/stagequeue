import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { PublicQueueView } from "../../../components/PublicQueueView"
import { ApiErrorPanel, InactiveQueuePanel } from "../../../components/StatePanels"
import { PublicApiError } from "../../../lib/apiClient"
import { queuePageMetadata } from "../../../lib/metadata"
import { getVenueMetadataData } from "../../../lib/pageData"
import { getServerPublicQueueByVenueSlug } from "../../../lib/serverApiClient"

type QueuePageProps = {
  params: Promise<{ venueSlug: string }>
}

export async function generateMetadata({ params }: QueuePageProps): Promise<Metadata> {
  const { venueSlug } = await params
  return queuePageMetadata(await getVenueMetadataData(venueSlug))
}

export default async function QueuePage({ params }: QueuePageProps) {
  const { venueSlug } = await params

  try {
    const queue = await getServerPublicQueueByVenueSlug(venueSlug)
    if (!queue.event) {
      return (
        <main className="page-shell narrow">
          <InactiveQueuePanel venue={queue.venue} />
        </main>
      )
    }

    return (
      <main className="page-shell">
        <PublicQueueView initialQueue={queue} venueSlug={venueSlug} />
      </main>
    )
  } catch (error) {
    if (error instanceof PublicApiError && error.status === 404) {
      notFound()
    }

    return <ApiErrorPanel message={error instanceof Error ? error.message : "Nie udalo sie pobrac kolejki."} />
  }
}
