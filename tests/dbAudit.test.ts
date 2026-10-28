// Regression tests for the October 2026 security audit fixes (migration 0009).
import { beforeAll, describe, expect, it } from 'vitest'
import { as, db, keyFor, newUser, one, rpc, setup } from './harness'

let n = 0x900
const fresh = (tz?: string) => newUser(`00000000-0000-0000-0000-${(n++).toString(16).padStart(12, '0')}`, tz)
const onboard = (u: string, tz = 'America/New_York') => as(u, () => rpc('save_onboarding', ['first', null, null, 1400, 20, tz]))
const nameOf = async (u: string) => (await one<{ n: string }>('select display_name n from public.profiles where id = $1', [u])).n

/** Moves an item out of (or back into) circulation, as an admin edit would. */
const setStatus = (item: string, status: string) => db.query('update public.items set status = $2 where id = $1', [item, status])

beforeAll(setup, 60_000)

describe('onboarding and settings', () => {
  it('runs onboarding once, so the timezone and goals can’t be overwritten', async () => {
    const u = await fresh()
    await onboard(u)
    await expect(onboard(u, 'Pacific/Kiritimati')).rejects.toThrow(/already onboarded/)
    expect(await one('select timezone, target_score from public.profiles where id = $1', [u])).toEqual({ timezone: 'America/New_York', target_score: 1400 })
  })

  it('saves settings without touching the timezone', async () => {
    const u = await fresh()
    await expect(as(u, () => rpc('update_settings', ['first', null, null, 1500, 30]))).rejects.toThrow(/finish onboarding/)
    await onboard(u)
    await as(u, () => rpc('update_settings', ['retake', null, 1200, 1500, 30]))
    expect(await one('select goal, current_score, target_score, daily_goal, timezone from public.profiles where id = $1', [u]))
      .toEqual({ goal: 'retake', current_score: 1200, target_score: 1500, daily_goal: 30, timezone: 'America/New_York' })
  })
})

describe('leagues', () => {
  it('takes an opted-out learner off everyone’s leaderboard straight away', async () => {
    const a = await fresh(), b = await fresh()
    await as(a, () => rpc('get_league'))
    await as(b, () => rpc('get_league'))
    const names = async () => (await as(a, () => rpc('get_league'))).members.map((m: any) => m.name)
    expect(await names()).toContain(await nameOf(b))
    await as(b, () => rpc('set_leagues_opt_out', [true]))
    expect(await names()).not.toContain(await nameOf(b))
  })

  it('ranks promotion only among the learners the leaderboard shows', async () => {
    const week = '2027-06-07' // a Monday
    const users: string[] = []
    for (let i = 0; i < 8; i++) users.push(await fresh())
    const guest = `00000000-0000-0000-0000-${(n++).toString(16).padStart(12, '0')}` // a legacy anonymous account
    await db.query('insert into auth.users (id, is_anonymous) values ($1, true)', [guest])
    await db.query(`insert into public.profiles (id, handle) values ($1, 'learner-guest900')`, [guest])
    const quiet = await fresh() // opted out of leagues
    await db.query('update public.profiles set leagues_opt_out = true where id = $1', [quiet])
    const all = [...users, guest, quiet]
    await db.query('update public.profiles set league_tier = 3 where id = any($1)', [all])
    for (const u of all) await db.query('select public.join_league($1, $2::timestamptz)', [u, `${week}T12:00:00Z`])
    for (const [i, u] of users.entries()) await db.query('insert into public.league_points values ($1, $2, $3)', [u, week, 100 - i])
    for (const u of [guest, quiet]) await db.query('insert into public.league_points values ($1, $2, 1000)', [u, week])

    const tiers: number[] = []
    for (const u of users) tiers.push((await one<{ t: number }>('select (public.join_league($1, $2::timestamptz)).tier t', [u, '2027-06-14T12:00:00Z'])).t)
    expect(tiers).toEqual([4, 4, 4, 4, 4, 4, 4, 2]) // 8 visible learners: the top 7 go up, the 8th goes down
  })

  it('counts points in the UTC week they were earned', async () => {
    const u = await fresh('Etc/GMT+12') // local day runs 12 hours behind UTC
    await db.query('insert into public.daily_points values ($1, public.local_day($1), 7)', [u])
    await db.query('update public.daily_points set points = points + 5 where user_id = $1', [u])
    expect(await one('select week, points from public.league_points where user_id = $1', [u]))
      .toEqual(await one(`select public.week_start() week, 12 points`))
    expect(await one('select public.week_points($1, public.week_start()) p', [u])).toEqual({ p: 12 })
  })

  it('keeps league points unreadable from the browser', async () => {
    const u = await fresh()
    await db.query('insert into public.daily_points values ($1, public.local_day($1), 7)', [u])
    await as(u, async () => expect((await db.query('select * from public.league_points')).rows).toHaveLength(0))
  })
})

describe('only published items are served', () => {
  it('drops an item unpublished after the session was built', async () => {
    const u = await fresh()
    const s = await as(u, () => rpc<string>('start_session', ['lesson', 'math.alg.lin1', 'easy']))
    const q = (await one<{ q: string[] }>('select queue q from public.sessions where id = $1', [s])).q
    await setStatus(q[0], 'draft')
    try {
      const next = await as(u, () => rpc('next_item', [s]))
      expect(next.item.id).toBe(q[1])
      expect(next.total).toBe(q.length - 1)
    } finally { await setStatus(q[0], 'published') }
  })

  it('neither grades nor reveals an item unpublished mid-question', async () => {
    const u = await fresh()
    const s = await as(u, () => rpc<string>('start_session', ['lesson', 'math.alg.lin1', 'easy']))
    const { item } = await as(u, () => rpc('next_item', [s]))
    const key = await keyFor(item.id, true)
    await setStatus(item.id, 'retired')
    try {
      await expect(as(u, () => rpc('submit_answer', [s, key, 1000]))).rejects.toThrow(/no longer available/)
    } finally { await setStatus(item.id, 'published') }
  })

  it('leaves unpublished items out of review sessions', async () => {
    const u = await fresh()
    const item = (await one<{ id: string }>(`select id from public.items where status = 'published' limit 1`)).id
    await db.query('insert into public.review_items values ($1, $2, 1, public.local_day($1))', [u, item])
    await setStatus(item, 'draft')
    try {
      await expect(as(u, () => rpc('start_session', ['review']))).rejects.toThrow(/no items/)
    } finally { await setStatus(item, 'published') }
  })

  it('leaves unpublished items out of mock modules', async () => {
    const u = await fresh()
    const mock = await as(u, () => rpc<string>('start_mock'))
    const before = (await as(u, () => rpc('mock_state', [mock]))).items as any[]
    await setStatus(before[0].item.id, 'draft')
    try {
      const after = (await as(u, () => rpc('mock_state', [mock]))).items as any[]
      expect(after.map((x) => x.item.id)).toEqual(before.slice(1).map((x) => x.item.id))
    } finally { await setStatus(before[0].item.id, 'published') }
  })
})
