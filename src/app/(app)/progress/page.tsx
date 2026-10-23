'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Alert, Screen } from '@/components/ui'
import { Bars, pct } from '@/components/Bars'
import { domainRows, skillRow } from '@/lib/mastery'
import { ensureUser, rpc, type Home } from '@/lib/supabase'

type Progress = {
  target_score: number | null
  days_to_test: number | null
  sections: Partial<Record<'rw' | 'math', { answered: number; accuracy: number; median_seconds: number }>> | null
  weeks: { week: string; answered: number; accuracy: number }[] | null
  mocks: { id: string; completed_at: string; total: { estimate: number; low: number; high: number } }[] | null
  achievements: { code: string; earned_at: string }[] | null
}
// SAT pace per question (docs/sat-spec.md §2).
const PACE = { rw: 1.19 * 60, math: 1.59 * 60 }
const NAMES = { rw: 'Reading and Writing', math: 'Math' }

export default function ProgressPage() {
  const [data, setData] = useState<{ p: Progress; h: Home } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    ensureUser().then(() => Promise.all([rpc<Progress>('get_progress'), rpc<Home>('get_home')]))
      .then(([p, h]) => setData({ p, h })).catch((e) => setError(e.message))
  }, [])

  if (error) return <Screen wide><Alert title="Couldn’t load progress">{error}</Alert></Screen>
  if (!data) return <Screen wide><p aria-live="polite">Loading…</p></Screen>
  const { p, h } = data
  const latest = p.mocks?.at(-1)?.total

  return (
    <Screen wide className="space-y-8">
      <h1 className="text-2xl font-bold">Your progress</h1>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border-2 border-border bg-surface p-4">
          <p className="text-sm text-text-muted">Days to test</p>
          <p className="text-3xl font-bold">{p.days_to_test ?? '–'}</p>
        </div>
        <div className="rounded-xl border-2 border-border bg-surface p-4">
          <p className="text-sm text-text-muted">Latest mock estimate</p>
          <p className="text-3xl font-bold">{latest ? `${latest.low}–${latest.high}` : '–'}</p>
          {p.target_score && <p className="text-sm text-text-muted">Target {p.target_score}{latest ? ` · gap ${Math.max(0, p.target_score - latest.estimate)}` : ''}</p>}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Last 30 days</h2>
        {(['rw', 'math'] as const).map((k) => {
          const s = p.sections?.[k]
          return (
            <div key={k} className="rounded-xl border-2 border-border bg-surface p-4">
              <p className="font-semibold">{NAMES[k]}</p>
              {s ? (
                <p className="text-text-muted">{s.answered} answered · {pct(s.accuracy)} correct · {Math.round(s.median_seconds)}s median per question
                  (SAT pace {Math.round(PACE[k])}s{s.median_seconds > PACE[k] ? ', so speed up a little' : ''})</p>
              ) : <p className="text-text-muted">No questions yet.</p>}
            </div>
          )
        })}
      </section>

      <Bars title="Mastery by domain" rows={domainRows(h.skills, h.diagnosed)} />

      {(['rw', 'math'] as const).map((sec) => (
        <Bars key={sec} title={`${NAMES[sec]} skills`} rows={h.skills.filter((s) => s.section === sec).map((s) => skillRow(s, h.diagnosed))} />
      ))}

      {p.weeks && <Bars title="Weekly accuracy" rows={p.weeks.map((w) => ({ label: `Week of ${w.week} (${w.answered} Qs)`, value: w.accuracy }))} />}

      {p.mocks && (
        <Bars title="Mock test estimates (out of 1600)" max={1600} fmt={(v) => String(v)}
          rows={p.mocks.map((m) => ({ label: new Date(m.completed_at).toLocaleDateString(), value: m.total.estimate }))} />
      )}

      <p className="text-text-muted">Achievements are on your <Link href="/profile" className="font-semibold text-text underline">profile</Link>.</p>
    </Screen>
  )
}
