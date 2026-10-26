'use client'
import { useEffect, useState } from 'react'
import { PasswordField } from '@/components/AuthCard'
import { Alert, Button, Screen } from '@/components/ui'
import { MIN_PASSWORD, authMessage } from '@/lib/auth'
import { requireUser, signOut, supabase } from '@/lib/supabase'

/** The signed-in email (only you see it; leaderboards show your display name), password change and sign out. */
export default function Account() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [tried, setTried] = useState(false)
  const [state, setState] = useState<'idle' | 'busy' | 'saved'>('idle')
  const [error, setError] = useState('')

  useEffect(() => { requireUser().then((u) => setEmail(u.email ?? '')) }, [])

  async function change(e: React.FormEvent) {
    e.preventDefault()
    setTried(true)
    if (pw.length < MIN_PASSWORD) return
    setState('busy')
    setError('')
    const { error } = await supabase().auth.updateUser({ password: pw })
    if (error) { setError(authMessage(error)); setState('idle') } else { setState('saved'); setPw(''); setTried(false) }
  }

  return (
    <Screen wide className="space-y-6">
      <h1 className="text-2xl font-bold">Account</h1>
      <section className="rounded-2xl border-2 border-border bg-surface p-4">
        <h2 className="font-semibold">Signed in as</h2>
        <p className="break-all text-text-muted">{email || '…'}</p>
        <p className="mt-1 text-sm text-text-muted">Only you can see your email. Leaderboards show your display name.</p>
      </section>
      <form onSubmit={change} className="space-y-3 rounded-2xl border-2 border-border bg-surface p-4">
        <h2 className="font-semibold">Change password</h2>
        <PasswordField label="New password" autoComplete="new-password" value={pw} onChange={(v) => { setPw(v); setState('idle') }}
          error={tried && pw.length < MIN_PASSWORD ? `Use at least ${MIN_PASSWORD} characters.` : undefined} hint={`At least ${MIN_PASSWORD} characters.`} />
        {error && <Alert title="Couldn’t change your password">{error}</Alert>}
        {state === 'saved' && <p role="status" className="font-semibold">Password changed.</p>}
        <Button type="submit" variant="secondary" className="w-full" disabled={state === 'busy'}>Change password</Button>
      </form>
      <Button className="w-full" onClick={signOut}>Sign out</Button>
    </Screen>
  )
}
