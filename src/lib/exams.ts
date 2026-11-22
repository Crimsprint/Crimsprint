export const EXAM_PROFILES = {
  sat: { label: 'SAT', tag: 'SAT', min: 400, max: 1600 },
  psat: { label: 'PSAT/NMSQT', tag: 'PSAT', min: 320, max: 1520 },
} as const

export type Exam = keyof typeof EXAM_PROFILES

export const EXAM_OPTIONS = (Object.keys(EXAM_PROFILES) as Exam[])
  .map((value) => ({ value, label: EXAM_PROFILES[value].label }))

export function scoreOptions(exam: Exam) {
  const { min, max } = EXAM_PROFILES[exam]
  return Array.from({ length: (max - min) / 10 + 1 }, (_, i) => min + i * 10)
}

export const PSAT_SCORE_NOTICE = 'Estimated — not an official College Board score.'
