import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isPublic, safeNext } from '@/lib/auth'

/** Every page except the public ones needs a Google session; guests go to /login?next=<path>. */
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
  // getClaims verifies the token's signature (not just its presence) and refreshes it when it has expired.
  const { data } = await supabase.auth.getClaims()
  const signedIn = !!data?.claims && !data.claims.is_anonymous
  const { pathname, search, searchParams } = request.nextUrl

  const to = (path: string) => NextResponse.redirect(new URL(path, request.url))
  if (!signedIn && !isPublic(pathname)) return to(`/login?next=${encodeURIComponent(pathname + search)}`)
  // Returning learners skip the landing page and sign-in screen.
  if (signedIn && pathname === '/') return to('/learn')
  if (signedIn && pathname === '/login') return to(safeNext(searchParams.get('next')))
  return response
}

export const config = {
  // Everything except static files and images.
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:png|svg|ico|jpg|jpeg|webp|txt|xml)$).*)'],
}
