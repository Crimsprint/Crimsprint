'use client'
import { useEffect, useState } from 'react'
import { ACCESSORIES, Avatar, type Accessory } from '@/components/Avatar'
import { NavIcon } from '@/components/AppShell'
import { Alert, Button, Flame, Screen } from '@/components/ui'
import { CURRENCY } from '@/lib/config'
import { requireUser, rpc, type Profile } from '@/lib/supabase'

// Rules mirror buy_item (supabase/migrations/0007_pages_shop_drills.sql): freezes max 2, consumables max 3, accessories once.
const POWER_UPS = [
  { item: 'streak_freeze', name: 'Streak freeze', what: 'Covers one missed day so your streak survives.', icon: <Flame className="size-7" /> },
  { item: 'mistake_boost', name: 'Mistake boost', what: '+3 mistakes on your next lesson.', icon: <span className="text-2xl font-bold" aria-hidden>+3</span> },
  { item: 'timer_pass', name: 'Timer pass', what: '+50% time on your next timed drill.', icon: <NavIcon name="practice" className="size-7" /> },
]

export default function ShopPage() {
  const [p, setP] = useState<Profile | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    requireUser().then(() => rpc<Profile>('get_profile')).then(setP).catch((e) => setError(e.message))
  }, [version])

  async function buy(item: string, name: string) {
    setBusy(true)
    setError('')
    try {
      const left = await rpc<number>('buy_item', { p_item: item })
      setStatus(`Bought ${name}. ${left} ${CURRENCY} left.`)
      setVersion((v) => v + 1)
    } catch (e) { setError((e as Error).message) }
    setBusy(false)
  }

  if (!p) return <Screen wide>{error ? <Alert title="Couldn’t load the shop">{error}</Alert> : <p aria-live="polite">Loading…</p>}</Screen>

  const held = (item: string) => (item === 'streak_freeze' ? p.freezes : p.inventory[item] ?? 0)
  const limit = (item: string) => (item === 'streak_freeze' ? 2 : 3)
  return (
    <Screen wide className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">Shop</h1>
        <p className="text-lg font-bold">{p.coins} {CURRENCY}</p>
      </div>
      <p className="text-text-muted">Earn {CURRENCY} from unit chests and quests. Everything here is bought with {CURRENCY}; there is nothing to buy with real money.</p>
      {error && <Alert title="Couldn’t buy that">{error}</Alert>}
      <p role="status" className={status ? 'rounded-xl bg-success p-3 font-semibold text-on-success' : 'sr-only'}>{status}</p>

      <section aria-labelledby="power" className="space-y-3">
        <h2 id="power" className="text-xl font-bold">Power-ups</h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {POWER_UPS.map((u) => {
            const price = p.prices[u.item], full = held(u.item) >= limit(u.item)
            return (
              <li key={u.item} className="flex flex-col gap-3 rounded-2xl border-2 border-border bg-surface p-4">
                <span className="grid size-12 place-items-center rounded-xl bg-primary text-on-primary">{u.icon}</span>
                <div className="flex-1">
                  <h3 className="font-semibold">{u.name}</h3>
                  <p className="text-sm text-text-muted">{u.what}</p>
                  <p className="mt-1 text-sm">{price} {CURRENCY} · you have {held(u.item)} of {limit(u.item)}</p>
                </div>
                <Button disabled={busy || full || p.coins < price} onClick={() => buy(u.item, u.name)}>
                  {full ? 'Full' : p.coins < price ? `Need ${price - p.coins} more` : `${price} ${CURRENCY}`}<span className="sr-only">: {u.name}, {price} {CURRENCY}</span>
                </Button>
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-labelledby="acc" className="space-y-3">
        <h2 id="acc" className="text-xl font-bold">Raccoon accessories</h2>
        <p className="text-sm text-text-muted">Wear them on your profile and the leaderboard.</p>
        <ul className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(ACCESSORIES) as Accessory[]).map((a) => {
            const owned = held(a) > 0, price = p.prices[a]
            return (
              <li key={a} className="flex flex-col items-center gap-3 rounded-2xl border-2 border-border bg-surface p-4 text-center">
                <Avatar avatar={p.avatar} accessory={a} size={96} />
                <h3 className="font-semibold">{ACCESSORIES[a]} <span className="font-normal text-text-muted">· {price} {CURRENCY}</span></h3>
                <Button className="w-full" disabled={busy || owned || p.coins < price} onClick={() => buy(a, ACCESSORIES[a])}>
                  {owned ? 'Owned' : p.coins < price ? `Need ${price - p.coins} more` : `${price} ${CURRENCY}`}<span className="sr-only">: {ACCESSORIES[a]}, {price} {CURRENCY}</span>
                </Button>
              </li>
            )
          })}
        </ul>
      </section>
    </Screen>
  )
}
