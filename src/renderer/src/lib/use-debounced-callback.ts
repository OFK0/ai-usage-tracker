import { useCallback, useEffect, useRef } from 'react'

/** Calls `fn` once calls stop for `waitMs`, always with the latest arguments. */
export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  waitMs: number
): (...args: A) => void {
  const latest = useRef(fn)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    latest.current = fn
  })

  useEffect(() => () => clearTimeout(timer.current), [])

  return useCallback(
    (...args: A) => {
      clearTimeout(timer.current)
      timer.current = setTimeout(() => latest.current(...args), waitMs)
    },
    [waitMs]
  )
}
