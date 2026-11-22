export const EXAM_PROFILES = {
  sat: { label: 'SAT', tag: 'SAT', min: 400, max: 1600 },
  psat: { label: 'PSAT/NMSQT', tag: 'PSAT', min: 320, max: 1520 },
} as const

export type Exam = keyof typeof EXAM_PROFILES

export const EXAM_OPTIONS = (Object.keys(EXAM_PROFILES) as Exam[])
  .map((value) => ({ value, label: EXAM_PROFILES[value].label }))

const SCORE_STEP = 10

export function scoreOptions(exam: Exam) {
  const { min, max } = EXAM_PROFILES[exam]
  return Array.from({ length: (max - min) / SCORE_STEP + 1 }, (_, i) => min + i * SCORE_STEP)
}

export function scoreRangeNote(exam: Exam) {
  const { label, min, max } = EXAM_PROFILES[exam]
  return `The ${label} is scored from ${min} to ${max} in steps of ${SCORE_STEP}.`
}

export const PSAT_SCORE_NOTICE = 'Estimated — not an official College Board score.'
