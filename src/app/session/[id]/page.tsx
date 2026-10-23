'use client'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Suspense, useEffect, useRef, useState } from 'react'
import { Alert, Button, Check, ProgressBar, Screen, XIcon } from '@/components/ui'
import { Tex } from '@/components/Tex'
import { MathTools } from '@/components/MathTools'
import { ReportItem } from '@/components/ReportItem'
import { ACHIEVEMENTS } from '@/lib/achievements'
import { rpc, supabase } from '@/lib/supabase'

type Item = {
  id: string; kind: 'mcq' | 'spr'; passage: string | null; stem: string; tier: string; skill: string; section: 'rw' | 'math'
  choices: { id: string; text: string }[] | null
}
type Next = { done: true } | { done: false; index: number; total: number; mode: string; mistakes_left: number | null; item: Item }
type Feedback = { done: boolean; correct?: boolean; correct_answer?: string; explanation?: string; rationale?: string | null; mistakes_left?: number | null }
type Summary = {
  mode: string; status: string; passed: boolean; points: number; correct: number; total: number; ms: number; skill: string | null
  mastery_before: number; mastery_after: number | null; missed: number; streak: number; today_points: number; daily_goal: number
  domains: { domain: string; mastery: number }[] | null
}
const LETTERS = ['A', 'B', 'C', 'D']
// SAT grid-in characters; length is checked by the server (5, or 6 with a minus sign).
const SPR_CHARS = /^-?[0-9./]*$/

