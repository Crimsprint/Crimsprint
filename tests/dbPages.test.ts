// Section 4 database logic: profile, shop, weekly quests, timed drills and review-every-mistake.
import { beforeAll, describe, expect, it } from 'vitest'
import { answer, as, db, newUser, one, qlen, rpc, setup } from './harness'

let n = 0x300
const fresh = () => newUser(`00000000-0000-0000-0000-${(n++).toString(16).padStart(12, '0')}`)
const coins = async (u: string) => (await one<{ coins: number }>('select coins from public.profiles where id = $1', [u])).coins
const give = (u: string, c: number) => db.query('update public.profiles set coins = $2 where id = $1', [u, c])

beforeAll(setup, 60_000)

async function run(uid: string, args: unknown[], correct: (i: number) => boolean = () => true) {
  const s = await as(uid, () => rpc<string>('start_session', args))
  // Re-asked misses extend the queue, so answer until the session says it is done.
  for (let i = 0; !(await answer(uid, s, correct(i))).done; i++);
  return { s, sum: await as(uid, () => rpc('complete_session', [s])) }
}

describe('profile', () => {
  it('validates display names and avatars, and only equips owned accessories', async () => {
    const u = await fresh()
    await as(u, () => rpc('set_profile', ['Sam R', 'slate', null]))
    expect(await as(u, () => rpc('get_profile'))).toMatchObject({ display_name: 'Sam R', avatar: 'slate', accessory: null, coins: 0 })
    await expect(as(u, () => rpc('set_profile', ['<b>hi</b>', 'slate', null]))).rejects.toThrow(/check/)
    await expect(as(u, () => rpc('set_profile', ['ab', 'slate', null]))).rejects.toThrow(/check/)
    await expect(as(u, () => rpc('set_profile', ['Sam', 'rainbow', null]))).rejects.toThrow(/check/)
    await expect(as(u, () => rpc('set_profile', ['Sam', 'slate', 'cap']))).rejects.toThrow(/not owned/)
    await as(u, () => rpc('set_profile', ['', 'crimson', null])) // blank goes back to a random default name
    expect((await as(u, () => rpc('get_profile'))).display_name).toMatch(/^Learner \d{4}$/)
  })

  it('keeps the longest streak after the current one resets', async () => {
    const u = await fresh()
    for (const d of ['01', '02', '03']) await db.query('select public.apply_streak($1, $2::timestamptz)', [u, `2027-06-${d}T20:00:00Z`])
    await db.query('select public.apply_streak($1, $2::timestamptz)', [u, '2027-06-10T20:00:00Z'])
    expect(await as(u, () => rpc('get_profile'))).toMatchObject({ streak: 1, longest_streak: 3 })
  })

  it('shows display names on the leaderboard', async () => {
    const u = await fresh()
    await as(u, () => rpc('set_profile', ['Raccoon Fan', 'green', null]))
    const lg = await as(u, () => rpc('get_league'))
    expect(lg.members.find((m: any) => m.me)).toMatchObject({ name: 'Raccoon Fan', avatar: 'green' })
  })
})

describe('shop', () => {
  it('charges Coins and enforces holding limits', async () => {
    const u = await fresh()
    const buy = (item: string) => as(u, () => rpc<number>('buy_item', [item]))
    await expect(buy('streak_freeze')).rejects.toThrow(/not enough coins/)
    await give(u, 1000)
    expect(await buy('streak_freeze')).toBe(950)
    await buy('streak_freeze')
    await expect(buy('streak_freeze')).rejects.toThrow(/already hold 2/)
    for (let i = 0; i < 3; i++) await buy('mistake_boost')
    await expect(buy('mistake_boost')).rejects.toThrow(/up to 3/)
    await buy('cap')
    await expect(buy('cap')).rejects.toThrow(/already owned/)
    await expect(buy('rocket')).rejects.toThrow(/unknown item/)
    expect(await coins(u)).toBe(1000 - 100 - 45 - 100)
    const p = await as(u, () => rpc('get_profile'))
    expect(p).toMatchObject({ freezes: 2, inventory: { mistake_boost: 3, cap: 1 } })
    await as(u, () => rpc('set_profile', [null, 'ink', 'cap']))
    expect((await as(u, () => rpc('get_profile'))).accessory).toBe('cap')
  })

  it('spends a mistake boost on the next lesson only', async () => {
    const u = await fresh()
    await give(u, 15)
    await as(u, () => rpc('buy_item', ['mistake_boost']))
    const s1 = await as(u, () => rpc<string>('start_session', ['lesson', 'math.alg.lin1', 'easy']))
    const s2 = await as(u, () => rpc<string>('start_session', ['lesson', 'math.alg.lin1', 'easy']))
    const budget = async (s: string) => (await one<{ m: number }>('select mistakes_left m from public.sessions where id = $1', [s])).m
    expect([await budget(s1), await budget(s2)]).toEqual([8, 5])
  })
})

