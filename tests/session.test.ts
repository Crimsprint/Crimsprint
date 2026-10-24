import { describe, expect, it } from 'vitest'
import { isAuthFailure, isDeadSession, mayRecover } from '../src/lib/session'

describe('stale sessions', () => {
  it('treats Auth server refusals as dead sessions, but not network failures', () => {
    expect(isDeadSession({ status: 403, code: 'user_not_found', name: 'AuthApiError' })).toBe(true) // user deleted
    expect(isDeadSession({ status: 400, code: 'refresh_token_not_found', name: 'AuthApiError' })).toBe(true)
    expect(isDeadSession({ status: 401, code: 'bad_jwt', name: 'AuthApiError' })).toBe(true)
    expect(isDeadSession({ name: 'AuthSessionMissingError', status: 400 })).toBe(true)
    expect(isDeadSession({ name: 'AuthRetryableFetchError', status: 0 })).toBe(false) // offline
    expect(isDeadSession(null)).toBe(false)
  })

  it('spots database calls refused because of the session', () => {
    expect(isAuthFailure({ message: 'not signed in', code: 'P0001' }, 400)).toBe(true)
    expect(isAuthFailure({ message: 'No suitable key or wrong key type', code: 'PGRST301' }, 401)).toBe(true)
    expect(isAuthFailure({ message: 'JWT expired', code: 'PGRST303' }, 401)).toBe(true)
    expect(isAuthFailure({ message: 'level locked', code: 'P0001' }, 400)).toBe(false)
    expect(isAuthFailure({ message: 'permission denied for function x', code: '42501' }, 403)).toBe(false)
  })

  it('recovers automatically at most once a minute', () => {
    const store = new Map<string, string>()
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
    expect(mayRecover(storage, 1_000_000)).toBe(true)
    expect(mayRecover(storage, 1_030_000)).toBe(false) // a second failure 30 s later: stop, don't loop
    expect(mayRecover(storage, 1_061_000)).toBe(true)
    expect(mayRecover(null)).toBe(false)
  })
})
