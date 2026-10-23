// Review screenshots of the running app (npm run dev) in headless Chrome, at desktop and phone sizes in light and dark.
// Run: node scripts/screenshots.ts <outDir> <path[|css selector to click first[|name suffix]]>...
//   e.g. node scripts/screenshots.ts screenshots/section-1 /learn "/learn|button[aria-controls=more-menu]|more" /progress
// One guest learner persists in <outDir>/../.profile and is onboarded (diagnostic skipped) on first run.
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import assert from 'node:assert'

const [outDir, ...specs] = process.argv.slice(2)
assert(outDir && specs.length, 'usage: node scripts/screenshots.ts <outDir> <path>...')
const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const SIZES = { desktop: [1440, 900], tablet: [834, 1112], mobile: [375, 812] } as const
const sizes = (process.env.SIZES?.split(',') ?? ['desktop', 'mobile']) as (keyof typeof SIZES)[]
const PORT = 9333
mkdirSync(outDir, { recursive: true })

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${resolve(dirname(outDir), '.profile')}`,
  '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let target: { webSocketDebuggerUrl: string } | undefined
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200)
  target = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json()).then((ts) => ts.find((t: { type: string }) => t.type === 'page')).catch(() => undefined)
}
assert(target, 'Chrome did not start')
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let seq = 0
const pending = new Map<number, (v: { result?: Record<string, unknown>; error?: { message: string } }) => void>()
ws.addEventListener('message', (e) => { const m = JSON.parse(String(e.data)); pending.get(m.id)?.(m); pending.delete(m.id) })
async function cdp(method: string, params: Record<string, unknown> = {}) {
  const id = ++seq
  ws.send(JSON.stringify({ id, method, params }))
  const m = await new Promise<{ result?: Record<string, unknown>; error?: { message: string } }>((r) => pending.set(id, r))
  if (m.error) throw new Error(`${method}: ${m.error.message}`)
  return m.result!
}
async function evaluate<T>(expression: string): Promise<T> {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }) as { result: { value: T } }
  return r.result.value
}
async function until(expression: string, what: string) {
  for (let i = 0; i < 100; i++) { if (await evaluate<boolean>(expression)) return; await sleep(150) }
  throw new Error(`timed out waiting for ${what} on ${await evaluate('location.pathname')}`)
}
const settled = `document.readyState === 'complete' && !/Loading|Checking/.test(document.body.innerText)
  && [...document.images].every((i) => i.complete || i.getBoundingClientRect().top > innerHeight)`
async function go(path: string) {
  await cdp('Page.navigate', { url: BASE + path })
  await sleep(300)
  await until(settled, 'the page to load')
}
// Clicks the label or button whose text contains `text`.
const click = (text: string) => evaluate(`(() => { const el = [...document.querySelectorAll('label, button')].find((e) => e.textContent.includes(${JSON.stringify(text)})); if (!el) throw new Error('no ' + ${JSON.stringify(text)}); el.click() })()`)
const hasText = (text: string) => `document.body.innerText.includes(${JSON.stringify(text)})`

try {
  await cdp('Page.enable')
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await go('/learn')
  if ((await evaluate<string>('location.pathname')).startsWith('/onboarding')) {
    await until(hasText('first SAT'), 'onboarding'); await click('first time'); await click('Continue')
    await until(hasText('When is your test'), 'date step'); await click('booked a date'); await click('Continue')
    await until(hasText('aiming for'), 'score step')
    await evaluate(`(() => { const s = document.querySelectorAll('select')[1]; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, '1400'); s.dispatchEvent(new Event('change', { bubbles: true })) })()`)
    await click('Continue')
    await until(hasText('daily goal'), 'goal step'); await click('Regular'); await click('Continue')
    await until(hasText('starting point'), 'diagnostic step'); await click('Skip and start learning')
    await until(`location.pathname === '/learn'`, '/learn')
  }

  for (const spec of specs) {
    const [path, clickSelector, suffix = 'open'] = spec.split('|')
    for (const size of sizes) {
      const [width, height] = SIZES[size]
      await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: size === 'mobile' })
      for (const scheme of ['light', 'dark']) {
        await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] })
        await go(path)
        await sleep(400)
        await evaluate(`document.querySelector('nextjs-portal')?.remove()`) // dev-only badge
        if (clickSelector) {
          // The target may only exist at some sizes (e.g. the More button is desktop-only).
          if (!await evaluate<boolean>(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(clickSelector)})].find((e) => e.offsetParent); el?.click(); return !!el })()`)) continue
          await sleep(300)
        }
        const { data } = await cdp('Page.captureScreenshot', { format: 'png' }) as { data: string }
        const name = `${path.replace(/^\//, '').replace(/\//g, '-') || 'home'}${clickSelector ? `-${suffix}` : ''}-${size}-${scheme}.png`
        writeFileSync(join(outDir, name), Buffer.from(data, 'base64'))
        console.log(name)
      }
    }
  }
  await evaluate(`localStorage.removeItem('track')`) // per-viewer track choice: start the next run on the default
} finally {
  ws.close()
  chrome.kill()
}
