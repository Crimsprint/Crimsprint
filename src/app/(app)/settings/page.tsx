'use client'
import { useEffect, useState } from 'react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Alert, Button, Screen } from '@/components/ui'
import { DAILY_GOALS } from '@/lib/goals'
import { requireUser, rpc, supabase } from '@/lib/supabase'

type Profile = { goal: string | null; current_score: number | null; target_score: number | null; test_date: string | null; daily_goal: number; timezone: string }

export default function SettingsPage() {
  const [p, setP] = useState<Profile | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    requireUser().then((u) => supabase().from('profiles').select('goal, current_score, target_score, test_date, daily_goal, timezone').eq('id', u.id).single())
      .then(({ data, error }) => (error ? setError(error.message) : setP(data as Profile)))
      .catch((e) => setError(e.message))
  }, [])

  const set = (patch: Partial<Profile>) => { setP((x) => x && { ...x, ...patch }); setSaved(false) }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!p) return
    setBusy(true)
    setError('')
    try {
      // save_onboarding writes every field, so the ones this page doesn't edit are sent back unchanged.
      await rpc('save_onboarding', {
        p_goal: p.goal, p_test_date: p.test_date || null, p_current: p.current_score,
        p_target: p.target_score, p_daily_goal: p.daily_goal, p_timezone: p.timezone,
      })
      setSaved(true)
    } catch (e) { setError((e as Error).message) }
    setBusy(false)
  }

  return (
    <Screen wide className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="flex items-center justify-between rounded-2xl border-2 border-border bg-surface p-4">
        <div>
          <h2 className="font-semibold">Theme</h2>
          <p className="text-sm text-text-muted">Switch between light and dark.</p>
        </div>
        <ThemeToggle />
      </section>

      {!p ? (error ? <Alert title="Couldn’t load settings">{error}</Alert> : <p aria-live="polite">Loading…</p>) : (
        <form onSubmit={save} className="space-y-6">
          <fieldset className="rounded-2xl border-2 border-border bg-surface p-4">
            <legend className="px-1 font-semibold">Daily goal</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {DAILY_GOALS.map((g) => (
                <label key={g.pts} className={`flex min-h-12 items-center gap-3 rounded-xl border-2 px-3 ${p.daily_goal === g.pts ? 'border-nav-active-border bg-nav-active' : 'border-border'}`}>
                  <input type="radio" name="daily" checked={p.daily_goal === g.pts} onChange={() => set({ daily_goal: g.pts })} />
                  <span><b>{g.label}</b> · {g.min} min a day ({g.pts} pts)</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-3 rounded-2xl border-2 border-border bg-surface p-4">
            <legend className="px-1 font-semibold">Test date</legend>
            <label className="block">
              <span className="mb-1 block text-sm">Date of your SAT</span>
              <input type="date" value={p.test_date ?? ''} disabled={p.test_date === null}
                onChange={(e) => set({ test_date: e.target.value })}
                className="min-h-12 w-full rounded-xl border-2 border-border bg-surface px-4 disabled:opacity-60" />
            </label>
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={p.test_date === null} onChange={(e) => set({ test_date: e.target.checked ? null : '' })} />
              I don’t have a test date yet
            </label>
          </fieldset>

          {error && <Alert title="Couldn’t save">{error}</Alert>}
          {saved && <p role="status" className="font-semibold">Saved.</p>}
          <Button type="submit" className="w-full" disabled={busy || p.test_date === ''}>Save settings</Button>
        </form>
      )}
    </Screen>
  )
}
