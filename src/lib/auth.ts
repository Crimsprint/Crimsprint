// Account rules shared by the proxy and the auth screens (no browser or server APIs here).

/** Pages anyone can open: landing, onboarding (answers stay in the browser), and the account screens. */
export function isPublic(path: string) {
  return path === '/' || ['/onboarding', '/signup', '/verify', '/login', '/forgot', '/legal'].some((p) => path === p || path.startsWith(`${p}/`))
}

/** Where to go after signing in: an internal path only (never another site), otherwise /learn. */
export function safeNext(next: string | null | undefined) {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\') || /[\r\n]/.test(next)) return '/learn'
  if (isPublic(next.split('?')[0]) && next !== '/onboarding') return '/learn' // never back into the sign-in screens
  return next
}

/** The email is the login: trimmed and lower-cased, so "Sam@Mail.com " and "sam@mail.com" are one account. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase()

export const MIN_PASSWORD = 8 // also set in Supabase Auth, so the server enforces it
export const RESEND_SECONDS = 60

/** Seconds until another code may be sent. */
export const cooldownLeft = (sentAt: number, now = Date.now()) => Math.max(0, Math.ceil((sentAt + RESEND_SECONDS * 1000 - now) / 1000))

/** Supabase Auth errors in plain words. Sign-in failures never say whether the email has an account. */
export function authMessage(error: { code?: string; message: string }) {
  switch (error.code) {
    case 'invalid_credentials': return 'Email or password is incorrect.'
    case 'email_not_confirmed': return 'Verify your email first: we can send you a new code.'
    case 'otp_expired':
    case 'invalid_otp': return 'That code is wrong or has expired. Check it, or send a new one.'
    case 'weak_password': return `Choose a stronger password: at least ${MIN_PASSWORD} characters.`
    case 'same_password': return 'Choose a password you haven’t used for this account before.'
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit': return 'Too many attempts. Please wait a minute and try again.'
    default: return 'Something went wrong. Please try again.'
  }
}
