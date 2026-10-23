'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Suspense, useEffect, useRef, useState } from 'react'
import { Bars } from '@/components/Bars'
import { MathTools } from '@/components/MathTools'
import { ReportItem } from '@/components/ReportItem'
import { Tex } from '@/components/Tex'
import { Alert, Button, Check, Screen, XIcon } from '@/components/ui'
import { rpc } from '@/lib/supabase'

type Choice = { id: string; text: string }
type Slot = { position: number; response: string | null; flagged: boolean; item: { id: string; kind: 'mcq' | 'spr'; passage: string | null; stem: string; choices: Choice[] | null } }
type Section = { estimate: number; low: number; high: number; correct: number; total: number; seconds_per_q: number }
type Result = {
  sections: { rw: Section; math: Section }; total: { estimate: number; low: number; high: number }
  domains: { domain: string; correct: number; total: number }[]; flagged_wrong: number
}
type State = { status: 'active' | 'break' | 'completed'; stage: number; section: 'rw' | 'math'; module: number; deadline: string; server_now: string; result: Result | null; items: Slot[] | null }
type Reviewed = { stage: number; position: number; response: string | null; correct: boolean; flagged: boolean
  item: { id: string; kind: string; passage: string | null; stem: string; choices: Choice[] | null; answer: string; explanation: string; rationales: Record<string, string>; skill: string } }

