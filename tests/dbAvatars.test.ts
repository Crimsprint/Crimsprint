import { beforeAll, expect, it } from 'vitest'
import { CATALOG, DEFAULT_OUTFIT, LEGACY_COLORS, resolveOutfit } from '../src/lib/avatar'
import { applyMigration, as, db, newUser, rpc, setupThrough } from './harness'

const uid = '00000000-0000-0000-0000-000000000aa1'
const newcomer = '00000000-0000-0000-0000-000000000aa2'
const other = '00000000-0000-0000-0000-000000000aa3'

beforeAll(async () => {
  await setupThrough(11)
  await newUser(uid)
  await db.query('update public.profiles set coins = 200 where id = $1', [uid])
  await as(uid, async () => {
    expect(await rpc('buy_item', ['cap'])).toBe(100)
    expect(await rpc('buy_item', ['glasses'])).toBe(40)
    expect(await rpc('buy_item', ['bowtie'])).toBe(0)
    await rpc('set_profile', ['Legacy Learner', 'green', 'cap'])
  })
  await applyMigration('0012_layered_avatars.sql')
  await newUser(newcomer)
  await newUser(other)
}, 60_000)

it('preserves all legacy purchases, selection and colors through the database-first rollout', async () => {
  const profile = await as(uid, () => rpc('get_profile'))
  expect(profile).toMatchObject({
    avatar: 'green', accessory: 'cap', outfit: null, coins: 0,
    inventory: { cap: 1, glasses: 1, bowtie: 1 },
    prices: { cap: 100, glasses: 60, bowtie: 40 },
  })
  expect(resolveOutfit(profile)).toEqual({ ...DEFAULT_OUTFIT, hairColor: '#366453', headwear: 'cap' })
  expect(new Set(Object.values(LEGACY_COLORS)).size).toBe(6)
  for (const [avatar, hairColor] of Object.entries(LEGACY_COLORS)) {
    expect(resolveOutfit({ avatar }).hairColor).toBe(hairColor)
  }
  await as(uid, async () => {
    await rpc('set_profile', ['Legacy Learner', 'ink', 'bowtie'])
    expect(resolveOutfit(await rpc('get_profile'))).toMatchObject({ hairColor: '#282431', accessory: 'bowtie' })
    await rpc('set_profile', ['Legacy Learner', 'ink', 'glasses'])
    expect(resolveOutfit(await rpc('get_profile'))).toMatchObject({ accessory: 'glasses' })
    const outfit = { ...DEFAULT_OUTFIT, headwear: 'cap', accessory: 'bowtie' }
    await rpc('set_avatar_outfit', [outfit])
    const legacyLeague = await rpc('get_league')
    expect(legacyLeague.members.find((member: { me: boolean }) => member.me)).toMatchObject({ avatar: 'ink', accessory: 'glasses' })
    const league = await rpc('get_league_v2')
    expect(league.members.find((member: { me: boolean }) => member.me)).toMatchObject({ outfit })
    expect(await rpc('set_display_name', ['New Wardrobe Name'])).toBe('New Wardrobe Name')
    expect(await rpc('get_profile')).toMatchObject({ display_name: 'New Wardrobe Name', avatar: 'ink', accessory: 'glasses', outfit, coins: 0 })
  })
})

it('exposes every paid price from the same catalog used for purchases', async () => {
  const { rows } = await db.query<{ item: string; layer: string; price: number }>('select * from public.avatar_catalog()')
  expect(rows).toHaveLength(CATALOG.length)
  const { prices } = await as(newcomer, () => rpc('get_profile'))
  const pricesByRarity = { common: 50, rare: 120, epic: 300, legendary: 700 }
  const legacy = new Map([['cap', 100], ['glasses', 60], ['bowtie', 40]])
  for (const item of CATALOG) {
    const expected = item.free ? 0 : legacy.get(item.id) ?? pricesByRarity[item.rarity]
    expect(rows.find((row) => row.item === item.id)).toEqual({ item: item.id, layer: item.layer, price: expected })
    expect(prices[item.id]).toBe(item.free ? undefined : expected)
  }
})

it('charges the database price once and allows free equip only after ownership', async () => {
  await db.query('update public.profiles set coins = $2 where id = $1', [newcomer, 750])
  const outfit = { ...DEFAULT_OUTFIT, top: 'top_hoodie', hairColor: '#00aaff' }
  await as(newcomer, async () => {
    await expect(rpc('set_avatar_outfit', [outfit])).rejects.toThrow(/not owned/)
    await expect(rpc('buy_item', ['hair_curls'])).rejects.toThrow(/unknown item/)
    await expect(rpc('buy_item', ['top_hoodie', 1])).rejects.toThrow(/does not exist/)
    expect(await rpc('buy_item', ['top_hoodie'])).toBe(700)
    await expect(rpc('buy_item', ['top_hoodie'])).rejects.toThrow(/already owned/)
    expect(await rpc('buy_item', ['bg_crimson'])).toBe(0)
    await expect(rpc('buy_item', ['top_sweater'])).rejects.toThrow(/not enough coins/)
    const worn = { ...outfit, skin: 'skin_umber', hair: 'hair_curls', background: 'bg_crimson' }
    await rpc('set_avatar_outfit', [worn])
    expect(await rpc('get_profile')).toMatchObject({ outfit: worn, coins: 0, inventory: { top_hoodie: 1, bg_crimson: 1 } })
    await rpc('set_avatar_outfit', [DEFAULT_OUTFIT])
    expect(await rpc('get_profile')).toMatchObject({ outfit: DEFAULT_OUTFIT, coins: 0, inventory: { top_hoodie: 1, bg_crimson: 1 } })
  })
  await expect(as(other, () => rpc('set_avatar_outfit', [outfit]))).rejects.toThrow(/not owned/)
})

it('rejects malformed outfits, mismatched layers, and direct or anonymous writes', async () => {
  await as(other, async () => {
    for (const input of [
      null, [], {}, { ...DEFAULT_OUTFIT, hairColor: 'url(#x)' }, { ...DEFAULT_OUTFIT, top: null },
      { ...DEFAULT_OUTFIT, top: 'hair_crop' }, { ...DEFAULT_OUTFIT, effect: 'cap' },
      { ...DEFAULT_OUTFIT, extra: 'skin_peach' }, { ...DEFAULT_OUTFIT, hair: { id: 'hair_crop' } },
    ]) {
      await expect(db.query('select public.set_avatar_outfit($1::jsonb)', [JSON.stringify(input)])).rejects.toThrow(/invalid/)
    }
    const result = await db.query('update public.profiles set outfit = $1 where id = $2', [DEFAULT_OUTFIT, other])
    expect(result.affectedRows).toBe(0)
    expect(await rpc('get_profile')).toMatchObject({ outfit: null })
  })
  await db.exec("set role anon; select set_config('request.jwt.claim.sub', '', false);")
  try {
    await expect(rpc('set_avatar_outfit', [DEFAULT_OUTFIT])).rejects.toThrow(/permission denied/)
  } finally {
    await db.exec('reset role')
  }
})
