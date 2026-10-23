'use client'
import { useState } from 'react'
import { rpc } from '@/lib/supabase'

/** "Report a problem" link that sends a short reason to the admin queue. */
export function ReportItem({ itemId }: { itemId: string }) {
  const [reason, setReason] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  if (state === 'sent') return <p role="status" className="text-sm">Thanks, we’ll take a look.</p>
  return (
    <details className="text-sm">
      <summary className="cursor-pointer underline">Report a problem</summary>
      <form className="mt-2 flex gap-2" onSubmit={async (e) => {
        e.preventDefault()
        setState('sending')
        try { await rpc('report_item', { p_item: itemId, p_reason: reason }); setState('sent') } catch { setState('error') }
      }}>
        <label className="flex-1">
          <span className="sr-only">What’s wrong with this question?</span>
          <input required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What’s wrong?"
            className="min-h-10 w-full rounded-lg border-2 border-border bg-surface px-2 text-text" />
        </label>
        <button disabled={state === 'sending'} className="min-h-10 rounded-lg border-2 border-border bg-surface px-3 font-semibold text-text">Send</button>
      </form>
      {state === 'error' && <p role="alert" className="mt-1">Couldn’t send. Try again.</p>}
    </details>
  )
}
