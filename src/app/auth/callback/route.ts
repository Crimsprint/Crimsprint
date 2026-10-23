import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { safeNext } from '@/lib/auth'

/** Google sends the learner back here with a one-time code; trade it for a session cookie, then finish signing in. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const next = safeNext(request.nextUrl.searchParams.get('next'))
  const store = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (all) => all.forEach(({ name, value, options }) => store.set(name, value, options)),
    },
  })
  const { error } = code ? await supabase.auth.exchangeCodeForSession(code) : { error: true }
  const to = error ? `/login?error=1&next=${encodeURIComponent(next)}` : `/auth/finish?next=${encodeURIComponent(next)}`
  return NextResponse.redirect(new URL(to, request.url))
}
