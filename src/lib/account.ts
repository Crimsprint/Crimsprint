'use client'
import { safeNext } from './auth'
import { clearDraft, readDraft } from './onboardingDraft'
import { rpc, type Home } from './supabase'

/** Once signed in and verified: save onboarding answers waiting in this browser (one write), then pick the next page.
 *  A brand-new account goes to the diagnostic choice; anyone not yet onboarded finishes onboarding first. */
export async function afterSignIn(next?: string | null): Promise<string> {
  const draft = readDraft()
  if (draft) {
    await rpc('save_onboarding', draft) // the profile row already exists: the auth trigger made it with the account
    clearDraft()
    return '/start'
  }
  const home = await rpc<Home>('get_home')
  return home.profile.onboarded ? safeNext(next) : '/onboarding'
}
