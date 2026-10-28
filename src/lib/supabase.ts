'use client'
import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { clearDraft } from './onboardingDraft'
import { EXPIRED_MESSAGE, isAuthFailure, isDeadSession, mayRecover } from './session'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

export const configured = Boolean(url && key)

// The guest-era client kept its session in localStorage (sb-<ref>-auth-token). Sessions now live in cookies, so a token
// left there is stale by definition: remove it when any page that uses Supabase loads.
if (typeof window !== 'undefined') {
  try { Object.keys(localStorage).filter((k) => /^sb-.+-auth-token$/.test(k)).forEach((k) => localStorage.removeItem(k)) } catch {}
}

let client: SupabaseClient | null = null
/** Browser client. The session lives in cookies, so src/proxy.ts can see it and guard routes. */
export function supabase(): SupabaseClient {
  if (!configured) throw new Error('Supabase is not configured. Copy .env.example to .env.local and fill it in.')
  return (client ??= createBrowserClient(url!, key!))
}

/** For signed-in pages. Never creates an account: the proxy already sends visitors without one to /login. */
export async function requireUser(): Promise<User> {
  const { data } = await supabase().auth.getSession()
  const u = data.session?.user
  if (u && !u.is_anonymous) return u
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load so the proxy starts clean
  location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`)
  return new Promise(() => {}) // the page is leaving; don't flash an error first
}

export async function signOut() {
  await supabase().auth.signOut()
  clearDraft() // unfinished onboarding answers belong to whoever signs in next, not to this account
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- drop everything held in memory
  location.assign('/')
}

/** Clears a session the server refused and sends the learner to sign in, at most once a minute (mayRecover).
 *  Never creates an account. */
async function recover(): Promise<never> {
  let storage: Storage | null = null
  try { storage = sessionStorage } catch {}
  if (!mayRecover(storage)) throw new Error(EXPIRED_MESSAGE)
  await supabase().auth.signOut({ scope: 'local' }) // this browser only
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load starts from a clean slate
  location.assign(`/login?expired=1&next=${encodeURIComponent(location.pathname + location.search)}`)
  return new Promise(() => {})
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
