// Google-only accounts: no profile (so no data) for anonymous users, and no reading or writing another learner's rows.
import { beforeAll, describe, expect, it } from 'vitest'
import { answer, as, db, newUser, one, rpc, setup } from './harness'

let n = 0x400
const id = () => `00000000-0000-0000-0000-${(n++).toString(16).padStart(12, '0')}`

beforeAll(setup, 60_000)

// Tables holding a learner's rows, and the column that names the owner.
const OWNED: [string, string][] = [
  ['profiles', 'id'], ['mastery', 'user_id'], ['level_progress', 'user_id'], ['review_items', 'user_id'], ['daily_points', 'user_id'],
  ['sessions', 'user_id'], ['responses', 'user_id'], ['achievements', 'user_id'], ['daily_quests', 'user_id'], ['weekly_quests', 'user_id'],
  ['league_members', 'user_id'], ['mocks', 'user_id'], ['unit_progress', 'user_id'], ['inventory', 'user_id'],
]

describe('accounts', () => {
  it('creates a profile for a Google user but none for an anonymous one', async () => {
    const google = id(), anon = id()
    await db.query('insert into auth.users (id) values ($1)', [google])
    await db.query('insert into auth.users (id, is_anonymous) values ($1, true)', [anon])
    expect(await one('select count(*)::int c from public.profiles where id = $1', [google])).toEqual({ c: 1 })
    expect(await one('select count(*)::int c from public.profiles where id = $1', [anon])).toEqual({ c: 0 })
    await expect(as(anon, () => rpc('get_home'))).rejects.toThrow(/not signed in/)
  })

  it('keeps anonymous accounts that already exist off the leaderboard', async () => {
    const me = await newUser(id())
    await as(me, () => rpc('get_league'))
    // An older guest account, in the same cohort.
    const guest = id()
    await db.query('insert into auth.users (id, is_anonymous) values ($1, true)', [guest])
    await db.query(`insert into public.profiles (id, handle, display_name) values ($1, 'learner-guest001', 'Old Guest')`, [guest])
    await db.query('insert into public.league_members select $1, week, tier, cohort from public.league_members where user_id = $2', [guest, me])
    const names = (await as(me, () => rpc('get_league'))).members.map((m: any) => m.name)
    expect(names).not.toContain('Old Guest')
  })
})

describe('row-level security', () => {
  it('has RLS switched on for every public table', async () => {
    const off = await db.query<{ t: string }>(`select tablename t from pg_tables where schemaname = 'public' and not rowsecurity`)
    expect(off.rows).toEqual([])
  })

  it('lets a learner read only their own rows, and write none directly', async () => {
    const a = await newUser(id()), b = await newUser(id())
    const s = await as(a, () => rpc<string>('start_session', ['lesson', 'math.alg.lin1', 'easy']))
    for (let i = 0; !(await answer(a, s, i % 2 === 0)).done; i++); // misses are re-asked, so answer until done
    await as(a, () => rpc('complete_session', [s]))
    await as(a, () => rpc('get_league'))
    await as(a, () => rpc('get_weekly_quests'))

    for (const [table, owner] of OWNED) {
      const mine = await as(a, () => db.query(`select count(*)::int c from public.${table} where ${owner} = $1`, [a]))
      const theirs = await as(b, () => db.query(`select count(*)::int c from public.${table} where ${owner} = $1`, [a]))
      expect((theirs.rows[0] as { c: number }).c, `${table}: b sees a's rows`).toBe(0)
      if (['profiles', 'sessions', 'responses', 'daily_points'].includes(table)) expect((mine.rows[0] as { c: number }).c, table).toBeGreaterThan(0)
    }
    // No direct writes, even to your own rows: everything goes through checked RPCs.
    await expect(as(a, () => db.query('update public.profiles set coins = 9999 where id = $1', [a]))).resolves.toMatchObject({ affectedRows: 0 })
    await expect(as(b, () => db.query(`insert into public.daily_points values ($1, current_date, 500)`, [a]))).rejects.toThrow(/row-level security/)
    // RPCs act on the caller's own data only.
    await expect(as(b, () => rpc('complete_session', [s]))).rejects.toThrow(/session not found/)
    await expect(as(b, () => rpc('next_item', [s]))).rejects.toThrow(/session not found/)
  })
})
