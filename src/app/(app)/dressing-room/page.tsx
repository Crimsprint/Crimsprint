'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useUpdateAvatar } from '@/components/AppShell'
import { Avatar, AvatarItemArt } from '@/components/Avatar'
import { Alert, Lock, Screen } from '@/components/ui'
import { CATALOG, DEFAULT_OUTFIT, HAIR_PRESETS, ITEMS, LAYERS, RARITIES, resolveOutfit, type AvatarItem, type Layer, type Outfit } from '@/lib/avatar'
import { CURRENCY } from '@/lib/config'
import { requireUser, rpc, type Profile } from '@/lib/supabase'
import './room.css'

const CATEGORIES: { label: string; layers: Layer[] }[] = [
  { label: 'Tops', layers: ['top', 'outerwear'] }, { label: 'Bottoms', layers: ['bottoms'] },
  { label: 'Shoes', layers: ['shoes'] }, { label: 'Headwear', layers: ['headwear'] },
  { label: 'Accessories', layers: ['accessory'] }, { label: 'Backgrounds', layers: ['background'] },
  { label: 'Hair', layers: ['hair'] }, { label: 'Face', layers: ['face'] }, { label: 'Skin', layers: ['skin'] },
]
const OPTIONAL: Layer[] = ['outerwear', 'headwear', 'accessory', 'background']
const random = <T,>(values: T[]) => values[Math.floor(Math.random() * values.length)]

function Coin({ value }: { value: number }) {
  return <span className="dressing-room-coin"><span aria-hidden>✦</span>{value} {CURRENCY}</span>
}

