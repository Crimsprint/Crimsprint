'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRefreshAvatar } from '@/components/AppShell'
import { Avatar } from '@/components/Avatar'
import { CrownBadge, CrownIcon, useCrownTimeLeft } from '@/components/Crown'
import { Alert, Button, Screen } from '@/components/ui'
import type { AvatarSource } from '@/lib/avatar'
import { EXAM_PROFILES, type Exam } from '@/lib/exams'
import { timeLeft, utcDate } from '@/lib/dates'
import { requireUser, rpc } from '@/lib/supabase'

type Champion = { profile_key: string; name: string; crown_expires_at: string }
type Member = AvatarSource & { profile_key: string; exam_target: Exam; name: string; points: number; me: boolean }
type League = { opted_out: true } | {
  opted_out: false; tier: number; tier_name: string; week_end: string; promote: number; demote: number; members: Member[]; previous_champion: Champion | null
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

function CrownRace({ members, previous }: { members: Member[]; previous: Champion | null }) {
  const left = useCrownTimeLeft(previous?.crown_expires_at)
  const myRank = members.findIndex((member) => member.me)
  const gap = myRank < 0 ? null : members[0].points - members[myRank].points
  return <section aria-labelledby="crown-race" className="flex items-start gap-3 rounded-2xl border-2 border-border bg-surface p-4">
    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-on-primary"><CrownIcon className="size-5" /></span>
    <div>
      <h2 id="crown-race" className="font-bold">Finish #1 this week to earn the crown</h2>
      {gap !== null && <p className="text-sm text-text-muted">
        {myRank === 0 ? 'You’re #1 · 0 points behind'
          : gap === 0 ? 'Tied on points · 1 more point to take the lead'
            : `${gap} ${gap === 1 ? 'point' : 'points'} behind #1`}
      </p>}
      {previous && left && !members.some((member) => member.profile_key === previous.profile_key) && (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm">
          <CrownIcon className="size-4" /> Last week’s champion
          <Link className="font-semibold underline underline-offset-2" href={`/leaderboards/profile?learner=${encodeURIComponent(previous.profile_key)}`}>{previous.name}</Link>
        </p>
      )}
    </div>
  </section>
}

export default function Leaderboards() {
  const [league, setLeague] = useState<League | null>(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const refreshAvatar = useRefreshAvatar()

  useEffect(() => {
    requireUser().then(() => rpc<League>('get_league_v3')).then(setLeague).catch((e) => setError(e.message))
  }, [version])

  async function optOut(v: boolean) {
    try {
      await rpc('set_leagues_opt_out', { p_opt_out: v })
      refreshAvatar()
      setLeague(null)
      setVersion((v) => v + 1)
    } catch (e) { setError((e as Error).message) }
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
      <CrownRace members={league.members} previous={league.previous_champion} />
      <ol className="overflow-hidden rounded-2xl border-2 border-border bg-surface">
        {league.members.map((m, i) => (
          <li key={m.profile_key}>
            {i === downFrom && i > 0 && <Divider up={false} />}
            <Link href={m.me ? '/profile' : `/leaderboards/profile?learner=${encodeURIComponent(m.profile_key)}`}
              className={`flex min-h-14 items-center gap-2 px-3 py-3 hover:bg-nav-active focus-visible:-outline-offset-4 sm:gap-3 sm:px-4 ${m.me ? 'bg-surface-muted font-semibold' : ''}`}>
              <span className="w-6 text-right tabular-nums">{i + 1}</span>
              <Avatar {...m} size={32} />
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate">{m.name}{m.me && ' (you)'}</span>
                <CrownBadge expiresAt={m.crown_expires_at} compact />
                <span className="shrink-0 rounded border border-border px-1 text-[10px] font-semibold text-text-muted">{EXAM_PROFILES[m.exam_target ?? 'sat'].tag}</span>
                {i < upTo && <span className="sr-only">, promotion zone</span>}
                {i >= downFrom && <span className="sr-only">, demotion zone</span>}
              </span>
              <span className="shrink-0 tabular-nums">{m.points} pts</span>
            </Link>
            {i === upTo - 1 && i < n - 1 && <Divider up />}
          </li>
        ))}
      </ol>
      <button onClick={() => optOut(true)} className="text-sm underline">Leave leagues</button>
    </Screen>
  )
}
