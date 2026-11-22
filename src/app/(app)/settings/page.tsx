'use client'
import { useEffect, useState } from 'react'
import { useExam } from '@/components/AppShell'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Alert, Button, Screen } from '@/components/ui'
import { EXAM_OPTIONS, EXAM_PROFILES, scoreOptions, type Exam } from '@/lib/exams'
import { DAILY_GOALS } from '@/lib/goals'
import { requireUser, rpc, supabase } from '@/lib/supabase'

type Profile = { exam_target: Exam; goal: string | null; current_score: number | null; target_score: number | null; test_date: string | null; daily_goal: number }

export default function SettingsPage() {
  const { setExam } = useExam()
  const [p, setP] = useState<Profile | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    requireUser().then((u) => supabase().from('profiles').select('exam_target, goal, current_score, target_score, test_date, daily_goal').eq('id', u.id).single())
      .then(({ data, error }) => (error ? setError(error.message) : setP(data as Profile)))
      .catch((e) => setError(e.message))
  }, [])

  const set = (patch: Partial<Profile>) => { setP((x) => x && { ...x, ...patch }); setSaved(false) }

  function changeExam(exam: Exam) {
    if (!p || p.exam_target === exam) return
    const { min, max } = EXAM_PROFILES[exam]
    const target = p.target_score
    const current = p.current_score
    set({
      exam_target: exam,
      target_score: target === null ? null : Math.min(max, Math.max(min, target)),
      current_score: current !== null && current >= min && current <= max ? current : null,
    })
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!p) return
    setBusy(true)
    setError('')
    try {
      // update_exam_settings writes every field, so the ones this page doesn't edit are sent back unchanged.
      await rpc('update_exam_settings', {
        p_exam_target: p.exam_target, p_goal: p.goal, p_test_date: p.test_date || null, p_current: p.current_score,
        p_target: p.target_score, p_daily_goal: p.daily_goal,
      })
      setExam(p.exam_target)
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
          <fieldset className="space-y-3 rounded-2xl border-2 border-border bg-surface p-4" disabled={busy}>
            <legend className="px-1 font-semibold">Which test are you preparing for?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {EXAM_OPTIONS.map(({ value, label }) => (
                <label key={value} className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-border px-3 has-[:checked]:border-nav-active-border has-[:checked]:bg-nav-active">
                  <input type="radio" name="exam" value={value} checked={p.exam_target === value} onChange={() => changeExam(value)} />
                  {label}
                </label>
              ))}
            </div>
            <label className="block">
              <span className="mb-1 block text-sm">Target score</span>
              <select value={p.target_score ?? ''} onChange={(e) => set({ target_score: e.target.value ? Number(e.target.value) : null })}
                className="min-h-12 w-full rounded-xl border-2 border-border bg-surface px-4">
                <option value="">Select…</option>
                {scoreOptions(p.exam_target).map((score) => <option key={score} value={score}>{score}</option>)}
              </select>
            </label>
          </fieldset>

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
              <span className="mb-1 block text-sm">Date of your {EXAM_PROFILES[p.exam_target].label}</span>
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
