import { beforeAll, expect, it } from 'vitest'
import { CATALOG, DEFAULT_OUTFIT, resolveOutfit } from '../src/lib/avatar'
import { applyMigration, as, db, newUser, rpc, setupThrough } from './harness'

const uid = '00000000-0000-0000-0000-000000000aa1'
const newcomer = '00000000-0000-0000-0000-000000000aa2'
const other = '00000000-0000-0000-0000-000000000aa3'
const oldOutfit = {
  skin: 'skin_peach', bottoms: 'bottom_joggers', shoes: 'shoes_canvas', top: 'top_tee',
  face: 'face_smile', hair: 'hair_crop', hairColor: '#513448',
}
const oldWorn = { ...oldOutfit, skin: 'skin_amber', hair: 'hair_curls', headwear: 'cap', accessory: 'glasses' }
let previousPrices: Record<string, number>

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
  await as(uid, async () => {
    await rpc('set_avatar_outfit', [oldWorn])
    previousPrices = (await rpc('get_profile')).prices
  })
  await applyMigration('0013_raccoon_avatars.sql')
  await newUser(newcomer)
  await newUser(other)
}, 60_000)

it('keeps legacy purchases and live endpoints while remapping an existing saved 0012 outfit', async () => {
  const outfit = { ...DEFAULT_OUTFIT, fur: 'fur_cinnamon', furStyle: 'style_curl', headwear: 'cap', eyewear: 'glasses' }
  const profile = await as(uid, () => rpc('get_profile'))
  expect(profile).toMatchObject({
    avatar: 'green', accessory: 'cap', outfit: oldWorn, coins: 0,
    inventory: { cap: 1, glasses: 1, bowtie: 1 },
    prices: previousPrices,
  })
  expect(resolveOutfit(profile)).toEqual(outfit)
  const legacyBadges = ['crimson', 'slate', 'chocolate', 'green', 'ink', 'putty']
  expect(new Set(legacyBadges.map((avatar) => resolveOutfit({ avatar }).fur)).size).toBe(6)
  expect(resolveOutfit({ avatar: 'green', accessory: 'cap' })).toMatchObject({ fur: 'fur_midnight', headwear: 'cap' })
  expect(resolveOutfit({ accessory: 'bowtie' }).accessory).toBe('bowtie')
  expect(resolveOutfit({ accessory: 'glasses' }).eyewear).toBe('glasses')
  await as(uid, async () => {
    await rpc('set_profile', ['Legacy Learner', 'ink', 'glasses'])
    const legacyLeague = await rpc('get_league')
    expect(legacyLeague.members.find((member: { me: boolean }) => member.me)).toMatchObject({ avatar: 'ink', accessory: 'glasses' })
    const league = await rpc('get_league_v2')
    expect(league.members.find((member: { me: boolean }) => member.me)).toMatchObject({ outfit: oldWorn })
    await rpc('set_avatar_outfit', [oldWorn])
    expect(await rpc('set_display_name', ['New Wardrobe Name'])).toBe('New Wardrobe Name')
    expect(await rpc('get_profile')).toMatchObject({ display_name: 'New Wardrobe Name', avatar: 'ink', accessory: 'glasses', outfit, coins: 0 })
    expect((await rpc('get_profile')).outfit).toEqual(outfit)
  })
})

it('normalizes every retired skin and hairstyle consistently in the client and RPC', async () => {
  const skins = ['pearl', 'peach', 'sand', 'amber', 'cocoa', 'umber']
  const styles = ['crop', 'bob', 'curls', 'bangs', 'buns', 'quiff', 'buzz', 'pony']
  const coats = new Set<string | undefined>()
  const tufts = new Set<string | undefined>()
  await as(uid, async () => {
    for (const [i, style] of styles.entries()) {
      const old = { ...oldOutfit, skin: 'skin_' + skins[i % skins.length], hair: 'hair_' + style }
      const canonical = resolveOutfit({ outfit: old })
      coats.add(canonical.fur)
      tufts.add(canonical.furStyle)
      await rpc('set_avatar_outfit', [old])
      expect((await rpc('get_profile')).outfit).toEqual(canonical)
    }
  })
  expect(coats.size).toBe(6)
  expect(tufts.size).toBe(6)
})

