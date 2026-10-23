// Onboarding answers from a signed-out visitor wait here (this browser only) until Google sign-in; nothing is sent to
// the database before then. /auth/finish saves them in one write and clears them.
const KEY = 'onboarding'

/** The save_onboarding arguments. */
export type Draft = {
  p_goal: string; p_test_date: string | null; p_current: number | null; p_target: number; p_daily_goal: number; p_timezone: string
}

export function saveDraft(d: Draft) {
  try { localStorage.setItem(KEY, JSON.stringify(d)) } catch {}
}

export function readDraft(): Draft | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') } catch { return null }
}

export function clearDraft() {
  try { localStorage.removeItem(KEY) } catch {}
}