describe('quests pay Coins', () => {
  it('pays 5 Coins for a daily quest', async () => {
    const u = await fresh()
    await db.query(`insert into public.daily_quests (user_id, day, code, target) select $1, public.local_day($1), code, target
                    from public.quest_pool() where code in ('streak5', 'lessons2', 'hard1')`, [u])
    await run(u, ['lesson', 'math.alg.lin1', 'easy'])
    expect(await coins(u)).toBe(5) // streak5 done
  })

  it('tracks weekly quests and pays 30 Coins each', async () => {
    const u = await fresh()
    await run(u, ['lesson', 'math.alg.lin1', 'easy'])
    await run(u, ['weak'])
    const w = Object.fromEntries((await as(u, () => rpc('get_weekly_quests'))).quests.map((q: any) => [q.code, q]))
    expect(w.lessons8).toMatchObject({ progress: 1, target: 8, done: false })
    expect(w.practice3).toMatchObject({ progress: 1, target: 3 })
    expect(w.points150.progress).toBeGreaterThan(20)
    const before = await coins(u)
    await db.query(`update public.weekly_quests set progress = 7 where user_id = $1 and code = 'lessons8'`, [u])
    await run(u, ['lesson', 'math.alg.lin1', 'easy'])
    expect(await coins(u)).toBeGreaterThanOrEqual(before + 30)
    expect(await one(`select done from public.weekly_quests where user_id = $1 and code = 'lessons8'`, [u])).toEqual({ done: true })
  })
})

describe('timed drill', () => {
  const deadlineSecs = async (s: string) => (await one<{ d: number }>(
    'select round(extract(epoch from deadline - created_at))::int d from public.sessions where id = $1', [s])).d

  it('serves 10 section items with an SAT-pace deadline, extended by a timer pass', async () => {
    const u = await fresh()
    const s = await as(u, () => rpc<string>('start_session', ['drill', null, null, null, 'math']))
    expect(await qlen(s)).toBe(10)
    expect(await deadlineSecs(s)).toBe(950)
    await expect(as(u, () => rpc('start_session', ['drill', null, null, null, 'rw', true]))).rejects.toThrow(/no timer pass/)
    await give(u, 25)
    await as(u, () => rpc('buy_item', ['timer_pass']))
    const p = await as(u, () => rpc<string>('start_session', ['drill', null, null, null, 'rw', true]))
    expect(await deadlineSecs(p)).toBe(1065) // 10 × 71 s × 1.5
    expect(await as(u, () => rpc('get_practice'))).toMatchObject({ timer_passes: 0 })
    const next = await as(u, () => rpc('next_item', [p]))
    expect(next.deadline).toBeTruthy()
  })

  it('stops taking answers when time is up and can then be completed early', async () => {
    const u = await fresh()
    const s = await as(u, () => rpc<string>('start_session', ['drill', null, null, null, 'rw']))
    await answer(u, s, true)
    await answer(u, s, false)
    await expect(as(u, () => rpc('complete_session', [s]))).rejects.toThrow(/not finished/)
    await db.query(`update public.sessions set deadline = now() - interval '1 minute' where id = $1`, [s])
    await expect(answer(u, s, true)).rejects.toThrow(/time is up/)
    expect(await as(u, () => rpc('next_item', [s]))).toEqual({ done: true })
    expect(await as(u, () => rpc('complete_session', [s]))).toMatchObject({ mode: 'drill', correct: 1, total: 2, planned: 10 })
  })
})

describe('review every mistake', () => {
  it('collects missed items and keeps serving each until it is answered correctly', async () => {
    const u = await fresh()
    await run(u, ['lesson', 'rw.ii.central', 'easy'], (i) => i >= 2) // first two wrong (both requeued and then right)
    expect((await as(u, () => rpc('get_practice'))).mistakes).toBe(0)
    // Miss the first question, and miss it again when it is re-asked at the end.
    const l = await as(u, () => rpc<string>('start_session', ['lesson', 'rw.cs.wic', 'easy']))
    const first = (await one<{ q: string }>('select queue[1] q from public.sessions where id = $1', [l])).q
    const current = async () => (await one<{ q: string }>('select queue[pos + 1] q from public.sessions where id = $1', [l])).q
    while (!(await answer(u, l, (await current()) !== first)).done);
    await as(u, () => rpc('complete_session', [l]))
    expect((await as(u, () => rpc('get_practice'))).mistakes).toBe(1)
    const s = await as(u, () => rpc<string>('start_session', ['mistakes']))
    expect(await qlen(s)).toBe(1)
    await answer(u, s, false)
    await answer(u, s, false)
    expect(await qlen(s)).toBe(3) // requeued after each miss
    await answer(u, s, true)
    expect(await as(u, () => rpc('complete_session', [s]))).toMatchObject({ mode: 'mistakes', planned: 1 })
    expect((await as(u, () => rpc('get_practice'))).mistakes).toBe(0)
  })
})

describe('privileges', () => {
  it.each(['use_item', 'missed_items', 'bump_weekly'])('keeps %s internal', async (fn) => {
    const u = await fresh()
    const args = fn === 'use_item' ? `'${u}', 'cap'` : fn === 'bump_weekly' ? `'${u}', 'lessons8', 1` : `'${u}'`
    await expect(as(u, () => db.query(`select public.${fn}(${args})`))).rejects.toThrow(/permission denied/)
  })
})
