'use client'
import Link from 'next/link'
import { NavIcon } from '@/components/AppShell'
import { Button, Flame, GoalRing } from '@/components/ui'
import { CURRENCY } from '@/lib/config'
import { daysUntil } from '@/lib/dates'
import type { Home } from '@/lib/supabase'

export type League = { opted_out: true } | {
  opted_out: false; tier: number; tier_name: string; week_end: string; promote: number; demote: number
  members: { handle: string; points: number; me: boolean }[]
}
/** An unfinished lesson the learner can go back to, with its remaining mistakes. */
export type OpenLesson = { id: string; mistakes_left: number } | null
export type LatestMock = { low: number; high: number } | null

const MISTAKES_PER_LESSON = 5 // start_session's lesson budget (supabase/migrations/0006_learning_path.sql)

const Coin = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v9M9.5 10a2.5 2 0 012.5-1.5c1.4 0 2.5.7 2.5 1.7 0 2.3-5 1.3-5 3.6 0 1 1.1 1.7 2.5 1.7a2.5 2 0 002.5-1.5" /></svg>
)
const Heart = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0112 7.3a4.3 4.3 0 017.5 2.5C19.5 15.4 12 20 12 20z" /></svg>
)

function Stat({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 text-center">
      <div className="flex items-center gap-1.5 text-lg font-bold tabular-nums">{icon}{value}</div>
      <p className="text-xs leading-tight text-text-muted">{label}</p>
    </div>
  )
}

export function StatsBar({ home, open }: { home: Home; open: OpenLesson }) {
  const { profile } = home
  return (
    <section aria-label="Today" className="rounded-2xl border-2 border-border bg-surface p-3">
      <div className="grid grid-cols-4 gap-2">
        <Stat label={`day streak${profile.freezes ? ` · ${profile.freezes} freeze${profile.freezes > 1 ? 's' : ''}` : ''}`} value={profile.streak}
          icon={<span className={`grid size-7 place-items-center rounded-full ${profile.done_today ? 'bg-primary text-on-primary' : 'bg-locked-bg text-on-locked'}`}><Flame className="size-4" /></span>} />
        <Stat label={`of ${profile.daily_goal} pts today`} value={home.today_points} icon={<GoalRing value={home.today_points} goal={profile.daily_goal} size={28} />} />
        <Stat label={open ? 'mistakes left' : 'mistakes per lesson'} value={open ? open.mistakes_left : MISTAKES_PER_LESSON} icon={<Heart className="size-6" />} />
        <Stat label={CURRENCY} value={profile.coins} icon={<Coin className="size-6" />} />
      </div>
      {open && <Link href={`/session/${open.id}`} className="mt-2 block text-center text-sm font-semibold underline">Resume your unfinished lesson</Link>}
    </section>
  )
}

export function DiagnosticCard({ busy, onStart }: { busy: boolean; onStart: () => void }) {
  return (
    <section aria-labelledby="diag" className="space-y-3 rounded-2xl border-2 border-border bg-surface p-4">
      <h2 id="diag" className="font-semibold">Find your starting point</h2>
      <p className="text-sm text-text-muted">A 24-question diagnostic (about 25 minutes) moves you ahead in the units you already know.</p>
      <Button className="w-full" disabled={busy} onClick={onStart}>Take the diagnostic</Button>
    </section>
  )
}

const cardHead = (id: string, title: string, href: string, link: string) => (
  <div className="flex items-baseline justify-between gap-3">
    <h2 id={id} className="font-semibold">{title}</h2>
    <Link href={href} className="text-sm font-bold uppercase tracking-wide underline">{link}</Link>
  </div>
)

export function LeagueCard({ league }: { league: League | null }) {
  if (!league) return null
  if (league.opted_out) return (
    <section aria-labelledby="league" className="space-y-2 rounded-2xl border-2 border-border bg-surface p-4">
      {cardHead('league', 'Leagues', '/leaderboards', 'Join')}
      <p className="text-sm text-text-muted">You’ve left leagues, so you won’t appear on weekly leaderboards.</p>
    </section>
  )
  const n = league.members.length
  const i = league.members.findIndex((m) => m.me)
  if (i < 0) return null
  const me = league.members[i]
  const zone = i < league.promote && me.points > 0 ? 'up' : league.demote && i >= Math.max(7, n - league.demote) ? 'down' : null
  return (
    <section aria-labelledby="league" className="space-y-3 rounded-2xl border-2 border-border bg-surface p-4">
      {cardHead('league', `${league.tier_name} League`, '/leaderboards', 'View league')}
      <div className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary text-on-primary"><NavIcon name="leaderboards" className="size-7" /></span>
        <div>
          <p className="font-semibold">You’re ranked #{i + 1} of {n}</p>
          <p className="text-sm text-text-muted">
            {zone === 'up' ? '▲ In the promotion zone' : zone === 'down' ? '▼ In the demotion zone'
              : me.points === 0 ? 'Earn points this week to climb' : 'Safe for now'} · {me.points} pts
          </p>
        </div>
      </div>
    </section>
  )
}

export function CountdownCard({ home, mock }: { home: Home; mock: LatestMock }) {
  const { test_date, target_score } = home.profile
  const days = test_date ? daysUntil(test_date) : null
  return (
    <section aria-labelledby="countdown" className="space-y-3 rounded-2xl border-2 border-border bg-surface p-4">
      {cardHead('countdown', 'Test countdown', '/progress', 'Progress')}
      {days === null ? (
        <p className="text-sm text-text-muted">No test date yet. <Link href="/settings" className="font-semibold text-text underline">Add one in Settings</Link></p>
      ) : days < 0 ? (
        <p className="text-sm text-text-muted">Your test date has passed. <Link href="/settings" className="font-semibold text-text underline">Update it</Link></p>
      ) : (
        <p><span className="text-3xl font-bold tabular-nums">{days}</span> <span className="text-text-muted">day{days === 1 ? '' : 's'} to your SAT</span></p>
      )}
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-text-muted">Target</dt><dd className="text-lg font-bold">{target_score ?? '–'}</dd></div>
        <div>
          <dt className="text-text-muted">Latest mock</dt>
          <dd className="text-lg font-bold">{mock ? `${mock.low}–${mock.high}` : <Link href="/mock" className="text-sm font-semibold underline">Take one</Link>}</dd>
        </div>
      </dl>
    </section>
  )
}
