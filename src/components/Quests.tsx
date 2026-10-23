'use client'
import { Check, ProgressBar } from '@/components/ui'

export type Quest = { code: string; title: string; target: number; progress: number; done: boolean }

export function DailyQuests({ quests, headingLevel: H = 'h2', id = 'quests' }: { quests: Quest[]; headingLevel?: 'h1' | 'h2'; id?: string }) {
  return (
    <section aria-labelledby={id} className="rounded-2xl border-2 border-border bg-surface p-4">
      <H id={id} className="font-semibold">Daily quests</H>
      <ul className="mt-3 space-y-3">
        {quests.map((q) => {
          const shown = q.code === 'minutes15' ? [Math.floor(q.progress / 60), 15] : [q.progress, q.target]
          return (
            <li key={q.code} className="flex items-center gap-3">
              <span className={`grid size-7 shrink-0 place-items-center rounded-full ${q.done ? 'bg-success text-on-success' : 'bg-locked-bg text-on-locked'}`}>
                {q.done ? <Check className="size-4" /> : null}
              </span>
              <div className="flex-1">
                <p className="text-sm">{q.title}{q.done && <span className="sr-only"> (done)</span>}</p>
                <ProgressBar value={shown[0]} max={shown[1]} label={`${q.title}: ${shown[0]} of ${shown[1]}`} />
              </div>
              <span className="text-xs tabular-nums text-text-muted">{shown[0]}/{shown[1]}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