const NAMES = { rw: 'Reading and Writing', math: 'Math' }
const BREAK_SECONDS = 600
const fmtClock = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`

function MockRunner() {
  const { id } = useParams<{ id: string }>()
  const [st, setSt] = useState<State | null>(null)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState('')
  const reload = () => setVersion((v) => v + 1)

  useEffect(() => {
    rpc<State>('mock_state', { p_mock: id }).then(setSt).catch((e) => setError(e.message))
  }, [id, version])

  if (error) return <Screen><Alert title="Something went wrong">{error}</Alert><Link href="/mock" className="underline">Back</Link></Screen>
  if (!st) return <Screen><p aria-live="polite">Loading…</p></Screen>
  if (st.status === 'break') return <Break id={id} onDone={reload} />
  if (st.status === 'completed') return <Results id={id} r={st.result!} />
  return <Module key={st.stage} id={id} st={st} onSubmitted={reload} />
}

function Module({ id, st, onSubmitted }: { id: string; st: State; onSubmitted: () => void }) {
  const [slots, setSlots] = useState<Slot[]>(st.items ?? [])
  const [cur, setCur] = useState(0)  // slots.length = review screen
  const [hideTimer, setHideTimer] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  // Server clock minus local clock, so a wrong device clock can't stretch the module.
  const [offset] = useState(() => Date.parse(st.server_now) - Date.now())
  const submitted = useRef(false)
  const saveTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  const left = Math.round((Date.parse(st.deadline) - (now + offset)) / 1000)
  const lowTime = left <= 300

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  async function submit() {
    if (submitted.current) return
    submitted.current = true
    // Flush debounced grid-in saves before grading.
    await Promise.all(Object.entries(saveTimers.current).map(([pos, t]) => {
      clearTimeout(t)
      const s = slots.find((x) => x.position === Number(pos))
      return rpc('mock_answer', { p_mock: id, p_position: Number(pos), p_response: s?.response ?? '' }).catch(() => {})
    }))
    await rpc('mock_submit', { p_mock: id }).catch(() => {})  // the server also closes expired modules itself
    onSubmitted()
  }
  useEffect(() => { if (left <= 0) submit() })  // time's up: auto-submit, like Bluebook

  function setResponse(pos: number, value: string, debounce = false) {
    setSlots((ss) => ss.map((s) => (s.position === pos ? { ...s, response: value } : s)))
    clearTimeout(saveTimers.current[pos])
    const save = () => rpc('mock_answer', { p_mock: id, p_position: pos, p_response: value }).catch(() => {})
    if (debounce) saveTimers.current[pos] = setTimeout(save, 400)
    else save()
  }
  function toggleFlag(pos: number) {
    const s = slots.find((x) => x.position === pos)!
    setSlots((ss) => ss.map((x) => (x.position === pos ? { ...x, flagged: !x.flagged } : x)))
    rpc('mock_flag', { p_mock: id, p_position: pos, p_flagged: !s.flagged }).catch(() => {})
  }

  const slot = slots[cur]
  const unanswered = slots.filter((s) => !s.response).length

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b-2 border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <p className="font-semibold">{NAMES[st.section]} · Module {st.module}</p>
          <div className="flex items-center gap-2">
            {(!hideTimer || lowTime) && <span className="font-mono text-lg tabular-nums" aria-live={lowTime ? 'polite' : 'off'}>{fmtClock(left)}</span>}
            <button onClick={() => setHideTimer(!hideTimer)} disabled={lowTime} className="rounded-lg border-2 border-border px-2 py-1 text-sm disabled:opacity-50">
              {hideTimer && !lowTime ? 'Show timer' : 'Hide timer'}
            </button>
          </div>
        </div>
        {lowTime && <p role="status" className="bg-primary px-4 py-2 text-center font-semibold text-on-primary">5 minutes or less remaining in this module</p>}
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 py-5 pb-28">
        {slot ? (
          <>
            <div className="flex items-center justify-between">
              <p className="font-semibold">Question {cur + 1} of {slots.length}</p>
              <button onClick={() => toggleFlag(slot.position)} aria-pressed={slot.flagged} className={`rounded-lg border-2 px-3 py-1 text-sm font-semibold ${slot.flagged ? 'border-text bg-surface-muted' : 'border-border'}`}>
                {slot.flagged ? '⚑ Marked for review' : '⚐ Mark for review'}
              </button>
            </div>
            {slot.item.passage && <Tex text={slot.item.passage} className="rounded-xl border-2 border-border bg-surface p-4 leading-relaxed" />}
            <Tex text={slot.item.stem} className="text-lg font-semibold leading-relaxed" />
            {st.section === 'math' && <MathTools />}
            {slot.item.kind === 'mcq' ? (
              <fieldset className="space-y-3">
                <legend className="sr-only">Answer choices</legend>
                {slot.item.choices!.map((c) => (
                  <label key={c.id} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 border-border bg-surface px-4 py-3 has-[:checked]:border-text has-[:checked]:bg-surface-muted has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-focus">
                    <input type="radio" name={`q${slot.position}`} className="sr-only" checked={slot.response === c.id} onChange={() => setResponse(slot.position, c.id)} />
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg border-2 border-current font-semibold">{c.id}</span>
                    <Tex text={c.text} className="flex-1" />
                  </label>
                ))}
              </fieldset>
            ) : (
              <label className="block">
                <span className="mb-2 block text-sm text-text-muted">Enter your answer (up to 5 characters, 6 if negative)</span>
                <input inputMode="decimal" autoComplete="off" maxLength={6} value={slot.response ?? ''}
                  onChange={(e) => /^-?[0-9./]*$/.test(e.target.value) && setResponse(slot.position, e.target.value, true)}
                  className="min-h-14 w-40 rounded-xl border-2 border-border bg-surface px-4 text-xl font-semibold" />
              </label>
            )}
          </>
        ) : (
          <section className="space-y-4">
            <h1 className="text-2xl font-bold">Check your work</h1>
            <p className="text-text-muted">{unanswered} unanswered · {slots.filter((s) => s.flagged).length} marked for review. Select a question to go back to it.</p>
            <ol className="grid grid-cols-6 gap-2 sm:grid-cols-9">
              {slots.map((s, i) => (
                <li key={s.position}>
                  <button onClick={() => setCur(i)} aria-label={`Question ${i + 1}${s.response ? ', answered' : ', unanswered'}${s.flagged ? ', marked for review' : ''}`}
                    className={`relative grid size-11 place-items-center rounded-lg border-2 font-semibold ${s.response ? 'border-text bg-surface-muted' : 'border-dashed border-border bg-surface'}`}>
                    {i + 1}{s.flagged && <span aria-hidden className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full bg-text text-[10px] text-bg">⚑</span>}
                  </button>
                </li>
              ))}
            </ol>
            {confirm ? (
              <div className="space-y-3 rounded-xl border-2 border-border bg-surface p-4">
                <p>Submit Module {st.module}? You can’t come back to it.{unanswered > 0 && ` ${unanswered} question${unanswered > 1 ? 's are' : ' is'} unanswered.`}</p>
                <div className="flex gap-3"><Button onClick={submit}>Yes, submit</Button><Button variant="secondary" onClick={() => setConfirm(false)}>Keep working</Button></div>
              </div>
            ) : <Button className="w-full" onClick={() => setConfirm(true)}>Submit module</Button>}
          </section>
        )}
      </main>

      <nav aria-label="Question navigation" className="fixed inset-x-0 bottom-0 border-t-2 border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Button variant="secondary" disabled={cur === 0} onClick={() => setCur(cur - 1)}>Back</Button>
          <button onClick={() => setCur(slots.length)} className="text-sm font-semibold underline">Question {Math.min(cur + 1, slots.length)} of {slots.length} · Review</button>
          <Button disabled={cur >= slots.length} onClick={() => setCur(cur + 1)}>Next</Button>
        </div>
      </nav>
    </div>
  )
}

function Break({ id, onDone }: { id: string; onDone: () => void }) {
  const [left, setLeft] = useState(BREAK_SECONDS)
  const resumed = useRef(false)
  const resume = async () => {
    if (resumed.current) return
    resumed.current = true
    await rpc('mock_resume', { p_mock: id })
    onDone()
  }
  useEffect(() => {
    const t = setInterval(() => setLeft((l) => l - 1), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => { if (left <= 0) resume() })
  return (
    <Screen className="space-y-5 text-center">
      <h1 className="text-2xl font-bold">Break</h1>
      <p className="font-mono text-5xl tabular-nums" aria-live="off">{fmtClock(left)}</p>
      <p className="text-text-muted">Reading and Writing is done. Math starts automatically when the break ends.</p>
      <Button className="w-full" onClick={resume}>Resume testing now</Button>
    </Screen>
  )
}

function Results({ id, r }: { id: string; r: Result }) {
  const [review, setReview] = useState<Reviewed[] | null>(null)
  return (
    <Screen className="space-y-6">
      <Link href="/learn" className="underline">← Back to your path</Link>
      <h1 className="text-2xl font-bold">Mock test results</h1>
      <div className="rounded-2xl bg-primary p-6 text-on-primary">
        <p className="text-sm font-semibold uppercase tracking-wide">Estimated total</p>
        <p className="text-5xl font-bold">{r.total.low}–{r.total.high}</p>
        <p className="mt-2 text-sm">Estimate only, not an official College Board score.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(['rw', 'math'] as const).map((k) => (
          <div key={k} className="rounded-xl border-2 border-border bg-surface p-4">
            <p className="text-sm text-text-muted">{NAMES[k]}</p>
            <p className="text-2xl font-bold">{r.sections[k].low}–{r.sections[k].high}</p>
            <p className="text-sm text-text-muted">{r.sections[k].correct}/{r.sections[k].total} correct · {r.sections[k].seconds_per_q}s per question</p>
          </div>
        ))}
      </div>
      <Bars title="Accuracy by domain" rows={r.domains.map((d) => ({ label: d.domain, value: d.total ? d.correct / d.total : 0 }))} />
      {r.flagged_wrong > 0 && <p>{r.flagged_wrong} question{r.flagged_wrong > 1 ? 's' : ''} you marked for review {r.flagged_wrong > 1 ? 'were' : 'was'} wrong. Your instinct to double-check was right.</p>}
      <p className="text-text-muted">Every missed question was added to your review queue.</p>
      {review ? (
        <ol className="space-y-4">
          {review.map((q, i) => (
            <li key={`${q.stage}-${q.position}`} className="space-y-2 rounded-xl border-2 border-border bg-surface p-4">
              <p className="flex items-center gap-2 font-semibold">
                <span className={`grid size-7 place-items-center rounded-full ${q.correct ? 'bg-success text-on-success' : 'bg-danger text-on-danger'}`}>
                  {q.correct ? <Check className="size-4" /> : <XIcon className="size-4" />}
                </span>
                {i + 1}. {q.correct ? 'Correct' : 'Incorrect'} · {q.item.skill}{q.flagged && ' · ⚑'}
              </p>
              {q.item.passage && <Tex text={q.item.passage} className="text-sm text-text-muted" />}
              <Tex text={q.item.stem} />
              <p className="text-sm">Your answer: <b>{q.response ?? 'blank'}</b> · Correct: <b>{q.item.answer}</b></p>
              {!q.correct && q.response && q.item.rationales[q.response] && <p className="text-sm">{q.item.rationales[q.response]}</p>}
              <details className="text-sm"><summary className="cursor-pointer font-semibold">Explanation</summary><Tex text={q.item.explanation} className="mt-1" /></details>
              <ReportItem itemId={q.item.id} />
            </li>
          ))}
        </ol>
      ) : (
        <Button variant="secondary" className="w-full" onClick={() => rpc<Reviewed[]>('mock_review', { p_mock: id }).then(setReview)}>Review all answers</Button>
      )}
    </Screen>
  )
}

export default function Page() {
  return <Suspense><MockRunner /></Suspense>
}
