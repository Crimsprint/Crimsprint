import { beforeAll, expect, it } from 'vitest'
import { applyMigration, as, db, newUser, one, rpc, setupThrough } from './harness'

let user = 0xc000
let cohort = 100
const fresh = () => newUser(`00000000-0000-0000-0000-${(user++).toString(16).padStart(12, '0')}`)
const old = '00000000-0000-0000-0000-00000000b001'
const optedOutAtInstall = '00000000-0000-0000-0000-00000000b002'
let week: string, last: string, earlier: string

beforeAll(async () => {
  await setupThrough(13)
  await newUser(old)
  await as(old, () => rpc('set_profile', ['Old Client', 'slate', null]))
  await newUser(optedOutAtInstall)
  await as(optedOutAtInstall, () => rpc('set_leagues_opt_out', [true]))
  await applyMigration('0014_weekly_league_crowns.sql')
  const dates = await one<{ week: string; last: string; earlier: string }>(
    'select public.week_start()::text as week, (public.week_start()-7)::text as last, (public.week_start()-14)::text as earlier')
  week = dates.week
  last = dates.last
  earlier = dates.earlier
  // Play through closed eligible weeks without changing the database clock.
  await db.exec('update public.league_crown_rules set first_week = public.week_start() - 21')
}, 60_000)

async function player(week: string, group: number, points: number, hour = 12, uid?: string, tier = 1) {
  const id = uid ?? await fresh()
  await db.query('insert into public.league_members values ($1, $2, $3, $4)', [id, week, tier, group])
  await db.query('insert into public.league_points (user_id, week, points) values ($1, $2, $3)', [id, week, points])
  await db.query(`update public.league_points
    set score_reached_at = (($2::date + 2)::timestamp at time zone 'UTC') + make_interval(hours => $3)
    where user_id = $1 and week = $2`, [id, week, hour])
  return id
}

it('preserves the old client RPCs, tracks real score writes, and captures existing opt-outs', async () => {
  const profile = await as(old, () => rpc('get_profile'))
  expect(profile).toMatchObject({ display_name: 'Old Client', avatar: 'slate' })
  expect(profile).not.toHaveProperty('crowns_won')
  expect(await one('select opted_out from public.league_visibility_changes where user_id = $1', [optedOutAtInstall])).toEqual({ opted_out: true })
  await db.query('update public.profiles set coins = 100 where id = $1', [old])
  await as(old, async () => {
    expect(await rpc('buy_item', ['glasses'])).toBe(40)
    await rpc('set_profile', ['Old Client', 'slate', 'glasses'])
    expect(await rpc('get_league_v2')).toMatchObject({ opted_out: false,
      members: [expect.objectContaining({ name: 'Old Client', avatar: 'slate', accessory: 'glasses' })] })
    expect(await rpc('get_profile_v2')).toMatchObject({ crowns_won: 0, crown_expires_at: null })
  })
  await rpc('add_points', [old, 20])
  const first = await one<{ reached: string }>('select score_reached_at::text reached from public.league_points where user_id = $1 and week = $2', [old, week])
  expect(first.reached).toBeTruthy()
  await db.query('update public.league_points set points = points where user_id = $1 and week = $2', [old, week])
  expect(await one('select score_reached_at::text reached from public.league_points where user_id = $1 and week = $2', [old, week])).toEqual(first)
  await rpc('add_points', [old, 35])
  expect(await rpc('week_points', [old, week])).toBe(55)
  expect(await one('select score_reached_at::text reached from public.league_points where user_id = $1 and week = $2', [old, week])).not.toEqual(first)
})

it('requires three eligible point earners and 50 winner points, using score time to break ties', async () => {
  const group = cohort++
  const late = await player(last, group, 50, 15)
  const early = await player(last, group, 50, 9)
  const highOptOut = await player(last, group, 99)
  await db.query(`insert into public.league_visibility_changes (user_id, changed_at, opted_out)
    values ($1, ($2::date + 4)::timestamp at time zone 'UTC', true)`, [highOptOut, last])
  const anonymous = await player(last, group, 100)
  await db.query('update auth.users set is_anonymous = true where id = $1', [anonymous])
  await player(last, group, 0)
  expect(await rpc('league_crown_winner', [last, 1, group])).toBeNull()
  await player(last, group, 1)
  expect(await rpc('league_crown_winner', [last, 1, group])).toBe(early)
  expect(await as(late, () => rpc('get_profile_v2'))).toMatchObject({ crowns_won: 0, crown_expires_at: null })
  expect(await as(early, () => rpc('get_profile_v2'))).toMatchObject({ crowns_won: 1, crown_expires_at: expect.any(String) })

  const low = cohort++
  for (const points of [49, 40, 1]) await player(last, low, points)
  expect(await rpc('league_crown_winner', [last, 1, low])).toBeNull()

  // Changing the centralized thresholds changes the decision, and changing the activation date hides pre-tracking history.
  await db.exec('update public.league_crown_rules set min_winner_points = 49')
  expect(await rpc('league_crown_winner', [last, 1, low])).not.toBeNull()
  await db.exec('update public.league_crown_rules set min_winner_points = 50, first_week = public.week_start()')
  expect(await rpc('league_crown_winner', [last, 1, group])).toBeNull()
  await db.exec('update public.league_crown_rules set first_week = public.week_start() - 21')
})

