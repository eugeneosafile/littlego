import { useEffect } from 'react'

/** Runs fn now and then every ms milliseconds while the component is mounted. */
export function usePoll(fn: () => Promise<void>, ms = 10_000) {
  useEffect(() => {
    fn().catch(() => {})
    const id = setInterval(() => fn().catch(() => {}), ms)
    return () => clearInterval(id)
  }, [fn, ms])
}
