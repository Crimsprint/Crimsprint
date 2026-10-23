'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Alert, Button, Screen } from '@/components/ui'
import { ensureUser, rpc, type Home } from '@/lib/supabase'

// shortcut: "Review mistakes" and "Timed drill" arrive in Section 4.
export default function PracticePage() {
  const router = useRouter()
  const [due, setDue] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ensureUser().then(() => rpc<Home>('get_home')).then((h) => setDue(h.due_reviews)).catch((e) => setError(e.message))
  }, [])

  async function start(mode: string) {
    setBusy(true)
    setError('')
    try { router.push(`/session/${await rpc<string>('start_session', { p_mode: mode })}`) } catch (e) { setError((e as Error).message); setBusy(false) }
  }

  return (
    <Screen wide className="space-y-4">
      <h1 className="text-2xl font-bold">Practice</h1>
      {error && <Alert title="Something went wrong">{error}</Alert>}
      <section className="space-y-3 rounded-2xl border-2 border-border bg-surface p-4">
        <h2 className="font-semibold">Practice weak skills</h2>
        <p className="text-sm text-text-muted">8 questions from your two lowest-mastery skills, pitched at your level.</p>
        <Button className="w-full" disabled={busy} onClick={() => start('weak')}>Start</Button>
      </section>
      <section className="space-y-3 rounded-2xl border-2 border-border bg-surface p-4">
        <h2 className="font-semibold">Spaced review</h2>
        <p className="text-sm text-text-muted">{due === null ? 'Checking…' : due > 0 ? `${due} question${due === 1 ? '' : 's'} due for another look.` : 'Nothing due right now. Missed questions come back here.'}</p>
        <Button className="w-full" variant="secondary" disabled={busy || !due} onClick={() => start('review')}>Review {due || ''} due</Button>
      </section>
      <p className="text-sm text-text-muted">Review every mistake and timed drills are coming soon.</p>
    </Screen>
  )
}
