// The learning path: each domain is a unit; a unit runs easy lessons → practice → medium lessons → chest → hard lessons → unit test
// (supabase/migrations/0006_learning_path.sql). R&W and Math are separate tracks, and within a track passing a unit's test
// unlocks the next unit. Only the first unfinished node in a track is "current"; the open unit's test is "available" (test out).
import type { Home, Tier } from './supabase'

export type NodeKind = 'lesson' | 'practice' | 'chest' | 'test'
export type NodeState = 'done' | 'current' | 'available' | 'locked'
export type PathNode = {
  key: string; kind: NodeKind; state: NodeState
  skillId?: string; skillName?: string; tier?: Tier
  lesson?: { index: number; count: number }
}
export type Unit = { id: string; number: number; title: string; unlocked: boolean; progress: number; nodes: PathNode[] }

const NO_PROGRESS = { practice_done: false, chest_claimed: false, test_passed: false }

export function buildTrack(home: Home, section: 'rw' | 'math'): Unit[] {
  const skills = home.skills.filter((s) => s.section === section) // already in taxonomy order
  let open = true
  let currentFound = false
  return [...new Set(skills.map((s) => s.domain_id))].map((domain, i) => {
    const ss = skills.filter((s) => s.domain_id === domain)
    const u = home.units[domain] ?? NO_PROGRESS
    const unlocked = open
    const lessons = (tier: Tier) => ss.filter((s) => s.counts[tier]).map((s) => ({
      key: `${s.id}:${tier}`, kind: 'lesson' as const, skillId: s.id, skillName: s.name, tier, done: s.passed.includes(tier),
    }))
    const steps = [
      ...lessons('easy'), { key: `${domain}:practice`, kind: 'practice' as const, done: u.practice_done },
      ...lessons('medium'), { key: `${domain}:chest`, kind: 'chest' as const, done: u.chest_claimed },
      ...lessons('hard'), { key: `${domain}:test`, kind: 'test' as const, done: false },
    ]
    const count = steps.filter((n) => n.kind === 'lesson').length
    let index = 0
    const nodes: PathNode[] = steps.map(({ done, ...n }) => {
      let state: NodeState
      if (u.test_passed || done) state = 'done' // passing the unit test completes the whole unit
      else if (unlocked && !currentFound) { state = 'current'; currentFound = true }
      else if (unlocked && n.kind === 'test') state = 'available'
      else state = 'locked'
      return { ...n, state, ...(n.kind === 'lesson' && { lesson: { index: ++index, count } }) }
    })
    open = u.test_passed
    return { id: domain, number: i + 1, title: ss[0].domain, unlocked, progress: nodes.filter((n) => n.state === 'done').length / nodes.length, nodes }
  })
}

/** Horizontal offset in px for the zig-zag: 0, 49, 70, 49, 0, -49, -70, -49, … */
export const nodeOffset = (i: number) => Math.round(Math.sin((i * Math.PI) / 4) * 70)
