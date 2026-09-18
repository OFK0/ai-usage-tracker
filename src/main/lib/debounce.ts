export interface Debounced {
  (): void
  /** Runs a pending call right away instead of waiting for the delay. */
  flush(): void
  cancel(): void
}

/** Collapses a burst of calls into one, made once the calls stop for waitMs. */
export function debounce(fn: () => void, waitMs: number): Debounced {
  let timer: ReturnType<typeof setTimeout> | undefined

  const run = (): void => {
    timer = undefined
    fn()
  }

  const debounced = (): void => {
    clearTimeout(timer)
    timer = setTimeout(run, waitMs)
  }

  debounced.flush = (): void => {
    if (timer === undefined) return
    clearTimeout(timer)
    run()
  }

  debounced.cancel = (): void => {
    clearTimeout(timer)
    timer = undefined
  }

  return debounced
}
