'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Mascot } from '@/components/Mascot'
import { Alert, Button, Screen } from '@/components/ui'
import { rpc } from '@/lib/supabase'

/** Right after the account is verified: take the diagnostic now, or skip to the path. */
export default function StartPage() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function diagnostic() {
    setBusy(true)
    try { router.push(`/session/${await rpc<string>('start_session', { p_mode: 'diagnostic' })}`) } catch (e) { setError((e as Error).message); setBusy(false) }
  }

  return (
    <Screen className="flex flex-col items-center gap-5 text-center">
      <Mascot pose="celebrating" size={120} priority />
      <h1 className="text-2xl font-bold">Find your starting point</h1>
      <p>A 24-question diagnostic covers all 8 SAT domains and adapts as you go. It takes about 25 minutes, and it moves you ahead in the units you already know.</p>
      {error && <div className="w-full text-left"><Alert title="Couldn’t start">{error}</Alert></div>}
      <Button className="w-full" onClick={diagnostic} disabled={busy}>Take the diagnostic</Button>
      <Button className="w-full" variant="secondary" onClick={() => router.push('/learn')} disabled={busy}>Skip and start learning</Button>
    </Screen>
  )
}
