'use client'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { AuthCard, Field, PasswordField } from '@/components/AuthCard'
import { Alert, Button } from '@/components/ui'
import { afterSignIn } from '@/lib/account'
import { authMessage, normalizeEmail } from '@/lib/auth'
import { savePendingEmail } from '@/lib/onboardingDraft'
import { EXPIRED_MESSAGE } from '@/lib/session'
import { supabase } from '@/lib/supabase'

function Login() {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const address = normalizeEmail(email)
    const { error } = await supabase().auth.signInWithPassword({ email: address, password: pw })
    if (error?.code === 'email_not_confirmed') {
      // Never verified: send a fresh code and finish on the code screen.
      await supabase().auth.resend({ type: 'signup', email: address })
      savePendingEmail(address)
      try { sessionStorage.setItem('code-sent-at', String(Date.now())) } catch {}
      return router.push('/verify')
    }
    if (error) { setError(authMessage(error)); setBusy(false); return }
    try { router.replace(await afterSignIn(params.get('next'))) } catch (e) { setError((e as Error).message); setBusy(false) }
  }

  return (
    <AuthCard title="Welcome back" links={<>
      <Link href="/forgot" className="underline">Forgot password?</Link>
      <p>New here? <Link href="/onboarding" className="font-semibold underline">Get started</Link></p>
    </>}>
      {params.get('expired') && <p role="status" className="rounded-xl border-2 border-border bg-surface p-3 text-center text-sm font-semibold">{EXPIRED_MESSAGE}</p>}
      <form onSubmit={submit} className="space-y-3">
        <Field label="Email" type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <PasswordField autoComplete="current-password" value={pw} onChange={setPw} />
        {error && <Alert title="Couldn’t log in">{error}</Alert>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</Button>
      </form>
    </AuthCard>
  )
}

export default function LoginPage() {
  return <Suspense><Login /></Suspense>
}
