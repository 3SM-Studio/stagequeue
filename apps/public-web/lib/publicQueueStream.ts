import { queueRefreshEvents } from "./queueRefresh.ts"

export type PublicQueueStreamStatus = "connecting" | "connected" | "stale"

export type PublicQueueEventSource = {
  addEventListener: (type: string, listener: (event: MessageEvent) => void) => void
  close: () => void
  onerror: ((event: Event) => void) | null
  onopen: ((event: Event) => void) | null
}

export type PublicQueueEventSourceFactory = (
  url: string,
  init: { withCredentials: boolean }
) => PublicQueueEventSource

export function createPublicQueueStream({
  eventSourceFactory,
  onEvent,
  onRefetch,
  onStatusChange,
  streamUrl
}: {
  eventSourceFactory: PublicQueueEventSourceFactory
  onEvent?: (eventType: string) => void
  onRefetch: () => void
  onStatusChange: (status: PublicQueueStreamStatus) => void
  streamUrl: string
}) {
  onStatusChange("connecting")

  const eventSource = eventSourceFactory(streamUrl, { withCredentials: true })
  eventSource.onopen = () => {
    onStatusChange("connected")
    onRefetch()
  }
  eventSource.onerror = () => onStatusChange("stale")

  for (const eventType of queueRefreshEvents) {
    eventSource.addEventListener(eventType, () => {
      onEvent?.(eventType)
      onRefetch()
    })
  }

  return {
    close() {
      eventSource.close()
      onStatusChange("stale")
    }
  }
}
