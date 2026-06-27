import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { PublicEventLandingView } from "../../../components/PublicEventLandingView"
import { ApiErrorPanel } from "../../../components/StatePanels"
import { getPublicEventLandingPageData } from "../../../lib/pageData"

type PublicEventPageProps = {
  params: Promise<{ eventPublicId: string }>
}

export default async function PublicEventPage({ params }: PublicEventPageProps) {
  const { eventPublicId } = await params
  const requestHeaders = await headers()
  const data = await getPublicEventLandingPageData(eventPublicId, requestHeaders.get("cookie"))

  if (data.kind === "not-found") {
    notFound()
  }

  if (data.kind === "api-error") {
    return <ApiErrorPanel message={data.message} />
  }

  return <PublicEventLandingView eventPublicId={eventPublicId} detail={data.detail} />
}
