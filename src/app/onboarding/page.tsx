'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useId, useState, type ReactNode } from 'react'
import { Alert, Button, ProgressBar, Screen } from '@/components/ui'
import { DAILY_GOALS as GOALS } from '@/lib/goals'
import { ensureUser, rpc } from '@/lib/supabase'

const STEPS = ['goal', 'date', 'scores', 'daily', 'diagnostic'] as const
type Step = (typeof STEPS)[number]
const SCORES = Array.from({ length: 121 }, (_, i) => 400 + i * 10)

function Options<T extends string | number>({ name, legend, value, onChange, options }: {
  name: string; legend: string; value: T | null; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]
}) {
  const uid = useId()
  return (
    <fieldset className="space-y-3">
      <legend className="sr-only">{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 border-border bg-surface px-4 has-[:checked]:border-text has-[:checked]:bg-surface-muted">
          {/* Explicit name and value: some screen readers announced these as "on". */}
          <input type="radio" name={name} value={String(o.value)} aria-labelledby={`${uid}-${o.value}`} className="size-5 accent-[var(--color-text)]"
            checked={value === o.value} onChange={() => onChange(o.value)} />
          <span id={`${uid}-${o.value}`} className="flex flex-1">{o.label}</span>
        </label>
      ))}
    </fieldset>
  )
}

function Onboarding() {
  const router = useRouter()
  const params = useSearchParams()
  const asked = (STEPS.includes(params.get('step') as Step) ? params.get('step') : 'goal') as Step

  const [goal, setGoal] = useState<'first' | 'retake' | null>(null)
  const [date, setDate] = useState('')
  const [noDate, setNoDate] = useState(false)
  const [current, setCurrent] = useState('')
  const [target, setTarget] = useState('')
  const [daily, setDaily] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const answered: Record<Step, boolean> = {
    goal: goal !== null,
    date: noDate || date !== '',
    scores: target !== '',
    daily: daily !== null,
    diagnostic: true,
  }
  // After a refresh the answers are gone: fall back to the first unanswered step.
  const step = STEPS.find((s, k) => k < STEPS.indexOf(asked) && !answered[s]) ?? asked
  const i = STEPS.indexOf(step)
  const canContinue = answered[step]

  async function finish(diagnostic: boolean) {
    setBusy(true)
    try {
      await ensureUser()
      await rpc('save_onboarding', {
        p_goal: goal, p_test_date: noDate ? null : date, p_current: current ? Number(current) : null,
        p_target: Number(target), p_daily_goal: daily, p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      if (diagnostic) router.push(`/session/${await rpc<string>('start_session', { p_mode: 'diagnostic' })}`)
      else router.push('/learn')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  const go = (to: Step) => router.push(`/onboarding?step=${to}`)

  return (
    <Screen className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <button aria-label="Back" disabled={i === 0} onClick={() => router.back()} className="grid size-10 place-items-center rounded-full disabled:invisible">←</button>
        <ProgressBar value={i + 1} max={STEPS.length} label="Onboarding progress" />
      </div>

      {step === 'goal' && <>
        <h1 className="text-2xl font-bold">Is this your first SAT?</h1>
        <Options name="goal" legend="Is this your first SAT?" value={goal} onChange={setGoal} options={[{ value: 'first', label: 'Yes, it’s my first time' }, { value: 'retake', label: 'No, I’m retaking it' }]} />
      </>}

      {step === 'date' && <>
        <h1 className="text-2xl font-bold">When is your test?</h1>
        <label className="block">
          <span className="mb-2 block text-text-muted">Test date</span>
          <input type="date" value={date} disabled={noDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)}
            className="min-h-12 w-full rounded-xl border-2 border-border bg-surface px-4" />
        </label>
        <label className="flex items-center gap-3">
          <input type="checkbox" value="no-date" aria-labelledby="no-date" className="size-5" checked={noDate} onChange={(e) => setNoDate(e.target.checked)} />
          <span id="no-date">I haven’t booked a date yet</span>
        </label>
      </>}

      {step === 'scores' && <>
        <h1 className="text-2xl font-bold">What score are you aiming for?</h1>
        {[['Current or recent score (optional)', current, setCurrent], ['Target score', target, setTarget]].map(([label, v, set]) => (
          <label key={label as string} className="block">
            <span className="mb-2 block text-text-muted">{label as string}</span>
            <select value={v as string} onChange={(e) => (set as (s: string) => void)(e.target.value)} className="min-h-12 w-full rounded-xl border-2 border-border bg-surface px-4">
              <option value="">Select…</option>
              {SCORES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        ))}
        <p className="text-sm text-text-muted">The SAT is scored from 400 to 1600 in steps of 10.</p>
      </>}

      {step === 'daily' && <>
        <h1 className="text-2xl font-bold">Pick a daily goal</h1>
        <Options name="daily" legend="Daily goal" value={daily} onChange={setDaily} options={GOALS.map((g) => ({
          value: g.pts, label: <span className="flex w-full justify-between"><b>{g.min} min / day</b>{' '}<span className="text-text-muted">{g.label}</span></span>,
        }))} />
      </>}

      {step === 'diagnostic' && <>
        <h1 className="text-2xl font-bold">Find your starting point</h1>
        <p>A 24-question diagnostic covers all 8 SAT domains and adapts as you go. It takes about 25 minutes, and you’ll see results at the end.</p>
        {error && <Alert title="Couldn’t save">{error}</Alert>}
        <Button onClick={() => finish(true)} disabled={busy}>Take the diagnostic</Button>
        <Button variant="secondary" onClick={() => finish(false)} disabled={busy}>Skip and start learning</Button>
      </>}

      {step !== 'diagnostic' && (
        <Button className="mt-auto" disabled={!canContinue} onClick={() => go(STEPS[i + 1])}>Continue</Button>
      )}
    </Screen>
  )
}

export default function Page() {
  return <Suspense><Onboarding /></Suspense>
}
