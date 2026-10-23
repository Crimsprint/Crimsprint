import { describe, expect, it } from 'vitest'
import { evaluate, formatResult } from '../src/lib/calc'

describe('fallback calculator', () => {
  it.each([
    ['2+3*4', 14], ['(2+3)*4', 20], ['2^3^2', 512], ['-2^2', -4], ['10/4', 2.5],
    ['sqrt(144)', 12], ['√144', 12], ['2π', 2 * Math.PI], ['3(4+1)', 15], ['2sqrt(9)', 6],
    ['sin(30)', 0.5], ['cos(60)', 0.5], ['log(1000)', 3], ['ln(e)', 1], ['abs(-7)', 7],
    ['6×7÷2', 21], ['1.5e3', 1500], ['--3', 3],
  ])('%s = %s', (expr, want) => expect(evaluate(expr as string)).toBeCloseTo(want as number, 10))

  it('uses radians when asked', () => expect(evaluate('sin(pi/2)', false)).toBeCloseTo(1, 12))
  it.each(['2+', '(1+2', 'foo(2)', '1 2 )', 'alert(1)'])('rejects %s', (e) => expect(() => evaluate(e)).toThrow())
  it('formats without float noise', () => {
    expect(formatResult(0.1 + 0.2)).toBe('0.3')
    expect(formatResult(1 / 0)).toBe('Error')
  })
})
