import { describe, expect, it } from 'vitest'
import { buildTrack, nodeOffset } from '../src/lib/path'
import type { Home, Tier } from '../src/lib/supabase'

const counts = { easy: 10, medium: 10, hard: 10 }
const skill = (id: string, domain_id: string, passed: Tier[] = []) => ({
  id, name: id, section: 'rw' as const, domain_id, domain: domain_id.toUpperCase(), share: 0.25, mastery: 0.5, answered: 0, passed, counts,
})
function home(skills: ReturnType<typeof skill>[], units: Home['units'] = {}): Home {
  return {
    profile: { onboarded: true, daily_goal: 20, target_score: null, test_date: null, freezes: 0, coins: 0, streak: 0, done_today: false },
    today_points: 0, due_reviews: 0, diagnosed: false, units,
    skills: [...skills, { ...skill('m1', 'math'), section: 'math' }],
  }
}
const states = (u: { nodes: { kind: string; state: string }[] }) => u.nodes.map((n) => `${n.kind[0]}:${n.state[0]}`).join(' ')

describe('buildTrack', () => {
  it('lays out easy → practice → medium → chest → hard → test, with the first lesson current', () => {
    const [a, b] = buildTrack(home([skill('a1', 'a'), skill('a2', 'a'), skill('b1', 'b')]), 'rw')
    expect(a.nodes.map((n) => n.key)).toEqual(['a1:easy', 'a2:easy', 'a:practice', 'a1:medium', 'a2:medium', 'a:chest', 'a1:hard', 'a2:hard', 'a:test'])
    expect(states(a)).toBe('l:c l:l p:l l:l l:l c:l l:l l:l t:a') // the open unit's test can be taken early
    expect(a.nodes[1].lesson).toEqual({ index: 2, count: 6 })
    expect(b.unlocked).toBe(false)
    expect(states(b)).toBe('l:l p:l l:l c:l l:l t:l')
  })

  it('moves "current" along as nodes are finished', () => {
    const [a] = buildTrack(home([skill('a1', 'a', ['easy']), skill('a2', 'a', ['easy'])]), 'rw')
    expect(states(a)).toBe('l:d l:d p:c l:l l:l c:l l:l l:l t:a')
  })

  it('lands diagnostic-placed learners on the chest', () => {
    const [a] = buildTrack(home([skill('a1', 'a', ['easy', 'medium']), skill('a2', 'a', ['easy', 'medium'])],
      { a: { practice_done: true, chest_claimed: false, test_passed: false } }), 'rw')
    expect(states(a)).toBe('l:d l:d p:d l:d l:d c:c l:l l:l t:a')
  })

  it('completes a unit and unlocks the next when its test is passed', () => {
    const [a, b] = buildTrack(home([skill('a1', 'a'), skill('b1', 'b')], { a: { practice_done: false, chest_claimed: false, test_passed: true } }), 'rw')
    expect(a.nodes.every((n) => n.state === 'done')).toBe(true)
    expect(a.progress).toBe(1)
    expect(b.unlocked).toBe(true)
    expect(states(b)).toBe('l:c p:l l:l c:l l:l t:a')
  })

  it('keeps tracks separate', () => {
    const [m] = buildTrack(home([skill('a1', 'a')]), 'math')
    expect(m).toMatchObject({ id: 'math', number: 1, unlocked: true })
    expect(m.nodes[0].state).toBe('current')
  })

  it('zig-zags symmetrically', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(nodeOffset)).toEqual([0, 49, 70, 49, 0, -49, -70, -49])
  })
})
