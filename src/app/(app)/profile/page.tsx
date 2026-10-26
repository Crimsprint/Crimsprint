'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { MORE } from '@/components/AppShell'
import { ACCESSORIES, AVATARS, Avatar, type Accessory } from '@/components/Avatar'
import { Alert, Button, Screen } from '@/components/ui'
import { ACHIEVEMENTS } from '@/lib/achievements'
import { requireUser, rpc, type Profile } from '@/lib/supabase'

const NAME = /^[A-Za-z0-9][A-Za-z0-9 ._-]{1,18}[A-Za-z0-9]$/ // same rule as the profiles.display_name check

export default function ProfilePage() {
  const [p, setP] = useState<Profile | null>(null)
  const [form, setForm] = useState({ name: '', avatar: 'crimson', accessory: '' })
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    requireUser().then(() => rpc<Profile>('get_profile')).then((x) => {
      setP(x)
      setForm({ name: x.display_name ?? '', avatar: x.avatar, accessory: x.accessory ?? '' })
    }).catch((e) => setError(e.message))
  }, [])

  const set = (patch: Partial<typeof form>) => { setForm((f) => ({ ...f, ...patch })); setSaved(false) }
  const nameOk = !form.name.trim() || NAME.test(form.name.trim())

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await rpc('set_profile', { p_name: form.name, p_avatar: form.avatar, p_accessory: form.accessory || null })
      setP((x) => x && { ...x, display_name: form.name.trim() || null, avatar: form.avatar, accessory: form.accessory || null })
      setSaved(true)
    } catch (e) { setError((e as Error).message) }
    setBusy(false)
  }

  if (!p) return <Screen wide>{error ? <Alert title="Couldn’t load your profile">{error}</Alert> : <p aria-live="polite">Loading…</p>}</Screen>

  const earned = new Set(p.achievements.map((a) => a.code))
  const owned = (Object.keys(ACCESSORIES) as Accessory[]).filter((a) => p.inventory[a])
  return (
    <Screen wide className="space-y-8">
      <header className="flex items-center gap-4">
        <Avatar avatar={p.avatar} accessory={p.accessory} size={96} alt="Your avatar" />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold">{p.display_name ?? p.handle}</h1>
          <p className="text-text-muted">Joined {new Date(p.joined).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['Total points', p.total_points], ['Current streak', `${p.streak} day${p.streak === 1 ? '' : 's'}`],
          ['Longest streak', `${p.longest_streak} day${p.longest_streak === 1 ? '' : 's'}`], ['League', p.league ?? 'Off']].map(([k, v]) => (
          <div key={k} className="rounded-xl border-2 border-border bg-surface p-4">
            <dt className="text-sm text-text-muted">{k}</dt><dd className="text-xl font-bold">{v}</dd>
          </div>
        ))}
      </dl>

      <form onSubmit={save} className="space-y-4 rounded-2xl border-2 border-border bg-surface p-4">
        <h2 className="text-xl font-bold">Edit profile</h2>
        <label className="block">
          <span className="mb-1 block font-semibold">Display name</span>
          <input value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={20} placeholder="e.g. Raccoon Fan"
            aria-invalid={!nameOk} aria-describedby="name-help" className="min-h-12 w-full rounded-xl border-2 border-border bg-surface px-4" />
          <span id="name-help" className="mt-1 block text-sm text-text-muted">
            {nameOk ? 'Shown on leaderboards instead of your email. Use a nickname, not your full name. Leave blank for a random “Learner” name.'
              : '3–20 letters or numbers; spaces, dots, dashes and underscores allowed in the middle.'}
          </span>
        </label>
        <fieldset>
          <legend className="mb-2 font-semibold">Avatar color</legend>
          <div className="flex flex-wrap gap-3">
            {AVATARS.map((a) => (
              <label key={a} className="cursor-pointer rounded-2xl border-2 p-1 has-[:checked]:border-nav-active-border has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-focus border-transparent">
                <input type="radio" name="avatar" value={a} checked={form.avatar === a} onChange={() => set({ avatar: a })} className="sr-only" />
                <Avatar avatar={a} accessory={form.accessory} size={56} />
                <span className="sr-only">{a}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 font-semibold">Accessory</legend>
          {owned.length ? (
            <div className="flex flex-wrap gap-3">
              {['', ...owned].map((a) => (
                <label key={a || 'none'} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border-2 border-border px-3 has-[:checked]:border-nav-active-border has-[:checked]:bg-nav-active">
                  <input type="radio" name="accessory" checked={form.accessory === a} onChange={() => set({ accessory: a })} />
                  {a ? ACCESSORIES[a as Accessory] : 'None'}
                </label>
              ))}
            </div>
          ) : <p className="text-sm text-text-muted">None yet. <Link href="/shop" className="font-semibold text-text underline">Visit the shop</Link></p>}
        </fieldset>
        {error && <Alert title="Couldn’t save">{error}</Alert>}
        {saved && <p role="status" className="font-semibold">Saved.</p>}
        <Button type="submit" className="w-full" disabled={busy || !nameOk}>Save profile</Button>
      </form>

      <section aria-labelledby="ach" className="space-y-3">
        <h2 id="ach" className="text-xl font-bold">Achievements</h2>
        <ul className="grid grid-cols-2 gap-3">
          {Object.entries(ACHIEVEMENTS).map(([code, a]) => (
            <li key={code} className={`rounded-xl p-3 ${earned.has(code) ? 'bg-accent text-on-accent' : 'border-2 border-dashed border-border text-text-muted'}`}>
              <p className="font-semibold">{a.title}{earned.has(code) ? '' : ' (locked)'}</p>
              <p className="text-sm">{a.how}</p>
            </li>
          ))}
        </ul>
      </section>

      <nav aria-label="Profile">
        <ul className="divide-y-2 divide-border overflow-hidden rounded-2xl border-2 border-border bg-surface">
          {[{ href: '/shop', label: 'Shop' }, ...MORE].map((m) => (
            <li key={m.href}><Link href={m.href} className="flex min-h-12 items-center justify-between px-4 font-semibold">{m.label}<span aria-hidden>›</span></Link></li>
          ))}
        </ul>
      </nav>
    </Screen>
  )
}
