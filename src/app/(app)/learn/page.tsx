'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Path, type StartArgs } from '@/components/Path'
import { DailyQuests, type Quest } from '@/components/Quests'
import { Alert, Button, Flame, GoalRing, Screen } from '@/components/ui'
import { CURRENCY } from '@/lib/config'
import { buildTrack } from '@/lib/path'
import { ensureUser, rpc, type Home } from '@/lib/supabase'

type Track = 'rw' | 'math'
const TRACKS: { id: Track; name: string }[] = [{ id: 'rw', name: 'Reading and Writing' }, { id: 'math', name: 'Math' }]

export default function Learn() {
  const router = useRouter()
  const [home, setHome] = useState<Home | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [quests, setQuests] = useState<Quest[]>([])
  const [version, setVersion] = useState(0)
  const [track, setTrack] = useState<Track>(() => {
    try { return localStorage.getItem('track') === 'math' ? 'math' : 'rw' } catch { return 'rw' }
  })

  useEffect(() => {
    ensureUser().then(() => rpc<Home>('get_home')).then((h) => {
      if (!h.profile.onboarded) router.replace('/onboarding')
      else setHome(h)
      return rpc<Quest[]>('get_quests').then(setQuests)
    }).catch((e) => setError(e.message))
  }, [router, version])

  const units = useMemo(() => (home ? buildTrack(home, track) : []), [home, track])

  // Bring the current node into view on load and when switching tracks (not after a chest refresh).
  const scrolledFor = useRef('')
  useEffect(() => {
    if (!units.length || scrolledFor.current === track) return
    scrolledFor.current = track
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    document.querySelector('[data-current]')?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
  }, [units, track])

  function pick(t: Track) {
    setTrack(t)
    try { localStorage.setItem('track', t) } catch {}
  }

  async function start(args: StartArgs) {
    setBusy(true)
    setError('')
    try {
      router.push(`/session/${await rpc<string>('start_session', args)}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  async function claim(domain: string) {
    setBusy(true)
    setError('')
    try {
      const coins = await rpc<number>('claim_chest', { p_domain: domain })
      setNotice(`Chest opened: +${coins} ${CURRENCY}`)
      setVersion((v) => v + 1)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setBusy(false)
  }

  if (!home) return <Screen>{error ? <Alert title="Couldn’t load your path">{error}</Alert> : <p aria-live="polite">Loading your path…</p>}</Screen>

  const diagnostic = !home.diagnosed && <DiagnosticCard busy={busy} onStart={() => start({ p_mode: 'diagnostic' })} />
  return (
    <div className="mx-auto flex w-full max-w-[66rem] flex-1 justify-center gap-12 px-4 py-6">
      <main className="w-full max-w-[600px] space-y-6">
        <h1 className="sr-only">Your learning path</h1>
        <div className="space-y-4 xl:hidden">
          <Stats home={home} />
          {diagnostic}
        </div>

        <div role="group" aria-label="Section" className="grid grid-cols-2 gap-2 rounded-2xl border-2 border-border bg-surface p-1">
          {TRACKS.map((t) => (
            <button key={t.id} aria-pressed={track === t.id} onClick={() => pick(t.id)}
              className={`min-h-11 rounded-xl px-2 text-sm font-bold ${track === t.id ? 'bg-primary text-on-primary' : ''}`}>
              {t.name}
            </button>
          ))}
        </div>

        {error && <Alert title="Something went wrong">{error}</Alert>}
        <p role="status" className={notice ? 'rounded-xl bg-success p-3 font-semibold text-on-success' : 'sr-only'}>{notice}</p>

        <Path units={units} section={track} busy={busy} onStart={start} onClaim={claim} />
      </main>
      <aside aria-label="Your stats" className="sticky top-6 hidden w-[360px] shrink-0 space-y-4 self-start xl:block">
        <Stats home={home} />
        {diagnostic}
        {quests.length > 0 && <DailyQuests quests={quests} />}
      </aside>
    </div>
  )
}

function DiagnosticCard({ busy, onStart }: { busy: boolean; onStart: () => void }) {
  return (
    <section aria-labelledby="diag" className="space-y-3 rounded-2xl border-2 border-border bg-surface p-4">
      <h2 id="diag" className="font-semibold">Find your starting point</h2>
      <p className="text-sm text-text-muted">A 24-question diagnostic (about 25 minutes) moves you ahead in the units you already know.</p>
      <Button className="w-full" disabled={busy} onClick={onStart}>Take the diagnostic</Button>
    </section>
  )
}

const Coin = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v9M9.5 10a2.5 2 0 012.5-1.5c1.4 0 2.5.7 2.5 1.7 0 2.3-5 1.3-5 3.6 0 1 1.1 1.7 2.5 1.7a2.5 2 0 002.5-1.5" /></svg>
)

function Stats({ home }: { home: Home }) {
  const { profile } = home
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-border bg-surface p-3">
      <div className="flex items-center gap-2" aria-label={`${profile.streak}-day streak`}>
        <span className={`grid size-10 place-items-center rounded-full ${profile.done_today ? 'bg-primary text-on-primary' : 'bg-locked-bg text-on-locked'}`}><Flame className="size-5" /></span>
        <span className="font-semibold">{profile.streak} day{profile.streak === 1 ? '' : 's'}</span>
        {profile.freezes > 0 && <span className="text-sm text-text-muted">· {profile.freezes} freeze{profile.freezes > 1 ? 's' : ''}</span>}
      </div>
      <GoalRing value={home.today_points} goal={profile.daily_goal} />
      <p className="flex items-center gap-1.5 font-semibold">
        <Coin className="size-6" />{profile.coins}<span className="sr-only"> {CURRENCY}</span>
      </p>
    </div>
  )
}
