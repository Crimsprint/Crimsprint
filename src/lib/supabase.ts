'use client'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

export const configured = Boolean(url && key)

let client: SupabaseClient | null = null
export function supabase(): SupabaseClient {
  if (!configured) throw new Error('Supabase is not configured. Copy .env.example to .env.local and fill it in.')
  return (client ??= createClient(url!, key!))
}

let pendingUser: Promise<User> | null = null

/** Guest-first: reuse the session, or create an anonymous user on first visit.
 *  Concurrent callers share one sign-in, otherwise each would create its own guest account. */
export function ensureUser(): Promise<User> {
  return (pendingUser ??= (async () => {
    const sb = supabase()
    const { data } = await sb.auth.getSession()
    if (data.session) return data.session.user
    const { data: anon, error } = await sb.auth.signInAnonymously()
    if (error) throw error
    return anon.user!
  })().finally(() => { pendingUser = null }))
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
