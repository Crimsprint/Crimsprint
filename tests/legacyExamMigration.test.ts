import { expect, it } from 'vitest'
import { applyMigration, as, db, keyFor, newUser, one, setupThrough } from './harness'

const uid = '00000000-0000-0000-0090-000000000001'
const other = '00000000-0000-0000-0090-000000000002'

// The argument names and RPC sequence come from crimsprint/main at 773ef6a.
const legacyRpc = <T = any>(name: string, args: Record<string, unknown> = {}, user = uid) =>
  as(user, async () => {
    const named = Object.keys(args).map((key, i) => `${key} => $${i + 1}`)
    return (await one<{ value: T }>(`select public.${name}(${named.join(', ')}) as value`, Object.values(args))).value
  })

const functions = async () => (await db.query<{ name: string; definition: string; acl: string | null }>(`
  select oid::regprocedure::text as name, pg_get_functiondef(oid) as definition, proacl::text as acl
  from pg_proc where pronamespace = 'public'::regnamespace and prokind = 'f'
  order by name`)).rows

const policies = async () => (await db.query(`
  select * from pg_policies where schemaname = 'public' order by tablename, policyname`)).rows

it('serves the 773ef6a client after the exam migration on its original database schema', async () => {
  await setupThrough(7)
  // The live client originally signs in anonymously. Supabase gives that user the authenticated database role.
  await db.query('insert into auth.users (id, is_anonymous) values ($1, true)', [uid])
  const oldSettings = { p_goal: 'first', p_test_date: null, p_current: 400, p_target: 1600, p_daily_goal: 20, p_timezone: 'UTC' }
  await legacyRpc('save_onboarding', oldSettings)
  const mock = await legacyRpc<string>('start_mock')
  const oldMock = await legacyRpc('mock_state', { p_mock: mock })
  const oldLeague = await legacyRpc('get_league')
  const oldProgress = await legacyRpc('get_progress')
  const oldFunctions = await functions()
  const oldPolicies = await policies()

  await applyMigration('0010_exam_targets.sql')

  const priorNames = new Set(oldFunctions.map(({ name }) => name))
  expect((await functions()).filter(({ name }) => priorNames.has(name))).toEqual(oldFunctions)
  expect(await policies()).toEqual(oldPolicies)
  const newState = await legacyRpc('mock_state', { p_mock: mock })
  expect(newState).toEqual({ ...oldMock, server_now: newState.server_now })
  expect(await legacyRpc('get_league')).toEqual(oldLeague)
  expect(await legacyRpc('get_progress')).toEqual(oldProgress)

  // Onboarding and Settings in this revision use the same six named arguments.
  await legacyRpc('save_onboarding', { ...oldSettings, p_test_date: '2027-06-01', p_daily_goal: 30 })
  const profile = await as(uid, () => one(`
    select goal, current_score, target_score, test_date::text, daily_goal, timezone
    from public.profiles where id = $1`, [uid]))
  expect(profile).toEqual({ goal: 'first', current_score: 400, target_score: 1600, test_date: '2027-06-01', daily_goal: 30, timezone: 'UTC' })
  expect(await one('select exam_target from public.profiles where id = $1', [uid])).toEqual({ exam_target: 'sat' })
  await newUser(other)
  await legacyRpc('save_onboarding', oldSettings, other)
  expect(await as(other, () => one('select id from public.profiles where id = $1', [uid]))).toBeUndefined()

  const lesson = await legacyRpc<string>('start_session', { p_mode: 'lesson', p_skill: 'math.alg.lin1', p_tier: 'easy' })
  expect(await legacyRpc('next_item', { p_session: lesson })).toMatchObject({ item: { tier: 'easy' } })

  for (let stage = 0; stage < 4; stage++) {
    if (stage === 2) await legacyRpc('mock_resume', { p_mock: mock })
    const state = await legacyRpc('mock_state', { p_mock: mock })
    expect(state).toMatchObject({ status: 'active', stage })
    expect(state.items).toHaveLength(stage < 2 ? 27 : 22)
    const { position, item } = state.items[0]
    await legacyRpc('mock_answer', { p_mock: mock, p_position: position, p_response: await keyFor(item.id, true) })
    await legacyRpc('mock_flag', { p_mock: mock, p_position: position, p_flagged: true })
    await legacyRpc('mock_submit', { p_mock: mock })
  }
  const completed = await legacyRpc('mock_state', { p_mock: mock })
  expect(completed.status).toBe('completed')
  expect(completed.result).not.toHaveProperty('selection_index')
  expect(completed.result.sections.rw.total).toBe(54)
  expect(completed.result.sections.math.total).toBe(44)
  expect(await legacyRpc('mock_review', { p_mock: mock })).toHaveLength(98)
  expect(await as(uid, () => one(`select id, status, created_at, result from public.mocks where id = $1`, [mock])))
    .toMatchObject({ id: mock, status: 'completed', result: completed.result })
  expect(await one('select exam_target from public.mocks where id = $1', [await legacyRpc<string>('start_mock')]))
    .toEqual({ exam_target: 'sat' })
  expect(await one('select count(*)::int as n from public.mock_items where mock_id = $1 and pretest', [mock]))
    .toEqual({ n: 0 })

  // The new entry points can coexist on the same schema, even before 0008/0009 are installed.
  await legacyRpc('update_exam_settings', {
    p_goal: 'first', p_test_date: null, p_current: 320, p_target: 1520, p_daily_goal: 20, p_exam_target: 'psat',
  }, other)
  expect(await legacyRpc('get_progress_v2', {}, other)).toMatchObject({ exam_target: 'psat', target_score: 1520 })
  const psatMock = await legacyRpc<string>('start_mock_v2', {}, other)
  expect(await legacyRpc('mock_state_v2', { p_mock: psatMock }, other)).toMatchObject({ exam_target: 'psat', stage: 0 })
  await expect(legacyRpc('mock_state_v2', { p_mock: psatMock })).rejects.toThrow(/mock not found/)
}, 60_000)

