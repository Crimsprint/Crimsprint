import type { Exam } from './exams'

// Onboarding answers wait here, in this browser only, until the account is verified; nothing reaches the database
// before then. The email being verified is kept for the code screen (sessionStorage, never in the URL).

/** The save_onboarding_v2 arguments. */
export type Draft = {
  p_exam_target: Exam; p_goal: string; p_test_date: string | null; p_current: number | null; p_target: number; p_daily_goal: number; p_timezone: string
}

const DRAFT = 'onboarding', EMAIL = 'verify-email'
const get = (s: () => Storage, k: string) => { try { return s().getItem(k) } catch { return null } }
const set = (s: () => Storage, k: string, v: string | null) => { try { if (v === null) s().removeItem(k); else s().setItem(k, v) } catch {} }

const DRAFT_MAX_AGE = 24 * 60 * 60 * 1000

export const saveDraft = (draft: Draft) => set(() => localStorage, DRAFT, JSON.stringify({ draft, savedAt: Date.now() }))
export const readDraft = (): Draft | null => {
  try {
    const stored = JSON.parse(get(() => localStorage, DRAFT) ?? 'null')
    const age = Date.now() - stored?.savedAt
    if (!Number.isFinite(stored?.savedAt) || age < 0 || age >= DRAFT_MAX_AGE ||
        !stored.draft || typeof stored.draft !== 'object' || Array.isArray(stored.draft)) return null
    return stored.draft
  } catch { return null }
}
export const clearDraft = () => set(() => localStorage, DRAFT, null)

export const savePendingEmail = (email: string) => set(() => sessionStorage, EMAIL, email)
export const pendingEmail = () => get(() => sessionStorage, EMAIL) ?? ''
