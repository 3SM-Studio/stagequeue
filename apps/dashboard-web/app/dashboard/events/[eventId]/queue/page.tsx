import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { OperatorQueueView } from "../../../../../components/OperatorQueueView"
import { getDashboardGateRedirect, readDashboardGate } from "../../../../../lib/dashboardGate.ts"

type OperatorQueuePageProps = {
  params: Promise<{ eventId: string }>
}

export const metadata = {
  title: "Event queue"
}

export default async function OperatorQueuePage({ params }: OperatorQueuePageProps) {
  const { eventId } = await params
  const cookieHeader = (await cookies()).toString()
  const gate = await readDashboardGate({ cookieHeader })
  const currentPath = `/dashboard/events/${eventId}/queue`
  const redirectTarget = getDashboardGateRedirect(gate, currentPath)

  if (redirectTarget) {
    redirect(redirectTarget)
  }

  if (gate.kind === "api_unavailable") {
    return (
      <main className="page-shell narrow">
        <section className="panel">
          <h1>{gate.title}</h1>
          <p className="lead">{gate.message}</p>
        </section>
      </main>
    )
  }

  if (gate.kind !== "allowed") {
    redirect("/sign-in")
  }

  return <OperatorQueueView eventId={eventId} />
}
