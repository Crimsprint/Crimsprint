import { describe, expect, it } from 'vitest'
import { daysUntil, nextMidnight, timeLeft, utcDate } from '../src/lib/dates'

describe('daysUntil', () => {
  const today = new Date(2026, 9, 23, 23, 30) // late evening local time must not round up a day
  it('counts whole local days', () => {
    expect(daysUntil('2026-10-23', today)).toBe(0)
    expect(daysUntil('2026-10-24', today)).toBe(1)
    expect(daysUntil('2026-12-05', today)).toBe(43)
    expect(daysUntil('2026-10-20', today)).toBe(-3)
  })
  it('ignores daylight-saving shifts', () => {
    expect(daysUntil('2026-11-02', new Date(2026, 10, 1, 12))).toBe(1) // US clocks change on Nov 1
  })
})

describe('timeLeft', () => {
  const now = new Date('2026-10-23T10:00:00Z')
  it('formats days, hours and minutes', () => {
    expect(timeLeft(new Date('2026-10-25T14:30:00Z'), now)).toBe('2d 4h')
    expect(timeLeft(new Date('2026-10-23T15:12:00Z'), now)).toBe('5h 12m')
    expect(timeLeft(new Date('2026-10-23T10:12:59Z'), now)).toBe('12m')
    expect(timeLeft(new Date('2026-10-22T00:00:00Z'), now)).toBe('0m')
  })
  it('finds the next local midnight and a UTC week end', () => {
    expect(nextMidnight(new Date(2026, 9, 23, 23, 59)).getDate()).toBe(24)
    expect(utcDate('2026-10-26').toISOString()).toBe('2026-10-26T00:00:00.000Z')
  })
})
