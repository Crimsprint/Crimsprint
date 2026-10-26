'use client'
import { useEffect, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { Alert, Button, Screen } from '@/components/ui'
import { timeLeft, utcDate } from '@/lib/dates'
import { requireUser, rpc } from '@/lib/supabase'

type Member = { name: string; avatar: string; accessory: string | null; points: number; me: boolean }
type League = { opted_out: true } | {
  opted_out: false; tier: number; tier_name: string; week_end: string; promote: number; demote: number; members: Member[]
}

// Visual only: each row also says its zone in screen-reader text.
function Divider({ up }: { up: boolean }) {
  return (
    <div aria-hidden className="flex items-center gap-3 px-4 py-2">
      <span className={`h-0.5 flex-1 ${up ? 'bg-zone-up' : 'bg-zone-down'}`} />
      <span className={`rounded-full px-3 py-0.5 text-xs font-bold uppercase tracking-wide ${up ? 'bg-primary text-on-primary' : 'bg-locked-bg text-on-locked'}`}>
        {up ? '▲ Promotion zone' : '▼ Demotion zone'}
      </span>
      <span className={`h-0.5 flex-1 ${up ? 'bg-zone-up' : 'bg-zone-down'}`} />
    </div>
  )
}

export default function Leaderboards() {
  const [league, setLeague] = useState<League | null>(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)

  useEffect(() => {
    requireUser().then(() => rpc<League>('get_league')).then(setLeague).catch((e) => setError(e.message))
  }, [version])

  async function optOut(v: boolean) {
    await rpc('set_leagues_opt_out', { p_opt_out: v })
    setLeague(null)
    setVersion((v) => v + 1)
  }

  if (error) return <Screen wide><Alert title="Couldn’t load leagues">{error}</Alert></Screen>
  if (!league) return <Screen wide><p aria-live="polite">Loading…</p></Screen>

  if (league.opted_out) return (
    <Screen wide className="space-y-4">
      <h1 className="text-2xl font-bold">Leagues are off</h1>
      <p className="text-text-muted">You won’t appear on weekly leaderboards.</p>
      <Button onClick={() => optOut(false)}>Join leagues</Button>
    </Screen>
  )

  const n = league.members.length
  // Same zones as join_league: the top 7 with points move up, the bottom 5 (below rank 7) move down.
  const upTo = Math.min(league.promote, league.members.filter((m) => m.points > 0).length)
  const downFrom = league.demote ? Math.max(7, n - league.demote) : n
  return (
    <Screen wide className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">{league.tier_name} League</h1>
        <p className="font-semibold">{timeLeft(utcDate(league.week_end))} left this week</p>
      </div>
      <p className="text-text-muted">
        Ranked by points this week.{league.promote > 0 && ` Top ${league.promote} move up.`}{league.demote > 0 && ` Bottom ${league.demote} move down.`}
      </p>
      <ol className="overflow-hidden rounded-2xl border-2 border-border bg-surface">
        {league.members.map((m, i) => (
          <li key={i}>
            {i === downFrom && i > 0 && <Divider up={false} />}
            <div className={`flex items-center gap-3 px-4 py-3 ${m.me ? 'bg-surface-muted font-semibold' : ''}`}>
              <span className="w-6 text-right tabular-nums">{i + 1}</span>
              <Avatar avatar={m.avatar} accessory={m.accessory} size={40} />
              <span className="min-w-0 flex-1 truncate">
                {m.name}{m.me && ' (you)'}
                {i < upTo && <span className="sr-only">, promotion zone</span>}
                {i >= downFrom && <span className="sr-only">, demotion zone</span>}
              </span>
              <span className="tabular-nums">{m.points} pts</span>
            </div>
            {i === upTo - 1 && i < n - 1 && <Divider up />}
          </li>
        ))}
      </ol>
      <button onClick={() => optOut(true)} className="text-sm underline">Leave leagues</button>
    </Screen>
  )
}
