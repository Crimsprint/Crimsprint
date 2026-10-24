// Spotting a stored session that no longer works (deleted user, revoked or wrongly signed token), so the app clears
// it and starts over instead of showing raw errors. No browser or server APIs here.

export const EXPIRED_MESSAGE = 'Your session expired. Let’s get you started again.'

type AuthError = { status?: number; code?: string; name?: string } | null | undefined

/** An Auth server answer meaning the stored session is dead. Network failures are not: keep the session then. */
export function isDeadSession(error: AuthError) {
  if (!error || error.name === 'AuthRetryableFetchError' || error.status === 0) return false
  return error.status === 401 || error.status === 403
    || ['user_not_found', 'session_not_found', 'refresh_token_not_found', 'bad_jwt', 'session_expired'].includes(error.code ?? '')
    || error.name === 'AuthSessionMissingError' || error.name === 'AuthInvalidJwtError'
}

/** A database call refused because of the session: our functions' "not signed in", or PostgREST rejecting the JWT. */
export function isAuthFailure(error: { message?: string; code?: string }, status?: number) {
  return status === 401 || ['PGRST301', 'PGRST302', 'PGRST303'].includes(error.code ?? '')
    || /not signed in|JWT|No suitable key|wrong key type/i.test(error.message ?? '')
}

const KEY = 'session-recovered-at'

/** Allows one automatic recovery a minute, so clearing a session can never become a redirect loop. */
export function mayRecover(storage: Pick<Storage, 'getItem' | 'setItem'> | null, now = Date.now()) {
  try {
    if (!storage || now - Number(storage.getItem(KEY) ?? 0) < 60_000) return false
    storage.setItem(KEY, String(now))
    return true
  } catch {
    return false // storage blocked: don't risk a loop
  }
}
