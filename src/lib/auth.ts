// Route rules shared by the proxy, the login page and the OAuth callback (no browser or server APIs here).

/** Pages anyone can open. Everything else needs a Google session (src/proxy.ts). */
export function isPublic(path: string) {
  return path === '/' || ['/onboarding', '/login', '/auth/callback', '/legal'].some((p) => path === p || path.startsWith(`${p}/`))
}

/** Where to go after sign-in: an internal path only (never another site), otherwise /learn. */
export function safeNext(next: string | null | undefined) {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\') || /[\r\n]/.test(next)) return '/learn'
  if (next === '/login' || next.startsWith('/login?') || next.startsWith('/auth/')) return '/learn' // avoid sign-in loops
  return next
}
