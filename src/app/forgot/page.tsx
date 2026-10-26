'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AuthCard, Field, PasswordField } from '@/components/AuthCard'
import { Alert, Button } from '@/components/ui'
import { MIN_PASSWORD, authMessage, cooldownLeft, normalizeEmail } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

/** Password reset without leaving Crimsprint: email → 6-digit code → new password. */
export default function Forgot() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(0) // when the last code was sent
  const [code, setCode] = useState('')
  const [pw, setPw] = useState('')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [wait, setWait] = useState(0)

  useEffect(() => {
    if (!wait) return
    const t = setTimeout(() => setWait(cooldownLeft(sent)), 1000)
    return () => clearTimeout(t)
  }, [wait, sent])

  async function send(e?: React.FormEvent) {
    e?.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase().auth.resetPasswordForEmail(normalizeEmail(email))
    setBusy(false)
    if (error) return setError(authMessage(error))
    const now = Date.now()
    setSent(now)
    setWait(cooldownLeft(now))
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault()
    setTried(true)
    if (pw.length < MIN_PASSWORD) return
    setBusy(true)
    setError('')
    const { error } = await supabase().auth.verifyOtp({ email: normalizeEmail(email), token: code.trim(), type: 'recovery' })
    const result = error ? { error } : await supabase().auth.updateUser({ password: pw })
    if (result.error) { setError(authMessage(result.error)); setBusy(false); return }
    router.replace('/learn')
  }

  const back = <Link href="/login" className="underline">Back to log in</Link>
  if (!sent) return (
    <AuthCard title="Reset your password" links={back}>
      <p className="text-center">Enter your email and we’ll send you a 6-digit code.</p>
      <form onSubmit={send} className="space-y-3">
        <Field label="Email" type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        {error && <Alert title="Couldn’t send the code">{error}</Alert>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Sending…' : 'Send code'}</Button>
      </form>
    </AuthCard>
  )
  return (
    <AuthCard title="Choose a new password" links={<>
      <button type="button" onClick={() => send()} disabled={wait > 0 || busy} className="font-semibold underline disabled:font-normal disabled:no-underline">
        {wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
      </button>
      <button type="button" onClick={() => { setSent(0); setCode(''); setError('') }} className="underline">Wrong email? Go back</button>
      {back}
    </>}>
      {/* Same words whether or not the email has an account. */}
      <p role="status" className="text-center">If <b className="break-all">{normalizeEmail(email)}</b> has an account, we sent it a 6-digit code.</p>
      <form onSubmit={reset} className="space-y-3">
        <Field label="6-digit code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={10} required
          value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        <PasswordField label="New password" autoComplete="new-password" value={pw} onChange={setPw}
          error={tried && pw.length < MIN_PASSWORD ? `Use at least ${MIN_PASSWORD} characters.` : undefined} hint={`At least ${MIN_PASSWORD} characters.`} />
        {error && <Alert title="Couldn’t reset your password">{error}</Alert>}
        <Button type="submit" className="w-full" disabled={busy || code.length < 6}>{busy ? 'Saving…' : 'Save new password'}</Button>
      </form>
    </AuthCard>
  )
}
