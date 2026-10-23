// Mastery shown to learners. A skill nobody has answered sits at the model's 50% prior, which reads as real progress,
// so it shows as "Not started" (value null), or as a ~estimate when the diagnostic seeded it.
import type { BarRow } from '@/components/Bars'
import type { Home } from './supabase'

type Skill = Home['skills'][number]

export const skillRow = (s: Skill, diagnosed: boolean): BarRow =>
  s.answered > 0 ? { label: s.name, value: s.mastery } : diagnosed ? { label: s.name, value: s.mastery, estimated: true } : { label: s.name, value: null }

/** Per domain: the mean over skills with answers; otherwise the diagnostic estimate; otherwise not started. */
export function domainRows(skills: Skill[], diagnosed: boolean): BarRow[] {
  return [...new Set(skills.map((s) => s.domain))].map((d) => {
    const ss = skills.filter((s) => s.domain === d)
    const started = ss.filter((s) => s.answered > 0)
    const mean = (xs: Skill[]) => xs.reduce((a, s) => a + s.mastery, 0) / xs.length
    if (started.length) return { label: d, value: mean(started) }
    return diagnosed ? { label: d, value: mean(ss), estimated: true } : { label: d, value: null }
  })
}
