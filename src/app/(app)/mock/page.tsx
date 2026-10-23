'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Alert, Button, Screen } from '@/components/ui'
import { requireUser, rpc, supabase } from '@/lib/supabase'

type MockRow = { id: string; status: string; created_at: string; result: { total: { low: number; high: number } } | null }

export default function MockHome() {
  const router = useRouter()
  const [mocks, setMocks] = useState<MockRow[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    requireUser().then(() => supabase().from('mocks').select('id, status, created_at, result').order('created_at', { ascending: false }))
      .then(({ data, error }) => (error ? setError(error.message) : setMocks(data as MockRow[])))
      .catch((e) => setError(e.message))
  }, [])

  async function start() {
    setBusy(true)
    try { router.push(`/mock/${await rpc<string>('start_mock')}`) } catch (e) { setError((e as Error).message); setBusy(false) }
  }

  return (
    <Screen wide className="space-y-5">
      <h1 className="text-2xl font-bold">Full-length mock test</h1>
      <ul className="space-y-1 text-text-muted">
        <li>• Reading and Writing: 2 modules, 27 questions and 32 minutes each</li>
        <li>• 10-minute break</li>
        <li>• Math: 2 modules, 22 questions and 35 minutes each, with a calculator and reference sheet</li>
        <li>• Module 2 adapts to how you did on Module 1</li>
        <li>• You can move freely within a module but can’t go back to an earlier one</li>
      </ul>
      <p className="rounded-xl bg-surface p-4 text-sm">You’ll get an <b>estimated</b> score range. It is not an official College Board score.</p>
      {error && <Alert title="Something went wrong">{error}</Alert>}
      <Button className="w-full" onClick={start} disabled={busy}>Start mock test</Button>
      <p className="-mt-3 text-center text-sm text-text-muted">About 2 hours 25 minutes, including the break</p>
      {mocks && mocks.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Your mock tests</h2>
          {mocks.map((m) => (
            <Link key={m.id} href={`/mock/${m.id}`} className="flex justify-between rounded-xl border-2 border-border bg-surface p-3">
              <span>{new Date(m.created_at).toLocaleDateString()}</span>
              <span className="font-semibold">{m.result ? `${m.result.total.low}–${m.result.total.high}` : m.status === 'break' ? 'On break, resume' : 'In progress, resume'}</span>
            </Link>
          ))}
        </section>
      )}
    </Screen>
  )
}
