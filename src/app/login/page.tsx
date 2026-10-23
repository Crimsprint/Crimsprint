'use client'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { Mascot } from '@/components/Mascot'
import { Alert, Button, Screen } from '@/components/ui'
import { safeNext } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

function Login() {
  const params = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(params.get('error') ? 'Google sign-in didn’t finish. Please try again.' : '')

  async function google() {
    setBusy(true)
    setError('')
    const next = safeNext(params.get('next'))
    const { error } = await supabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    })
    if (error) { setError(error.message); setBusy(false) } // on success the browser is already leaving for Google
  }

  return (
    <Screen className="flex flex-col items-center justify-center gap-6 text-center">
      <Mascot size={160} priority />
      <h1 className="text-2xl font-bold">Sign in to save your progress and keep your streak</h1>
      {error && <div className="w-full text-left"><Alert title="Couldn’t sign in">{error}</Alert></div>}
      <Button className="w-full max-w-sm" onClick={google} disabled={busy}>{busy ? 'Opening Google…' : 'Continue with Google'}</Button>
    </Screen>
  )
}

export default function LoginPage() {
  return <Suspense><Login /></Suspense>
}
