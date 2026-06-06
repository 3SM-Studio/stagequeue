import { operatorQueueRefetchEvents, type OperatorQueueStreamStatus } from "./operatorQueueState.ts"

export type DashboardEventSource = {
  addEventListener: (type: string, listener: () => void) => void
  close: () => void
  onerror: ((event: Event) => void) | null
  onopen: ((event: Event) => void) | null
}

export type DashboardEventSourceFactory = (url: string, init: { withCredentials: boolean }) => DashboardEventSource

export function createOperatorQueueStream({
  eventSourceFactory,
  onRefetch,
  onStatusChange,
  streamUrl
}: {
  eventSourceFactory: DashboardEventSourceFactory
  onRefetch: () => void
  onStatusChange: (status: OperatorQueueStreamStatus) => void
  streamUrl: string
}) {
  onStatusChange("connecting")

  const eventSource = eventSourceFactory(streamUrl, { withCredentials: true })
  const refetch = () => onRefetch()

  eventSource.onopen = () => onStatusChange("connected")
  eventSource.onerror = () => onStatusChange("disconnected")

  for (const eventType of operatorQueueRefetchEvents) {
    eventSource.addEventListener(eventType, refetch)
  }

  return {
    close() {
      eventSource.close()
      onStatusChange("disconnected")
    }
  }
}