export default function DressingRoomPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [draft, setDraft] = useState<Outfit>(DEFAULT_OUTFIT)
  const [category, setCategory] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [sort, setSort] = useState('new')
  const [filter, setFilter] = useState('all')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const setHeaderOutfit = useUpdateAvatar()

  useEffect(() => {
    let active = true
    requireUser().then(() => rpc<Profile>('get_profile')).then((value) => {
      if (active) { setProfile(value); setDraft(resolveOutfit(value)) }
    }).catch((e: Error) => { if (active) setError(e.message) })
    return () => { active = false }
  }, [])

  if (!profile) return <Screen wide>{error ? <Alert title="Couldn’t load the dressing room">{error}</Alert> : <p role="status">Loading…</p>}</Screen>

  const saved = resolveOutfit(profile)
  const price = (item: AvatarItem) => item.free ? 0 : profile.prices[item.id]
  const owns = (item: AvatarItem) => item.free || (profile.inventory[item.id] ?? 0) > 0
  const activeItem = selected ? ITEMS.get(selected) : undefined
  const locked = activeItem && !owns(activeItem) ? activeItem : undefined
  const lockedPrice = locked ? price(locked) : undefined
  const preview = locked ? { ...draft, [locked.layer]: locked.id } : draft
  const changed = draft.hairColor !== saved.hairColor || LAYERS.some((layer) => draft[layer] !== saved[layer])
  const layers = CATEGORIES[category].layers
  const available = CATALOG.filter((item) => layers.includes(item.layer)
    && (item.free || price(item) !== undefined)
    && (filter === 'all' || (filter === 'owned') === owns(item)))
  if (sort === 'price') available.sort((a, b) => price(a) - price(b))
  if (sort === 'rarity') available.sort((a, b) => RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity))

  function selectCategory(index: number) {
    setCategory(index)
    setSelected(null)
  }

  function tryOn(item: AvatarItem) {
    setSelected(item.id)
    setStatus('')
    setError('')
    if (owns(item)) setDraft((outfit) => ({ ...outfit, [item.layer]: item.id }))
  }

  function remove(layer: Layer) {
    setError('')
    setDraft((outfit) => {
      const next = { ...outfit }
      delete next[layer]
      return next
    })
    setSelected(null)
    setStatus('')
  }

  function randomize() {
    const next: Outfit = { hairColor: random(Object.values(HAIR_PRESETS)) }
    for (const layer of LAYERS) {
      if (layer === 'effect') continue
      const options = CATALOG.filter((item) => item.layer === layer && owns(item))
      const item = random(OPTIONAL.includes(layer) ? [undefined, ...options] : options)
      if (item) next[layer] = item.id
    }
    setDraft(next)
    setSelected(null)
    setStatus('Random outfit ready to try on.')
    setError('')
  }

  function reset() {
    setDraft(saved)
    setSelected(null)
    setStatus('Returned to your equipped outfit.')
    setError('')
  }

  async function buy(item: AvatarItem) {
    setBusy(true)
    setError('')
    setStatus('')
    try {
      const coins = await rpc<number>('buy_item', { p_item: item.id })
      setProfile((current) => current && { ...current, coins, inventory: { ...current.inventory, [item.id]: 1 } })
      setDraft((outfit) => ({ ...outfit, [item.layer]: item.id }))
      setStatus(`Bought ${item.name}. Equip to save your look.`)
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  async function equip() {
    setBusy(true)
    setError('')
    setStatus('')
    try {
      await rpc('set_avatar_outfit', { p_outfit: draft })
      setProfile((current) => current && { ...current, outfit: draft })
      setHeaderOutfit(draft)
      setStatus('Outfit equipped.')
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <main className="dressing-room">
      <header className="dressing-room-heading">
        <div>
          <Link className="dressing-room-back" href="/profile">← Profile</Link>
          <h1>Dressing room</h1>
        </div>
        <div className="dressing-room-balance"><Coin value={profile.coins} /></div>
      </header>

      {error && <Alert title="Couldn’t update your outfit">{error}</Alert>}
      <div className="dressing-room-layout">
        <section className="dressing-room-preview" aria-labelledby="preview-title">
          <div className="dressing-room-preview-heading">
            <h2 id="preview-title">Your look</h2>
            <span>{locked ? 'Trying on' : changed ? 'Unsaved' : 'Equipped'}</span>
          </div>
          <div className="dressing-room-stage">
            <Avatar outfit={preview} size={360} alt="Live outfit preview" />
          </div>
          <div className="dressing-room-preview-detail">
            {locked ? <><Lock className="size-4" />{locked.name} {lockedPrice !== undefined && <Coin value={lockedPrice} />}</>
              : <p>{changed ? 'Equip to save this look.' : 'This is the outfit other learners see.'}</p>}
          </div>
          <div className="dressing-room-actions">
            {locked && <button type="button" className="dressing-room-primary"
              disabled={busy || lockedPrice === undefined || profile.coins < lockedPrice} onClick={() => buy(locked)}>
              {lockedPrice !== undefined && profile.coins < lockedPrice ? `Need ${lockedPrice - profile.coins} more ${CURRENCY}` : 'Buy'}
            </button>}
            <button type="button" className={locked ? 'dressing-room-secondary' : 'dressing-room-primary'} disabled={busy || !changed || !!locked} onClick={equip}>Equip</button>
          </div>
          <div className="dressing-room-tools">
            <button type="button" disabled={busy} onClick={randomize}>
              <svg viewBox="0 0 24 24" aria-hidden><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M8 8h.01m8 0h.01m-4 4h.01m-4 4h.01m8 0h.01" /></svg>
              Randomize
            </button>
            <button type="button" disabled={busy || (!changed && !locked)} onClick={reset}>
              <svg viewBox="0 0 24 24" aria-hidden><path d="M4 10a8 8 0 1 1 1.7 7M4 4v6h6" /></svg>
              Reset
            </button>
          </div>
          <p role="status" className={status ? 'dressing-room-status' : 'sr-only'}>{status}</p>
        </section>

        <section className="dressing-room-catalog" aria-labelledby="wardrobe-title">
          <div className="dressing-room-catalog-head">
            <h2 id="wardrobe-title">Wardrobe</h2>
            <div className="dressing-room-filters">
              <label><span className="sr-only">Ownership</span>
                <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                  <option value="all">All items</option><option value="owned">Owned</option><option value="locked">Locked</option>
                </select>
              </label>
              <label><span className="sr-only">Sort by</span>
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="new">Newest</option><option value="price">Price ↑</option><option value="rarity">Rarity ↓</option>
                </select>
              </label>
            </div>
          </div>
          <div className="dressing-room-categories" role="tablist" aria-label="Item categories"
            onKeyDown={(e) => {
              const offset = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
              if (busy || (!offset && e.key !== 'Home' && e.key !== 'End')) return
              e.preventDefault()
              const index = e.key === 'Home' ? 0 : e.key === 'End' ? CATEGORIES.length - 1 : (category + offset + CATEGORIES.length) % CATEGORIES.length
              selectCategory(index)
              e.currentTarget.querySelectorAll('button')[index]?.focus()
            }}>
            {CATEGORIES.map(({ label }, index) => (
              <button type="button" key={label} id={`avatar-category-${index}`} role="tab" aria-selected={index === category}
                aria-controls="avatar-items" tabIndex={index === category ? 0 : -1} disabled={busy}
                onClick={() => selectCategory(index)}>{label}</button>
            ))}
          </div>

          <div id="avatar-items" role="tabpanel" aria-labelledby={`avatar-category-${category}`} tabIndex={0} className="dressing-room-items">
            {layers.includes('hair') && <div className="dressing-room-tint">
              <label htmlFor="avatar-hair-color">Hair color</label>
              {Object.entries(HAIR_PRESETS).map(([name, color]) => <button key={name} type="button" disabled={busy} aria-label={`${name} hair`}
                aria-pressed={draft.hairColor === color} style={{ backgroundColor: color }}
                onClick={() => setDraft((outfit) => ({ ...outfit, hairColor: color }))} />)}
              <input id="avatar-hair-color" type="color" value={draft.hairColor ?? DEFAULT_OUTFIT.hairColor} disabled={busy}
                onChange={(e) => setDraft((outfit) => ({ ...outfit, hairColor: e.target.value }))} />
            </div>}
            {OPTIONAL.filter((layer) => layers.includes(layer) && preview[layer]).map((layer) => (
              <button key={layer} type="button" className="dressing-room-remove" disabled={busy} onClick={() => remove(layer)}>Remove {layer === 'outerwear' ? 'jacket' : layer}</button>
            ))}
            {available.length === 0 && <p className="dressing-room-empty">No {filter === 'all' ? 'available' : filter} items in this category.</p>}
            <ul className="dressing-room-grid">
              {available.map((item) => {
                const owned = owns(item), showing = preview[item.layer] === item.id
                return <li key={item.id}>
                  <button type="button" className="dressing-room-item" aria-pressed={showing} disabled={busy} onClick={() => tryOn(item)}>
                    <div className="dressing-room-art">
                      <AvatarItemArt item={item} hairColor={draft.hairColor ?? DEFAULT_OUTFIT.hairColor} />
                      <span className="dressing-room-rarity" data-rarity={item.rarity}>{item.rarity}</span>
                    </div>
                    <span className="dressing-room-item-name">{item.name}</span>
                    <span className="dressing-room-item-meta">
                      {showing && owned ? 'In preview' : item.free ? 'Free' : owned ? 'Owned' : <><Lock className="size-3" /><Coin value={price(item)} /></>}
                    </span>
                  </button>
                </li>
              })}
            </ul>
          </div>
        </section>
      </div>
    </main>
  )
}
