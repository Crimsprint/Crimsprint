'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Alert, Button, Screen } from '@/components/ui'
import { supabase } from '@/lib/supabase'

/** Upgrades the anonymous guest to an email account; progress stays on the same user id. */
export default function Account() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle')
  const [error, setError] = useState('')

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setState('busy')
    setError('')
    const { error } = await supabase().auth.updateUser({ email })
    if (error) { setError(error.message); setState('idle') } else setState('sent')
  }

  return (
    <Screen className="space-y-5">
      <Link href="/learn" className="underline">← Back to your path</Link>
      <h1 className="text-2xl font-bold">Save your progress</h1>
      <p className="text-text-muted">You’re practicing as a guest. Add your email so you can sign in on another device without losing your streak or mastery.</p>
      {state === 'sent' ? (
        <p role="status" className="rounded-xl bg-success p-4 text-on-success">Check {email} for a confirmation link.</p>
      ) : (
        <form onSubmit={save} className="space-y-4">
          <label className="block">
            <span className="mb-2 block">Email</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="min-h-12 w-full rounded-xl border-2 border-border bg-surface px-4" />
          </label>
          {error && <Alert title="Couldn’t save">{error}</Alert>}
          <Button type="submit" className="w-full" disabled={state === 'busy'}>Send confirmation link</Button>
        </form>
      )}
    </Screen>
  )
}
