'use client'
import { safeNext } from './auth'
import { clearDraft, readDraft } from './onboardingDraft'
import { rpc, type Home } from './supabase'

/** Once signed in and verified: save onboarding answers waiting in this browser, then pick the next page.
 *  A brand-new account goes to the diagnostic choice; anyone not yet onboarded finishes onboarding first.
 *  Answers left by someone else on a shared browser never overwrite an onboarded account. */
export async function afterSignIn(next?: string | null): Promise<string> {
  const draft = readDraft()
  const home = await rpc<Home>('get_home')
  if (home.profile.onboarded) {
    clearDraft()
    return safeNext(next)
  }
  if (!draft) return '/onboarding'
  await rpc('save_onboarding', draft) // the profile row already exists: the auth trigger made it with the account
  clearDraft()
  return '/start'
}
