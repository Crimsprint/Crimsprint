// Templates for the remaining math skills. Same contract as math-templates.ts: answers are computed, then checked.
import assert from 'node:assert/strict'
import { fracTex, fracText, int, m$, mcq, nz, pick, reduce, sgn, spr, sx, type Item, type Rng, type Template } from './math-templates.ts'

type Tier = Item['tier']
const T = (skill: string, subskill: string, tier: Tier, make: (r: Rng) => Omit<Item, 'skill' | 'subskill' | 'tier'> | null): Template =>
  ({ skill, subskill, tier, make: (r) => { const it = make(r); return it && { skill, subskill, tier, ...it } } })
/** Polynomial equality by evaluating at several points. */
const same = (f: (x: number) => number, g: (x: number) => number) => [-3, -1, 0, 2, 5].every((x) => Math.abs(f(x) - g(x)) < 1e-9)
const poly2 = (b: number, c: number) => `x^2${sx(b)}${c === 0 ? '' : sgn(c)}`
/** Two-way table as a pipe table (rendered by Tex). */
const table = (head: string[], rows: (string | number)[][]) => [`| ${head.join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n')

export const templates2: Template[] = [
  // ───── Advanced Math: equivalent expressions ─────
  T('math.adv.equiv', 'math.adv.equiv.polynomial', 'easy', (r) => {
    const a = nz(r, -9, 9), b = nz(r, -9, 9)
    if (a === b || a + b === 0) return null
    const key = (x: number) => (x + a) * (x + b)
    assert(same(key, (x) => x * x + (a + b) * x + a * b))
    const ch = mcq(r, m$(poly2(a + b, a * b)), [
      [m$(poly2(0, a * b)), 'Multiplies only the first terms and the last terms, dropping the middle term.'],
      [m$(poly2(a * b, a + b)), 'Swaps the sum and the product of the constants.'],
      [m$(poly2(a + b, -(a * b))), 'Uses the wrong sign for the constant term.'],
    ])
    return ch && { kind: 'mcq', stem: `Which expression is equivalent to ${m$(`(x${sgn(a)})(x${sgn(b)})`)}?`, ...ch,
      explanation: `Distribute: ${m$(`x^2 + ${a}x + ${b}x + (${a})(${b}) = ${poly2(a + b, a * b)}`)}.` }
  }),
  T('math.adv.equiv', 'math.adv.equiv.polynomial', 'medium', (r) => {
    const a = int(r, 2, 6), k = int(r, 2, 9)
    const key = (x: number) => a * (x - k) * (x + k)
    assert(same(key, (x) => a * x * x - a * k * k))
    const ds: [string, (x: number) => number, string][] = [
      [`${a}(x - ${k})^2`, (x) => a * (x - k) ** 2, 'A squared binomial has a middle term; the given expression has none.'],
      [`(${a}x - ${k})(${a}x + ${k})`, (x) => (a * x - k) * (a * x + k), `This expands to ${a * a}x² − ${k * k}, not ${a}x² − ${a * k * k}.`],
      [`${a}(x - ${k * k})(x + ${k * k})`, (x) => a * (x - k * k) * (x + k * k), `Uses ${k * k} instead of its square root inside the factors.`],
    ]
    for (const [, f] of ds) assert(!same(key, f))
    const ch = mcq(r, m$(`${a}(x - ${k})(x + ${k})`), ds.map(([t, , w]) => [m$(t), w]))
    return ch && { kind: 'mcq', stem: `Which expression is equivalent to ${m$(`${a}x^2 - ${a * k * k}`)}?`, ...ch,
      explanation: `Factor out ${a}: ${m$(`${a}(x^2 - ${k * k})`)}. Then use the difference of squares: ${m$(`${a}(x - ${k})(x + ${k})`)}.` }
  }),
  T('math.adv.equiv', 'math.adv.equiv.exponents', 'hard', (r) => {
    const a = int(r, 2, 6), b = int(r, 2, 5), c = int(r, 1, 12), k = a * b - c
    assert.equal(2 ** (a * b) / 2 ** c, 2 ** k)
    return { kind: 'spr', rationales: {}, answer: spr([k, 1]),
      stem: `${m$(`\\frac{(x^{${a}})^{${b}}}{x^{${c}}} = x^{k}`)}\n\nIn the given equation, ${m$('x > 1')} and ${m$('k')} is a constant. What is the value of ${m$('k')}?`,
      explanation: `A power of a power multiplies exponents: ${m$(`(x^{${a}})^{${b}} = x^{${a * b}}`)}. Dividing subtracts exponents: ${m$(`x^{${a * b} - ${c}} = x^{${k}}`)}, so ${m$(`k = ${k}`)}.` }
  }),
  // ───── Advanced Math: nonlinear functions ─────
  T('math.adv.nonlin_fn', 'math.adv.nonlin_fn.quadratic', 'easy', (r) => {
    const a = nz(r, -4, 5), c = nz(r, -12, 12), k = nz(r, -4, 4)
    const f = (x: number) => a * x * x + c
    const ch = mcq(r, m$(f(k)), [
      [m$((a * k) ** 2 + c), `Squares ${a}·${k} instead of only ${k}.`],
      [m$(a * 2 * k + c), 'Multiplies by 2 instead of squaring.'],
      [m$(a * k * k - c), 'Uses the wrong sign for the constant.'],
      [m$(-f(k)), 'Sign error in the final answer.'],
    ])
    return ch && { kind: 'mcq', stem: `The function ${m$('f')} is defined by ${m$(`f(x) = ${a === 1 ? '' : a === -1 ? '-' : a}x^2${sgn(c)}`)}. What is the value of ${m$(`f(${k})`)}?`, ...ch,
      explanation: `${m$(`f(${k}) = ${a}(${k})^2${sgn(c)} = ${a}(${k * k})${sgn(c)} = ${f(k)}`)}.` }
  }),
  T('math.adv.nonlin_fn', 'math.adv.nonlin_fn.quadratic', 'medium', (r) => {
    const a = int(r, 1, 4), h = nz(r, -8, 8), k = nz(r, -15, 15)
    const f = (x: number) => a * (x - h) ** 2 + k
    assert(f(h) === k && f(h + 1) > k && f(h - 1) > k)
    const ch = mcq(r, m$(k), [
      [m$(h), 'This is the x-coordinate of the vertex, not the minimum value.'],
      [m$(-k), 'Uses the wrong sign for the vertex’s y-coordinate.'],
      [m$(-h), 'Reads the x-coordinate from the factor with the wrong sign.'],
    ])
    return ch && { kind: 'mcq', stem: `The function ${m$('f')} is defined by ${m$(`f(x) = ${a === 1 ? '' : a}(x${sgn(-h)})^2${sgn(k)}`)}. What is the minimum value of ${m$('f(x)')}?`, ...ch,
      explanation: `In vertex form ${m$('a(x - h)^2 + k')} with ${m$('a > 0')}, the minimum value is ${m$('k')}. Here the squared term is at least 0, so ${m$('f(x)')} is smallest at ${m$(`x = ${h}`)}, where ${m$(`f(${h}) = ${k}`)}.` }
  }),
  T('math.adv.nonlin_fn', 'math.adv.nonlin_fn.exponential', 'hard', (r) => {
    const P0 = 50 * int(r, 1, 20), g = pick(r, [2, 3]), d = int(r, 2, 8), n = int(r, 1, g === 2 ? 4 : 3), t = d * n
    const v = P0 * g ** n
    if (String(v).length > 5) return null
    assert.equal(v, P0 * g ** (t / d))
    const what = pick(r, ['bacteria in a sample', 'subscribers to a newsletter', 'trees in a reforestation plot'])
    return { kind: 'spr', rationales: {}, answer: spr([v, 1]),
      stem: `The number of ${what} is ${P0} and ${g === 2 ? 'doubles' : 'triples'} every ${d} ${what.startsWith('bacteria') ? 'hours' : 'months'}. If this pattern continues, what will the number be after ${t} ${what.startsWith('bacteria') ? 'hours' : 'months'}?`,
      explanation: `${t} is ${n} periods of ${d}, so the number is multiplied by ${g} a total of ${n} times: ${m$(`${P0} \\cdot ${g}^{${n}} = ${v}`)}.` }
  }),
  // ───── PSDA: ratios, rates, proportional relationships, units ─────
  T('math.psda.ratios', 'math.psda.ratios.proportion', 'easy', (r) => {
    const q = pick(r, [12, 16, 18, 20, 24, 30]), p = int(r, 2, 5), mult = pick(r, [2, 3, 4, 5]), n = q * mult
    const ans = p * mult
    assert.equal(ans / n, p / q)
    const ch = mcq(r, m$(ans), [
      [m$(p + mult), 'Adds the scale factor instead of multiplying.'],
      [m$(n / p), 'Divides the number of cookies by the cups of flour.'],
      [m$(p * q), 'Multiplies the two numbers in the original recipe.'],
      [m$(n - q), 'Subtracts the cookie counts instead of scaling.'],
    ].filter(([t]) => !t.includes('.')) as [string, string][])
    return ch && { kind: 'mcq', stem: `A recipe uses ${p} cups of flour to make ${q} cookies. At this rate, how many cups of flour are needed to make ${n} cookies?`, ...ch,
      explanation: `${n} cookies is ${m$(`\\frac{${n}}{${q}} = ${mult}`)} times the recipe, so the flour is ${m$(`${p} \\cdot ${mult} = ${ans}`)} cups.` }
  }),
  T('math.psda.ratios', 'math.psda.ratios.units', 'medium', (r) => {
    const mps = 5 * int(r, 1, 12), kmh = (mps * 3600) / 1000
    assert(Number.isInteger(kmh) && Math.abs(kmh / 3.6 - mps) < 1e-9)
    const who = pick(r, ['A cyclist', 'A delivery drone', 'A train', 'A sprinter'])
    return { kind: 'spr', rationales: {}, answer: spr([kmh, 1]),
      stem: `${who} travels at a constant speed of ${mps} meters per second. What is this speed in kilometers per hour? (1 kilometer = 1,000 meters)`,
      explanation: `${m$(`${mps}\\,\\frac{\\text{m}}{\\text{s}} \\times 3600\\,\\frac{\\text{s}}{\\text{h}} \\times \\frac{1\\,\\text{km}}{1000\\,\\text{m}} = ${kmh}`)} kilometers per hour.` }
  }),
  T('math.psda.ratios', 'math.psda.ratios.units', 'hard', (r) => {
    const a = pick(r, [20, 30, 40, 60]), b = pick(r, [2, 3, 4, 5]), N = a * 60 * int(r, 1, 6) / b
    if (!Number.isInteger(N)) return null
    const hours = (N * b) / (a * 60)
    assert(Number.isInteger(hours) && hours * 60 * (a / b) === N)
    const ch = mcq(r, m$(hours), [
      [m$(hours * 60), 'Gives the time in minutes, not hours.'],
      [m$((N * a) / (b * 60)), 'Inverts the rate.'],
      [m$(N / a), 'Ignores that each batch takes more than one minute.'],
    ].filter(([t]) => !String(t).includes('.')) as [string, string][])
    return ch && { kind: 'mcq', stem: `A machine fills ${a} bottles every ${b} minutes. At this rate, how many hours will it take the machine to fill ${N.toLocaleString('en-US')} bottles?`, ...ch,
      explanation: `The rate is ${m$(`\\frac{${a}}{${b}}`)} bottles per minute, so ${N} bottles take ${m$(`${N} \\cdot \\frac{${b}}{${a}} = ${hours * 60}`)} minutes, which is ${m$(`\\frac{${hours * 60}}{60} = ${hours}`)} hours.` }
  }),
  // ───── PSDA: one-variable data ─────
  T('math.psda.onevar', 'math.psda.onevar.center', 'easy', (r) => {
    const xs = Array.from({ length: 5 }, () => int(r, 2, 30))
    const sum = xs.reduce((a, b) => a + b, 0)
    if (sum % 5 !== 0) return null
    const mean = sum / 5, med = [...xs].sort((a, b) => a - b)[2], range = Math.max(...xs) - Math.min(...xs)
    const ch = mcq(r, m$(mean), [
      [m$(med), 'This is the median, not the mean.'],
      [m$(range), 'This is the range, not the mean.'],
      [m$(sum), 'This is the sum; divide by the number of values.'],
    ])
    return ch && { kind: 'mcq', stem: `What is the mean of the data set ${m$(xs.join(', '))}?`, ...ch,
      explanation: `The sum is ${m$(`${xs.join(' + ')} = ${sum}`)}. There are 5 values, so the mean is ${m$(`\\frac{${sum}}{5} = ${mean}`)}.` }
  }),
  T('math.psda.onevar', 'math.psda.onevar.center', 'medium', (r) => {
    const n = int(r, 4, 9), m1 = int(r, 10, 40), m2 = m1 + nz(r, -4, 6)
    const x = m2 * (n + 1) - m1 * n
    if (x <= 0) return null
    assert.equal((m1 * n + x) / (n + 1), m2)
    return { kind: 'spr', rationales: {}, answer: spr([x, 1]),
      stem: `The mean of a list of ${n} numbers is ${m1}. When one more number is added to the list, the mean of the ${n + 1} numbers is ${m2}. What number was added?`,
      explanation: `The original sum is ${m$(`${n} \\cdot ${m1} = ${n * m1}`)} and the new sum is ${m$(`${n + 1} \\cdot ${m2} = ${(n + 1) * m2}`)}. The added number is ${m$(`${(n + 1) * m2} - ${n * m1} = ${x}`)}.` }
  }),
  T('math.psda.onevar', 'math.psda.onevar.spread', 'hard', (r) => {
    const c = int(r, 20, 60), s = int(r, 1, 3), w = s + int(r, 3, 6)
    const tight = [c - s, c - s, c, c, c + s, c + s], wide = [c - w, c - 1, c, c, c + 1, c + w]
    const sd = (xs: number[]) => Math.sqrt(xs.reduce((a, x) => a + (x - c) ** 2, 0) / xs.length)
    assert(sd(wide) > sd(tight) && wide.reduce((a, b) => a + b) === tight.reduce((a, b) => a + b))
    const aWide = r() < 0.5
    const [A, B] = aWide ? [wide, tight] : [tight, wide]
    const key = aWide ? 'Data set A' : 'Data set B'
    const ch = mcq(r, key, [
      [aWide ? 'Data set B' : 'Data set A', 'This set’s values are more tightly clustered around the mean.'],
      ['The standard deviations are equal.', 'Equal means do not imply equal spread.'],
      ['It cannot be determined from the information given.', 'All values are listed, so the spread can be compared.'],
    ])
    return ch && { kind: 'mcq', stem: `Data set A: ${m$(A.join(', '))}\n\nData set B: ${m$(B.join(', '))}\n\nBoth data sets have a mean of ${c}. Which data set has the greater standard deviation?`, ...ch,
      explanation: `Standard deviation measures typical distance from the mean. ${key} has values as far as ${w} from ${c}, while the other set stays within ${s}, so ${key.toLowerCase()} is more spread out.` }
  }),
  // ───── PSDA: two-variable data ─────
  T('math.psda.twovar', 'math.psda.twovar.scatter', 'easy', (r) => {
    const m = pick(r, [1.5, 2, 2.5, 3, 4]), b = int(r, 5, 40), x0 = 2 * int(r, 2, 10), y = m * x0 + b
    assert(Number.isInteger(y))
    const ch = mcq(r, m$(y), [
      [m$(m * x0), 'Leaves out the y-intercept.'],
      [m$(x0 + b), 'Adds the input instead of multiplying it by the slope.'],
      [m$(m * (x0 + b)), 'Adds the intercept before multiplying by the slope.'],
    ].filter(([t]) => !String(t).includes('.')) as [string, string][])
    return ch && { kind: 'mcq', stem: `A line of best fit for a scatterplot of hours studied, ${m$('x')}, and quiz score, ${m$('y')}, is ${m$(`y = ${m}x + ${b}`)}. Based on this model, what is the predicted quiz score for a student who studied ${x0} hours?`, ...ch,
      explanation: `Substitute: ${m$(`y = ${m}(${x0}) + ${b} = ${y}`)}.` }
  }),
  T('math.psda.twovar', 'math.psda.twovar.models', 'medium', (r) => {
    const [thing, unitX, unitY] = pick(r, [['the cost of renting a kayak', 'hour', 'dollars'], ['the height of a plant', 'week', 'centimeters'],
      ['the total distance a hiker has walked', 'hour', 'kilometers'], ['the water in a tank', 'minute', 'liters']])
    const m = int(r, 2, 15), b = int(r, 5, 60)
    const ch = mcq(r, `${thing.replace(/^the /, 'The ')} increases by ${m} ${unitY} for each additional ${unitX}.`, [
      [`${thing.replace(/^the /, 'The ')} is ${m} ${unitY} at the start.`, `The starting value is the constant term, ${b}.`],
      [`${thing.replace(/^the /, 'The ')} increases by ${b} ${unitY} for each additional ${unitX}.`, 'This uses the y-intercept as the rate.'],
      [`It takes ${m} ${unitX}s for ${thing} to reach ${b} ${unitY}.`, 'The slope is a rate of change, not a time.'],
    ])
    return ch && { kind: 'mcq', stem: `The equation ${m$(`y = ${m}x + ${b}`)} models ${thing}, ${m$('y')}, in ${unitY}, after ${m$('x')} ${unitX}s. What is the best interpretation of ${m} in this context?`, ...ch,
      explanation: `${m} is the slope: each 1-${unitX} increase in ${m$('x')} adds ${m} to ${m$('y')}. The constant ${b} is the value at ${m$('x = 0')}.` }
  }),
  T('math.psda.twovar', 'math.psda.twovar.models', 'hard', (r) => {
    const start = pick(r, [100, 200, 400, 500, 800]), exp = r() < 0.5
    const d = exp ? pick(r, [10, 20, 25, 50]) : pick(r, [15, 20, 30, 40])
    const ys = [0, 1, 2, 3].map((k) => (exp ? start * (1 + d / 100) ** k : start + d * k))
    if (!ys.every(Number.isInteger)) return null
    if (exp) assert(ys.every((y, k) => k === 0 || Math.abs(y / ys[k - 1] - (1 + d / 100)) < 1e-9))
    else assert(ys.every((y, k) => k === 0 || y - ys[k - 1] === d))
    const lin_ = `A linear model, because ${m$('y')} increases by ${exp ? ys[1] - ys[0] : d} each time ${m$('x')} increases by 1`
    const exp_ = `An exponential model, because ${m$('y')} increases by ${exp ? d : Math.round(((ys[1] - ys[0]) / ys[0]) * 100)}% each time ${m$('x')} increases by 1`
    const ch = mcq(r, exp ? exp_ : lin_, [
      [exp ? lin_ : exp_, exp ? 'The differences between consecutive values grow, so the change is not constant.' : 'The percent change shrinks as values grow; only the difference is constant.'],
      [`A linear model, because ${m$('y')} decreases as ${m$('x')} increases`, `${m$('y')} increases in the table.`],
      [`An exponential model, because ${m$('y')} decreases by half each time ${m$('x')} increases by 1`, `${m$('y')} increases in the table.`],
    ])
    return ch && { kind: 'mcq', stem: `${table(['x', '0', '1', '2', '3'], [['y', ...ys]])}\n\nWhich type of model best fits the data in the table?`, ...ch,
      explanation: exp
        ? `Each value is ${1 + d / 100} times the previous one (a constant ${d}% increase), which is exponential growth.`
        : `Each value is ${d} more than the previous one (a constant difference), which is linear growth.` }
  }),
  // ───── PSDA: probability ─────
  T('math.psda.prob', 'math.psda.prob.simple', 'easy', (r) => {
    const red = int(r, 2, 12), blue = int(r, 2, 12), green = int(r, 2, 12), tot = red + blue + green
    const p = reduce(red, tot)
    assert.equal(p[0] / p[1], red / tot)
    const ch = mcq(r, m$(fracTex(p)), [
      [m$(fracTex(reduce(red, blue + green))), 'Compares red to non-red marbles (odds), not to all marbles.'],
      [m$(fracTex(reduce(blue, tot))), 'This is the probability of blue.'],
      [m$(fracTex(reduce(1, tot))), 'This is the probability of one particular marble.'],
    ])
    return ch && { kind: 'mcq', stem: `A bag contains ${red} red marbles, ${blue} blue marbles, and ${green} green marbles. If one marble is chosen at random, what is the probability that it is red?`, ...ch,
      explanation: `There are ${m$(`${red} + ${blue} + ${green} = ${tot}`)} marbles, and ${red} are red, so the probability is ${m$(`\\frac{${red}}{${tot}}${p[1] !== tot ? ` = ${fracTex(p)}` : ''}`)}.` }
  }),
  T('math.psda.prob', 'math.psda.prob.conditional', 'medium', (r) => {
    const a = int(r, 10, 60), b = int(r, 10, 60), c = int(r, 10, 60), d = int(r, 10, 60), tot = a + b + c + d
    const [g1, g2] = pick(r, [['Juniors', 'Seniors'], ['Morning', 'Afternoon'], ['Online', 'In person']])
    const p = reduce(a, tot)
    const ch = mcq(r, m$(fracTex(p)), [
      [m$(fracTex(reduce(a, a + b))), `Divides by the ${g1} total instead of the total of all people.`],
      [m$(fracTex(reduce(a, a + c))), 'Divides by the "Yes" total instead of the total of all people.'],
      [m$(fracTex(reduce(a + c, tot))), `This is the probability of "Yes" for anyone, not only ${g1}.`],
    ])
    return ch && { kind: 'mcq', stem: `${table(['', 'Yes', 'No'], [[g1, a, b], [g2, c, d]])}\n\nThe table shows survey responses from ${tot} people. If one of these people is chosen at random, what is the probability that the person is in the ${g1} group and answered "Yes"?`, ...ch,
      explanation: `${a} of the ${tot} people are in the ${g1} group and answered "Yes", so the probability is ${m$(`\\frac{${a}}{${tot}}${p[1] !== tot ? ` = ${fracTex(p)}` : ''}`)}.` }
  }),
  T('math.psda.prob', 'math.psda.prob.conditional', 'hard', (r) => {
    const a = int(r, 10, 60), b = int(r, 10, 60), c = int(r, 10, 60), d = int(r, 10, 60)
    const p = reduce(a, a + c)
    if (fracText(p).length > 5) return null
    const [g1, g2] = pick(r, [['Juniors', 'Seniors'], ['Morning', 'Afternoon'], ['Online', 'In person']])
    return { kind: 'spr', rationales: {}, answer: spr(p),
      stem: `${table(['', 'Yes', 'No'], [[g1, a, b], [g2, c, d]])}\n\nThe table shows survey responses. If a person who answered "Yes" is chosen at random, what is the probability that the person is in the ${g1} group?`,
      explanation: `Only the "Yes" column matters: ${m$(`${a} + ${c} = ${a + c}`)} people answered "Yes", and ${a} of them are ${g1}. The probability is ${m$(`\\frac{${a}}{${a + c}}${p[1] !== a + c ? ` = ${fracTex(p)}` : ''}`)}.` }
  }),
  // ───── PSDA: inference from sample statistics and margin of error ─────
  T('math.psda.inference', 'math.psda.inference.estimate', 'easy', (r) => {
    const n = pick(r, [40, 50, 80, 100, 200]), k = int(r, 3, n / 2), N = n * pick(r, [10, 20, 25, 30, 40, 50])
    const est = (N * k) / n
    assert(Number.isInteger(est))
    const [place, pref] = pick(r, [['a school', 'prefer a later start time'], ['a town', 'use the public library each month'], ['a company', 'commute by bicycle']])
    const ch = mcq(r, m$(est), [
      [m$(k), 'This is the count in the sample, not the population estimate.'],
      [m$(N - est), `This estimates the number who do not ${pref}.`],
      [m$(Math.round((N * n) / k)), 'Inverts the sample proportion.'],
    ])
    return ch && { kind: 'mcq', stem: `In a random sample of ${n} people from ${place} of ${N.toLocaleString('en-US')} people, ${k} said they ${pref}. Based on the sample, about how many of the ${N.toLocaleString('en-US')} people ${pref}?`, ...ch,
      explanation: `The sample proportion is ${m$(`\\frac{${k}}{${n}}`)}. Applied to the population: ${m$(`\\frac{${k}}{${n}} \\cdot ${N} = ${est}`)}.` }
  }),
  T('math.psda.inference', 'math.psda.inference.moe', 'medium', (r) => {
    const p = int(r, 30, 70), e = int(r, 2, 6), inside = p + nz(r, -e + 1, e - 1)
    assert(Math.abs(inside - p) < e)
    const ch = mcq(r, `${inside}%`, [
      [`${p + e + 2}%`, 'Above the upper end of the interval.'],
      [`${p - e - 3}%`, 'Below the lower end of the interval.'],
      [`${p + 2 * e + 1}%`, 'Well above the interval.'],
    ])
    return ch && { kind: 'mcq', stem: `A survey of a random sample of voters estimated that ${p}% support a new park, with a margin of error of ${e} percentage points. Which of the following is a plausible value for the percentage of all voters who support the new park?`, ...ch,
      explanation: `Plausible values lie within the margin of error: from ${p - e}% to ${p + e}%. Only ${inside}% is in that interval.` }
  }),
  T('math.psda.inference', 'math.psda.inference.moe', 'hard', (r) => {
    const n1 = pick(r, [100, 150, 200, 250]), n2 = n1 * pick(r, [3, 4, 5]), topic = pick(r, ['use a recycling program', 'own a pet', 'read the news daily', 'play a musical instrument'])
    assert(1 / Math.sqrt(n2) < 1 / Math.sqrt(n1))
    const ch = mcq(r, `The survey of ${n2} residents is likely to have a smaller margin of error.`, [
      [`The survey of ${n1} residents is likely to have a smaller margin of error.`, 'Smaller samples have larger margins of error.'],
      ['Both surveys will have the same margin of error because they use the same method.', 'The margin of error depends on sample size.'],
      [`The survey of ${n2} residents will give exactly the true percentage.`, 'A larger sample reduces error but never removes it.'],
    ])
    return ch && { kind: 'mcq', stem: `Two researchers each select a random sample of residents from the same city to estimate the percentage who ${topic}. One samples ${n1} residents and the other samples ${n2} residents. Which statement is most likely true?`, ...ch,
      explanation: 'With the same sampling method, a larger random sample gives a more precise estimate, so its margin of error is smaller.' }
  }),
  // ───── PSDA: evaluating statistical claims ─────
  T('math.psda.claims', 'math.psda.claims.design', 'easy', (r) => {
    const [who, where] = pick(r, [['students', 'Lakeview High School'], ['members', 'the Riverside gym'], ['employees', 'a regional bank'],
      ['library card holders', 'the Elm County library'], ['customers', 'an online bookstore'], ['residents', 'the town of Fairmont'], ['nurses', 'Northside Hospital'], ['season-ticket holders', 'a minor-league team']])
    const n = pick(r, [80, 120, 150, 200, 300])
    const ch = mcq(r, `All ${who} at ${where}`, [
      [`All ${who} in the country`, `Only ${who} at ${where} had a chance to be selected.`],
      [`Only the ${n} ${who} who were surveyed`, 'A random sample allows conclusions beyond the people surveyed.'],
      [`All people who live near ${where}`, `The sample was drawn only from ${who} at ${where}.`],
    ])
    return ch && { kind: 'mcq', stem: `A researcher selected ${n} ${who} at random from all ${who} at ${where} and asked them about their weekly schedules. To which group can the results most appropriately be generalized?`, ...ch,
      explanation: `A random sample represents the population it was drawn from, which is all ${who} at ${where}, and no larger group.` }
  }),
  T('math.psda.claims', 'math.psda.claims.design', 'medium', (r) => {
    const [treat, out, pool] = pick(r, [['a new study app', 'quiz scores', 'volunteers from one college'], ['a stretching routine', 'reported back pain', 'volunteers from a fitness center'],
      ['a reading program', 'reading speed', 'volunteers from three schools'], ['a sleep-tracking device', 'hours of sleep', 'volunteers who answered an online ad'],
      ['a new fertilizer', 'plant height', 'seedlings from one greenhouse'], ['a typing course', 'typing speed', 'volunteers from an office building'], ['a hydration reminder', 'water intake', 'volunteers from a running club']])
    const ch = mcq(r, `${treat[0].toUpperCase() + treat.slice(1)} likely causes improved ${out} for ${pool.replace(/^volunteers/, 'people like the volunteers')}.`, [
      [`${treat[0].toUpperCase() + treat.slice(1)} causes improved ${out} for everyone.`, 'The participants were not a random sample of everyone.'],
      [`There is an association, but no conclusion about cause can be drawn.`, 'Random assignment to groups is what allows a cause-and-effect conclusion.'],
      ['No conclusion can be drawn because the groups were chosen at random.', 'Random assignment strengthens, not weakens, the conclusion.'],
    ])
    return ch && { kind: 'mcq', stem: `Researchers recruited ${pool} and randomly assigned half to use ${treat} and half not to. The group using ${treat} showed significantly better ${out}. Which conclusion is best supported?`, ...ch,
      explanation: 'Random assignment supports a cause-and-effect conclusion, but because the participants were not randomly selected from a larger population, the conclusion applies only to people like the participants.' }
  }),
  T('math.psda.claims', 'math.psda.claims.design', 'hard', (r) => {
    const [x, y] = pick(r, [['drink more coffee', 'sleep fewer hours'], ['eat breakfast daily', 'have higher grades'], ['own a dog', 'walk more steps per day'],
      ['play video games often', 'have faster reaction times'], ['live closer to a park', 'report less stress'], ['take music lessons', 'score higher in math'], ['use standing desks', 'report less back pain']])
    const ch = mcq(r, `People who ${x} tend to ${y}, but the study does not show that one causes the other.`, [
      [`Choosing to ${x} causes people to ${y}.`, 'Without random assignment, other factors could explain the link.'],
      [`There is no relationship between whether people ${x} and whether they ${y}.`, 'The study did find an association.'],
      [`Everyone who chose to ${x} will ${y}.`, 'An association describes a tendency, not a certainty for every person.'],
    ])
    return ch && { kind: 'mcq', stem: `An observational study of a large random sample of adults found that those who ${x} were more likely to ${y}. Participants chose their own habits; none were assigned. Which statement is best supported?`, ...ch,
      explanation: 'A random sample supports generalizing the association to the population, but because habits were not randomly assigned, the study cannot show cause and effect.' }
  }),
  // ───── Geometry: area and volume ─────
  T('math.geo.area', 'math.geo.area.area', 'easy', (r) => {
    const b = 2 * int(r, 2, 12), h = int(r, 3, 15), A = (b * h) / 2
    const ch = mcq(r, m$(A), [
      [m$(b * h), 'Forgets the factor of 1/2 in the triangle area formula.'],
      [m$(b + h), 'Adds the base and height.'],
      [m$(2 * (b + h)), 'Computes a perimeter-like quantity, not area.'],
    ])
    return ch && { kind: 'mcq', stem: `A triangle has a base of ${b} centimeters and a height of ${h} centimeters. What is the area of the triangle, in square centimeters?`, ...ch,
      explanation: `${m$(`A = \\frac{1}{2}bh = \\frac{1}{2}(${b})(${h}) = ${A}`)}.` }
  }),
  T('math.geo.area', 'math.geo.area.volume', 'medium', (r) => {
    const rad = int(r, 2, 9), h = int(r, 2, 12), k = rad * rad * h
    assert(Math.abs(Math.PI * rad ** 2 * h - k * Math.PI) < 1e-9)
    return { kind: 'spr', rationales: {}, answer: spr([k, 1]),
      stem: `A right circular cylinder has a radius of ${rad} inches and a height of ${h} inches. The volume of the cylinder is ${m$('k\\pi')} cubic inches. What is the value of ${m$('k')}?`,
      explanation: `${m$(`V = \\pi r^2 h = \\pi (${rad})^2 (${h}) = ${k}\\pi`)}, so ${m$(`k = ${k}`)}.` }
  }),
  T('math.geo.area', 'math.geo.area.volume', 'hard', (r) => {
    const k = int(r, 2, 5), dim = r() < 0.5 ? 'volume' : 'surface area'
    const f = dim === 'volume' ? k ** 3 : k ** 2
    const shape = pick(r, ['cube', 'rectangular prism', 'cylinder', 'sphere'])
    const ch = mcq(r, m$(f), [
      [m$(k), 'Scales by k only once; each dimension contributes a factor.'],
      [m$(dim === 'volume' ? k * k : k * k * k), dim === 'volume' ? 'Volume uses three dimensions, so the factor is cubed.' : 'Surface area uses two dimensions, so the factor is squared.'],
      [m$(3 * k), 'Adds the factor three times instead of multiplying.'],
    ])
    return ch && { kind: 'mcq', stem: `Every linear dimension of a ${shape} is multiplied by ${k}. The ${dim} of the new ${shape} is how many times the ${dim} of the original?`, ...ch,
      explanation: `${dim === 'volume' ? 'Volume scales by the cube' : 'Surface area scales by the square'} of the scale factor: ${m$(`${k}^{${dim === 'volume' ? 3 : 2}} = ${f}`)}.` }
  }),
  // ───── Geometry: lines, angles, and triangles ─────
  T('math.geo.lines', 'math.geo.lines.angles', 'easy', (r) => {
    const a = int(r, 25, 155)
    if (a === 90) return null
    const ch = mcq(r, m$(`${180 - a}^\\circ`), [
      [m$(`${a}^\\circ`), 'That is the vertical angle, which is opposite, not adjacent.'],
      [m$(`${Math.abs(90 - a)}^\\circ`), 'Uses 90° instead of 180°.'],
      [m$(`${360 - a}^\\circ`), 'Uses 360° instead of 180°.'],
    ])
    return ch && { kind: 'mcq', stem: `Two lines intersect. One of the angles formed measures ${a}°. What is the measure of an angle adjacent to it?`, ...ch,
      explanation: `Adjacent angles formed by intersecting lines form a straight line, so they sum to 180°: ${m$(`180 - ${a} = ${180 - a}`)}.` }
  }),
  T('math.geo.lines', 'math.geo.lines.angles', 'medium', (r) => {
    const x = int(r, 5, 30), a = int(r, 2, 4), b = a + int(r, 1, 3), p = int(r, 5, 40)
    const q = b * x - (a * x + p)
    if (q <= 0) return null
    assert.equal(a * x + p, b * x - q)
    if (a * x + p >= 180) return null
    return { kind: 'spr', rationales: {}, answer: spr([x, 1]),
      stem: `Two parallel lines are cut by a transversal. A pair of alternate interior angles measure ${m$(`(${a}x + ${p})^\\circ`)} and ${m$(`(${b}x - ${q})^\\circ`)}. What is the value of ${m$('x')}?`,
      explanation: `Alternate interior angles are congruent: ${m$(`${a}x + ${p} = ${b}x - ${q}`)}, so ${m$(`${b - a}x = ${p + q}`)} and ${m$(`x = ${x}`)}.` }
  }),
  T('math.geo.lines', 'math.geo.lines.similar', 'hard', (r) => {
    const a = int(r, 3, 12), k = pick(r, [2, 3, 1.5, 2.5]), b = 2 * int(r, 2, 10)
    const d = a * k, e = b * k
    if (!Number.isInteger(d) || !Number.isInteger(e)) return null
    assert.equal(e / b, d / a)
    const ch = mcq(r, m$(e), [
      [m$(b + (d - a)), 'Adds the difference between sides instead of using the ratio.'],
      [m$(Math.round((a * d) / b * 100) / 100), 'Sets up the proportion with sides that do not correspond.'],
      [m$(b * k * k), 'Squares the scale factor; that applies to areas, not lengths.'],
    ].filter(([t]) => !String(t).includes('.')) as [string, string][])
    return ch && { kind: 'mcq', stem: `Triangle ${m$('ABC')} is similar to triangle ${m$('DEF')}, where ${m$('A')}, ${m$('B')}, and ${m$('C')} correspond to ${m$('D')}, ${m$('E')}, and ${m$('F')}. If ${m$(`AB = ${a}`)}, ${m$(`BC = ${b}`)}, and ${m$(`DE = ${d}`)}, what is ${m$('EF')}?`, ...ch,
      explanation: `The scale factor is ${m$(`\\frac{DE}{AB} = \\frac{${d}}{${a}} = ${k}`)}, so ${m$(`EF = ${k} \\cdot ${b} = ${e}`)}.` }
  }),
  // ───── Geometry: circles ─────
  T('math.geo.circles', 'math.geo.circles.arcs', 'easy', (r) => {
    const rad = int(r, 2, 12)
    const ch = mcq(r, m$(`${rad * rad}\\pi`), [
      [m$(`${2 * rad}\\pi`), 'This is the circumference.'],
      [m$(`${rad}\\pi`), 'Forgets to square the radius.'],
      [m$(`${4 * rad * rad}\\pi`), 'Squares the diameter instead of the radius.'],
    ])
    return ch && { kind: 'mcq', stem: `A circle has a radius of ${rad}. What is the area of the circle?`, ...ch,
      explanation: `${m$(`A = \\pi r^2 = \\pi (${rad})^2 = ${rad * rad}\\pi`)}.` }
  }),
  T('math.geo.circles', 'math.geo.circles.arcs', 'medium', (r) => {
    const rad = int(r, 3, 18), deg = pick(r, [30, 40, 45, 60, 72, 90, 120, 135, 150])
    const k = reduce(rad * deg, 180)
    if (fracText(k).length > 5) return null
    assert(Math.abs((2 * Math.PI * rad * deg) / 360 - (k[0] / k[1]) * Math.PI) < 1e-9)
    return { kind: 'spr', rationales: {}, answer: spr(k),
      stem: `A circle has a radius of ${rad}. A central angle of ${deg}° intercepts an arc of length ${m$('k\\pi')}. What is the value of ${m$('k')}?`,
      explanation: `Arc length is ${m$(`\\frac{${deg}}{360} \\cdot 2\\pi(${rad}) = ${fracTex(k)}\\pi`)}, so ${m$(`k = ${fracTex(k)}`)}.` }
  }),
  T('math.geo.circles', 'math.geo.circles.equation', 'hard', (r) => {
    const h = nz(r, -9, 9), k = nz(r, -9, 9), rad = int(r, 2, 12)
    const D = -2 * h, E = -2 * k, F = h * h + k * k - rad * rad
    assert.equal((-D / 2) ** 2 + (-E / 2) ** 2 - F, rad * rad)
    const ys = E === 0 ? '' : `${E < 0 ? ' - ' : ' + '}${Math.abs(E)}y`
    return { kind: 'spr', rationales: {}, answer: spr([rad, 1]),
      stem: `${m$(`x^2 + y^2${sx(D)}${ys}${F === 0 ? '' : sgn(F)} = 0`)}\n\nThe graph of the given equation in the xy-plane is a circle. What is the length of the circle’s radius?`,
      explanation: `Complete the square: ${m$(`(x${sgn(-h)})^2 + (y${sgn(-k)})^2 = ${h * h} + ${k * k}${sgn(-F)} = ${rad * rad}`)}. The radius is ${m$(`\\sqrt{${rad * rad}} = ${rad}`)}.` }
  }),
]
