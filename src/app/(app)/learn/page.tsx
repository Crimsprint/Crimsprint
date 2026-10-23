'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Path, type StartArgs } from '@/components/Path'
import { QuestList, type Quest } from '@/components/Quests'
import { CountdownCard, DiagnosticCard, LeagueCard, StatsBar, type LatestMock, type League, type OpenLesson } from '@/components/Rail'
import { Alert, Screen } from '@/components/ui'
import { CURRENCY } from '@/lib/config'
import { buildTrack } from '@/lib/path'
import { ensureUser, rpc, supabase, type Home } from '@/lib/supabase'

type Track = 'rw' | 'math'
const TRACKS: { id: Track; name: string }[] = [{ id: 'rw', name: 'Reading and Writing' }, { id: 'math', name: 'Math' }]

export default function Learn() {
  const router = useRouter()
  const [home, setHome] = useState<Home | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [quests, setQuests] = useState<Quest[]>([])
  const [league, setLeague] = useState<League | null>(null)
  const [mock, setMock] = useState<LatestMock>(null)
  const [openLesson, setOpenLesson] = useState<OpenLesson>(null)
  const [version, setVersion] = useState(0)
  const [track, setTrack] = useState<Track>(() => {
    try { return localStorage.getItem('track') === 'math' ? 'math' : 'rw' } catch { return 'rw' }
  })

  useEffect(() => {
    ensureUser().then(() => rpc<Home>('get_home')).then((h) => {
      if (!h.profile.onboarded) { router.replace('/onboarding'); return }
      setHome(h)
      const sb = supabase()
      return Promise.all([
        rpc<Quest[]>('get_quests').then(setQuests),
        rpc<League>('get_league').then(setLeague),
        sb.from('mocks').select('result').eq('status', 'completed').order('completed_at', { ascending: false }).limit(1)
          .then(({ data }) => setMock(data?.[0]?.result?.total ?? null)),
        // A lesson started in the last day and left unfinished: the stats bar offers to resume it.
        sb.from('sessions').select('id, mistakes_left').eq('mode', 'lesson').eq('status', 'active').gt('pos', 0)
          .gt('created_at', new Date(Date.now() - 86_400_000).toISOString()).order('created_at', { ascending: false }).limit(1)
          .then(({ data }) => setOpenLesson(data?.[0] ?? null)),
      ])
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
          <StatsBar home={home} open={openLesson} />
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
      {/* Scrolls on its own when taller than the window, so every card stays reachable while it sticks. */}
      <aside aria-label="Your stats" className="sticky top-6 hidden max-h-[calc(100dvh-3rem)] w-[360px] shrink-0 space-y-4 self-start overflow-y-auto xl:block">
        <StatsBar home={home} open={openLesson} />
        {diagnostic}
        <LeagueCard league={league} />
        {quests.length > 0 && <QuestList quests={quests} id="rail-quests" reward={5} viewAll />}
        <CountdownCard home={home} mock={mock} />
      </aside>
    </div>
  )
}
