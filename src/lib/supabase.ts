'use client'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { EXPIRED_MESSAGE, isAuthFailure, isDeadSession, mayRecover } from './session'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

export const configured = Boolean(url && key)

let client: SupabaseClient | null = null
export function supabase(): SupabaseClient {
  if (!configured) throw new Error('Supabase is not configured. Copy .env.example to .env.local and fill it in.')
  return (client ??= createClient(url!, key!))
}

let checked: Promise<User> | null = null

/** Guest-first: reuse the session, or create an anonymous user on first visit.
 *  The stored session is checked with the server once per page load (getUser, not getSession): it can outlive its
 *  user, for example after the account was deleted. A dead one is cleared and the visitor starts fresh.
 *  Concurrent callers share one check, otherwise each would create its own guest account. */
export function ensureUser(): Promise<User> {
  return (checked ??= (async () => {
    const sb = supabase()
    const { data, error: readError } = await sb.auth.getSession()
    if (data.session) {
      const { data: u, error } = await sb.auth.getUser()
      if (u.user && !error) return u.user
      if (!isDeadSession(error)) throw new Error('Couldn’t reach the server. Check your connection and try again.')
    }
    if (data.session || readError) await sb.auth.signOut({ scope: 'local' }) // drop the dead token from this browser only
    const { data: anon, error } = await sb.auth.signInAnonymously()
    if (error) throw new Error('Couldn’t start. Please try again.')
    return anon.user!
  })().catch((e) => { checked = null; throw e }))
}

/** Clears a session the server refused and restarts the flow, at most once a minute (see mayRecover). */
async function recover(): Promise<never> {
  let storage: Storage | null = null
  try { storage = sessionStorage } catch {}
  if (!mayRecover(storage)) throw new Error(EXPIRED_MESSAGE)
  await supabase().auth.signOut({ scope: 'local' })
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load starts from a clean slate
  location.assign('/?expired=1')
  return new Promise(() => {}) // the page is leaving; don't flash an error first
}

/** On any failed call, ask the Auth server whether the session still exists (an account deleted mid-visit can surface
 *  as an ordinary database error, not just "not signed in"). Only runs on errors, so it costs nothing normally. */
async function sessionIsDead() {
  const { error } = await supabase().auth.getUser()
  return isDeadSession(error)
}

export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error, status } = await supabase().rpc(fn, args)
  if (error) {
    if (isAuthFailure(error, status) || await sessionIsDead()) await recover()
    throw new Error(error.message)
  }
  return data as T
}

export type Home = {
  profile: { onboarded: boolean; daily_goal: number; target_score: number | null; test_date: string | null; freezes: number; coins: number; streak: number; done_today: boolean }
  today_points: number
  due_reviews: number
  diagnosed: boolean
  skills: {
    id: string; name: string; section: 'rw' | 'math'; domain_id: string; domain: string; share: number
    mastery: number; answered: number; passed: Tier[]; counts: Partial<Record<Tier, number>>
  }[]
  units: Record<string, { practice_done: boolean; chest_claimed: boolean; test_passed: boolean }>
}
export type Tier = 'easy' | 'medium' | 'hard'

/** get_profile: the profile page and shop. */
export type Profile = {
  display_name: string | null; handle: string; avatar: string; accessory: string | null; joined: string
  coins: number; freezes: number; streak: number; longest_streak: number; total_points: number; league: string | null
  inventory: Record<string, number>; prices: Record<string, number>; achievements: { code: string; earned_at: string }[]
}
