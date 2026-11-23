// Run against the production build with the loopback environment in docs/security-fixes.md.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const app = 'http://127.0.0.1:38124'
const expires = Math.floor(Date.now() / 1000) + 3600
const learners = ['Test Learner One', 'Test Learner Two'].map((name, i) => {
  const id = `00000000-0000-0000-0093-00000000000${i + 1}`
  const user = { id, aud: 'authenticated', role: 'authenticated', email_confirmed_at: new Date().toISOString() }
  const access_token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: id, exp: expires })).toString('base64url')}.test`
  const session = { user, access_token, expires_at: expires, refresh_token: 'local-refresh-token', token_type: 'bearer' }
  return { name, user, access_token, target: i ? 1270 : 1410, cookie: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}` }
})
const cookieName = 'sb-127-auth-token'
const backend = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', app)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] ?? '')
  res.setHeader('Content-Type', 'application/json')
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return }
  const index = learners.findIndex(({ access_token }) => req.headers.authorization === `Bearer ${access_token}`)
  const learner = learners[index]
  const send = (body: unknown, status = 200) => res.writeHead(status).end(JSON.stringify(body))
  if (!learner) { send({ message: 'Missing test session' }, 401); return }
  switch (req.url?.split('?')[0]) {
    case '/auth/v1/user': return send(learner.user)
    case '/rest/v1/profiles':
    case '/rest/v1/rpc/get_my_avatar':
      return send({ exam_target: index ? 'psat' : 'sat', avatar: 'crimson', crown_expires_at: null })
    case '/rest/v1/skills': return send([])
    case '/rest/v1/rpc/get_home': return send({ skills: [], diagnosed: false })
    case '/rest/v1/rpc/get_progress_v2':
      return send({ exam_target: index ? 'psat' : 'sat', target_score: learner.target })
    case '/rest/v1/rpc/admin_reports':
      return index ? send([]) : send({ message: 'admin only: update public.profiles set is_admin = true' }, 400)
    case '/rest/v1/rpc/get_profile':
    case '/rest/v1/rpc/get_profile_v2':
      return send({
        display_name: learner.name, avatar: 'crimson', joined: '2026-11-23T00:00:00Z', total_points: 23 + index,
        streak: 1, longest_streak: 1, coins: 0, crowns_won: 0, inventory: {}, prices: {}, achievements: [],
      })
    default: return send({ message: 'Unexpected test endpoint' }, 404)
  }
})

