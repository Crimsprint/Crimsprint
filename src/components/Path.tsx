'use client'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { NavIcon } from '@/components/AppShell'
import { Button, Check, Lock, XIcon } from '@/components/ui'
import { CURRENCY } from '@/lib/config'
import { nodeOffset, type PathNode, type Unit } from '@/lib/path'
import { TIPS } from '@/lib/tips'

export type StartArgs = Record<string, unknown>
const SECTION_NO = { rw: 1, math: 2 }
const TIER_NAME = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }

const Star = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.5L12 17.2l-5.9 3.2 1.3-6.5L2.5 9.3l6.6-.8z" /></svg>
)
function KindIcon({ kind, className }: { kind: PathNode['kind']; className: string }) {
  if (kind === 'lesson') return <Star className={className} />
  return <NavIcon name={kind === 'practice' ? 'practice' : kind === 'chest' ? 'quests' : 'leaderboards'} className={className} />
}

function title(n: PathNode) {
  return n.kind === 'lesson' ? n.skillName! : n.kind === 'practice' ? 'Unit practice' : n.kind === 'chest' ? 'Chest' : 'Unit test'
}
function subtitle(n: PathNode) {
  if (n.kind === 'lesson') return `${TIER_NAME[n.tier!]} · Lesson ${n.lesson!.index} of ${n.lesson!.count}`
  if (n.kind === 'practice') return 'Mixed review of this unit’s skills'
  if (n.kind === 'chest') return `Bonus ${CURRENCY} for finishing the first two rounds`
  return '10 questions · 8 right finishes the unit'
}
const STATE_TEXT = { done: 'completed', current: 'start here', available: 'available to test out', locked: 'locked' }

function Mascot({ side, bob }: { side: 'left' | 'right'; bob: boolean }) {
  return (
    <Image src="/mascot/raccoon.png" alt="Crimsprint raccoon mascot" width={96} height={96}
      className={`pointer-events-none absolute top-1/2 -mt-12 max-w-none ${bob ? 'motion-safe:animate-bob' : ''} ${side === 'left' ? 'right-full mr-6' : 'left-full ml-6'}`} />
  )
}

/** Progress ring drawn around the current node: how much of the unit is done. */
function Ring({ value }: { value: number }) {
  const r = 46, c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 100 100" className="pointer-events-none absolute -inset-2.5 size-[calc(100%+1.25rem)]" aria-hidden>
      <circle cx="50" cy="50" r={r} fill="none" strokeWidth="6" className="stroke-track" />
      <circle cx="50" cy="50" r={r} fill="none" strokeWidth="6" strokeLinecap="round" className="stroke-ring-progress"
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(value, 0.04))} transform="rotate(-90 50 50)" />
    </svg>
  )
}

function Popover({ n, unit, busy, onStart, onClaim, close }: {
  n: PathNode; unit: Unit; busy: boolean; onStart: (args: StartArgs) => void; onClaim: (domain: string) => void; close: () => void
}) {
  const start = () => onStart(n.kind === 'lesson' ? { p_mode: 'lesson', p_skill: n.skillId, p_tier: n.tier }
    : { p_mode: n.kind === 'test' ? 'unit_test' : 'unit_practice', p_domain: unit.id })
  let body: React.ReactNode
  if (n.state === 'locked') {
    body = <p className="text-sm">{unit.unlocked ? 'Finish the steps above to unlock this.' : `Pass the Unit ${unit.number - 1} test to unlock this unit.`}</p>
  } else if (n.kind === 'chest') {
    body = n.state === 'done' ? <p className="text-sm">Opened.</p>
      : <Button className="w-full" disabled={busy} onClick={() => onClaim(unit.id)}>Open chest</Button>
  } else if (n.kind === 'test' && n.state === 'done') {
    body = <p className="text-sm">Passed. This unit is complete.</p>
  } else if (n.state === 'available') {
    body = <>
      <p className="text-sm">Already know this unit? Pass the test to skip the rest of it.</p>
      <Button className="w-full" disabled={busy} onClick={start}>Test out</Button>
    </>
  } else {
    body = <Button className="w-full" variant={n.state === 'done' ? 'secondary' : 'primary'} disabled={busy} onClick={start}>
      {n.state === 'done' ? (n.kind === 'practice' ? 'Practice again' : 'Review') : 'Start'}
    </Button>
  }
  return (
    <div id={`pop-${n.key}`} role="group" aria-label={title(n)} className="relative z-10 mx-auto mt-3 w-full max-w-xs space-y-3 rounded-2xl border-2 border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold">{title(n)}</p>
          <p className="text-sm text-text-muted">{subtitle(n)}</p>
        </div>
        <button onClick={close} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-full"><XIcon className="size-4" /></button>
      </div>
      {body}
    </div>
  )
}

