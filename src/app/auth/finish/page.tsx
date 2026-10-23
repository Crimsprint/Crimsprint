'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { Alert, Button, Screen } from '@/components/ui'
import { safeNext } from '@/lib/auth'
import { clearDraft, readDraft } from '@/lib/onboardingDraft'
import { requireUser, rpc, type Home } from '@/lib/supabase'

/** Right after Google sign-in: save the onboarding answers kept in this browser (one write), clear them, then continue. */
function Finish() {
  const router = useRouter()
  const params = useSearchParams()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const next = safeNext(params.get('next'))
    requireUser().then(async () => {
      const draft = readDraft()
      // The profile row already exists: the auth trigger creates it when Google sign-in creates the user.
      if (draft) { await rpc('save_onboarding', draft); clearDraft() }
      const home = await rpc<Home>('get_home')
      router.replace(home.profile.onboarded ? next : `/onboarding?next=${encodeURIComponent(next)}`)
    }).catch((e) => setError(e.message)) // the draft stays in place, so trying again loses nothing
  }, [params, router, attempt])

  return (
    <Screen className="flex flex-col justify-center gap-4">
      {error ? <>
        <Alert title="Couldn’t save your answers">{error}</Alert>
        <Button onClick={() => { setError(''); setAttempt((a) => a + 1) }}>Try again</Button>
      </> : <p aria-live="polite">Signing you in…</p>}
    </Screen>
  )
}

export default function FinishPage() {
  return <Suspense><Finish /></Suspense>
}
