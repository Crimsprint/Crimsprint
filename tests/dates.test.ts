import { describe, expect, it } from 'vitest'
import { daysUntil } from '../src/lib/dates'

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