function UnitBlock({ unit, section, openKey, setOpenKey, busy, onStart, onClaim, onTips, flip }: {
  unit: Unit; section: 'rw' | 'math'; openKey: string | null; setOpenKey: (k: string | null) => void
  busy: boolean; onStart: (args: StartArgs) => void; onClaim: (domain: string) => void; onTips: (u: Unit) => void; flip: boolean
}) {
  const half = Math.floor(unit.nodes.length / 2)
  return (
    <section aria-labelledby={`unit-${unit.id}`}>
      <header className={`sticky top-0 z-20 flex items-center justify-between gap-3 rounded-2xl p-4 ${unit.unlocked ? 'bg-primary text-on-primary' : 'bg-locked-bg text-on-locked'}`}>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest">Section {SECTION_NO[section]}, Unit {unit.number}</p>
          <h2 id={`unit-${unit.id}`} className="text-xl font-bold">{unit.title}</h2>
        </div>
        <button onClick={() => onTips(unit)} className="shrink-0 rounded-xl border-2 border-current px-3 py-2 text-sm font-bold uppercase tracking-widest">
          Tips<span className="sr-only"> for {unit.title}</span>
        </button>
      </header>
      <ol className="mt-16 space-y-6 pb-4">
        {unit.nodes.map((n, i) => {
          const x = nodeOffset(i)
          const side = x > 0 || (x === 0 && flip) ? 'left' : 'right'
          const open = openKey === n.key
          const current = n.state === 'current'
          return (
            <li key={n.key} className="relative">
              <div className="relative mx-auto size-[72px]" style={{ transform: `translateX(${x}px)` }}>
                {current && (
                  <span className="absolute -top-11 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-xl border-2 border-border bg-surface px-3 py-1 text-sm font-bold uppercase tracking-widest motion-safe:animate-bob" aria-hidden>
                    Start
                  </span>
                )}
                {current && <Ring value={unit.progress} />}
                <button id={`node-${n.key}`} data-current={current || undefined} aria-expanded={open} aria-controls={open ? `pop-${n.key}` : undefined}
                  aria-label={`${title(n)}, ${subtitle(n)}: ${STATE_TEXT[n.state]}`}
                  onClick={() => setOpenKey(open ? null : n.key)}
                  className={`relative grid size-full place-items-center rounded-full ${{
                    done: 'bg-primary text-on-primary',
                    current: 'bg-primary text-on-primary',
                    available: 'border-2 border-border bg-surface text-text',
                    locked: 'bg-locked-bg text-locked',
                  }[n.state]}`}>
                  {n.state === 'done' ? <Check className="size-8" /> : n.state === 'locked' ? <Lock className="size-7" /> : <KindIcon kind={n.kind} className="size-8" />}
                </button>
                {(current || i === half) && <Mascot side={side} bob={current} />}
              </div>
              {open && <Popover n={n} unit={unit} busy={busy} onStart={onStart} onClaim={onClaim}
                close={() => { setOpenKey(null); document.getElementById(`node-${n.key}`)?.focus() }} />}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

export function Path({ units, section, busy, onStart, onClaim }: {
  units: Unit[]; section: 'rw' | 'math'; busy: boolean; onStart: (args: StartArgs) => void; onClaim: (domain: string) => void
}) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [tips, setTips] = useState<Unit | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => { if (tips) dialog.current?.showModal() }, [tips])

  return (
    <div className="space-y-12" onKeyDown={(e) => {
      if (e.key === 'Escape' && openKey) { document.getElementById(`node-${openKey}`)?.focus(); setOpenKey(null) }
    }}>
      {units.map((u, i) => (
        <UnitBlock key={u.id} unit={u} section={section} openKey={openKey} setOpenKey={setOpenKey} busy={busy}
          onStart={onStart} onClaim={onClaim} onTips={setTips} flip={i % 2 === 1} />
      ))}
      <dialog ref={dialog} onClose={() => setTips(null)} aria-labelledby="tips-title"
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl bg-surface p-6 text-text backdrop:bg-scrim/60">
        {tips && <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Section {SECTION_NO[section]}, Unit {tips.number}</p>
              <h2 id="tips-title" className="text-xl font-bold">Tips: {tips.title}</h2>
            </div>
            <button onClick={() => dialog.current?.close()} aria-label="Close tips" className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-border"><XIcon className="size-4" /></button>
          </div>
          <ul className="mt-4 space-y-3">
            {(TIPS[tips.id] ?? []).map((t) => <li key={t} className="flex gap-3"><Check className="mt-1 size-4 shrink-0" />{t}</li>)}
          </ul>
        </>}
      </dialog>
    </div>
  )
}
