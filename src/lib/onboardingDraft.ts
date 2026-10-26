// Onboarding answers wait here, in this browser only, until the account is verified; nothing reaches the database
// before then. The email being verified is kept for the code screen (sessionStorage, never in the URL).

/** The save_onboarding arguments. */
export type Draft = {
  p_goal: string; p_test_date: string | null; p_current: number | null; p_target: number; p_daily_goal: number; p_timezone: string
}

const DRAFT = 'onboarding', EMAIL = 'verify-email'
const get = (s: () => Storage, k: string) => { try { return s().getItem(k) } catch { return null } }
const set = (s: () => Storage, k: string, v: string | null) => { try { if (v === null) s().removeItem(k); else s().setItem(k, v) } catch {} }

export const saveDraft = (d: Draft) => set(() => localStorage, DRAFT, JSON.stringify(d))
export const readDraft = (): Draft | null => { try { return JSON.parse(get(() => localStorage, DRAFT) ?? 'null') } catch { return null } }
export const clearDraft = () => set(() => localStorage, DRAFT, null)

export const savePendingEmail = (email: string) => set(() => sessionStorage, EMAIL, email)
export const pendingEmail = () => get(() => sessionStorage, EMAIL) ?? ''
