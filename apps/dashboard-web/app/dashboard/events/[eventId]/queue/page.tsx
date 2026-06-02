import { OperatorQueueView } from "../../../../../components/OperatorQueueView"

type OperatorQueuePageProps = {
  params: Promise<{ eventId: string }>
}

export const metadata = {
  title: "Event queue"
}

export default async function OperatorQueuePage({ params }: OperatorQueuePageProps) {
  const { eventId } = await params

  return <OperatorQueueView eventId={eventId} />
}
