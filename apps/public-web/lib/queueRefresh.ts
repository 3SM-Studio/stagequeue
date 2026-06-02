export const queueRefreshEvents = [
  "queue.updated",
  "request.created",
  "request.approved",
  "request.rejected",
  "request.started",
  "request.done",
  "request.skipped",
  "request.moved",
  "event.started",
  "event.paused",
  "event.resumed",
  "event.closed",
  "event.archived",
  "event.cancelled"
] as const

export function shouldRefetchQueue(eventType: string): boolean {
  return (queueRefreshEvents as readonly string[]).includes(eventType)
}
