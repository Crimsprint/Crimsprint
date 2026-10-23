import { describe, expect, it } from 'vitest'
import { domainRows, skillRow } from '../src/lib/mastery'

const skill = (name: string, domain: string, mastery: number, answered: number) =>
  ({ id: name, name, section: 'rw' as const, domain_id: domain, domain, share: 0.25, mastery, answered, passed: [], counts: {} })

describe('mastery display', () => {
  it('shows "Not started" (null) for unanswered skills instead of the 50% prior', () => {
    expect(skillRow(skill('a', 'D', 0.5, 0), false)).toEqual({ label: 'a', value: null })
    expect(skillRow(skill('a', 'D', 0.62, 3), false)).toEqual({ label: 'a', value: 0.62 })
  })
  it('marks diagnostic-only figures as estimates', () => {
    expect(skillRow(skill('a', 'D', 0.7, 0), true)).toEqual({ label: 'a', value: 0.7, estimated: true })
  })
  it('averages a domain over the skills that have answers', () => {
    const rows = domainRows([skill('a', 'D', 0.8, 4), skill('b', 'D', 0.5, 0), skill('c', 'E', 0.5, 0)], false)
    expect(rows).toEqual([{ label: 'D', value: 0.8 }, { label: 'E', value: null }])
  })
})
