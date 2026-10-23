// Fallback scientific calculator (used when no Desmos API key is set). Recursive descent, no eval().
// Grammar: expr = term (± term)* ; term = unary ((*|/|implicit) unary)* ; unary = ± unary | power ; power = atom (^ unary)?
const FNS: Record<string, (x: number, deg: boolean) => number> = {
  sqrt: (x) => Math.sqrt(x), abs: (x) => Math.abs(x), ln: (x) => Math.log(x), log: (x) => Math.log10(x),
  sin: (x, d) => Math.sin(d ? (x * Math.PI) / 180 : x), cos: (x, d) => Math.cos(d ? (x * Math.PI) / 180 : x),
  tan: (x, d) => Math.tan(d ? (x * Math.PI) / 180 : x),
  asin: (x, d) => Math.asin(x) * (d ? 180 / Math.PI : 1), acos: (x, d) => Math.acos(x) * (d ? 180 / Math.PI : 1),
  atan: (x, d) => Math.atan(x) * (d ? 180 / Math.PI : 1),
}
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E }

export function evaluate(input: string, deg = true): number {
  const src = input.replaceAll('×', '*').replaceAll('÷', '/').replaceAll('−', '-').replaceAll('π', 'pi').replaceAll('√', 'sqrt')
  const tokens = src.match(/\d*\.?\d+(?:e[+-]?\d+)?|[a-z]+|[-+*/^()]|\S/gi) ?? []
  let i = 0
  const peek = () => tokens[i]
  const take = (t?: string) => {
    const tok = tokens[i++]
    if (t && tok !== t) throw new Error(`Expected "${t}"`)
    return tok
  }
  const startsAtom = (t?: string) => t !== undefined && (t === '(' || /^[a-z\d.]/i.test(t))

  function expr(): number {
    let v = term()
    while (peek() === '+' || peek() === '-') v = take() === '+' ? v + term() : v - term()
    return v
  }
  function term(): number {
    let v = unary()
    for (;;) {
      if (peek() === '*') { take(); v *= unary() }
      else if (peek() === '/') { take(); v /= unary() }
      else if (startsAtom(peek())) v *= unary() // implicit: 2pi, 3(4), 2sqrt(9)
      else return v
    }
  }
  function unary(): number {
    if (peek() === '-') { take(); return -unary() }
    if (peek() === '+') { take(); return unary() }
    return power()
  }
  function power(): number {
    const base = atom()
    if (peek() === '^') { take(); return base ** unary() }
    return base
  }
  function atom(): number {
    const t = take()
    if (t === undefined) throw new Error('Incomplete expression')
    if (t === '(') { const v = expr(); take(')'); return v }
    if (/^\d*\.?\d+/.test(t)) return Number(t)
    const name = t.toLowerCase()
    if (name in CONSTS) return CONSTS[name]
    if (name in FNS) {
      // sqrt9 and sqrt(9) both work
      const arg = peek() === '(' ? (take(), (() => { const v = expr(); take(')'); return v })()) : power()
      return FNS[name](arg, deg)
    }
    throw new Error(`Unknown "${t}"`)
  }

  const v = expr()
  if (i < tokens.length) throw new Error(`Unexpected "${tokens[i]}"`)
  return v
}

/** Display: up to 10 significant digits, no float noise. */
export const formatResult = (v: number) => (Number.isFinite(v) ? String(Number(v.toPrecision(10))) : 'Error')
