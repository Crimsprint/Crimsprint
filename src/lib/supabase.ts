'use client'
import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient, User } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

export const configured = Boolean(url && key)

let client: SupabaseClient | null = null
/** Browser client. The session lives in cookies, so src/proxy.ts can see it and guard routes. */
export function supabase(): SupabaseClient {
  if (!configured) throw new Error('Supabase is not configured. Copy .env.example to .env.local and fill it in.')
  return (client ??= createBrowserClient(url!, key!))
}

/** The signed-in Google user, or null. Never creates an account: guests get nothing in the database. */
export async function currentUser(): Promise<User | null> {
  const { data } = await supabase().auth.getSession()
  const u = data.session?.user
  return u && !u.is_anonymous ? u : null
}

/** For signed-in pages. The proxy already redirects guests; if a session expires mid-visit, send them to sign in. */
export async function requireUser(): Promise<User> {
  const u = await currentUser()
  if (u) return u
  // A full load, so the proxy and the login page see the expired session cleanly.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`)
  return new Promise(() => {}) // the page is leaving; don't flash an error first
}

export async function signOut() {
  await supabase().auth.signOut()
  // A full load drops everything the signed-in pages held in memory.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  location.assign('/')
}

export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args)
  if (error) throw new Error(error.message)
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
