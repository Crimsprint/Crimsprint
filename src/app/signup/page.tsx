'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AuthCard, Field, PasswordField } from '@/components/AuthCard'
import { Alert, Button } from '@/components/ui'
import { afterSignIn } from '@/lib/account'
import { MIN_PASSWORD, authMessage, normalizeEmail } from '@/lib/auth'
import { savePendingEmail } from '@/lib/onboardingDraft'
import { supabase } from '@/lib/supabase'

export default function SignUp() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pwError = tried && pw.length < MIN_PASSWORD ? `Use at least ${MIN_PASSWORD} characters.` : undefined

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setTried(true)
    if (pw.length < MIN_PASSWORD) return
    setBusy(true)
    setError('')
    const address = normalizeEmail(email)
    const { data, error } = await supabase().auth.signUp({ email: address, password: pw })
    if (error) { setError(authMessage(error)); setBusy(false); return }
    // With email confirmation on there is no session yet: Supabase emailed a 6-digit code. An email that already has an
    // account gets the same screen (Supabase creates nothing and sends nothing), so this form never reveals who signed up.
    if (data.session) return router.replace(await afterSignIn())
    savePendingEmail(address)
    try { sessionStorage.setItem('code-sent-at', String(Date.now())) } catch {}
    router.push('/verify')
  }

  return (
    <AuthCard title="Create your account" links={<p>Already have an account? <Link href="/login" className="font-semibold underline">Sign in</Link></p>}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Email" type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <PasswordField autoComplete="new-password" value={pw} onChange={setPw} error={pwError} hint={`At least ${MIN_PASSWORD} characters.`} />
        {error && <Alert title="Couldn’t create your account">{error}</Alert>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</Button>
      </form>
    </AuthCard>
  )
}
