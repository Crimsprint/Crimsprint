'use client'
import { useEffect, useState } from 'react'
import { DailyQuests, type Quest } from '@/components/Quests'
import { Alert, Screen } from '@/components/ui'
import { ensureUser, rpc } from '@/lib/supabase'

export default function QuestsPage() {
  const [quests, setQuests] = useState<Quest[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    ensureUser().then(() => rpc<Quest[]>('get_quests')).then(setQuests).catch((e) => setError(e.message))
  }, [])

  return (
    <Screen wide className="space-y-4">
      {error ? <Alert title="Couldn’t load quests">{error}</Alert>
        : quests ? <DailyQuests quests={quests} headingLevel="h1" />
        : <p aria-live="polite">Loading…</p>}
      <p className="text-sm text-text-muted">Daily quests reset at midnight in your time zone.</p>
    </Screen>
  )
}
