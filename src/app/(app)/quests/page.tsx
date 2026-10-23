'use client'
import { useEffect, useState } from 'react'
import { QuestList, type Quest } from '@/components/Quests'
import { Alert, Screen } from '@/components/ui'
import { CURRENCY } from '@/lib/config'
import { nextMidnight, timeLeft, utcDate } from '@/lib/dates'
import { ensureUser, rpc } from '@/lib/supabase'

type Weekly = { week_end: string; quests: Quest[] }

export default function QuestsPage() {
  const [daily, setDaily] = useState<Quest[] | null>(null)
  const [weekly, setWeekly] = useState<Weekly | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    ensureUser().then(() => Promise.all([rpc<Quest[]>('get_quests'), rpc<Weekly>('get_weekly_quests')]))
      .then(([d, w]) => { setDaily(d); setWeekly(w) }).catch((e) => setError(e.message))
  }, [])

  if (error) return <Screen wide><Alert title="Couldn’t load quests">{error}</Alert></Screen>
  if (!daily || !weekly) return <Screen wide><p aria-live="polite">Loading…</p></Screen>
  return (
    <Screen wide className="space-y-4">
      <h1 className="text-2xl font-bold">Quests</h1>
      <p className="text-text-muted">Finish quests to open their chests: {CURRENCY} for the shop, plus 5 bonus points for each daily quest.</p>
      <QuestList quests={daily} reward={5} note={`Resets in ${timeLeft(nextMidnight())}`} />
      <QuestList quests={weekly.quests} title="Weekly quests" id="weekly" reward={30} note={`Resets in ${timeLeft(utcDate(weekly.week_end))}`} />
    </Screen>
  )
}
