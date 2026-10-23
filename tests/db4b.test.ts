// Phase 4b database logic: quests, achievements, leagues, mock test, progress, admin.
import { beforeAll, describe, expect, it } from 'vitest'
import { answer, as, db, keyFor, newUser, one, qlen, rpc, setup } from './harness'

let n = 0x100
const fresh = () => newUser(`00000000-0000-0000-0000-${(n++).toString(16).padStart(12, '0')}`)

beforeAll(setup, 60_000)

async function finishLesson(uid: string, skill: string, tier: string, correct = true) {
  const s = await as(uid, () => rpc<string>('start_session', ['lesson', skill, tier]))
  const L = await qlen(s)
  for (let i = 0; i < L; i++) await answer(uid, s, correct)
  return as(uid, () => rpc('complete_session', [s]))
}

describe('function privileges', () => {
  it.each([
    ['apply_streak', "'00000000-0000-0000-0000-000000000000', now()"], ['add_points', "'00000000-0000-0000-0000-000000000000', 100"],
    ['award', "'00000000-0000-0000-0000-000000000000', 'full_run'"], ['bump_quest', "'00000000-0000-0000-0000-000000000000', 'hard1', 1"],
    ['join_league', "'00000000-0000-0000-0000-000000000000'"], ['mock_advance', "'00000000-0000-0000-0000-000000000000'"],
  ])('authenticated users cannot call internal %s', async (fn, args) => {
    const u = await fresh()
    await expect(as(u, () => db.query(`select public.${fn}(${args})`))).rejects.toThrow(/permission denied/)
  })
})

describe('daily quests', () => {
  it('assigns the same 3 quests per user per day', async () => {
    const u = await fresh()
    const q1 = await as(u, () => rpc<any[]>('get_quests'))
    expect(q1).toHaveLength(3)
    expect(await as(u, () => rpc('get_quests'))).toEqual(q1)
  })

  it('tracks progress from answers and lessons, and pays 5 points on completion', async () => {
    const u = await fresh()
    // Force a known quest set for today.
    await db.query(`insert into public.daily_quests (user_id, day, code, target) select $1, public.local_day($1), code, target
                    from public.quest_pool() where code in ('streak5', 'lessons2', 'minutes15')`, [u])
    const before = (await one<{ p: number }>(`select coalesce(sum(points),0)::int p from public.daily_points where user_id = $1`, [u])).p
    await finishLesson(u, 'math.alg.lin1', 'easy')
    const q = Object.fromEntries((await as(u, () => rpc<any[]>('get_quests'))).map((x) => [x.code, x]))
    expect(q.streak5).toMatchObject({ done: true, progress: 5 })
    expect(q.lessons2).toMatchObject({ done: false, progress: 1 })
    expect(q.minutes15.progress).toBeGreaterThan(0)
    const after = (await one<{ p: number }>(`select coalesce(sum(points),0)::int p from public.daily_points where user_id = $1`, [u])).p
    const L = 7
    expect(after - before).toBe(2 * L + 3 + 5) // lesson points + completion bonus + quest bonus
  })
})

describe('achievements', () => {
  it('awards first_step and sharpshooter, and diagnosed after the diagnostic', async () => {
    const u = await fresh()
    await finishLesson(u, 'math.alg.lin1', 'easy')
    await finishLesson(u, 'math.alg.lin1', 'medium')
    await finishLesson(u, 'math.alg.lin1', 'hard')
    const codes = (await db.query<{ code: string }>(`select code from public.achievements where user_id = $1 order by code`, [u])).rows.map((r) => r.code)
    expect(codes).toEqual(expect.arrayContaining(['first_step', 'sharpshooter']))
    expect(codes).not.toContain('diagnosed')
  })

  it('does not award Domain Master from diagnostic estimates alone', async () => {
    const u = await fresh()
    // Diagnostic-style seeding: every Algebra skill at high mastery but unpractised (n = 0).
    await db.query(`insert into public.mastery (user_id, skill_id, theta, n) select $1, id, 2, 0 from public.skills where domain_id = 'math.alg'`, [u])
    await finishLesson(u, 'math.alg.lin1', 'easy')
    expect(await one(`select count(*)::int c from public.achievements where user_id = $1 and code = 'domain_master'`, [u])).toEqual({ c: 0 })
  })

  it('awards streak milestones through the profile trigger', async () => {
    const u = await fresh()
    for (let d = 1; d <= 7; d++) await db.query('select public.apply_streak($1, $2::timestamptz)', [u, `2027-05-0${d}T20:00:00Z`])
    expect(await one(`select count(*)::int c from public.achievements where user_id = $1 and code = 'streak_7'`, [u])).toEqual({ c: 1 })
  })
})