it('uses the same catalog prices for display and purchases, with no purchasable champion aura', async () => {
  const { rows } = await db.query<{ item: string; layer: string; price: number }>('select * from public.avatar_catalog()')
  expect(rows).toHaveLength(CATALOG.length)
  const { prices } = await as(newcomer, () => rpc('get_profile'))
  expect(prices).toMatchObject(previousPrices)
  const pricesByRarity = { common: 50, rare: 120, epic: 300, legendary: 700 }
  const legacy = new Map([['cap', 100], ['glasses', 60], ['bowtie', 40]])
  for (const item of CATALOG) {
    const expected = item.free ? 0 : legacy.get(item.id) ?? pricesByRarity[item.rarity]
    expect(rows.find((row) => row.item === item.id)).toEqual({ item: item.id, layer: item.layer, price: expected })
    expect(prices[item.id]).toBe(item.free ? undefined : expected)
  }
  expect(prices.effect_champion).toBeUndefined()
})

it('charges once and equips purchased eyewear and auras with accessories for free', async () => {
  await db.query('update public.profiles set coins = $2 where id = $1', [newcomer, 250])
  const outfit = { ...DEFAULT_OUTFIT, fur: 'fur_midnight', furStyle: 'style_curl',
    eyewear: 'eye_sunglasses', accessory: 'bowtie', effect: 'effect_sparkle' }
  await as(newcomer, async () => {
    await expect(rpc('set_avatar_outfit', [outfit])).rejects.toThrow(/not owned/)
    await expect(rpc('buy_item', ['style_curl'])).rejects.toThrow(/unknown item/)
    await expect(rpc('buy_item', ['effect_champion'])).rejects.toThrow(/unknown item/)
    await expect(rpc('buy_item', ['eye_sunglasses', 1])).rejects.toThrow(/does not exist/)
    expect(await rpc('buy_item', ['eye_sunglasses'])).toBe(130)
    await expect(rpc('buy_item', ['eye_sunglasses'])).rejects.toThrow(/already owned/)
    expect(await rpc('buy_item', ['bowtie'])).toBe(90)
    await expect(rpc('set_avatar_outfit', [outfit])).rejects.toThrow(/not owned/)
    expect(await rpc('buy_item', ['effect_sparkle'])).toBe(40)
    await expect(rpc('buy_item', ['top_hoodie'])).rejects.toThrow(/not enough coins/)
    await rpc('set_avatar_outfit', [outfit])
    const held = { eye_sunglasses: 1, bowtie: 1, effect_sparkle: 1 }
    expect(await rpc('get_profile')).toMatchObject({ outfit, coins: 40, inventory: held })
    await rpc('set_avatar_outfit', [DEFAULT_OUTFIT])
    expect(await rpc('get_profile')).toMatchObject({ outfit: DEFAULT_OUTFIT, coins: 40, inventory: held })
  })
  await expect(as(other, () => rpc('set_avatar_outfit', [outfit]))).rejects.toThrow(/not owned/)
  await expect(as(other, () => rpc('set_avatar_outfit', [oldWorn]))).rejects.toThrow(/not owned/)
})

it('rejects malformed outfits, invalid slots, champion equip, and direct or anonymous writes', async () => {
  await as(other, async () => {
    for (const input of [
      null, [], {}, { ...oldOutfit, hairColor: 'url(#x)' }, { ...oldOutfit, skin: 'unknown' },
      { ...DEFAULT_OUTFIT, hair: 'hair_crop' }, { ...DEFAULT_OUTFIT, top: null }, { ...DEFAULT_OUTFIT, top: 'fur_gray' },
      { ...DEFAULT_OUTFIT, effect: 'effect_champion' }, { ...DEFAULT_OUTFIT, effect: 'cap' },
      { ...DEFAULT_OUTFIT, eyewear: 'glasses', accessory: 'glasses' },
      { ...DEFAULT_OUTFIT, extra: 'fur_cream' }, { ...DEFAULT_OUTFIT, furStyle: { id: 'style_tuft' } },
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