it('awards only for the following UTC week and keeps history when a champion leaves', async () => {
  const group = cohort++
  const first = await player(last, group, 100)
  await player(last, group, 70)
  await player(last, group, 60)
  const previous = cohort++
  await player(earlier, previous, 100, 12, first)
  await player(earlier, previous, 25)
  await player(earlier, previous, 1)

  const crownAt = (days: number, delta: number) => one<{ expiry: string | null }>(`select public.league_crown_expiry(
    $1, public.week_start((($2::date + $3::int)::timestamp at time zone 'UTC') + ($4::int * interval '1 millisecond')))::text expiry`,
  [first, week, days, delta]).then((row) => row.expiry)
  expect(await crownAt(0, -1)).toMatch(new RegExp('^' + week)) // the previous week's crown is still active
  const firstInstant = await crownAt(0, 0)
  expect(firstInstant).not.toMatch(new RegExp('^' + week)) // a fresh one replaces it at midnight
  expect(await crownAt(7, -1)).toBe(firstInstant)
  expect(await crownAt(7, 0)).toBeNull()
  expect(await as(first, () => rpc('get_my_avatar'))).toMatchObject({ crown_expires_at: expect.any(String) })
  expect(await as(first, () => rpc('get_profile_v2'))).toMatchObject({ crowns_won: 2, crown_expires_at: expect.any(String) })
  await as(first, () => rpc('set_leagues_opt_out', [true]))
  expect(await rpc('league_crown_winner', [last, 1, group])).toBe(first)
  expect(await as(first, () => rpc('get_profile_v2'))).toMatchObject({ crowns_won: 2, crown_expires_at: null })
  expect(await as(first, () => rpc('get_league_v3'))).toEqual({ opted_out: true })
  await as(first, () => rpc('set_leagues_opt_out', [false]))
  expect(await as(first, () => rpc('get_my_avatar'))).toMatchObject({ crown_expires_at: expect.any(String) })
})

it('shows a promoted previous champion and exposes only an allowlisted profile to eligible viewers', async () => {
  const group = cohort++
  const winner = await player(last, group, 100)
  const viewer = await player(last, group, 10)
  await player(last, group, 15)
  await player(week, cohort++, 5, 12, winner, 2)
  const current = cohort++
  await player(week, current, 25, 10, viewer)
  const peer = await player(week, current, 25, 9)
  const outsider = await player(week, cohort++, 1)
  await as(winner, () => rpc('set_profile', ['Champion Learner', 'crimson', null]))
  await db.query("update public.profiles set streak = 7, league_tier = 2, coins = 420, target_score = 1550 where id = $1", [winner])
  await db.query('update public.profiles set outfit = $2 where id = $1', [
    winner, { fur: 'fur_gray', private_note: 'a private value' },
  ])
  const key = async (id: string) => (await one<{ handle: string }>('select handle from public.profiles where id = $1', [id])).handle
  const handle = await key(winner)
  const league = await as(viewer, () => rpc('get_league_v3'))
  expect(league.previous_champion).toMatchObject({ profile_key: handle, name: 'Champion Learner' })
  expect(league.members.map((member: { profile_key: string }) => member.profile_key)).toEqual([await key(peer), await key(viewer)])
  const view = await as(viewer, () => rpc('get_public_league_profile', [handle]))
  expect(view).toEqual({
    display_name: 'Champion Learner', avatar: { avatar: 'crimson', accessory: null, outfit: { fur: 'fur_gray' } },
    crown_expires_at: expect.any(String), league_tier: 'Notebook', streak: 7, crowns_won: 1, achievements: ['streak_7'],
  })
  expect(await as(viewer, async () => rpc('get_public_league_profile', [league.members[0].profile_key]))).not.toBeNull()
  expect(await as(outsider, () => rpc('get_public_league_profile', [handle]))).toBeNull()
  expect(await as(viewer, () => rpc('get_public_league_profile', [winner]))).toBeNull()
  expect(await as(viewer, () => one('select id from public.profiles where id = $1', [winner]))).toBeUndefined()
  await expect(as(viewer, () => rpc('league_crown_winner', [last, 1, group]))).rejects.toThrow(/permission denied/)
  await db.exec("set role anon; select set_config('request.jwt.claim.sub', '', false);")
  try {
    await expect(rpc('get_public_league_profile', [handle])).rejects.toThrow(/permission denied/)
  } finally { await db.exec('reset role') }
  await as(viewer, () => rpc('set_leagues_opt_out', [true]))
  expect(await as(viewer, () => rpc('get_public_league_profile', [handle]))).toBeNull()
  await as(viewer, () => rpc('set_leagues_opt_out', [false]))
  await as(winner, () => rpc('set_leagues_opt_out', [true]))
  expect(await as(viewer, () => rpc('get_public_league_profile', [handle]))).toBeNull()
  expect((await as(viewer, () => rpc('get_league_v3'))).previous_champion).toBeNull()
})
