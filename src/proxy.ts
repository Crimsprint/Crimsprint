import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isPublic, safeNext } from '@/lib/auth'
import { isDeadSession } from '@/lib/session'

/** App pages need a signed-in, verified account; everyone else goes to /login?next=<path>. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      // A refreshed session is written to both the request (for this render) and the response (for the browser).
      setAll: (cookies, headers) => {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v))
      },
    },
  })
  // Only the session cookie (sb-<ref>-auth-token, possibly split into .0, .1 …); empty leftovers don't count.
  const sessionCookies = request.cookies.getAll().filter((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name) && c.value)
  // getUser asks the Auth server, so a validly signed token for a deleted account still counts as signed out.
  const { data, error } = sessionCookies.length ? await supabase.auth.getUser() : { data: { user: null }, error: null }
  const signedIn = !!data.user && !data.user.is_anonymous && !!data.user.email_confirmed_at
  // A dead session (deleted account, revoked or bad token): clear its cookies so the browser starts clean.
  const dead = sessionCookies.length > 0 && !data.user && isDeadSession(error)
  if (dead) {
    await supabase.auth.signOut({ scope: 'local' })
    sessionCookies.forEach((c) => response.cookies.set(c.name, '', { path: '/', maxAge: 0 }))
  }
  const { pathname, search, searchParams } = request.nextUrl

  // Redirects carry any cookie changes made above (refreshed or cleared session).
  const to = (path: string) => {
    const r = NextResponse.redirect(new URL(path, request.url))
    response.cookies.getAll().forEach((c) => r.cookies.set(c))
    return r
  }
  if (!signedIn && !isPublic(pathname)) return to(`/login?${dead ? 'expired=1&' : ''}next=${encodeURIComponent(pathname + search)}`)
  // Signed-in learners skip the landing page and the sign-in/sign-up screens.
  if (signedIn && ['/', '/login', '/signup'].includes(pathname)) return to(safeNext(searchParams.get('next')))
  return response
}

export const config = {
  // Everything except static files and images.
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:png|svg|ico|jpg|jpeg|webp|txt|xml)$).*)'],
}
