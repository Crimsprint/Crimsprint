import { describe, expect, it } from 'vitest'
import { isPublic, safeNext } from '../src/lib/auth'

describe('route rules', () => {
  it('keeps only the landing, onboarding, sign-in and callback pages public', () => {
    for (const p of ['/', '/onboarding', '/login', '/auth/callback', '/legal/privacy']) expect(isPublic(p), p).toBe(true)
    for (const p of ['/learn', '/session/abc', '/practice', '/mock', '/mock/1', '/leaderboards', '/quests', '/shop', '/profile',
      '/progress', '/diagnostic', '/settings', '/help', '/admin', '/auth/finish', '/onboardingx', '/loginx']) expect(isPublic(p), p).toBe(false)
  })

  it('only returns to internal paths after sign-in', () => {
    expect(safeNext('/practice?x=1')).toBe('/practice?x=1')
    expect(safeNext('/diagnostic')).toBe('/diagnostic')
    for (const bad of [null, '', 'https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '/learn\r\nSet-Cookie: x',
      '/login', '/login?next=/learn', '/auth/callback?code=1']) expect(safeNext(bad), String(bad)).toBe('/learn')
  })
})
