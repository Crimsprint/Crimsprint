'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { Alert, Button, Screen } from '@/components/ui'
import { ThemeToggle } from '@/components/ThemeToggle'
import { EXPIRED_MESSAGE } from '@/lib/session'
import { configured, ensureUser, rpc, type Home } from '@/lib/supabase'

function Landing() {
  const router = useRouter()
  const expired = useSearchParams().get('expired') === '1'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function start() {
    setBusy(true)
    setError('')
    try {
      await ensureUser()
      const home = await rpc<Home>('get_home')
      router.push(home.profile.onboarded ? '/learn' : '/onboarding')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Screen className="flex flex-col justify-center gap-8">
      <div className="flex justify-end"><ThemeToggle /></div>
      <div className="rounded-3xl bg-primary p-8 text-on-primary">
        <p className="text-sm font-semibold uppercase tracking-widest">Crimsprint</p>
        <h1 className="mt-3 text-4xl font-bold leading-tight">Ten minutes a day to a higher SAT score.</h1>
        <p className="mt-4 text-lg">Short adaptive lessons, instant explanations, and a full mock test that mirrors the digital SAT.</p>
      </div>
      <ul className="space-y-2 text-text-muted">
        <li>• A 25-minute diagnostic finds your weak skills</li>
        <li>• 8-question lessons on one skill at a time</li>
        <li>• Every answer explained, including why the wrong ones are wrong</li>
      </ul>
      {configured ? (
        <Button onClick={start} disabled={busy}>{busy ? 'Starting…' : 'Get started'}</Button>
      ) : (
        <p role="alert" className="rounded-xl border-2 border-border bg-surface p-4">
          Supabase isn’t configured yet. Copy <code>.env.example</code> to <code>.env.local</code>, fill in your project URL and publishable key, then restart the dev server.
        </p>
      )}
      {expired && !error && <p role="status" className="rounded-xl border-2 border-border bg-surface p-4 font-semibold">{EXPIRED_MESSAGE}</p>}
      {error && <Alert title="Couldn’t start">{error}</Alert>}
      <p className="text-xs text-text-muted">Not affiliated with College Board, the SAT, or any university. SAT is a trademark of College Board.</p>
    </Screen>
  )
}

export default function Page() {
  return <Suspense><Landing /></Suspense>
}
