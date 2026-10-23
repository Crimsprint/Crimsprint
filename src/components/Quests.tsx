'use client'
import Link from 'next/link'
import { NavIcon } from '@/components/AppShell'
import { Check, ProgressBar } from '@/components/ui'

export type Quest = { code: string; title: string; target: number; progress: number; done: boolean }

export function DailyQuests({ quests, headingLevel: H = 'h2', id = 'quests', viewAll = false }: {
  quests: Quest[]; headingLevel?: 'h1' | 'h2'; id?: string; viewAll?: boolean
}) {
  return (
    <section aria-labelledby={id} className="rounded-2xl border-2 border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <H id={id} className="font-semibold">Daily quests</H>
        {viewAll && <Link href="/quests" className="text-sm font-bold uppercase tracking-wide underline">View all</Link>}
      </div>
      <ul className="mt-3 space-y-3">
        {quests.map((q) => {
          const shown = q.code === 'minutes15' ? [Math.floor(q.progress / 60), 15] : [q.progress, q.target]
          return (
            <li key={q.code} className="flex items-center gap-3">
              <span className={`grid size-7 shrink-0 place-items-center rounded-full ${q.done ? 'bg-success text-on-success' : 'bg-locked-bg text-on-locked'}`}>
                {q.done ? <Check className="size-4" /> : null}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm">{q.title}{q.done && <span className="sr-only"> (done)</span>}</p>
                <ProgressBar value={shown[0]} max={shown[1]} label={`${q.title}: ${shown[0]} of ${shown[1]}`} />
              </div>
              <span className="text-xs tabular-nums text-text-muted">{shown[0]}/{shown[1]}</span>
              {/* Reward chest: filled once the quest's bonus is paid. */}
              <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${q.done ? 'bg-primary text-on-primary' : 'bg-locked-bg text-on-locked'}`}>
                <NavIcon name="quests" className="size-5" />
                <span className="sr-only">{q.done ? 'Reward collected' : 'Reward chest'}</span>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