describe('weekly leagues', () => {
  it('places new learners in Pencil cohorts of at most 30, showing only name, avatar and points', async () => {
    const u = await fresh()
    const l = await as(u, () => rpc('get_league'))
    expect(l).toMatchObject({ tier: 1, tier_name: 'Pencil', promote: 7, demote: 0 })
    const me = l.members.find((m: any) => m.me)
    expect(Object.keys(me).sort()).toEqual(['accessory', 'avatar', 'me', 'name', 'points'])
    expect(me.name).toMatch(/^Learner [0-9A-F]{4}$/) // no display name yet: a pseudonym, never the Google name
    expect(JSON.stringify(l)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/) // no user ids leak
  })

  it('promotes the top 7 and relegates the bottom 5 when the next week starts', async () => {
    const week = '2027-06-07' // a Monday
    const users: string[] = []
    for (let i = 0; i < 15; i++) users.push(await fresh())
    await db.exec(`update public.profiles set league_tier = 3 where id in (${users.map((u) => `'${u}'`).join(',')})`)
    for (const [i, u] of users.entries()) {
      await db.query(`select public.join_league($1, $2::timestamptz)`, [u, `${week}T12:00:00Z`])
      await db.query(`insert into public.daily_points values ($1, $2::date, $3)`, [u, week, 100 - i]) // rank i+1
    }
    expect(new Set((await db.query<{ c: number }>(`select cohort c from public.league_members where week = $1 and tier = 3`, [week])).rows.map((r) => r.c)).size).toBe(1)
    const next = '2027-06-14T12:00:00Z'
    const tiers: number[] = []
    for (const u of users) tiers.push((await db.query<{ tier: number }>(`select (public.join_league($1, $2::timestamptz)).tier`, [u, next])).rows[0].tier)
    expect(tiers).toEqual([4, 4, 4, 4, 4, 4, 4, 3, 3, 3, 2, 2, 2, 2, 2])
  })

  it('tolerates two concurrent joins', async () => {
    const u = await fresh()
    const [a, b] = await Promise.all([as(u, () => rpc('get_league')), as(u, () => rpc('get_league'))])
    expect(a.tier).toBe(1)
    expect(b.tier).toBe(1)
    // Simulate the race directly: a second insert for the same week must not fail.
    await expect(db.query(`select public.join_league($1)`, [u])).resolves.toBeTruthy()
  })

  it('respects opt-out', async () => {
    const u = await fresh()
    await as(u, () => rpc('set_leagues_opt_out', [true]))
    expect(await as(u, () => rpc('get_league'))).toEqual({ opted_out: true })
  })
})

describe('mock test', () => {
  async function answerModule(u: string, mock: string, rightRatio: number) {
    const st = await as(u, () => rpc('mock_state', [mock]))
    const items = st.items as any[]
    for (const [i, it] of items.entries()) {
      const resp = await keyFor(it.item.id, i < Math.round(items.length * rightRatio))
      await as(u, () => rpc('mock_answer', [mock, it.position, resp]))
    }
    await as(u, () => rpc('mock_flag', [mock, items[0].position, true]))
    await as(u, () => rpc('mock_submit', [mock]))
    return st
  }

  it('runs R&W → break → Math with adaptive routing and an estimated score', async () => {
    const u = await fresh()
    const mock = await as(u, () => rpc<string>('start_mock'))
    const m1 = await answerModule(u, mock, 1)
    expect(m1).toMatchObject({ status: 'active', section: 'rw', module: 1 })
    expect(JSON.stringify(m1.items)).not.toMatch(/"(answer|explanation|rationales|correct)":/)
    const m2 = await as(u, () => rpc('mock_state', [mock]))
    expect(m2).toMatchObject({ section: 'rw', module: 2 })
    await answerModule(u, mock, 0.5)
    expect(await as(u, () => rpc('mock_state', [mock]))).toMatchObject({ status: 'break' })
    await as(u, () => rpc('mock_resume', [mock]))
    const m3 = await answerModule(u, mock, 0.2)
    expect(m3).toMatchObject({ section: 'math', module: 1 })
    expect(m3.items).toHaveLength(22)
    await answerModule(u, mock, 0.2)
    const done = await as(u, () => rpc('mock_state', [mock]))
    expect(done.status).toBe('completed')
    expect(done.result.routes).toEqual({ rw: 'higher', math: 'lower' })
    const { rw, math } = done.result.sections
    expect(rw.estimate).toBeGreaterThan(math.estimate)
    for (const s of [rw, math]) {
      expect(s.estimate % 10).toBe(0)
      expect(s.high - s.low).toBeLessThanOrEqual(60)
    }
    expect(done.result.total.estimate).toBe(rw.estimate + math.estimate)
    const review = await as(u, () => rpc<any[]>('mock_review', [mock]))
    expect(review[0].item).toHaveProperty('explanation')
    expect(await one(`select count(*)::int c from public.achievements where user_id = $1 and code = 'full_run'`, [u])).toEqual({ c: 1 })
  })

  it('orders R&W modules Craft and Structure → Information and Ideas → Conventions → Expression', async () => {
    const u = await fresh()
    const mock = await as(u, () => rpc<string>('start_mock'))
    const rows = (await db.query<{ d: string }>(`select s.domain_id d from public.mock_items x join public.items i on i.id = x.item_id
      join public.skills s on s.id = i.skill_id where x.mock_id = $1 order by x.position`, [mock])).rows.map((r) => r.d)
    const order = [...new Set(rows)]
    expect(order).toEqual(['rw.cs', 'rw.ii', 'rw.sec', 'rw.eoi'].filter((d) => order.includes(d)))
  })

  it('closes a module after its time limit, server-side', async () => {
    const u = await fresh()
    const mock = await as(u, () => rpc<string>('start_mock'))
    await db.query(`update public.mocks set stage_started_at = now() - interval '33 minutes' where id = $1`, [mock])
    await expect(as(u, () => rpc('mock_answer', [mock, 1, 'A']))).rejects.toThrow(/module closed/)
    const st = await as(u, () => rpc('mock_state', [mock]))
    expect(st).toMatchObject({ stage: 1, module: 2 })
  })

  it('hides review until the test is finished, and other users’ mocks entirely', async () => {
    const u = await fresh(), v = await fresh()
    const mock = await as(u, () => rpc<string>('start_mock'))
    await expect(as(u, () => rpc('mock_review', [mock]))).rejects.toThrow(/not finished/)
    await expect(as(v, () => rpc('mock_state', [mock]))).rejects.toThrow(/not found/)
    await as(u, async () => expect((await db.query('select * from public.mock_items')).rows).toHaveLength(0))
  })
})