async function until<T>(read: () => Promise<T | undefined>, label: string): Promise<T> {
  for (let i = 0; i < 100; i++) {
    const result = await read()
    if (result !== undefined) return result
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

await new Promise<void>((resolve, reject) => {
  backend.once('error', reject)
  backend.listen(38123, '127.0.0.1', resolve)
})
const temp = await mkdtemp(join(tmpdir(), 'crimsprint-web-test-'))
const next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '38124'], {
  stdio: 'inherit',
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:38123', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'local-test-key' },
})
const chromeBin = process.env.CHROME ?? (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome')
const chrome = spawn(chromeBin, [
  '--headless=new', '--no-first-run', '--disable-background-networking', '--remote-debugging-port=0',
  `--user-data-dir=${temp}`, 'about:blank',
], { stdio: 'ignore' })
let chromeError: Error | undefined
chrome.on('error', (error) => { chromeError = error })
let socket: WebSocket | undefined
try {
  await until(() => fetch(app).catch(() => undefined), 'Next.js')
  const [port, path] = await until(async () => {
    if (chromeError) throw chromeError
    return readFile(join(temp, 'DevToolsActivePort'), 'utf8').then((s) => s.trim().split('\n')).catch(() => undefined)
  }, 'Chrome')
  const ws = socket = new WebSocket(`ws://127.0.0.1:${port}${path}`)
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  let seq = 0
  const pending = new Map<number, (msg: any) => void>()
  ws.addEventListener('message', ({ data }) => {
    const msg = JSON.parse(String(data))
    pending.get(msg.id)?.(msg)
    pending.delete(msg.id)
  })
  async function cdp(method: string, params: object, sessionId?: string) {
    const id = ++seq
    const msg = await new Promise<any>((resolve) => {
      pending.set(id, resolve)
      ws.send(JSON.stringify({ id, method, params, sessionId }))
    })
    if (msg.error) throw new Error(`${method}: ${msg.error.message}`)
    return msg.result
  }
  async function browserFor(cookie: string) {
    const { browserContextId } = await cdp('Target.createBrowserContext', {})
    const { targetId } = await cdp('Target.createTarget', { url: 'about:blank', browserContextId })
    const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true })
    assert.equal((await cdp('Network.setCookie', { url: app, name: cookieName, value: cookie }, sessionId)).success, true)
    const open = async (route: string, title: string) => {
      await cdp('Page.navigate', { url: app + route }, sessionId)
      return until(async () => {
        const { result } = await cdp('Runtime.evaluate', {
          expression: "({ title: document.querySelector('h1')?.textContent, text: document.body?.innerText })",
          returnByValue: true,
        }, sessionId)
        if (result.value?.title === title) return result.value.text as string
        return undefined
      }, `${route} to show ${title}`)
    }
    return Object.assign(open, {
      async evaluate(expression: string) {
        const { result, exceptionDetails } = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)
        if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text)
        return result.value
      },
    })
  }

  const [first, second] = learners
  const profileA = await browserFor(first.cookie)
  const profileB = await browserFor(second.cookie)
  assert.ok(!(await profileA('/profile', first.name)).includes(second.name))
  assert.ok(!(await profileB('/profile', second.name)).includes(first.name))
  assert.ok(!(await profileA('/profile', first.name)).includes(second.name))
  const progressA = await profileA('/progress', 'Your progress')
  const progressB = await profileB('/progress', 'Your PSAT/NMSQT progress')
  assert.ok(progressA.includes(`Target ${first.target}`) && !progressA.includes(`Target ${second.target}`))
  assert.ok(progressB.includes(`Target ${second.target}`) && !progressB.includes(`Target ${first.target}`))
  for (const route of ['/profile', '/progress']) {
    for (const learner of learners) {
      const headers = { Cookie: `${cookieName}=${learner.cookie}` }
      for (const request of [headers, { ...headers, RSC: '1', 'Next-Router-Prefetch': '1' }]) {
        // Next may redirect a Flight request to add its cache-busting query parameter.
        const shell = await fetch(app + route, { headers: request })
        assert.equal(shell.status, 200)
        assert.equal(new URL(shell.url).pathname, route)
        assert.match(shell.headers.get('content-type') ?? '', 'RSC' in request ? /^text\/x-component/ : /^text\/html/)
        assert.equal(shell.headers.get('content-security-policy'), "frame-ancestors 'none'")
        assert.equal(shell.headers.get('x-frame-options'), 'DENY')
        const body = await shell.text()
        for (const { name, target } of learners) assert.ok(!body.includes(name) && !body.includes(`Target ${target}`))
      }
    }
  }
  const signedOut = await fetch(`${app}/profile`, { redirect: 'manual' })
  assert.equal(signedOut.status, 307)
  assert.match(signedOut.headers.get('location') ?? '', /\/login\?next=%2Fprofile$/)
  assert.equal(signedOut.headers.get('content-security-policy'), "frame-ancestors 'none'")
  assert.equal(signedOut.headers.get('x-frame-options'), 'DENY')
  assert.doesNotMatch(await profileA('/admin', 'Not found'), /admin only|is_admin|public\.profiles|Choose…/)
  await profileB('/admin', 'Content')
  await profileA('/dressing-room', 'Dressing room')
  const furClick = await profileA.evaluate(`(async () => {
    let writes = 0;
    for (const method of ['write', 'writeText']) {
      Object.defineProperty(navigator.clipboard, method, { value: async () => { writes++ } });
    }
    const exec = document.execCommand.bind(document);
    document.execCommand = (command, ...args) => {
      if (command.toLowerCase() === 'copy' || command.toLowerCase() === 'cut') { writes++; return false; }
      return exec(command, ...args);
    };
    const nextFrame = () => new Promise(requestAnimationFrame);
    [...document.querySelectorAll('[role=tab]')].find((tab) => tab.textContent === 'Fur color').click();
    await nextFrame();
    const cream = [...document.querySelectorAll('[role=tabpanel] button')].find((item) => item.textContent.includes('Cream'));
    cream.click();
    await nextFrame();
    return { writes, selected: cream.getAttribute('aria-pressed') || document.querySelector('[role=tabpanel] button[aria-pressed=true]')?.textContent.includes('Cream') };
  })()`)
  assert.deepEqual(furClick, { writes: 0, selected: 'true' })
  console.log('PASS: isolated account data, clean HTML and prefetch payloads, anti-framing headers, generic admin denial, and clipboard-free fur selection.')
} finally {
  socket?.close()
  next.kill()
  if (chrome.pid && chrome.exitCode === null && chrome.signalCode === null) {
    const exited = new Promise<void>((resolve) => chrome.once('exit', () => resolve()))
    chrome.kill()
    await exited
  }
  backend.closeAllConnections()
  backend.close()
  await rm(temp, { force: true, recursive: true, maxRetries: 5 })
}
