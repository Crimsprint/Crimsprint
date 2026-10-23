// Original SAT-style math item templates. Every answer is computed, then checked by substituting it back (assert).
import assert from 'node:assert/strict'

export type Choice = { id: string; text: string }
export type Item = {
  skill: string
  subskill: string
  tier: 'easy' | 'medium' | 'hard'
  kind: 'mcq' | 'spr'
  passage?: string
  stem: string
  choices?: Choice[]
  answer: { choice: string } | { values: [number, number][]; display: string }
  explanation: string
  rationales: Record<string, string>
}
export type Rng = () => number
export type Template = { skill: string; subskill: string; tier: Item['tier']; make: (r: Rng) => Item | null }

export function mulberry32(seed: number): Rng {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export const int = (r: Rng, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1))
export const nz = (r: Rng, lo: number, hi: number) => { let v = 0; while (v === 0) v = int(r, lo, hi); return v }
export const pick = <T>(r: Rng, xs: T[]) => xs[Math.floor(r() * xs.length)]
export const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b))

export function reduce(n: number, d: number): [number, number] {
  assert(d !== 0)
  const g = gcd(n, d) || 1
  const s = d < 0 ? -1 : 1
  return [(s * n) / g, (s * d) / g]
}
export const fracText = ([n, d]: [number, number]) => (d === 1 ? `${n}` : `${n}/${d}`)
export const fracTex = ([n, d]: [number, number]) => (d === 1 ? `${n}` : `${n < 0 ? '-' : ''}\\frac{${Math.abs(n)}}{${d}}`)
/** " + 5" / " - 5" for appending a signed constant. */
export const sgn = (c: number) => (c < 0 ? ` - ${-c}` : ` + ${c}`)
/** Signed x-term to append, e.g. " - 3x", " + x", "" for 0. */
export const sx = (c: number) => (c === 0 ? '' : `${c < 0 ? ' - ' : ' + '}${Math.abs(c) === 1 ? '' : Math.abs(c)}x`)
/** Linear expression mx + c in TeX, e.g. "-x + 4", "3x". */
export function lin(m: number, c: number) {
  const head = m === 1 ? 'x' : m === -1 ? '-x' : `${m}x`
  return c === 0 ? head : `${head}${sgn(c)}`
}

/** Builds an MCQ with the key at a random letter. Needs exactly 3 distinct distractors different from the key. */
export function mcq(r: Rng, key: string, distractors: [string, string][]): Pick<Item, 'choices' | 'answer' | 'rationales'> | null {
  const uniq: [string, string][] = []
  for (const d of distractors) if (d[0] !== key && !uniq.some((u) => u[0] === d[0])) uniq.push(d)
  if (uniq.length < 3) return null
  const texts = uniq.slice(0, 3)
  const at = int(r, 0, 3)
  texts.splice(at, 0, [key, ''])
  const ids = ['A', 'B', 'C', 'D']
  const rationales: Record<string, string> = {}
  texts.forEach(([, why], i) => { if (i !== at) rationales[ids[i]] = why })
  return { choices: texts.map(([text], i) => ({ id: ids[i], text })), answer: { choice: ids[at] }, rationales }
}
export const m$ = (s: string | number) => `$${s}$`
export const spr = (v: [number, number]): Item['answer'] => {
  const display = fracText(v)
  assert(display.length <= (v[0] < 0 ? 6 : 5), `SPR answer ${display} does not fit the entry field`)
  return { values: [v], display }
}

