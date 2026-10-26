import { describe, expect, it } from 'vitest'
import { authMessage, cooldownLeft, isPublic, normalizeEmail, safeNext } from '../src/lib/auth'

describe('route rules', () => {
  it('keeps only the landing, onboarding and account screens public', () => {
    for (const p of ['/', '/onboarding', '/signup', '/verify', '/login', '/forgot', '/legal/terms']) expect(isPublic(p), p).toBe(true)
    for (const p of ['/learn', '/start', '/session/abc', '/practice', '/mock', '/mock/1', '/leaderboards', '/quests', '/shop',
      '/profile', '/progress', '/account', '/settings', '/help', '/admin', '/loginx']) expect(isPublic(p), p).toBe(false)
  })

  it('only returns to internal app pages after signing in', () => {
    expect(safeNext('/practice?x=1')).toBe('/practice?x=1')
    for (const bad of [null, '', 'https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '/learn\r\nX: y',
      '/login', '/signup', '/verify', '/forgot']) expect(safeNext(bad), String(bad)).toBe('/learn')
  })
})

describe('account rules', () => {
  it('treats emails case- and space-insensitively', () => {
    expect(normalizeEmail('  Sam.Lee@Example.COM ')).toBe('sam.lee@example.com')
  })

  it('waits 60 seconds between codes', () => {
    expect(cooldownLeft(1_000_000, 1_000_000)).toBe(60)
    expect(cooldownLeft(1_000_000, 1_059_500)).toBe(1)
    expect(cooldownLeft(1_000_000, 1_060_000)).toBe(0)
  })

  it('never says whether an email has an account', () => {
    expect(authMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe('Email or password is incorrect.')
    expect(authMessage({ code: 'otp_expired', message: 'Token has expired or is invalid' })).toMatch(/wrong or has expired/)
    expect(authMessage({ message: 'Database error: users_email_key for x@y.com' })).toBe('Something went wrong. Please try again.')
  })
})
