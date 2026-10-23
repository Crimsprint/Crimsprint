'use client'
import { useEffect, useState } from 'react'
import { Alert, Button, Screen } from '@/components/ui'
import { ensureUser, rpc } from '@/lib/supabase'

type League = { opted_out: true } | {
  opted_out: false; tier: number; tier_name: string; week_end: string; promote: number; demote: number
  members: { handle: string; points: number; me: boolean }[]
}

export default function Leagues() {
  const [league, setLeague] = useState<League | null>(null)
  const [error, setError] = useState('')

  const [version, setVersion] = useState(0)
  useEffect(() => {
    ensureUser().then(() => rpc<League>('get_league')).then(setLeague).catch((e) => setError(e.message))
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
  return (
    <Screen wide className="space-y-4">
      <h1 className="text-2xl font-bold">{league.tier_name} League</h1>
      <p className="text-text-muted">
        Ranked by points this week. Ends {new Date(league.week_end + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })}.
        {league.promote > 0 && ` Top ${league.promote} move up.`}{league.demote > 0 && ` Bottom ${league.demote} move down.`}
      </p>
      <ol className="divide-y-2 divide-border overflow-hidden rounded-2xl border-2 border-border bg-surface">
        {league.members.map((m, i) => {
          const zone = i < league.promote && m.points > 0 ? 'up' : league.demote && i >= Math.max(7, n - league.demote) ? 'down' : ''
          return (
            <li key={m.handle} className={`flex items-center gap-3 px-4 py-3 ${m.me ? 'bg-surface-muted font-semibold' : ''}`}>
              <span className="w-6 text-right tabular-nums">{i + 1}</span>
              <span className="flex-1">{m.handle}{m.me && ' (you)'}</span>
              {zone && <span className="text-xs text-text-muted">{zone === 'up' ? '▲ promotion zone' : '▼ relegation zone'}</span>}
              <span className="tabular-nums">{m.points} pts</span>
            </li>
          )
        })}
      </ol>
      <button onClick={() => optOut(true)} className="text-sm underline">Leave leagues</button>
    </Screen>
  )
}
