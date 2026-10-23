'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Alert, Button, Screen } from '@/components/ui'
import { requireUser, rpc } from '@/lib/supabase'

type Practice = { due_reviews: number; mistakes: number; timer_passes: number }
// SAT pace (docs/sat-spec.md §2), matching start_session's drill deadline.
const DRILLS = [{ section: 'rw', name: 'Reading and Writing', secs: 71 }, { section: 'math', name: 'Math', secs: 95 }] as const
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border-2 border-border bg-surface p-4">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  )
}

export default function PracticePage() {
  const router = useRouter()
  const [p, setP] = useState<Practice | null>(null)
  const [pass, setPass] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    requireUser().then(() => rpc<Practice>('get_practice')).then(setP).catch((e) => setError(e.message))
  }, [])

  async function start(args: Record<string, unknown>) {
    setBusy(true)
    setError('')
    try { router.push(`/session/${await rpc<string>('start_session', args)}`) } catch (e) { setError((e as Error).message); setBusy(false) }
  }

  const n = (x: number, one: string) => `${x} ${one}${x === 1 ? '' : 's'}`
  return (
    <Screen wide className="space-y-4">
      <h1 className="text-2xl font-bold">Practice</h1>
      {error && <Alert title="Something went wrong">{error}</Alert>}

      <Card title="Practice weak skills">
        <p className="text-sm text-text-muted">8 questions from your two lowest-mastery skills, pitched at your level.</p>
        <Button className="w-full" disabled={busy} onClick={() => start({ p_mode: 'weak' })}>Start</Button>
      </Card>

      <Card title="Review mistakes">
        <p className="text-sm text-text-muted">
          {p === null ? 'Checking…' : p.mistakes ? `${n(p.mistakes, 'question')} you last got wrong. Each one comes back until you get it right (up to 15 per session).`
            : 'No mistakes to review. Anything you miss lands here.'}
        </p>
        <Button className="w-full" variant="secondary" disabled={busy || !p?.mistakes} onClick={() => start({ p_mode: 'mistakes' })}>Review mistakes</Button>
      </Card>

      <Card title="Timed drill">
        <p className="text-sm text-text-muted">10 medium and hard questions at real SAT pace. The drill ends when the clock runs out.</p>
        {!!p?.timer_passes && (
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={pass} onChange={(e) => setPass(e.target.checked)} />
            Use a timer pass for +50% time ({p.timer_passes} left)
          </label>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {DRILLS.map((d) => (
            <Button key={d.section} disabled={busy} onClick={() => start({ p_mode: 'drill', p_section: d.section, p_pass: pass })}>
              {d.name} · {mmss(10 * d.secs * (pass ? 1.5 : 1))}
            </Button>
          ))}
        </div>
      </Card>

      <Card title="Spaced review">
        <p className="text-sm text-text-muted">{p === null ? 'Checking…' : p.due_reviews ? `${n(p.due_reviews, 'question')} due for another look.` : 'Nothing due right now.'}</p>
        <Button className="w-full" variant="secondary" disabled={busy || !p?.due_reviews} onClick={() => start({ p_mode: 'review' })}>Review {p?.due_reviews || ''} due</Button>
      </Card>
    </Screen>
  )
}
