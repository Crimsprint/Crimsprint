import { beforeAll, expect, it } from 'vitest'
import { scoreOptions } from '../src/lib/exams'
import { answer, as, db, keyFor, newUser, one, qlen, rpc, setup } from './harness'

beforeAll(setup, 60_000)

let n = 0
const fresh = () => newUser(`00000000-0000-0000-0080-${String(++n).padStart(12, '0')}`)
const onboard = (u: string, target = 1200) =>
  as(u, () => rpc('save_onboarding_v2', ['first', null, null, target, 20, 'UTC', 'psat']))

it.each([['sat', 400, 1600], ['psat', 320, 1520]] as const)('offers %s scores in steps of 10', (exam, min, max) => {
  expect(scoreOptions(exam)).toEqual(Array.from({ length: (max - min) / 10 + 1 }, (_, i) => min + i * 10))
})

it.each([[160, 160, 320, 48], [620, 500, 1120, 174], [760, 760, 1520, 228]])(
  'calculates the Selection Index for R&W %i and Math %i', async (rw, math, total, index) => {
    expect(rw + math).toBe(total)
    expect(await rpc('psat_selection_index', [rw, math])).toBe(index)
  },
)

it('validates exam-specific score ranges and keeps private profile access', async () => {
  const u = await fresh(), v = await fresh()
  expect(await one('select exam_target from public.profiles where id = $1', [u])).toEqual({ exam_target: 'sat' })
  await expect(onboard(u, 1530)).rejects.toThrow(/invalid target score for exam/)
  await expect(onboard(u, 325)).rejects.toThrow(/invalid target score for exam/)
  await onboard(u, 320)
  await expect(as(u, () => rpc('update_exam_settings', ['first', null, null, 390, 20, 'sat'])))
    .rejects.toThrow(/invalid target score for exam/)
  expect(await as(v, () => one('select exam_target from public.profiles where id = $1', [u]))).toBeUndefined()
})

it('keeps streak, points and mastery when switching targets and tags the same league', async () => {
  const u = await fresh(), v = await fresh()
  await as(u, () => rpc('save_onboarding', ['first', null, null, 1200, 20, 'UTC']))
  const session = await as(u, () => rpc<string>('start_session_v2', ['lesson', 'math.alg.lin1', 'easy']))
  const length = await qlen(session)
  for (let i = 0; i < length; i++) await answer(u, session, true)
  await as(u, () => rpc('complete_session', [session]))
  const before = await as(u, () => rpc('get_home'))
  expect(before.profile.streak).toBeGreaterThan(0)
  expect(before.today_points).toBeGreaterThan(0)
  expect(before.skills.find((skill: { id: string }) => skill.id === 'math.alg.lin1').answered).toBe(length)
  await as(v, () => rpc('get_league_v2'))
  for (const exam of ['psat', 'sat']) {
    await as(u, () => rpc('update_exam_settings', ['first', null, null, 1200, 20, exam]))
    expect(await as(u, () => rpc('get_home'))).toEqual(before)
    const league = await as(u, () => rpc('get_league_v2'))
    expect(league.members.find((member: { me: boolean }) => member.me).exam_target).toBe(exam)
    expect(league.members.find((member: { me: boolean }) => !member.me).exam_target).toBe('sat')
  }
})

it('samples fewer hard items at the same path tier in PSAT mode', async () => {
  const u = await fresh()
  await onboard(u)
  await db.query("insert into public.level_progress (user_id, skill_id, tier) values ($1, 'math.alg.lin1', 'medium')", [u])
  const lesson = () => as(u, () => rpc<string>('start_session_v2', ['lesson', 'math.alg.lin1', 'hard']))
  const count = (id: string) => one<{ total: number; hard: number }>(
    'select count(*)::int as total, count(*) filter (where i.tier = \'hard\')::int as hard from public.sessions s join public.items i on i.id = any(s.queue) where s.id = $1',
    [id],
  )
  expect(await count(await lesson())).toEqual({ total: 8, hard: 3 })
  await as(u, () => rpc('update_exam_settings', ['first', null, null, 1200, 20, 'sat']))
  const sat = await count(await lesson())
  expect(sat.total).toBe(sat.hard)
  expect(sat.hard).toBeGreaterThan(3)
})

it('runs all four PSAT modules, excludes pretest responses from routes and scores, and keeps the original exam', async () => {
  const u = await fresh()
  await onboard(u)
  const call = <T = any>(name: string, args: unknown[] = []) => as(u, () => rpc<T>(name, args))
  const mock = await call<string>('start_mock_v2')
  await call('update_exam_settings', ['first', null, null, 1200, 20, 'sat'])
  const satMock = await call<string>('start_mock_v2')

  for (const stage of [0, 1, 2, 3]) {
    if (stage === 2) {
      expect((await call('mock_state_v2', [mock])).status).toBe('break')
      await call('mock_resume_v2', [mock])
    }
    const state = await call('mock_state_v2', [mock])
    expect(state).toMatchObject({ exam_target: 'psat', stage, status: 'active' })
    expect(state.items).toHaveLength(stage < 2 ? 27 : 22)
    expect((Date.parse(state.deadline) - Date.parse(state.server_now)) / 60000).toBeCloseTo(stage < 2 ? 32 : 35, 1)
    expect(state.items[0]).not.toHaveProperty('pretest')

    const { rows } = await db.query<{ item_id: string; position: number; pretest: boolean; tier: string }>(`
      select x.item_id, x.position, x.pretest, i.tier from public.mock_items x
      join public.items i on i.id = x.item_id where x.mock_id = $1 and x.stage = $2 order by x.position`, [mock, stage])
    expect(rows.filter((r) => r.pretest)).toHaveLength(2)
    if (stage === 0) {
      const sat = await one<{ hard: number }>(`select count(*)::int hard from public.mock_items x
        join public.items i on i.id = x.item_id where x.mock_id = $1 and i.tier = 'hard'`, [satMock])
      expect(rows.filter((r) => r.tier === 'hard').length).toBeLessThan(sat.hard)
    }
    let scored = 0
    for (const row of rows) {
      // Reading and Writing routes higher on 15/25 even though both pretest responses are wrong.
      const right = !row.pretest && scored++ < (stage < 2 ? 15 : 9)
      await call('mock_answer', [mock, row.position, await keyFor(row.item_id, right)])
    }
    await call('mock_submit_v2', [mock])
  }

  const done = await call('mock_state_v2', [mock])
  const { rw, math } = done.result.sections
  expect(done.result.routes).toEqual({ rw: 'higher', math: 'lower' })
  expect(rw).toMatchObject({ total: 50, correct: 30 })
  expect(math).toMatchObject({ total: 40, correct: 18 })
  for (const { low, estimate, high } of [rw, math]) {
    expect(low).toBeGreaterThanOrEqual(160)
    expect(high).toBeLessThanOrEqual(760)
    expect(estimate % 10).toBe(0)
  }
  expect(done.result.total.estimate).toBe(rw.estimate + math.estimate)
  expect(done.result.selection_index).toBe((2 * rw.estimate + math.estimate) / 10)
  expect((await call('get_progress_v2')).mocks).toEqual([expect.objectContaining({ id: mock, exam_target: 'psat' })])
  expect((await call('mock_state_v2', [satMock])).exam_target).toBe('sat')
})
