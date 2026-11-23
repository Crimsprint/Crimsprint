import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Draft } from '../src/lib/onboardingDraft'

const { rpc, auth } = vi.hoisted(() => ({
  rpc: vi.fn(),
  auth: { signOut: vi.fn(), onAuthStateChange: vi.fn() },
}))
vi.mock('@supabase/ssr', () => ({ createBrowserClient: () => ({ rpc, auth }) }))

const draft: Draft = {
  p_exam_target: 'psat', p_goal: 'first', p_test_date: null,
  p_current: null, p_target: 1200, p_daily_goal: 20, p_timezone: 'UTC',
}
const epoch = new Date('2026-11-23T00:00:00Z')
const day = 86_400_000

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(epoch)
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:38123')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-key')
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  })
  vi.stubGlobal('location', { assign: vi.fn() })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

it('saves the timestamp and applies a fresh draft to an unfinished profile only', async () => {
  const { saveDraft, readDraft } = await import('../src/lib/onboardingDraft')
  const { afterSignIn } = await import('../src/lib/account')
  rpc.mockResolvedValueOnce({ data: { profile: { onboarded: false } } }).mockResolvedValueOnce({})
  saveDraft(draft)
  expect(JSON.parse(localStorage.getItem('onboarding')!)).toEqual({ draft, savedAt: epoch.getTime() })
  vi.setSystemTime(epoch.getTime() + day - 1)
  expect(await afterSignIn()).toBe('/start')
  expect(rpc).toHaveBeenNthCalledWith(2, 'save_onboarding_v2', draft)
  expect(readDraft()).toBeNull()
})

it.each(['expired', 'legacy', 'future', 'corrupt'])('ignores a %s draft on sign-in', async (type) => {
  const { saveDraft } = await import('../src/lib/onboardingDraft')
  const { afterSignIn } = await import('../src/lib/account')
  rpc.mockResolvedValueOnce({ data: { profile: { onboarded: false } } })
  saveDraft(draft)
  if (type === 'expired') vi.setSystemTime(epoch.getTime() + day)
  if (type === 'future') vi.setSystemTime(epoch.getTime() - 1)
  if (type === 'legacy') localStorage.setItem('onboarding', JSON.stringify(draft))
  if (type === 'corrupt') localStorage.setItem('onboarding', '{')
  expect(await afterSignIn()).toBe('/onboarding')
  expect(rpc).toHaveBeenCalledExactlyOnceWith('get_home', undefined)
})

it('discards a fresh draft for an already onboarded account', async () => {
  const { saveDraft, readDraft } = await import('../src/lib/onboardingDraft')
  const { afterSignIn } = await import('../src/lib/account')
  rpc.mockResolvedValueOnce({ data: { profile: { onboarded: true } } })
  saveDraft(draft)
  expect(await afterSignIn('/progress')).toBe('/progress')
  expect(rpc).toHaveBeenCalledExactlyOnceWith('get_home', undefined)
  expect(readDraft()).toBeNull()
})

it('clears the draft on sign-out and on a sign-out event from another tab', async () => {
  const { saveDraft, readDraft } = await import('../src/lib/onboardingDraft')
  const { signOut } = await import('../src/lib/supabase')
  saveDraft(draft)
  auth.signOut.mockImplementation(async () => expect(readDraft()).toBeNull())
  await signOut()
  expect(location.assign).toHaveBeenCalledWith('/')
  saveDraft(draft)
  auth.onAuthStateChange.mock.calls[0][0]('SIGNED_OUT')
  expect(readDraft()).toBeNull()
})
