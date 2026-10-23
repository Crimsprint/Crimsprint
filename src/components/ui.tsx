'use client'
import type { ComponentProps, ReactNode } from 'react'

export function Button({ variant = 'primary', className = '', ...props }: ComponentProps<'button'> & { variant?: 'primary' | 'secondary' | 'success' }) {
  const look = {
    primary: 'bg-primary text-on-primary',
    success: 'bg-success text-on-success',
    secondary: 'bg-surface text-text border-2 border-border',
  }[variant]
  return (
    <button
      {...props}
      className={`min-h-12 rounded-xl px-5 font-semibold uppercase tracking-wide transition-opacity disabled:cursor-not-allowed disabled:bg-locked-bg disabled:text-text-muted disabled:border-transparent ${look} ${className}`}
    />
  )
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className="h-3 w-full overflow-hidden rounded-full bg-track">
      <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
    </div>
  )
}

/** Daily-goal ring (decorative: the number beside it carries the value). */
export function GoalRing({ value, goal, size = 40 }: { value: number; goal: number; size?: number }) {
  const r = 16, c = 2 * Math.PI * r, f = Math.min(1, value / goal)
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <circle cx="20" cy="20" r={r} fill="none" strokeWidth="5" className="stroke-track" />
      <circle cx="20" cy="20" r={r} fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-ring-progress"
        strokeDasharray={c} strokeDashoffset={c * (1 - f)} transform="rotate(-90 20 20)" />
    </svg>
  )
}

export const Check = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
)
export const XIcon = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
)
export const Lock = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor"><path d="M7 10V8a5 5 0 0110 0v2h1a1 1 0 011 1v9a1 1 0 01-1 1H6a1 1 0 01-1-1v-9a1 1 0 011-1h1zm2 0h6V8a3 3 0 00-6 0v2z" /></svg>
)
export const Flame = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor"><path d="M12 2c1 4 5 5.5 5 11a5 5 0 01-10 0c0-2.5 1.2-4 2.5-5 0 2 1 3 2 3 0-3-1.5-5.5.5-9z" /></svg>
)

export function Screen({ children, className = '', wide = false }: { children: ReactNode; className?: string; wide?: boolean }) {
  return <main className={`mx-auto w-full ${wide ? 'max-w-[45rem]' : 'max-w-xl'} flex-1 px-4 py-6 ${className}`}>{children}</main>
}

/** Error/incorrect banner: crimson only as a filled strip and icon disc (never thin lines), always with an icon and a label. */
export function Alert({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div role="alert" className="overflow-hidden rounded-xl bg-surface">
      <div className="h-2 bg-danger" />
      <div className="flex gap-3 p-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-danger text-on-danger"><XIcon className="size-4" /></span>
        <div><p className="font-semibold">{title}</p>{children && <div className="text-text-muted">{children}</div>}</div>
      </div>
    </div>
  )
}
