// Numbers that count up (or down) to their new value, so a change is seen rather than just replaced.
// With "reduce motion" on, or in tests, the value appears at once.
import { useEffect, useRef, useState } from 'react'

const reduced = () => typeof window === 'undefined' || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function useCountUp(target: number, ms = 600): number {
  const [shown, setShown] = useState(() => (reduced() ? target : 0))
  const from = useRef(shown)
  useEffect(() => {
    if (reduced() || from.current === target) { from.current = target; setShown(target); return }
    const start = performance.now(), a = from.current
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms)
      const eased = 1 - Math.pow(1 - t, 3)
      const v = Math.round(a + (target - a) * eased)
      from.current = v
      setShown(v)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return shown
}

/** Drop-in for a plain number. Keeps the final value in an aria-label so screen readers never hear the counting. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const n = useCountUp(value)
  return <span className={className} aria-label={String(value)}>{n}</span>
}
