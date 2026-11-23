'use client'

import { useEffect, useState } from 'react'
import { timeLeft } from '../lib/dates'

export function useCrownTimeLeft(expiresAt?: string | null) {
  const [now, setNow] = useState<number | null>(null)
  const end = expiresAt ? Date.parse(expiresAt) : 0

  useEffect(() => {
    if (!end) return
    let timer: ReturnType<typeof setTimeout>
    function update() {
      const current = Date.now()
      setNow(current)
      if (current < end) timer = setTimeout(update, Math.min(end - current, 60_000))
    }
    timer = setTimeout(update, 0)
    return () => clearTimeout(timer)
  }, [end])

  return now !== null && end > now ? timeLeft(new Date(end), new Date(now)) : null
}

export function CrownIcon({ className = '' }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinejoin="round" aria-hidden><path d="M3 6l5 4 4-6 4 6 5-4-2 11H5zm3 14h12" /></svg>
}

export function CrownBadge({ expiresAt, compact = false }: { expiresAt?: string | null; compact?: boolean }) {
  const left = useCrownTimeLeft(expiresAt)
  if (!left) return null
  if (compact) return <span className="shrink-0 rounded-md border border-border bg-surface p-1" title={`Last week’s champion · ${left} left`}>
    <CrownIcon className="size-4" /><span className="sr-only">Last week’s champion</span>
  </span>
  return <p className="mt-1 inline-flex flex-wrap items-center gap-2 text-sm font-semibold">
    <CrownIcon className="size-5 shrink-0" /> Weekly champion · {left} left
  </p>
}

export function CrownCount({ count }: { count: number }) {
  return <div className="rounded-xl border-2 border-border bg-surface p-4">
    <dt className="flex items-center gap-2 text-sm text-text-muted"><CrownIcon className="size-4" /> Crowns won</dt>
    <dd className="text-xl font-bold tabular-nums">{count}</dd>
  </div>
}
