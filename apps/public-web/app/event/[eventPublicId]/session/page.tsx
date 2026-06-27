import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { PublicEventSessionView } from "../../../../components/PublicEventSessionView"
import { ApiErrorPanel } from "../../../../components/StatePanels"
import { getPublicEventSessionPageData } from "../../../../lib/pageData"

type PublicEventSessionPageProps = {
  params: Promise<{ eventPublicId: string }>
}

export default async function PublicEventSessionPage({ params }: PublicEventSessionPageProps) {
  const { eventPublicId } = await params
  const requestHeaders = await headers()
  const data = await getPublicEventSessionPageData(eventPublicId, requestHeaders.get("cookie"))

  if (data.kind === "not-found") {
    notFound()
  }

  if (data.kind === "api-error") {
    return <ApiErrorPanel message={data.message} />
  }

  return <PublicEventSessionView eventPublicId={eventPublicId} initialDetail={data.detail} initialQueue={data.queue} />
}