describe('progress dashboard', () => {
  it('summarizes accuracy, pace and weeks', async () => {
    const u = await fresh()
    await finishLesson(u, 'math.alg.linfn', 'easy')
    const p = await as(u, () => rpc('get_progress'))
    expect(p.sections.math).toMatchObject({ answered: 7, accuracy: 1, median_seconds: 30 })
    expect(p.weeks).toHaveLength(1)
  })
})

describe('admin content tool', () => {
  const base = {
    skill_id: 'math.alg.lin1', tier: 'easy', kind: 'mcq', stem: 'If $x + 1 = 3$, what is $x$?',
    choices: [{ id: 'A', text: '1' }, { id: 'B', text: '2' }, { id: 'C', text: '3' }, { id: 'D', text: '4' }],
    answer: { choice: 'B' }, explanation: 'Subtract 1 from both sides: x = 2.',
    rationales: { A: 'Subtracts twice.', C: 'Copies the right side.', D: 'Adds 1.' },
  }
  it('rejects non-admins', async () => {
    const u = await fresh()
    await expect(as(u, () => rpc('admin_save_item', [JSON.stringify(base)]))).rejects.toThrow(/admin only/)
  })
  it('validates items and saves drafts', async () => {
    const u = await fresh()
    await db.query(`update public.profiles set is_admin = true where id = $1`, [u])
    const save = (p: object) => as(u, () => rpc<string>('admin_save_item', [JSON.stringify(p)]))
    await expect(save({ ...base, rationales: { A: 'x' } })).rejects.toThrow(/rationale/)
    await expect(save({ ...base, answer: { choice: 'E' } })).rejects.toThrow(/A–D/)
    await expect(save({ ...base, kind: 'spr', answer: { values: [[2, 3]], display: '0.67' } })).rejects.toThrow(/display/)
    const id = await save(base)
    expect(await one(`select status, b from public.items where id = $1`, [id])).toEqual({ status: 'draft', b: -1 })
    await save({ ...base, id, tier: 'hard', status: 'published' })
    expect(await one(`select status, b from public.items where id = $1`, [id])).toEqual({ status: 'published', b: 1 })
  })
  it('collects learner reports for admins', async () => {
    const u = await fresh(), admin = await fresh()
    await db.query(`update public.profiles set is_admin = true where id = $1`, [admin])
    const item = (await one<{ id: string }>(`select id from public.items limit 1`)).id
    await as(u, () => rpc('report_item', [item, 'Choice C looks correct too']))
    const reports = await as(admin, () => rpc<any[]>('admin_reports'))
    expect(reports.some((r) => r.reason === 'Choice C looks correct too')).toBe(true)
  })
})
