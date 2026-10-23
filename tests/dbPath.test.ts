// Section 2 database logic: unit practice, unit tests, chests and diagnostic placement.
import { beforeAll, describe, expect, it } from 'vitest'
import { answer, as, db, newUser, one, qlen, rpc, setup } from './harness'

let n = 0x200
const fresh = () => newUser(`00000000-0000-0000-0000-${(n++).toString(16).padStart(12, '0')}`)

beforeAll(setup, 60_000)

async function run(uid: string, args: unknown[], correct: (i: number) => boolean = () => true) {
  const s = await as(uid, () => rpc<string>('start_session', args))
  const L = await qlen(s)
  for (let i = 0; i < L; i++) await answer(uid, s, correct(i))
  return { s, sum: await as(uid, () => rpc('complete_session', [s])) }
}
const unit = (uid: string, domain: string) =>
  one('select practice_done, chest_claimed, test_passed from public.unit_progress where user_id = $1 and domain_id = $2', [uid, domain])
// Marks earlier units passed so a later unit is open (as the database owner).
const unlockAfter = (uid: string, ...domains: string[]) => db.query(
  `insert into public.unit_progress (user_id, domain_id, test_passed) select $1, d, true from unnest($2::text[]) d`, [uid, domains])
const tiersPassed = async (uid: string, domain: string) => (await one<{ c: number }>(
  `select count(*)::int c from public.level_progress l join public.skills k on k.id = l.skill_id where l.user_id = $1 and k.domain_id = $2`, [uid, domain])).c

describe('unit practice', () => {
  it('serves 8 easy/medium items from the unit and marks practice done on completion', async () => {
    const u = await fresh()
    await unlockAfter(u, 'rw.ii', 'rw.cs')
    const { s } = await run(u, ['unit_practice', null, null, 'rw.eoi'], (i) => i % 2 === 0)
    const items = await db.query<{ domain_id: string; tier: string }>(
      `select k.domain_id, i.tier from public.sessions s cross join unnest(s.queue) q join public.items i on i.id = q join public.skills k on k.id = i.skill_id where s.id = $1`, [s])
    expect(items.rows).toHaveLength(8)
    expect(items.rows.every((r) => r.domain_id === 'rw.eoi' && r.tier !== 'hard')).toBe(true)
    expect(await unit(u, 'rw.eoi')).toEqual({ practice_done: true, chest_claimed: false, test_passed: false })
  })
})

describe('unit test', () => {
  it('locks a unit until the previous unit in its track is passed, then unlocks it', async () => {
    const u = await fresh()
    await expect(as(u, () => rpc('start_session', ['unit_test', null, null, 'rw.cs']))).rejects.toThrow(/unit locked/)
    // The first unit of each track is open from the start.
    const { sum } = await run(u, ['unit_test', null, null, 'rw.ii'])
    expect(sum).toMatchObject({ passed: true, unit: 'Information and Ideas', total: 10 })
    expect(await unit(u, 'rw.ii')).toEqual({ practice_done: true, chest_claimed: false, test_passed: true })
    expect(await tiersPassed(u, 'rw.ii')).toBe(9) // 3 skills × 3 tiers: the whole unit is complete
    await expect(as(u, () => rpc('start_session', ['unit_test', null, null, 'rw.cs']))).resolves.toBeTruthy()
    // Math is its own track.
    await expect(as(u, () => rpc('start_session', ['unit_test', null, null, 'math.alg']))).resolves.toBeTruthy()
  })

  it('needs 8 of 10 to pass', async () => {
    const u = await fresh()
    const { sum } = await run(u, ['unit_test', null, null, 'math.alg'], (i) => i >= 3)
    expect(sum).toMatchObject({ passed: false, correct: 7, total: 10 })
    expect(await unit(u, 'math.alg')).toBeUndefined()
  })

  it('deals items round-robin across the unit’s skills', async () => {
    const u = await fresh()
    await unlockAfter(u, 'math.alg', 'math.adv', 'math.psda')
    const s = await as(u, () => rpc<string>('start_session', ['unit_test', null, null, 'math.geo']))
    const per = await db.query<{ c: number }>(
      `select count(*)::int c from public.sessions s cross join unnest(s.queue) q join public.items i on i.id = q where s.id = $1 group by i.skill_id`, [s])
    expect(per.rows.map((r) => r.c).sort()).toEqual([2, 2, 3, 3]) // 4 skills, 10 items
  })
})

describe('chests', () => {
  it('opens only after the easy and medium rounds and the unit practice, pays coins once', async () => {
    const u = await fresh()
    await unlockAfter(u, 'rw.ii', 'rw.cs', 'rw.eoi')
    const claim = () => as(u, () => rpc<number>('claim_chest', ['rw.sec']))
    await expect(claim()).rejects.toThrow(/not available/)
    for (const skill of ['rw.sec.boundaries', 'rw.sec.form']) await run(u, ['lesson', skill, 'easy'])
    await run(u, ['unit_practice', null, null, 'rw.sec'])
    await expect(claim()).rejects.toThrow(/not available/) // medium round still to do
    for (const skill of ['rw.sec.boundaries', 'rw.sec.form']) await run(u, ['lesson', skill, 'medium'])
    const before = (await one<{ coins: number }>('select coins from public.profiles where id = $1', [u])).coins // quests pay Coins too
    expect(await claim()).toBe(20)
    await expect(claim()).rejects.toThrow(/not available/)
    expect(await one('select coins from public.profiles where id = $1', [u])).toEqual({ coins: before + 20 })
    expect(await as(u, () => rpc('get_home'))).toMatchObject({
      profile: { coins: before + 20 }, units: { 'rw.sec': { practice_done: true, chest_claimed: true, test_passed: false } },
    })
  })
})

describe('diagnostic placement', () => {
  it('skips rounds in strong domains and leaves weak ones at the start', async () => {
    const u = await fresh()
    const s = await as(u, () => rpc<string>('start_session', ['diagnostic']))
    // All right in the first domain (Information and Ideas), right-then-wrong-wrong elsewhere.
    for (let i = 0; i < 24; i++) {
      await as(u, () => rpc('next_item', [s]))
      await answer(u, s, i < 3 || i % 3 === 0)
    }
    await as(u, () => rpc('complete_session', [s]))
    expect(await unit(u, 'rw.ii')).toMatchObject({ practice_done: true, chest_claimed: false })
    expect(await tiersPassed(u, 'rw.ii')).toBe(6) // easy + medium for 3 skills: lands on the chest
    expect(await unit(u, 'rw.cs')).toBeUndefined()
    expect(await tiersPassed(u, 'rw.cs')).toBe(0)
    expect(await as(u, () => rpc<number>('claim_chest', ['rw.ii']))).toBe(20)
  })
})

describe('privileges', () => {
  it('keeps the placement and unit-order helpers internal', async () => {
    const u = await fresh()
    await expect(as(u, () => db.query(`select public.place_from_diagnostic('${u}')`))).rejects.toThrow(/permission denied/)
    await expect(as(u, () => db.query(`select public.prev_unit('rw.cs')`))).rejects.toThrow(/permission denied/)
  })
})