function SessionPlayer() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [cur, setCur] = useState<Extract<Next, { done: false }> | null>(null)
  const [answer, setAnswer] = useState('')
  const [fb, setFb] = useState<Feedback | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const shownAt = useRef(0)
  const continueRef = useRef<HTMLButtonElement>(null)

  // Bumped to fetch the next item.
  const [step, setStep] = useState(0)
  const next = () => setStep((n) => n + 1)

  useEffect(() => {
    let live = true
    rpc<Next>('next_item', { p_session: id }).then(async (n) => {
      if (!live) return
      setFb(null)
      setAnswer('')
      if (n.done) {
        setCur(null)
        const sm = await rpc<Summary>('complete_session', { p_session: id })
        if (live) setSummary(sm)
      } else {
        setCur(n)
        shownAt.current = Date.now()
      }
    }).catch((e) => live && setError(e instanceof Error ? e.message : String(e)))
    return () => { live = false }
  }, [id, step])
  useEffect(() => { if (fb) continueRef.current?.focus() }, [fb])

  async function submit() {
    if (!cur || !answer || busy) return
    setBusy(true)
    try {
      const r = await rpc<Feedback>('submit_answer', { p_session: id, p_response: answer, p_ms: Date.now() - shownAt.current })
      if (cur.mode === 'diagnostic') next()  // no feedback during the diagnostic
      else setFb(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (error) return <Screen><Alert title="Something went wrong">{error}</Alert><Link href="/learn" className="mt-4 inline-block underline">Back to your path</Link></Screen>
  if (summary) return <Completion s={summary} sessionId={id} onDone={() => router.push('/learn')} />
  if (!cur) return <Screen><p aria-live="polite">Loading…</p></Screen>

  const { item } = cur
  const letterOf = (choiceId: string) => LETTERS[item.choices?.findIndex((c) => c.id === choiceId) ?? -1]
  const keyText = fb?.correct_answer && item.choices
    ? `${letterOf(fb.correct_answer)}) ${item.choices.find((c) => c.id === fb.correct_answer)?.text}` : fb?.correct_answer

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Bottom padding matches the feedback sheet's max height so it never hides the question. */}
      <Screen className={`flex flex-col gap-5 ${fb ? 'pb-[65dvh]' : 'pb-32'}`}>
        <div className="flex items-center gap-3">
          <Link href="/learn" aria-label="Quit session" className="grid size-10 shrink-0 place-items-center rounded-full"><XIcon className="size-5" /></Link>
          <ProgressBar value={cur.index + (fb ? 1 : 0)} max={cur.total} label={`Question ${cur.index + 1} of ${cur.total}`} />
          {cur.mistakes_left != null && (() => {
            const left = fb?.mistakes_left ?? cur.mistakes_left
            return <span className="shrink-0 text-sm font-semibold" aria-label={`${left} mistakes left`}>{left} ✕ left</span>
          })()}
        </div>
        <p className="text-sm text-text-muted">{cur.mode === 'diagnostic' ? `Diagnostic · ${cur.index + 1} of ${cur.total}` : item.skill} · <span className="capitalize">{item.tier}</span></p>

        {item.passage && <Tex text={item.passage} className="rounded-xl border-2 border-border bg-surface p-4 leading-relaxed" />}
        <Tex text={item.stem} className="text-lg font-semibold leading-relaxed" />
        {item.section === 'math' && <MathTools />}

        {item.kind === 'mcq' ? (
          <fieldset disabled={!!fb} className="space-y-3">
            <legend className="sr-only">Answer choices</legend>
            {item.choices!.map((c, i) => {
              const isKey = fb && c.id === fb.correct_answer
              const isWrongPick = fb && !fb.correct && c.id === answer
              return (
                <label key={c.id} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 has-[:checked]:border-text has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-focus ${
                  isKey ? 'border-success bg-success text-on-success' : isWrongPick ? 'border-border bg-surface-muted' : 'border-border bg-surface'}`}>
                  <input type="radio" name="choice" value={c.id} checked={answer === c.id} onChange={() => setAnswer(c.id)} className="sr-only" />
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg border-2 border-current font-semibold">{LETTERS[i]}</span>
                  <Tex text={c.text} className="flex-1" />
                  {isKey && <><Check className="size-5" /><span className="sr-only">Correct answer</span></>}
                  {isWrongPick && <><XIcon className="size-5" /><span className="sr-only">Your answer</span></>}
                </label>
              )
            })}
          </fieldset>
        ) : (
          <label className="block">
            <span className="mb-2 block text-sm text-text-muted">Enter your answer (up to 5 characters, 6 if negative; fractions like 2/3 or decimals like .6667)</span>
            <input inputMode="decimal" autoComplete="off" maxLength={6} value={answer} disabled={!!fb}
              onChange={(e) => SPR_CHARS.test(e.target.value) && setAnswer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              className="min-h-14 w-40 rounded-xl border-2 border-border bg-surface px-4 text-xl font-semibold" />
          </label>
        )}
      </Screen>

      <div className="fixed inset-x-0 bottom-0 border-t-2 border-border bg-surface">
        <div className="mx-auto max-h-[65dvh] max-w-xl overflow-y-auto px-4 py-4" aria-live="polite">
          {fb ? (
            <div className={`-mx-4 -my-4 px-4 py-4 ${fb.correct ? 'bg-success text-on-success' : ''}`}>
              {!fb.correct && <div className="-mx-4 -mt-4 mb-4 h-2 bg-danger" />}
              <div className="flex items-center gap-3">
                <span className={`grid size-9 place-items-center rounded-full ${fb.correct ? 'bg-on-success text-success' : 'bg-danger text-on-danger'}`}>
                  {fb.correct ? <Check className="size-5" /> : <XIcon className="size-5" />}
                </span>
                <p className="text-xl font-bold">{fb.correct ? 'Correct' : 'Incorrect'}</p>
              </div>
              {!fb.correct && <div className="mt-2"><span className="font-semibold">Correct answer:</span><Tex text={keyText ?? ''} /></div>}
              {!fb.correct && fb.rationale && <p className="mt-2"><span className="font-semibold">Why your choice is wrong: </span>{fb.rationale}</p>}
              <details className="mt-2" open={!fb.correct}>
                <summary className="cursor-pointer font-semibold">Explanation</summary>
                <Tex text={fb.explanation ?? ''} className="mt-1 max-h-40 overflow-y-auto" />
              </details>
              <div className="mt-2"><ReportItem itemId={item.id} /></div>
              <Button ref={continueRef} variant={fb.correct ? 'secondary' : 'primary'} className="mt-3 w-full" onClick={next}>Continue</Button>
            </div>
          ) : (
            <Button className="w-full" disabled={!answer || busy} onClick={submit}>{busy ? 'Checking…' : 'Check'}</Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SessionPage() {
  return <Suspense><SessionPlayer /></Suspense>
}

function Completion({ s, sessionId, onDone }: { s: Summary; sessionId: string; onDone: () => void }) {
  const [earned, setEarned] = useState<string[]>([])
  useEffect(() => {
    // Achievements the triggers awarded during this session.
    supabase().from('sessions').select('created_at').eq('id', sessionId).single()
      .then(({ data }) => data && supabase().from('achievements').select('code').gte('earned_at', data.created_at))
      .then((r) => r?.data && setEarned(r.data.map((a) => a.code)))
  }, [sessionId])
  const mins = Math.floor(s.ms / 60000), secs = Math.round((s.ms % 60000) / 1000)
  const pct = (x: number) => `${Math.round(x * 100)}%`
  const title = s.mode === 'diagnostic' ? 'Diagnostic complete'
    : s.status === 'failed' ? 'Out of mistakes for this lesson'
    : s.passed ? 'Level complete!' : 'Lesson complete'
  return (
    <Screen className="space-y-6">
      <h1 className="text-3xl font-bold">{title}</h1>
      {s.status === 'failed' && <p>No lockout: take a short break, then try the lesson again. Every miss is in your review queue.</p>}
      <dl className="grid grid-cols-2 gap-3">
        {[
          ['Points', `+${s.points}`],
          ['Accuracy', `${s.correct}/${s.total}`],
          ['Time', `${mins}m ${secs}s`],
          ['Avg per question', s.total ? `${Math.round(s.ms / s.total / 1000)}s` : '–'],
          ['Streak', `${s.streak} day${s.streak === 1 ? '' : 's'}`],
          ['Today', `${s.today_points}/${s.daily_goal} pts`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border-2 border-border bg-surface p-4"><dt className="text-sm text-text-muted">{k}</dt><dd className="text-2xl font-bold">{v}</dd></div>
        ))}
      </dl>
      {s.skill && s.mastery_after != null && (
        <p className="rounded-xl bg-surface p-4"><span className="font-semibold">{s.skill}:</span> mastery {pct(s.mastery_before)} → {pct(s.mastery_after)}</p>
      )}
      {s.domains && (
        <section className="space-y-3">
          <h2 className="font-semibold">Starting mastery by domain</h2>
          {s.domains.map((d) => (
            <div key={d.domain}>
              <div className="flex justify-between text-sm"><span>{d.domain}</span><span>{pct(d.mastery)}</span></div>
              <ProgressBar value={Math.round(d.mastery * 100)} max={100} label={`${d.domain} mastery`} />
            </div>
          ))}
        </section>
      )}
      {earned.map((c) => ACHIEVEMENTS[c] && (
        <div key={c} role="status" className="rounded-xl bg-accent p-4 text-on-accent">
          <p className="text-sm uppercase tracking-wide">Achievement unlocked</p>
          <p className="text-xl font-bold">{ACHIEVEMENTS[c].title}</p>
          <p>{ACHIEVEMENTS[c].how}</p>
        </div>
      ))}
      {s.missed > 0 && <p className="text-text-muted">{s.missed} missed question{s.missed > 1 ? 's' : ''} added to your review queue for tomorrow.</p>}
      <Button className="w-full" onClick={onDone} autoFocus>Continue</Button>
    </Screen>
  )
}