export const templates: Template[] = [
  // ───── Algebra: linear equations in one variable ─────
  {
    skill: 'math.alg.lin1', subskill: 'math.alg.lin1.solve', tier: 'easy',
    make: (r) => {
      const a = int(r, 2, 9), x = nz(r, -9, 9), b = nz(r, -20, 20), c = a * x + b
      assert.equal(a * x + b, c)
      const m = mcq(r, m$(x), [
        [m$((c + b) / a), `Moves ${b} to the other side without changing its sign.`],
        [m$(c - b), `Isolates ${a}x but forgets to divide by ${a}.`],
        [m$(-x), 'Sign error when solving for x.'],
        [m$(x + a), 'Arithmetic slip after isolating the x-term.'],
      ].filter(([t]) => !t.includes('.')) as [string, string][])
      return m && {
        skill: 'math.alg.lin1', subskill: 'math.alg.lin1.solve', tier: 'easy', kind: 'mcq',
        stem: `If ${m$(`${a}x${sgn(b)} = ${c}`)}, what is the value of ${m$('x')}?`, ...m,
        explanation: `Isolate the x-term: ${m$(`${a}x = ${c}${sgn(-b)} = ${c - b}`)}. Divide both sides by ${a}: ${m$(`x = ${x}`)}.`,
      }
    },
  },
  {
    skill: 'math.alg.lin1', subskill: 'math.alg.lin1.solve', tier: 'medium',
    make: (r) => {
      const a = int(r, 2, 6), q = int(r, 1, 9), p = nz(r, -6, 6), rr = int(r, -20, 20)
      if (a === q) return null
      const x = reduce(rr - a * p, a - q)
      assert.equal(a * (x[0] + p * x[1]), q * x[0] + rr * x[1]) // a(x+p) = qx + r, scaled by the denominator
      if (fracText(x).length > (x[0] < 0 ? 6 : 5)) return null
      return {
        skill: 'math.alg.lin1', subskill: 'math.alg.lin1.solve', tier: 'medium', kind: 'spr',
        stem: `${m$(`${a}(x${sgn(p)}) = ${lin(q, rr)}`)}\n\nWhat is the solution to the given equation?`,
        answer: spr(x), rationales: {},
        explanation: `Distribute: ${m$(`${a}x${sgn(a * p)} = ${lin(q, rr)}`)}. Collect x-terms: ${m$(`${a - q}x = ${rr - a * p}`)}, so ${m$(`x = ${fracTex(x)}`)}.`,
      }
    },
  },
  {
    skill: 'math.alg.lin1', subskill: 'math.alg.lin1.solutions', tier: 'hard',
    make: (r) => {
      const a = int(r, 2, 9), p = int(r, 1, 9), q = nz(r, -15, 15)
      if (q === -a * p) return null
      // With k = a the x-terms cancel, leaving -ap = q, which is false: no solution.
      assert.notEqual(-a * p, q)
      const m = mcq(r, m$(a), [
        [m$(-a), 'Opposite x-coefficients still leave exactly one solution.'],
        [m$(a * p), 'Uses the distributed constant term instead of the x-coefficient.'],
        [m$(q), 'Matches the constants; no solution requires matching x-coefficients with different constants.'],
      ])
      return m && {
        skill: 'math.alg.lin1', subskill: 'math.alg.lin1.solutions', tier: 'hard', kind: 'mcq',
        stem: `${m$(`${a}(x - ${p}) = kx${sgn(q)}`)}\n\nIn the given equation, ${m$('k')} is a constant. For what value of ${m$('k')} does the equation have no solution?`,
        ...m,
        explanation: `Distribute: ${m$(`${a}x - ${a * p} = kx${sgn(q)}`)}. If ${m$(`k = ${a}`)}, the x-terms cancel and the equation becomes ${m$(`-${a * p} = ${q}`)}, which is false, so there is no solution. Any other ${m$('k')} gives exactly one solution.`,
      }
    },
  },
  // ───── Algebra: linear equations in two variables ─────
  {
    skill: 'math.alg.lin2', subskill: 'math.alg.lin2.interpret', tier: 'easy',
    make: (r) => {
      const a = int(r, 2, 9), b = int(r, 2, 9), x0 = nz(r, -5, 9), y0 = nz(r, -9, 9), c = a * x0 + b * y0
      assert.equal(a * x0 + b * y0, c)
      const ds: [string, string][] = [
        [m$(c - a * x0), `Subtracts ${a * x0} but forgets to divide by ${b}.`],
        [m$(-y0), 'Sign error when solving for y.'],
        [m$(y0 + b), 'Arithmetic slip after substituting.'],
      ]
      if ((c + a * x0) % b === 0) ds.unshift([m$((c + a * x0) / b), `Adds ${a * x0} instead of subtracting it.`])
      const m = mcq(r, m$(y0), ds)
      return m && {
        skill: 'math.alg.lin2', subskill: 'math.alg.lin2.interpret', tier: 'easy', kind: 'mcq',
        stem: `${m$(`${a}x + ${b}y = ${c}`)}\n\nIn the given equation, if ${m$(`x = ${x0}`)}, what is the value of ${m$('y')}?`, ...m,
        explanation: `Substitute: ${m$(`${a}(${x0}) + ${b}y = ${c}`)}, so ${m$(`${b}y = ${c - a * x0}`)} and ${m$(`y = ${y0}`)}.`,
      }
    },
  },
  {
    skill: 'math.alg.lin2', subskill: 'math.alg.lin2.model', tier: 'medium',
    make: (r) => {
      const a = int(r, 2, 9), b = int(r, 2, 9), xs = int(r, 5, 30), ys = int(r, 5, 30)
      if (a === b) return null
      const T = a * xs + b * ys
      assert.equal(a * xs + b * ys, T)
      const [things, x1, y1] = pick(r, [['a club fundraiser', 'pens', 'notebooks'], ['a bake sale', 'muffins', 'cookies'], ['a museum', 'student tickets', 'adult tickets']])
      const m = mcq(r, m$(`${a}x + ${b}y = ${T}`), [
        [m$(`${b}x + ${a}y = ${T}`), 'Swaps the two prices.'],
        [m$(`x + y = ${T}`), 'Counts items sold rather than dollars collected.'],
        [m$(`${a + b}(x + y) = ${T}`), 'Assumes every item costs the combined price of both.'],
      ])
      return m && {
        skill: 'math.alg.lin2', subskill: 'math.alg.lin2.model', tier: 'medium', kind: 'mcq',
        stem: `At ${things}, ${x1} cost \\$${a} each and ${y1} cost \\$${b} each. A total of \\$${T} was collected from selling ${m$('x')} ${x1} and ${m$('y')} ${y1}. Which equation represents this situation?`,
        ...m,
        explanation: `Money from ${x1} is ${m$(`${a}x`)} and from ${y1} is ${m$(`${b}y`)}; together they equal ${T}: ${m$(`${a}x + ${b}y = ${T}`)}.`,
      }
    },
  },
  {
    skill: 'math.alg.lin2', subskill: 'math.alg.lin2.interpret', tier: 'hard',
    make: (r) => {
      const a = int(r, 2, 9), b = int(r, 2, 9), d = int(r, 1, 9)
      if (a === b) return null
      const dy = reduce(a * d, b)
      assert.equal(a * d * dy[1], b * dy[0]) // a·Δx = b·Δy keeps ax + by unchanged
      return {
        skill: 'math.alg.lin2', subskill: 'math.alg.lin2.interpret', tier: 'hard', kind: 'spr',
        stem: `${m$(`${a}x + ${b}y = 120`)}\n\nIn the given equation, if ${m$('x')} increases by ${d}, by how much must ${m$('y')} decrease for the equation to remain true?`,
        answer: spr(dy), rationales: {},
        explanation: `Increasing x by ${d} adds ${m$(`${a}\\cdot ${d} = ${a * d}`)} to the left side. To keep the sum at 120, ${m$(`${b}y`)} must drop by ${a * d}, so y decreases by ${m$(fracTex(dy))}.`,
      }
    },
  },
  // ───── Algebra: linear functions ─────
  {
    skill: 'math.alg.linfn', subskill: 'math.alg.linfn.evaluate', tier: 'easy',
    make: (r) => {
      const m = nz(r, -6, 6), c = nz(r, -10, 10), k = nz(r, -5, 6)
      const f = (x: number) => m * x + c
      const ch = mcq(r, m$(f(k)), [
        [m$(m * k - c), 'Uses the wrong sign for the constant term.'],
        [m$(m * (k + c)), 'Adds the constant before multiplying by the slope.'],
        [m$(-f(k)), 'Sign error in the final answer.'],
        [m$(m + c + k), 'Adds the input instead of multiplying by it.'],
      ])
      return ch && {
        skill: 'math.alg.linfn', subskill: 'math.alg.linfn.evaluate', tier: 'easy', kind: 'mcq',
        stem: `The function ${m$('f')} is defined by ${m$(`f(x) = ${lin(m, c)}`)}. What is the value of ${m$(`f(${k})`)}?`, ...ch,
        explanation: `Substitute ${k} for x: ${m$(`f(${k}) = ${m}(${k})${sgn(c)} = ${f(k)}`)}.`,
      }
    },
  },
  {
    skill: 'math.alg.linfn', subskill: 'math.alg.linfn.represent', tier: 'medium',
    make: (r) => {
      const m = nz(r, -5, 5), c = nz(r, -9, 9), x1 = int(r, 1, 3), x2 = x1 + int(r, 1, 4)
      const y1 = m * x1 + c, y2 = m * x2 + c
      const fits = (mm: number, cc: number) => mm * x1 + cc === y1 && mm * x2 + cc === y2
      assert(fits(m, c))
      const ds: [number, number, string][] = [
        [m, y1, `Uses f(${x1}) as the y-intercept.`],
        [c, m, 'Swaps the slope and the y-intercept.'],
        [m, -c, 'Uses the wrong sign for the y-intercept.'],
        [-m, c + 2 * m * x1, 'Uses the wrong sign for the slope.'],
      ]
      const ch = mcq(r, m$(`f(x) = ${lin(m, c)}`), ds.filter(([mm, cc]) => mm !== 0 && !fits(mm, cc)).map(([mm, cc, why]) => [m$(`f(x) = ${lin(mm, cc)}`), why]))
      return ch && {
        skill: 'math.alg.linfn', subskill: 'math.alg.linfn.represent', tier: 'medium', kind: 'mcq',
        stem: `For the linear function ${m$('f')}, ${m$(`f(${x1}) = ${y1}`)} and ${m$(`f(${x2}) = ${y2}`)}. Which equation defines ${m$('f')}?`, ...ch,
        explanation: `Slope: ${m$(`\\frac{${y2} - (${y1})}{${x2} - ${x1}} = ${m}`)}. Then ${m$(`${y1} = ${m}(${x1}) + b`)} gives ${m$(`b = ${c}`)}, so ${m$(`f(x) = ${lin(m, c)}`)}.`,
      }
    },
  },
  {
    skill: 'math.alg.linfn', subskill: 'math.alg.linfn.interpret', tier: 'hard',
    make: (r) => {
      const m = nz(r, -5, 5), c = nz(r, -9, 9), h = nz(r, -4, 4), v = nz(r, -8, 8), k = int(r, -3, 5)
      const f = (x: number) => m * x + c
      const g = (x: number) => f(x - h) + v
      const ans = g(k)
      assert.equal(ans, m * (k - h) + c + v)
      return {
        skill: 'math.alg.linfn', subskill: 'math.alg.linfn.interpret', tier: 'hard', kind: 'spr',
        stem: `The function ${m$('f')} is defined by ${m$(`f(x) = ${lin(m, c)}`)}. The function ${m$('g')} is defined by ${m$(`g(x) = f(x${sgn(-h)})${sgn(v)}`)}. What is the value of ${m$(`g(${k})`)}?`,
        answer: spr([ans, 1]), rationales: {},
        explanation: `${m$(`g(${k}) = f(${k}${sgn(-h)})${sgn(v)} = f(${k - h})${sgn(v)}`)}. Since ${m$(`f(${k - h}) = ${m}(${k - h})${sgn(c)} = ${f(k - h)}`)}, ${m$(`g(${k}) = ${f(k - h)}${sgn(v)} = ${ans}`)}.`,
      }
    },
  },
  // ───── Algebra: systems ─────
  {
    skill: 'math.alg.systems', subskill: 'math.alg.systems.solve', tier: 'easy',
    make: (r) => {
      const m = nz(r, -5, 5), c = nz(r, -9, 9), x0 = nz(r, -6, 6), t = m * x0 + c
      assert.equal(m * x0 + c, t)
      const ds: [string, string][] = [
        [m$(t), 'Gives the y-value of the solution instead of the x-value.'],
        [m$(t - c), `Subtracts ${c} but forgets to divide by ${m}.`],
        [m$(-x0), 'Sign error when solving for x.'],
      ]
      if ((t + c) % m === 0) ds.unshift([m$((t + c) / m), `Adds ${c} instead of subtracting it.`])
      const ch = mcq(r, m$(x0), ds)
      return ch && {
        skill: 'math.alg.systems', subskill: 'math.alg.systems.solve', tier: 'easy', kind: 'mcq',
        stem: `${m$(`y = ${lin(m, c)}`)}\n\n${m$(`y = ${t}`)}\n\nThe solution to the given system of equations is ${m$('(x, y)')}. What is the value of ${m$('x')}?`, ...ch,
        explanation: `Set the expressions for y equal: ${m$(`${lin(m, c)} = ${t}`)}, so ${m$(`${m}x = ${t - c}`)} and ${m$(`x = ${x0}`)}.`,
      }
    },
  },
  {
    skill: 'math.alg.systems', subskill: 'math.alg.systems.solve', tier: 'medium',
    make: (r) => {
      const a = nz(r, -5, 5), b = nz(r, -5, 5), c = nz(r, -5, 5), d = nz(r, -5, 5)
      if (a * d - b * c === 0) return null
      const x0 = nz(r, -6, 6), y0 = nz(r, -6, 6), e = a * x0 + b * y0, f = c * x0 + d * y0
      // Cramer's rule recovers the planted solution.
      const det = a * d - b * c
      assert.equal((e * d - b * f) / det, x0)
      assert.equal((a * f - e * c) / det, y0)
      const eq = (p: number, q: number, rhs: number) => `${lin(p, 0)} ${q < 0 ? '-' : '+'} ${Math.abs(q) === 1 ? '' : Math.abs(q)}y = ${rhs}`
      return {
        skill: 'math.alg.systems', subskill: 'math.alg.systems.solve', tier: 'medium', kind: 'spr',
        stem: `${m$(eq(a, b, e))}\n\n${m$(eq(c, d, f))}\n\nThe solution to the given system of equations is ${m$('(x, y)')}. What is the value of ${m$('x + y')}?`,
        answer: spr([x0 + y0, 1]), rationales: {},
        explanation: `Solving by elimination gives ${m$(`x = ${x0}`)} and ${m$(`y = ${y0}`)} (check: ${m$(`${a}(${x0}) + ${b}(${y0}) = ${e}`)} and ${m$(`${c}(${x0}) + ${d}(${y0}) = ${f}`)}). So ${m$(`x + y = ${x0 + y0}`)}.`,
      }
    },
  },
  {
    skill: 'math.alg.systems', subskill: 'math.alg.systems.solutions', tier: 'hard',
    make: (r) => {
      const a = int(r, 2, 7), b = int(r, 2, 7), c = int(r, 5, 30), d = int(r, 5, 70)
      if (d === 2 * c) return null
      const k = 2 * a
      assert.equal(a * (2 * b) - b * k, 0) // parallel lines
      assert.notEqual(d, 2 * c) // distinct lines → no solution
      const ch = mcq(r, m$(k), [
        [m$(a), 'Does not scale the x-coefficient to match the doubled y-coefficient.'],
        [m$(-k), 'Opposite coefficients make the lines intersect.'],
        [m$(2 * b), 'Doubles the wrong coefficient.'],
        [m$(a * b), 'Multiplies the coefficients instead of matching their ratio.'],
      ])
      return ch && {
        skill: 'math.alg.systems', subskill: 'math.alg.systems.solutions', tier: 'hard', kind: 'mcq',
        stem: `${m$(`${a}x + ${b}y = ${c}`)}\n\n${m$(`kx + ${2 * b}y = ${d}`)}\n\nIn the given system of equations, ${m$('k')} is a constant. For what value of ${m$('k')} does the system have no solution?`,
        ...ch,
        explanation: `A system has no solution when the lines are parallel but distinct. The y-coefficient doubled (${b} → ${2 * b}), so the x-coefficient must double too: ${m$(`k = ${k}`)}. Then the left side is twice the first equation's, but ${m$(`${d} \\ne 2(${c})`)}, so the lines never meet.`,
      }
    },
  },
  // ───── Algebra: linear inequalities ─────
  {
    skill: 'math.alg.ineq', subskill: 'math.alg.ineq.solve', tier: 'easy',
    make: (r) => {
      const a = int(r, 2, 9), q = nz(r, -8, 8), b = nz(r, -15, 15), c = a * q + b
      assert.equal((c - b) / a, q)
      const ds: [string, string][] = [
        [m$(`x > ${q}`), 'Reverses the inequality; dividing by a positive number keeps its direction.'],
        [m$(`x \\le ${q}`), 'Includes the boundary, but the original inequality is strict.'],
        [m$(`x < ${c - b}`), `Forgets to divide by ${a}.`],
      ]
      const ch = mcq(r, m$(`x < ${q}`), ds)
      return ch && {
        skill: 'math.alg.ineq', subskill: 'math.alg.ineq.solve', tier: 'easy', kind: 'mcq',
        stem: `Which inequality is equivalent to ${m$(`${a}x${sgn(b)} < ${c}`)}?`, ...ch,
        explanation: `Subtract ${b}: ${m$(`${a}x < ${c - b}`)}. Divide by ${a} (positive, so the sign stays): ${m$(`x < ${q}`)}.`,
      }
    },
  },
  {
    skill: 'math.alg.ineq', subskill: 'math.alg.ineq.solve', tier: 'medium',
    make: (r) => {
      const a = int(r, 2, 9), q = nz(r, -8, 8), b = nz(r, -15, 15), c = b - a * q // -ax + b ≥ c ⇔ x ≤ q
      assert.equal((b - c) / a, q)
      const ch = mcq(r, m$(`x \\le ${q}`), [
        [m$(`x \\ge ${q}`), `Forgets to reverse the inequality when dividing by ${-a}.`],
        [m$(`x \\le ${-q}`), 'Sign error when moving the constant.'],
        [m$(`x \\ge ${-q}`), 'Sign error and does not reverse the inequality.'],
      ])
      return ch && {
        skill: 'math.alg.ineq', subskill: 'math.alg.ineq.solve', tier: 'medium', kind: 'mcq',
        stem: `Which inequality is equivalent to ${m$(`-${a}x${sgn(b)} \\ge ${c}`)}?`, ...ch,
        explanation: `Subtract ${b}: ${m$(`-${a}x \\ge ${c - b}`)}. Dividing by ${-a} reverses the sign: ${m$(`x \\le ${q}`)}.`,
      }
    },
  },
  {
    skill: 'math.alg.ineq', subskill: 'math.alg.ineq.model', tier: 'hard',
    make: (r) => {
      const w = int(r, 12, 45), W = int(r, 60, 95), M = int(r, 400, 1200)
      if ((M - W) % w === 0) return null
      const n = Math.floor((M - W) / w)
      assert(n * w + W <= M && (n + 1) * w + W > M)
      return {
        skill: 'math.alg.ineq', subskill: 'math.alg.ineq.model', tier: 'hard', kind: 'spr',
        stem: `A freight elevator can safely carry at most ${M} kilograms. A worker who weighs ${W} kilograms will ride the elevator with boxes that each weigh ${w} kilograms. What is the maximum number of boxes the worker can bring on one trip?`,
        answer: spr([n, 1]), rationales: {},
        explanation: `The load must satisfy ${m$(`${W} + ${w}b \\le ${M}`)}, so ${m$(`b \\le \\frac{${M - W}}{${w}} \\approx ${((M - W) / w).toFixed(2)}`)}. The number of boxes must be a whole number, so the maximum is ${n}.`,
      }
    },
  },
  // ───── Advanced Math: nonlinear equations ─────
  {
    skill: 'math.adv.nonlin_eq', subskill: 'math.adv.nonlin_eq.quadratic', tier: 'easy',
    make: (r) => {
      const r1 = int(r, 1, 9), r2 = -int(r, 1, 9)
      if (r1 === -r2) return null
      const p = -(r1 + r2), q = r1 * r2
      assert.equal(r1 * r1 + p * r1 + q, 0)
      assert.equal(r2 * r2 + p * r2 + q, 0)
      const ch = mcq(r, m$(r1), [
        [m$(-r2), 'Flips the sign of the other root when reading the factors.'],
        [m$(r2), 'This is the negative solution.'],
        [m$(-r1), 'Takes the root from the factor without changing its sign.'],
      ])
      return ch && {
        skill: 'math.adv.nonlin_eq', subskill: 'math.adv.nonlin_eq.quadratic', tier: 'easy', kind: 'mcq',
        stem: `${m$(`x^2${sx(p)}${sgn(q)} = 0`)}\n\nWhat is the positive solution to the given equation?`, ...ch,
        explanation: `Factor: ${m$(`(x - ${r1})(x + ${-r2}) = 0`)}, so ${m$(`x = ${r1}`)} or ${m$(`x = ${r2}`)}. The positive solution is ${r1}.`,
      }
    },
  },
  {
    skill: 'math.adv.nonlin_eq', subskill: 'math.adv.nonlin_eq.quadratic', tier: 'medium',
    make: (r) => {
      let b: number, c: number
      if (r() < 1 / 3) { const h = nz(r, -7, 7); b = 2 * h; c = h * h } else { b = nz(r, -10, 10); c = nz(r, -20, 20) }
      const D = b * b - 4 * c
      const n = D > 0 ? 2 : D === 0 ? 1 : 0
      const opts = ['Zero', 'Exactly one', 'Exactly two', 'Infinitely many']
      const why: Record<string, string> = {
        Zero: 'Zero real solutions requires a negative discriminant.',
        'Exactly one': 'Exactly one real solution requires a discriminant of 0.',
        'Exactly two': 'Two real solutions requires a positive discriminant.',
        'Infinitely many': 'A quadratic equation can never have infinitely many solutions.',
      }
      const key = opts[[0, 1, 2].indexOf(n)]
      const ch = mcq(r, key, opts.filter((o) => o !== key).map((o) => [o, why[o]]))
      return ch && {
        skill: 'math.adv.nonlin_eq', subskill: 'math.adv.nonlin_eq.quadratic', tier: 'medium', kind: 'mcq',
        stem: `${m$(`x^2${sx(b)}${sgn(c)} = 0`)}\n\nHow many distinct real solutions does the given equation have?`, ...ch,
        explanation: `The discriminant is ${m$(`b^2 - 4ac = (${b})^2 - 4(1)(${c}) = ${D}`)}, which is ${D > 0 ? 'positive, so there are two' : D === 0 ? 'zero, so there is exactly one' : 'negative, so there are no'} real solutions.`,
      }
    },
  },
  {
    skill: 'math.adv.nonlin_eq', subskill: 'math.adv.nonlin_eq.systems', tier: 'hard',
    make: (r) => {
      const a = int(r, 2, 5), p = int(r, 1, 12), q = nz(r, -9, 9)
      const x = reduce(p + 1, a)
      // a·x² − p·x + q = x + q at the nonzero solution (scaled by den²).
      assert.equal(a * x[0] * x[0] - p * x[0] * x[1], x[0] * x[1])
      return {
        skill: 'math.adv.nonlin_eq', subskill: 'math.adv.nonlin_eq.systems', tier: 'hard', kind: 'spr',
        stem: `${m$(`y = ${a}x^2 - ${p}x${sgn(q)}`)}\n\n${m$(`y = x${sgn(q)}`)}\n\nThe graphs of the given equations in the xy-plane intersect at two points. What is the x-coordinate of the intersection point that does not lie on the y-axis?`,
        answer: spr(x), rationales: {},
        explanation: `Set the right sides equal: ${m$(`${a}x^2 - ${p}x${sgn(q)} = x${sgn(q)}`)}, so ${m$(`${a}x^2 - ${p + 1}x = 0`)} and ${m$(`x(${a}x - ${p + 1}) = 0`)}. The nonzero solution is ${m$(`x = ${fracTex(x)}`)}.`,
      }
    },
  },
  // ───── Problem-Solving and Data Analysis: percentages ─────
  {
    skill: 'math.psda.percent', subskill: 'math.psda.percent.of', tier: 'easy',
    make: (r) => {
      const p = pick(r, [5, 10, 15, 20, 25, 30, 40, 60, 75]), N = 20 * int(r, 2, 20), ans = (p * N) / 100
      if (!Number.isInteger(ans)) return null
      assert.equal((ans / N) * 100, p)
      const ch = mcq(r, m$(ans), [
        [m$((p * N) / 10), 'Misplaces the decimal point: p% is p/100, not p/10.'],
        [m$(N - ans), `This is the amount remaining after removing ${p}%.`],
        [m$(N + ans), `This is ${100 + p}% of ${N}.`],
      ])
      return ch && {
        skill: 'math.psda.percent', subskill: 'math.psda.percent.of', tier: 'easy', kind: 'mcq',
        stem: `What is ${p}% of ${N}?`, ...ch,
        explanation: `${p}% of ${N} is ${m$(`\\frac{${p}}{100} \\cdot ${N} = ${ans}`)}.`,
      }
    },
  },
  {
    skill: 'math.psda.percent', subskill: 'math.psda.percent.change', tier: 'medium',
    make: (r) => {
      const A = 20 * int(r, 1, 15), p = 5 * int(r, 1, 12), B = (A * (100 + p)) / 100
      if (!Number.isInteger(B)) return null
      assert.equal(((B - A) / A) * 100, p)
      const thing = pick(r, ['bicycle', 'concert ticket', 'textbook', 'monthly bus pass'])
      return {
        skill: 'math.psda.percent', subskill: 'math.psda.percent.change', tier: 'medium', kind: 'spr',
        stem: `The price of a ${thing} increased from \\$${A} to \\$${B}. The price increased by ${m$('p')}%. What is the value of ${m$('p')}?`,
        answer: spr([p, 1]), rationales: {},
        explanation: `Percent change is ${m$(`\\frac{\\text{new} - \\text{old}}{\\text{old}} \\cdot 100 = \\frac{${B} - ${A}}{${A}} \\cdot 100 = ${p}`)}.`,
      }
    },
  },
  {
    skill: 'math.psda.percent', subskill: 'math.psda.percent.change', tier: 'hard',
    make: (r) => {
      const p = 10 * int(r, 1, 5), q = 10 * int(r, 1, 5)
      const net = ((100 + p) * (100 - q)) / 100 - 100
      assert(Number.isInteger(net))
      if (net === 0 || net === p - q) return null
      const say = (v: number) => (v === 0 ? 'It did not change.' : v > 0 ? `It increased by ${v}%.` : `It decreased by ${-v}%.`)
      const ch = mcq(r, say(net), [
        [say(p - q), 'Adds the percents directly; the second change applies to the new, different amount.'],
        [say(-net), 'Gets the size of the net change right but the direction wrong.'],
        [say(p + q), 'Treats both changes as increases.'],
        [say(0), 'Assumes the changes cancel.'],
      ])
      return ch && {
        skill: 'math.psda.percent', subskill: 'math.psda.percent.change', tier: 'hard', kind: 'mcq',
        stem: `A store increased the price of a jacket by ${p}%. Later, it decreased the new price by ${q}%. Which statement describes the final price compared with the original price?`,
        ...ch,
        explanation: `Multiply the factors: ${m$(`${(100 + p) / 100} \\times ${(100 - q) / 100} = ${((100 + p) * (100 - q)) / 10000}`)}. So the final price is ${((100 + p) * (100 - q)) / 100}% of the original: ${say(net).toLowerCase()}`,
      }
    },
  },
  // ───── Geometry and Trigonometry: right triangles ─────
  {
    skill: 'math.geo.trig', subskill: 'math.geo.trig.pythagorean', tier: 'easy',
    make: (r) => {
      const [a0, b0, c0] = pick(r, [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25]]), k = int(r, 1, 3)
      const a = a0 * k, b = b0 * k, c = c0 * k
      assert.equal(a * a + b * b, c * c)
      const ch = mcq(r, m$(c), [
        [m$(a + b), 'Adds the legs; the Pythagorean theorem adds their squares.'],
        [m$(a * a + b * b), 'Forgets to take the square root.'],
        [m$(b - a), 'Subtracts the legs.'],
      ])
      return ch && {
        skill: 'math.geo.trig', subskill: 'math.geo.trig.pythagorean', tier: 'easy', kind: 'mcq',
        stem: `A right triangle has legs of lengths ${a} and ${b}. What is the length of the hypotenuse?`, ...ch,
        explanation: `${m$(`c^2 = ${a}^2 + ${b}^2 = ${a * a} + ${b * b} = ${c * c}`)}, so ${m$(`c = ${c}`)}.`,
      }
    },
  },
  {
    skill: 'math.geo.trig', subskill: 'math.geo.trig.pythagorean', tier: 'medium',
    make: (r) => {
      const s = int(r, 2, 12)
      assert(Math.abs(Math.sqrt((2 * s) ** 2 - s ** 2) - s * Math.sqrt(3)) < 1e-9)
      const ch = mcq(r, m$(`${s}\\sqrt{3}`), [
        [m$(2 * s), 'This is the hypotenuse, not the longer leg.'],
        [m$(`${s}\\sqrt{2}`), 'Uses the 45°-45°-90° ratio.'],
        [m$(`${2 * s}\\sqrt{3}`), 'Doubles the longer leg.'],
      ])
      return ch && {
        skill: 'math.geo.trig', subskill: 'math.geo.trig.pythagorean', tier: 'medium', kind: 'mcq',
        stem: `In a 30°-60°-90° triangle, the side opposite the 30° angle has length ${s}. What is the length of the side opposite the 60° angle?`, ...ch,
        explanation: `The sides of a 30°-60°-90° triangle are in the ratio ${m$('1 : \\sqrt{3} : 2')}. The side opposite 60° is ${m$('\\sqrt{3}')} times the shortest side: ${m$(`${s}\\sqrt{3}`)}.`,
      }
    },
  },
  {
    skill: 'math.geo.trig', subskill: 'math.geo.trig.ratios', tier: 'hard',
    make: (r) => {
      const [a, b, c] = pick(r, [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [4, 3, 5], [12, 5, 13]])
      // Right angle at C: BC = a is opposite A, AC = b is adjacent to A, AB = c. Complementary: cos B = sin A, sin B = cos A.
      assert.equal(a * a + b * b, c * c)
      const [given, find, side] = r() < 0.5 ? ['\\sin A', '\\cos B', a] : ['\\cos A', '\\sin B', b]
      const v = reduce(side, c)
      return {
        skill: 'math.geo.trig', subskill: 'math.geo.trig.ratios', tier: 'hard', kind: 'spr',
        stem: `In right triangle ${m$('ABC')}, angle ${m$('C')} is the right angle and ${m$(`${given} = \\frac{${side}}{${c}}`)}. What is the value of ${m$(find)}?`,
        answer: spr(v), rationales: {},
        explanation: `Angles A and B are complementary, so ${m$(`${find} = ${given}`)}. Both equal ${m$(`\\frac{${side}}{${c}}`)}.`,
      }
    },
  },
]

/** Generates `n` distinct items from one template. */
export function generate(t: Template, n: number, seed: number): Item[] {
  const r = mulberry32(seed)
  const out: Item[] = []
  const seen = new Set<string>()
  for (let tries = 0; out.length < n && tries < n * 200; tries++) {
    const it = t.make(r)
    if (!it || seen.has(it.stem)) continue
    seen.add(it.stem)
    if (it.kind === 'mcq') {
      assert.equal(new Set(it.choices!.map((c) => c.text)).size, 4, `duplicate choices: ${it.stem}`)
      assert.equal(Object.keys(it.rationales).length, 3)
    }
    out.push(it)
  }
  assert.equal(out.length, n, `template ${t.skill}/${t.tier} produced only ${out.length}`)
  return out
}
