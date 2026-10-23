// Theme acceptance checks: no hex colors outside the token file, and WCAG AA contrast for every text pairing we use.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8')
const raw = Object.fromEntries([...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]))

/** Semantic tokens for light (@theme) and dark (the [data-theme="dark"] block), resolved to hex. */
function tokens(block: string) {
  return Object.fromEntries([...block.matchAll(/--color-([a-z0-9-]+):\s*var\(--([a-z0-9-]+)\)/g)].map((m) => [m[1], raw[m[2]]]))
}
const light = tokens(css.slice(css.indexOf('@theme'), css.indexOf('@media')))
const dark = { ...light, ...tokens(css.slice(css.indexOf(':root[data-theme="dark"]'))) }

function lum(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

// [text token, background token, minimum]: 4.5 for body text, 3 for icons and large UI.
const pairs: [string, string, number][] = [
  ['text', 'bg', 4.5], ['text', 'surface', 4.5], ['text-muted', 'bg', 4.5], ['text-muted', 'surface', 4.5],
  ['text', 'surface-muted', 4.5], ['text-muted', 'locked-bg', 4.5],
  ['on-primary', 'primary', 4.5], ['on-success', 'success', 4.5], ['on-danger', 'danger', 4.5], ['on-accent', 'accent', 4.5],
  ['on-locked', 'locked-bg', 4.5], ['locked', 'locked-bg', 1.9], // locked icon is decorative; state is also in the label
  ['focus', 'bg', 3], ['focus', 'surface', 3],
  ['text', 'sidebar', 4.5], ['text', 'nav-active', 4.5], ['nav-active-border', 'sidebar', 3], ['nav-active-border', 'nav-active', 3],
  ['ring-progress', 'track', 1.5], ['ring-progress', 'surface', 3],
]

describe('theme tokens', () => {
  it('has no hex colors outside globals.css', () => {
    const hits = execSync(`grep -rnE "#[0-9A-Fa-f]{3,8}\\b" src --include=*.ts --include=*.tsx --include=*.css || true`, { encoding: 'utf8' })
      .split('\n').filter((l) => l && !l.startsWith('src/app/globals.css'))
    expect(hits).toEqual([])
  })
  it('uses exactly the brief\'s palette values', () => {
    expect(raw).toMatchObject({ crimson: '#A51C30', ink: '#1E1E1E', white: '#FFFFFF', 'gray-900': '#252727', 'gray-700': '#3D3D3D',
      'gray-200': '#D6D6D7', 'gray-50': '#F0F0F2', putty: '#D7D1CB', slate: '#8996A0', chocolate: '#422E1C', green: '#1E7B4A' })
  })
  for (const [mode, t] of [['light', light], ['dark', dark]] as const) {
    it.each(pairs)(`${mode}: %s on %s ≥ %s:1`, (fg, bg, min) => {
      expect(t[fg], fg).toBeDefined()
      expect(t[bg], bg).toBeDefined()
      expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(min)
    })
  }
  it('never uses crimson as a text color', () => {
    const hits = execSync(`grep -rnE "text-(primary|danger)\\b" src || true`, { encoding: 'utf8' }).trim()
    expect(hits).toBe('')
  })
})
