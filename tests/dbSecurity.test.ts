import { beforeAll, expect, it } from 'vitest'
import { as, db, keyFor, newUser, one, rpc, setup } from './harness'

beforeAll(setup, 60_000)

let n = 0
const fresh = () => newUser(`00000000-0000-0000-0091-${String(++n).padStart(12, '0')}`, 'UTC')
const call = <T = any>(uid: string, fn: string, ...args: unknown[]) => as(uid, () => rpc<T>(fn, args))
const session = async (uid: string, queue: string[]) => (await one<{ id: string }>(
  "insert into public.sessions (user_id, mode, queue) values ($1, 'review', $2) returning id", [uid, queue],
)).id
const points = (uid: string) => one<{ points: number }>(
  'select coalesce(sum(points), 0)::int as points from public.league_points where user_id = $1', [uid],
)

it('credits a learner per item only once per rolling seven days and grades all attempts', async () => {
  const uid = await fresh(), other = await fresh()
  const { id, skill_id } = await one<{ id: string; skill_id: string }>(
    "select id, skill_id from public.items where status = 'published' and kind = 'mcq' and tier = 'easy' limit 1",
  )
  const right = await keyFor(id, true), wrong = await keyFor(id, false)
  const first = await session(uid, [id])
  expect(await call(uid, 'submit_answer', first, wrong, 0)).toMatchObject({ done: true, correct: false })
  expect(await points(uid)).toEqual({ points: 1 })

  // Model historical data from 0010, then verify that repeat attempts don't move the credit window.
  await db.query("update public.responses set earned_points = null, created_at = now() - interval '167 hours' where session_id = $1", [first])
  const repeat = await session(uid, [id])
  expect(await call(uid, 'submit_answer', repeat, right, 0)).toMatchObject({ done: true, correct: true })
  expect(await points(uid)).toEqual({ points: 1 })
  expect(await one('select n from public.mastery where user_id = $1 and skill_id = $2', [uid, skill_id])).toEqual({ n: 2 })
  expect(await one('select earned_points from public.responses where session_id = $1', [repeat])).toEqual({ earned_points: 0 })

  await db.query("update public.responses set created_at = now() - interval '168 hours' where session_id = $1", [first])
  await call(uid, 'submit_answer', await session(uid, [id]), right, 0)
  expect(await points(uid)).toEqual({ points: 3 })
  await call(uid, 'submit_answer', await session(uid, [id]), right, 0)
  expect(await points(uid)).toEqual({ points: 3 })
  await call(other, 'submit_answer', await session(other, [id]), right, 0)
  expect(await points(other)).toEqual({ points: 2 })
})

it('skips missing, draft and retired queue entries while preserving the next published item', async () => {
  const uid = await fresh()
  const { rows } = await db.query<{ id: string }>("select id from public.items where status = 'published' limit 3")
  const [draft, retired, published] = rows.map(({ id }) => id)
  const missing = '00000000-0000-0000-0091-999999999999'
  const sid = await session(uid, [draft, missing, retired, published, missing])
  await db.query("update public.items set status = 'draft' where id = $1", [draft])
  await db.query("update public.items set status = 'retired' where id = $1", [retired])
  try {
    expect(await call(uid, 'next_item', sid)).toMatchObject({ done: false, index: 0, item: { id: published } })
    await call(uid, 'submit_answer', sid, await keyFor(published, true), 0)
    expect(await call(uid, 'next_item', sid)).toEqual({ done: true })
  } finally {
    await db.query("update public.items set status = 'published' where id in ($1, $2)", [draft, retired])
  }
})

async function newMock(exam = 'psat') {
  const uid = await fresh()
  await db.query('update public.profiles set exam_target = $2 where id = $1', [uid, exam])
  const id = await call<string>(uid, 'start_mock_v2')
  const submit = (stage?: number) => as(uid, async () => {
    const headers = stage === undefined ? {} : { prefer: `return=minimal, crimsprint-mock-stage=${stage}` }
    await db.query("select set_config('request.headers', $1, false)", [JSON.stringify(headers)])
    try { await rpc('mock_submit_v2', [id]) }
    finally { await db.exec("reset request.headers") }
  })
  return { uid, id, submit, state: () => call(uid, 'mock_state_v2', id) }
}

