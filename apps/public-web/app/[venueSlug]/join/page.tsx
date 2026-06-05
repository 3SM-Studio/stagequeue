import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { PublicJoinView } from "../../../components/PublicJoinView"
import { ApiErrorPanel } from "../../../components/StatePanels"
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

  return (
    <main className="page-shell narrow">
      <PublicJoinView initialActive={data.active} venue={data.venue} venueSlug={venueSlug} />
    </main>
  )
}
