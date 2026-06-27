import { queueRefreshEvents } from "./queueRefresh.ts"

export type PublicQueueStreamStatus = "connecting" | "connected" | "reconnecting"

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
  onOpen,
  onRefetch,
  onStatusChange,
  streamUrl
}: {
  eventSourceFactory: PublicQueueEventSourceFactory
  onEvent?: (eventType: string) => void
  onOpen?: () => void
  onRefetch: () => void
  onStatusChange: (status: PublicQueueStreamStatus) => void
  streamUrl: string
}) {
  onStatusChange("connecting")

  const eventSource = eventSourceFactory(streamUrl, { withCredentials: true })
  eventSource.onopen = () => {
    onStatusChange("connected")
    onOpen?.()
    onRefetch()
  }
  eventSource.onerror = () => onStatusChange("reconnecting")
  eventSource.addEventListener("connected", () => onStatusChange("connected"))

  for (const eventType of queueRefreshEvents) {
    eventSource.addEventListener(eventType, () => {
      onStatusChange("connected")
      onEvent?.(eventType)
      onRefetch()
    })
  }

  return {
    close() {
      eventSource.close()
      onStatusChange("reconnecting")
    }
  }
}
