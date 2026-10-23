'use client'
import { useEffect, useRef, useState } from 'react'
import { Tex } from './Tex'
import { evaluate, formatResult } from '@/lib/calc'

const DESMOS_KEY = process.env.NEXT_PUBLIC_DESMOS_API_KEY

declare global {
  interface Window { Desmos?: { GraphingCalculator: (el: HTMLElement, opts?: object) => { destroy: () => void } } }
}

/** Graphing calculator via the Desmos API when a key is configured (like Bluebook); otherwise a scientific fallback. */
function Calculator() {
  const el = useRef<HTMLDivElement>(null)
  const [expr, setExpr] = useState('')
  const [deg, setDeg] = useState(true)

  useEffect(() => {
    if (!DESMOS_KEY || !el.current) return
    let calc: { destroy: () => void } | undefined
    const mount = () => { if (el.current && window.Desmos) calc = window.Desmos.GraphingCalculator(el.current, { expressionsCollapsed: false }) }
    if (window.Desmos) mount()
    else {
      const s = document.createElement('script')
      s.src = `https://www.desmos.com/api/v1.11/calculator.js?apiKey=${encodeURIComponent(DESMOS_KEY)}`
      s.onload = mount
      document.head.appendChild(s)
    }
    return () => calc?.destroy()
  }, [])

  if (DESMOS_KEY) return <div ref={el} className="h-96 w-full rounded-xl" />

  let result = ''
  try { result = expr.trim() ? formatResult(evaluate(expr, deg)) : '' } catch (e) { result = (e as Error).message }
  const insert = (t: string) => setExpr((x) => x + t)
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="sr-only">Expression</span>
        <input value={expr} onChange={(e) => setExpr(e.target.value)} placeholder="e.g. 2sqrt(18) + 3^2" autoComplete="off"
          className="min-h-12 w-full rounded-xl border-2 border-border bg-surface px-3 font-mono" />
      </label>
      <p aria-live="polite" className="min-h-7 font-mono text-xl font-semibold">{result && `= ${result}`}</p>
      <div className="flex flex-wrap gap-2">
        {['√(', 'π', '^', '(', ')', 'sin(', 'cos(', 'tan('].map((t) => (
          <button key={t} type="button" onClick={() => insert(t)} className="min-h-10 min-w-10 rounded-lg border-2 border-border bg-surface px-2 font-mono">{t}</button>
        ))}
        <button type="button" onClick={() => setExpr('')} className="min-h-10 rounded-lg border-2 border-border bg-surface px-3">Clear</button>
        <button type="button" onClick={() => setDeg(!deg)} aria-pressed={deg} className="min-h-10 rounded-lg border-2 border-border bg-surface px-3">{deg ? 'Degrees' : 'Radians'}</button>
      </div>
      <p className="text-xs text-text-muted">Scientific mode. Add a Desmos API key to enable graphing.</p>
    </div>
  )
}

const FORMULAS = [
  'Circle: $A = \\pi r^2$, $C = 2\\pi r$',
  'Rectangle: $A = \\ell w$',
  'Triangle: $A = \\frac{1}{2}bh$',
  'Pythagorean theorem: $c^2 = a^2 + b^2$',
  'Special right triangles: $x, x\\sqrt{3}, 2x$ (30°-60°-90°) and $s, s, s\\sqrt{2}$ (45°-45°-90°)',
  'Rectangular prism: $V = \\ell w h$',
  'Cylinder: $V = \\pi r^2 h$',
  'Sphere: $V = \\frac{4}{3}\\pi r^3$',
  'Cone: $V = \\frac{1}{3}\\pi r^2 h$',
  'Pyramid: $V = \\frac{1}{3}\\ell w h$',
  'A circle has $360°$, or $2\\pi$ radians. The angles of a triangle sum to $180°$.',
]

/** Calculator and reference-sheet toggles for math questions. */
export function MathTools() {
  const [open, setOpen] = useState<'calc' | 'ref' | null>(null)
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {([['calc', 'Calculator'], ['ref', 'Reference']] as const).map(([k, label]) => (
          <button key={k} type="button" aria-expanded={open === k} onClick={() => setOpen(open === k ? null : k)}
            className={`min-h-10 rounded-full border-2 px-4 text-sm font-semibold ${open === k ? 'border-text bg-surface-muted' : 'border-border bg-surface'}`}>{label}</button>
        ))}
      </div>
      {open && (
        <div className="rounded-xl border-2 border-border bg-surface p-4">
          {open === 'calc' ? <Calculator /> : (
            <ul className="space-y-2 text-sm">{FORMULAS.map((f) => <li key={f}><Tex text={f} /></li>)}</ul>
          )}
        </div>
      )}
    </div>
  )
}
