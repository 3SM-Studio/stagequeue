import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { PublicEventParticipantView } from "../../../components/PublicEventParticipantView"
import { ApiErrorPanel } from "../../../components/StatePanels"
import { getPublicEventPageData } from "../../../lib/pageData"

type PublicEventPageProps = {
  params: Promise<{ eventPublicId: string }>
}

export default async function PublicEventPage({ params }: PublicEventPageProps) {
  const { eventPublicId } = await params
  const requestHeaders = await headers()
  const data = await getPublicEventPageData(eventPublicId, requestHeaders.get("cookie"))

  if (data.kind === "not-found") {
    notFound()
  }

  if (data.kind === "api-error") {
    return <ApiErrorPanel message={data.message} />
  }

  return <PublicEventParticipantView eventPublicId={eventPublicId} initialDetail={data.detail} initialQueue={data.queue} />
}
