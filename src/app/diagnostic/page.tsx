'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Alert, Screen } from '@/components/ui'
import { requireUser, rpc } from '@/lib/supabase'

/** "Take the diagnostic" lands here after sign-in: start a diagnostic session and open it. */
export default function DiagnosticPage() {
  const router = useRouter()
  const [error, setError] = useState('')

  useEffect(() => {
    requireUser().then(() => rpc<string>('start_session', { p_mode: 'diagnostic' }))
      .then((id) => router.replace(`/session/${id}`)).catch((e) => setError(e.message))
  }, [router])

  return (
    <Screen className="space-y-4">
      {error ? <>
        <Alert title="Couldn’t start the diagnostic">{error}</Alert>
        <Link href="/learn" className="underline">Go to your path</Link>
      </> : <p aria-live="polite">Starting your diagnostic…</p>}
    </Screen>
  )
}
