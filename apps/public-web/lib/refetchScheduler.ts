export type RefetchScheduler = {
  cancel: () => void
  schedule: () => void
}

type TimeoutHandle = number | ReturnType<typeof setTimeout>

export function createRefetchScheduler(
  refetch: () => Promise<unknown>,
  options: {
    clearTimeoutFn?: (handle: TimeoutHandle) => void
    delayMs?: number
    setTimeoutFn?: (callback: () => void, delayMs: number) => TimeoutHandle
  } = {}
): RefetchScheduler {
  const delayMs = options.delayMs ?? 150
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout
  let disposed = false
  let inFlight = false
  let pending = false
  let timeout: TimeoutHandle | null = null

  const run = () => {
    timeout = null
    if (disposed) {
      return
    }
    if (inFlight) {
      pending = true
      return
    }

    inFlight = true
    void refetch().finally(() => {
      inFlight = false
      if (pending && !disposed) {
        pending = false
        schedule()
      }
    })
  }

  const schedule = () => {
    if (disposed) {
      return
    }
    if (timeout || inFlight) {
      pending = true
      return
    }

    timeout = setTimeoutFn(run, delayMs)
  }

  return {
    cancel() {
      disposed = true
      if (timeout) {
        clearTimeoutFn(timeout)
        timeout = null
      }
    },
    schedule
  }
}
