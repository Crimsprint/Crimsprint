'use client' // reads the public Supabase config, which lives in a client module
import Link from 'next/link'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Screen } from '@/components/ui'
import { configured } from '@/lib/supabase'

// Signed-in learners never see this page: src/proxy.ts sends them to /learn.
export default function Landing() {

  return (
    <Screen className="flex flex-col justify-center gap-8">
      <div className="flex justify-end"><ThemeToggle /></div>
      <div className="rounded-3xl bg-primary p-8 text-on-primary">
        <p className="text-sm font-semibold uppercase tracking-widest">Crimsprint</p>
        <h1 className="mt-3 text-4xl font-bold leading-tight">Ten minutes a day to a higher SAT score.</h1>
        <p className="mt-4 text-lg">Short adaptive lessons, instant explanations, and a full mock test that mirrors the digital SAT.</p>
      </div>
      <ul className="space-y-2 text-text-muted">
        <li>• A 25-minute diagnostic finds your weak skills</li>
        <li>• 8-question lessons on one skill at a time</li>
        <li>• Every answer explained, including why the wrong ones are wrong</li>
      </ul>
      {configured ? (
        <div className="space-y-3">
          <Link href="/onboarding" className="grid min-h-12 place-items-center rounded-xl bg-primary px-5 font-semibold uppercase tracking-wide text-on-primary">Get started</Link>
          <Link href="/login" className="grid min-h-12 place-items-center rounded-xl border-2 border-border bg-surface px-5 font-semibold uppercase tracking-wide">I already have an account</Link>
        </div>
      ) : (
        <p role="alert" className="rounded-xl border-2 border-border bg-surface p-4">
          Supabase isn’t configured yet. Copy <code>.env.example</code> to <code>.env.local</code>, fill in your project URL and publishable key, then restart the dev server.
        </p>
      )}
      <p className="text-xs text-text-muted">Not affiliated with College Board, the SAT, or any university. SAT is a trademark of College Board.</p>
    </Screen>
  )
}
