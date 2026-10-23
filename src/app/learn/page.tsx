'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Alert, Button, Check, Flame, GoalRing, Lock, ProgressBar, Screen } from '@/components/ui'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ensureUser, rpc, type Home, type Tier } from '@/lib/supabase'

const TIERS: Tier[] = ['easy', 'medium', 'hard']
const SECTIONS = [{ id: 'rw', name: 'Reading and Writing' }, { id: 'math', name: 'Math' }] as const
type Skill = Home['skills'][number]
type Quest = { code: string; title: string; target: number; progress: number; done: boolean }

function nodeState(s: Skill, t: Tier): 'done' | 'current' | 'locked' | 'empty' {
  if (s.passed.includes(t)) return 'done'
  if (!s.counts[t]) return 'empty'
  const prev = TIERS[TIERS.indexOf(t) - 1]
  return !prev || s.passed.includes(prev) ? 'current' : 'locked'
}

export default function Learn() {
  const router = useRouter()
  const [home, setHome] = useState<Home | null>(null)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)
  const [quests, setQuests] = useState<Quest[]>([])

  useEffect(() => {
    ensureUser().then(() => rpc<Home>('get_home')).then((h) => {
      if (!h.profile.onboarded) router.replace('/onboarding')
      else setHome(h)
      return rpc<Quest[]>('get_quests').then(setQuests)
    }).catch((e) => setError(e.message))
  }, [router])

  async function start(args: Record<string, unknown>) {
    setStarting(true)
    setError('')
    try {
      router.push(`/session/${await rpc<string>('start_session', args)}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStarting(false)
    }
  }

  if (!home) return <Screen>{error ? <Alert title="Couldn’t load your path">{error}</Alert> : <p aria-live="polite">Loading your path…</p>}</Screen>

  const { profile } = home
  // Recommended: weakest unfinished unit, weighted by its domain's share of the test.
  const open = home.skills.filter((s) => TIERS.some((t) => nodeState(s, t) === 'current'))
  const recommended = open.sort((a, b) => (1 - b.mastery) * b.share - (1 - a.mastery) * a.share)[0]?.id

  return (
    <Screen className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2" aria-label={`${profile.streak}-day streak`}>
          <span className={`grid size-10 place-items-center rounded-full ${profile.done_today ? 'bg-primary text-on-primary' : 'bg-locked-bg text-on-locked'}`}><Flame className="size-5" /></span>
          <span className="font-semibold">{profile.streak} day{profile.streak === 1 ? '' : 's'}</span>
          {profile.freezes > 0 && <span className="text-sm text-text-muted">· {profile.freezes} freeze{profile.freezes > 1 ? 's' : ''}</span>}
        </div>
        <GoalRing value={home.today_points} goal={profile.daily_goal} />
        <div className="flex items-center gap-2">
          <Link href="/account" className="text-sm font-semibold underline">Save progress</Link>
          <ThemeToggle />
        </div>
      </header>

      <nav aria-label="Main" className="flex gap-2 overflow-x-auto">
        {[['/progress', 'Progress'], ['/leagues', 'Leagues'], ['/mock', 'Mock test']].map(([href, label]) => (
          <Link key={href} href={href} className="rounded-full border-2 border-border bg-surface px-4 py-2 text-sm font-semibold">{label}</Link>
        ))}
      </nav>

      {error && <Alert title="Something went wrong">{error}</Alert>}

      <section className="grid gap-3 sm:grid-cols-2">
        {!home.diagnosed && <Button disabled={starting} onClick={() => start({ p_mode: 'diagnostic' })}>Take the diagnostic</Button>}
        {home.due_reviews > 0 && <Button disabled={starting} onClick={() => start({ p_mode: 'review' })}>Review {home.due_reviews} due</Button>}
        <Button variant="secondary" disabled={starting} onClick={() => start({ p_mode: 'weak' })}>Practice weak skills</Button>
      </section>

      {quests.length > 0 && (
        <section aria-labelledby="quests" className="rounded-2xl border-2 border-border bg-surface p-4">
          <h2 id="quests" className="font-semibold">Daily quests</h2>
          <ul className="mt-3 space-y-3">
            {quests.map((q) => {
              const shown = q.code === 'minutes15' ? [Math.floor(q.progress / 60), 15] : [q.progress, q.target]
              return (
                <li key={q.code} className="flex items-center gap-3">
                  <span className={`grid size-7 shrink-0 place-items-center rounded-full ${q.done ? 'bg-success text-on-success' : 'bg-locked-bg text-on-locked'}`}>
                    {q.done ? <Check className="size-4" /> : null}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm">{q.title}{q.done && <span className="sr-only"> (done)</span>}</p>
                    <ProgressBar value={shown[0]} max={shown[1]} label={`${q.title}: ${shown[0]} of ${shown[1]}`} />
                  </div>
                  <span className="text-xs tabular-nums text-text-muted">{shown[0]}/{shown[1]}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {SECTIONS.map((sec) => {
        const skills = home.skills.filter((s) => s.section === sec.id)
        const domains = [...new Set(skills.map((s) => s.domain))]
        return (
          <section key={sec.id} aria-labelledby={`sec-${sec.id}`} className="space-y-4">
            <h2 id={`sec-${sec.id}`} className="text-xl font-bold">{sec.name}</h2>
            {domains.map((d) => (
              <div key={d} className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">{d}</h3>
                {skills.filter((s) => s.domain === d).map((s) => (
                  <article key={s.id} className="rounded-2xl border-2 border-border bg-surface p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-semibold">{s.name}</h4>
                        {s.id === recommended && <span className="mt-1 inline-block rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-on-primary">Recommended</span>}
                      </div>
                      <span className="shrink-0 text-sm text-text-muted">{Math.round(s.mastery * 100)}% mastery</span>
                    </div>
                    <ol className="mt-4 flex items-center gap-4">
                      {TIERS.map((t) => {
                        const st = nodeState(s, t)
                        const label = `${s.name}, ${t} level: ${{ done: 'completed', current: 'start lesson', locked: 'locked', empty: 'coming soon' }[st]}`
                        return (
                          <li key={t} className="flex flex-col items-center gap-1">
                            <button aria-label={label} title={label} disabled={st === 'locked' || st === 'empty' || starting}
                              onClick={() => start({ p_mode: 'lesson', p_skill: s.id, p_tier: t })}
                              className={`grid size-14 place-items-center rounded-full ${{
                                done: 'bg-success text-on-success',
                                current: 'border-4 border-node-current-ring bg-node-current-bg font-bold',
                                locked: 'bg-locked-bg text-locked',
                                empty: 'bg-locked-bg text-locked opacity-60',
                              }[st]}`}>
                              {st === 'done' ? <Check className="size-6" /> : st === 'current' ? '▶' : <Lock className="size-5" />}
                            </button>
                            <span className="text-xs capitalize text-text-muted">{t}</span>
                          </li>
                        )
                      })}
                      {s.counts.easy && s.counts.medium && s.counts.hard && s.passed.length < 3 ? (
                        <li className="ml-auto">
                          <button disabled={starting} onClick={() => start({ p_mode: 'testout', p_skill: s.id })} className="text-sm font-semibold underline">Test out</button>
                        </li>
                      ) : null}
                    </ol>
                  </article>
                ))}
              </div>
            ))}
          </section>
        )
      })}
    </Screen>
  )
}
