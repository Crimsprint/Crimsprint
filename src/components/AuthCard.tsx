'use client'
import Image from 'next/image'
import { useId, useState, type ReactNode } from 'react'

// Sign-in, sign-up, code and reset screens: one narrow centered card, the same on phone and desktop.
export function AuthCard({ title, children, links }: { title: string; children: ReactNode; links?: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <Image src="/mascot/raccoon-head.png" alt="Crimsprint raccoon mascot" width={72} height={72} priority className="size-18" />
        <h1 className="text-2xl font-bold">{title}</h1>
      </div>
      {children}
      {links && <div className="flex flex-col items-center gap-2 text-sm">{links}</div>}
    </main>
  )
}

const input = 'min-h-12 w-full rounded-xl border-2 border-border bg-surface px-4 text-text placeholder:text-text-muted'

/** A full-width field whose placeholder reads as its label; the label is also there for screen readers. */
export function Field({ label, error, ...props }: React.ComponentProps<'input'> & { label: string; error?: string }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="sr-only">{label}</label>
      <input id={id} placeholder={label} aria-invalid={!!error} aria-describedby={error ? `${id}-e` : undefined} className={input} {...props} />
      {error && <p id={`${id}-e`} className="mt-1 text-sm font-semibold">⚠ {error}</p>}
    </div>
  )
}

/** Password field with a show/hide toggle. */
export function PasswordField({ label = 'Password', autoComplete, value, onChange, error, hint }: {
  label?: string; autoComplete: 'new-password' | 'current-password'; value: string; onChange: (v: string) => void; error?: string; hint?: string
}) {
  const id = useId()
  const [shown, setShown] = useState(false)
  const note = error ? `⚠ ${error}` : hint
  return (
    <div>
      <label htmlFor={id} className="sr-only">{label}</label>
      <div className="relative">
        <input id={id} type={shown ? 'text' : 'password'} placeholder={label} required autoComplete={autoComplete} value={value}
          onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} aria-describedby={note ? `${id}-n` : undefined} className={`${input} pr-20`} />
        <button type="button" onClick={() => setShown(!shown)} aria-pressed={shown} aria-controls={id}
          className="absolute inset-y-1 right-1 rounded-lg px-3 text-sm font-semibold underline">
          {shown ? 'Hide' : 'Show'}<span className="sr-only"> password</span>
        </button>
      </div>
      {note && <p id={`${id}-n`} className={`mt-1 text-sm ${error ? 'font-semibold' : 'text-text-muted'}`}>{note}</p>}
    </div>
  )
}