it.each(['sat', 'psat'])('keeps late and duplicate %s submits on the viewed stage', async (exam) => {
  const { uid, id, state, submit } = await newMock(exam)
  expect(await state()).toMatchObject({ status: 'active', stage: 0 })
  await submit()
  const balance = await points(uid)
  await submit()
  expect(await one('select stage, status from public.mocks where id = $1', [id])).toEqual({ stage: 1, status: 'active' })
  expect(await points(uid)).toEqual(balance)

  expect(await state()).toMatchObject({ status: 'active', stage: 1 })
  await submit(0)
  expect(await state()).toMatchObject({ status: 'active', stage: 1 })
  expect(await points(uid)).toEqual(balance)
  await submit(1)
  expect(await state()).toMatchObject({ status: 'break', stage: 2 })
})

it.each(['sat', 'psat'])('earns no points, streak, quest or full_run for an all-blank %s mock', async (exam) => {
  const { uid, id, state, submit } = await newMock(exam)
  await db.query("insert into public.daily_quests (user_id, day, code, target) values ($1, public.local_day($1), 'mock1', 1)", [uid])
  for (let stage = 0; stage < 4; stage++) {
    if (stage === 2) await call(uid, 'mock_resume_v2', id)
    expect(await state()).toMatchObject({ status: 'active', stage })
    await submit(stage)
  }
  const completed = await state()
  expect(completed).toMatchObject({
    status: 'completed',
    result: {
      sections: { rw: { correct: 0, total: exam === 'sat' ? 54 : 50 }, math: { correct: 0, total: exam === 'sat' ? 44 : 40 } },
      routes: { rw: 'lower', math: 'lower' },
    },
  })
  if (exam === 'psat') expect(completed.result.selection_index).toEqual(expect.any(Number))
  else expect(completed.result).not.toHaveProperty('selection_index')
  expect(await points(uid)).toEqual({ points: 0 })
  expect(await one('select streak, last_active from public.profiles where id = $1', [uid])).toEqual({ streak: 0, last_active: null })
  expect(await one("select progress, done from public.daily_quests where user_id = $1 and code = 'mock1'", [uid])).toEqual({ progress: 0, done: false })
  expect(await one("select code from public.achievements where user_id = $1 and code = 'full_run'", [uid])).toBeUndefined()
})

it.each(['sat', 'psat'])('requires scored work in each %s module for full_run, including through legacy RPCs', async (exam) => {
  const { uid, id, state, submit } = await newMock(exam)
  await db.query("insert into public.daily_quests (user_id, day, code, target) values ($1, public.local_day($1), 'mock1', 1)", [uid])
  for (let stage = 0; stage < 4; stage++) {
    if (stage === 2) await call(uid, 'mock_resume', id)
    const loaded = await call(uid, 'mock_state', id)
    expect(loaded).toMatchObject({ status: 'active', stage })
    expect(loaded).not.toHaveProperty('exam_target')
    if (stage !== 0 || exam === 'psat') {
      const { position, item_id } = await one<{ position: number; item_id: string }>(
        'select position, item_id from public.mock_items where mock_id = $1 and stage = $2 and pretest = $3 limit 1',
        [id, stage, stage === 0],
      )
      await call(uid, 'mock_answer', id, position, await keyFor(item_id, true))
    }
    if (stage === 0) {
      // The legacy state RPC closes the blank SAT or pretest-only PSAT module on timeout.
      await db.query("update public.mocks set stage_started_at = now() - interval '40 minutes' where id = $1", [id])
      expect(await call(uid, 'mock_state', id)).toMatchObject({ stage: 1 })
      expect(await points(uid)).toEqual({ points: 0 })
      expect(await one('select streak from public.profiles where id = $1', [uid])).toEqual({ streak: 0 })
    } else {
      await submit(stage)
    }
  }
  expect(await state()).toMatchObject({ status: 'completed' })
  expect(await points(uid)).toEqual({ points: 17 }) // 4 per eligible module, plus the mock quest
  expect(await one('select streak from public.profiles where id = $1', [uid])).toEqual({ streak: 1 })
  expect(await one("select progress, done from public.daily_quests where user_id = $1 and code = 'mock1'", [uid])).toEqual({ progress: 1, done: true })
  expect(await one("select code from public.achievements where user_id = $1 and code = 'full_run'", [uid])).toBeUndefined()
})
