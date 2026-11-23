'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { CrownBadge, CrownCount } from '@/components/Crown'
import { Screen } from '@/components/ui'
import { ACHIEVEMENTS } from '@/lib/achievements'
import type { AvatarSource } from '@/lib/avatar'
import { requireUser, rpc } from '@/lib/supabase'

type LeagueProfile = {
  display_name: string
  avatar: AvatarSource
  crown_expires_at: string | null
  league_tier: string
  streak: number
  crowns_won: number
  achievements: string[]
}

function LeagueProfilePage({ handle }: { handle: string }) {
  const validHandle = /^learner-[0-9a-f]{8}$/.test(handle)
  const [profile, setProfile] = useState<LeagueProfile | null | undefined>(validHandle ? undefined : null)
  useEffect(() => {
    if (!validHandle) return
    let active = true
    requireUser().then(() => rpc<LeagueProfile | null>('get_public_league_profile', { p_profile_key: handle }))
      .then((value) => { if (active) setProfile(value) })
      .catch(() => { if (active) setProfile(null) })
    return () => { active = false }
  }, [handle, validHandle])

  const back = <Link href="/leaderboards" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">← Leaderboards</Link>
  if (profile === undefined) return <Screen wide>{back}<p role="status">Loading…</p></Screen>
  if (!profile) return <Screen wide>{back}<h1 className="text-2xl font-bold">Profile unavailable</h1></Screen>

  const earned = profile.achievements.map((code) => ACHIEVEMENTS[code]).filter(Boolean)
  return <Screen wide className="space-y-6">
    {back}
    <header className="flex items-center gap-4">
      <Avatar {...profile.avatar} crown_expires_at={profile.crown_expires_at} size={96} />
      <div className="min-w-0">
        <h1 className="break-words text-2xl font-bold">{profile.display_name}</h1>
        <CrownBadge expiresAt={profile.crown_expires_at} />
      </div>
    </header>
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div className="rounded-xl border-2 border-border bg-surface p-4">
        <dt className="text-sm text-text-muted">League tier</dt>
        <dd className="text-xl font-bold">{profile.league_tier}</dd>
      </div>
      <div className="rounded-xl border-2 border-border bg-surface p-4">
        <dt className="text-sm text-text-muted">Current streak</dt>
        <dd className="text-xl font-bold">{profile.streak} {profile.streak === 1 ? 'day' : 'days'}</dd>
      </div>
      <CrownCount count={profile.crowns_won} />
    </dl>
    <section aria-labelledby="earned-achievements" className="space-y-3">
      <h2 id="earned-achievements" className="text-xl font-bold">Achievements</h2>
      {earned.length ? <ul className="grid grid-cols-2 gap-3">
        {earned.map((item) => <li className="rounded-xl bg-accent p-3 font-semibold text-on-accent" key={item.title}>{item.title}</li>)}
      </ul> : <p className="text-text-muted">No achievements yet.</p>}
    </section>
  </Screen>
}

function LeagueProfileRoute() {
  const handle = useSearchParams().get('learner') ?? ''
  return <LeagueProfilePage key={handle} handle={handle} />
}

export default function PublicLeagueProfile() {
  return <Suspense><LeagueProfileRoute /></Suspense>
}
