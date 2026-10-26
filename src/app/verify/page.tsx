'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { AuthCard, Field } from '@/components/AuthCard'
import { Alert, Button } from '@/components/ui'
import { afterSignIn } from '@/lib/account'
import { authMessage, cooldownLeft } from '@/lib/auth'
import { pendingEmail } from '@/lib/onboardingDraft'
import { supabase } from '@/lib/supabase'

const sentAt = () => { try { return Number(sessionStorage.getItem('code-sent-at') ?? 0) } catch { return 0 } }

/** "We sent a 6-digit code": the account is confirmed here, on Crimsprint, without leaving the site. */
export default function Verify() {
  const router = useRouter()
  const [email] = useState(pendingEmail)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  // The clock is read in the browser only (the screen renders after mounting; see below).
  const [wait, setWait] = useState(() => (typeof window === 'undefined' ? 0 : cooldownLeft(sentAt())))

  useEffect(() => {
    if (!wait) return
    const t = setTimeout(() => setWait(cooldownLeft(sentAt())), 1000)
    return () => clearTimeout(t)
  }, [wait])

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase().auth.verifyOtp({ email, token: code.trim(), type: 'signup' })
    if (error) { setError(authMessage(error)); setBusy(false); return }
    try { router.replace(await afterSignIn()) } catch (e) { setError((e as Error).message); setBusy(false) }
  }

  async function resend() {
    setError('')
    const { error } = await supabase().auth.resend({ type: 'signup', email })
    if (error) return setError(authMessage(error))
    try { sessionStorage.setItem('code-sent-at', String(Date.now())) } catch {}
    setWait(cooldownLeft(Date.now()))
    setNotice('A new code is on its way. Check your spam folder too.')
  }

  // The email lives in this tab's storage, which the server can't read: render once mounted so both sides agree.
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false)
  if (!mounted) return <AuthCard title="Check your email"><p aria-live="polite" className="text-center">Loading…</p></AuthCard>
  if (!email) return (
    <AuthCard title="Verify your email" links={<Link href="/signup" className="font-semibold underline">Create an account</Link>}>
      <p className="text-center">Start by creating your account, and we’ll email you a code.</p>
    </AuthCard>
  )
  return (
    <AuthCard title="Check your email" links={<>
      <button type="button" onClick={resend} disabled={wait > 0} className="font-semibold underline disabled:font-normal disabled:no-underline">
        {wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
      </button>
      <Link href="/signup" className="underline">Wrong email? Go back</Link>
      <Link href="/login" className="underline">Already verified? Sign in</Link>
    </>}>
      <p className="text-center">We sent a 6-digit code to <b className="break-all">{email}</b>.</p>
      <form onSubmit={verify} className="space-y-3">
        <Field label="6-digit code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={10} required
          value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="min-h-14 w-full rounded-xl border-2 border-border bg-surface px-4 text-center text-2xl tracking-[0.4em] placeholder:text-base placeholder:tracking-normal placeholder:text-text-muted" />
        {error && <Alert title="Couldn’t verify">{error}</Alert>}
        {notice && !error && <p role="status" className="text-center text-sm">{notice}</p>}
        <Button type="submit" className="w-full" disabled={busy || code.length < 6}>{busy ? 'Verifying…' : 'Verify'}</Button>
      </form>
    </AuthCard>
  )
}