it('keeps both deployed client RPC flows working after 0011, including mocks already open on 0010', async () => {
  await setupThrough(10)
  const contracts = async () => (await db.query(`
    select oid::regprocedure::text as name, pg_get_function_arguments(oid) as args,
           pg_get_function_result(oid) as result, proacl::text as acl
    from pg_proc where pronamespace = 'public'::regnamespace and prokind = 'f' order by name
  `)).rows
  const before = await contracts()
  await newUser(uid, 'UTC')
  await newUser(other, 'UTC')
  const settings = { p_goal: 'first', p_test_date: null, p_current: 400, p_target: 1200, p_daily_goal: 20, p_timezone: 'UTC' }
  await legacyRpc('save_onboarding', settings)
  await legacyRpc('save_onboarding_v2', { ...settings, p_exam_target: 'psat' }, other)

  const mocks: { id: string; suffix: string; user: string }[] = []
  for (const [suffix, user] of [['', uid], ['_v2', uid], ['_v2', other]]) {
    const id = await legacyRpc<string>(`start_mock${suffix}`, {}, user)
    expect(await legacyRpc(`mock_state${suffix}`, { p_mock: id }, user)).toMatchObject({ status: 'active', stage: 0 })
    mocks.push({ id, suffix, user })
  }

  await applyMigration('0011_security_fixes.sql')
  expect(await contracts()).toEqual(before)
  for (const { id, suffix, user } of mocks) {
    const args = { p_mock: id }
    // No post-migration state call before the first submit. The deployed client already has the state.
    await legacyRpc(`mock_submit${suffix}`, args, user)
    for (const stage of [1, 2, 3]) {
      if (stage === 2) await legacyRpc(`mock_resume${suffix}`, args, user)
      const state = await legacyRpc(`mock_state${suffix}`, args, user)
      expect(state).toMatchObject({ status: 'active', stage })
      const { position, item } = state.items[0]
      await legacyRpc('mock_answer', { ...args, p_position: position, p_response: await keyFor(item.id, true) }, user)
      await legacyRpc(`mock_submit${suffix}`, args, user)
    }
    const done = await legacyRpc(`mock_state${suffix}`, args, user)
    expect(done).toMatchObject({ status: 'completed', stage: 3 })
    expect(done.result.sections.rw.total).toBe(user === other ? 50 : 54)
    expect(await legacyRpc('mock_review', args, user)).toHaveLength(98)
  }

  const lesson = await legacyRpc<string>('start_session', { p_mode: 'lesson', p_skill: 'math.alg.lin1', p_tier: 'easy' })
  const { item } = await legacyRpc('next_item', { p_session: lesson })
  expect(await legacyRpc('submit_answer', { p_session: lesson, p_response: await keyFor(item.id, true), p_ms: 250 }))
    .toMatchObject({ correct: true, done: false })
}, 60_000)
