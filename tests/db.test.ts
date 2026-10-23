// Runs the real migrations + seed in PGlite (in-process Postgres); see tests/harness.ts.
import { beforeAll, describe, expect, it } from 'vitest'
import { answer, as, db, one, qlen, rpc, setup } from './harness'

const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'

beforeAll(async () => {
  await setup()
  await db.exec(`insert into auth.users values ('${A}'), ('${B}');`)
  await db.exec(`update public.profiles set timezone = 'America/Los_Angeles';`)
}, 60_000)

describe('spr_correct (Bluebook entry rules)', () => {
  const ok = (input: string, n: number, d: number) => rpc<boolean>('spr_correct', [input, JSON.stringify([[n, d]])])
  it.each(['3.5', '3.50', '7/2'])('accepts %s for 7/2', async (s) => expect(await ok(s, 7, 2)).toBe(true))
  it.each(['31/2', '3 1/2', '$3.5', '3.5%'])('rejects %s for 7/2', async (s) => expect(await ok(s, 7, 2)).toBe(false))
  it.each(['2/3', '.6666', '.6667', '0.666', '0.667'])('accepts %s for 2/3', async (s) => expect(await ok(s, 2, 3)).toBe(true))
  it.each(['0.66', '.66', '0.67', '.67', '0.6667'])('rejects %s for 2/3', async (s) => expect(await ok(s, 2, 3)).toBe(false))
  it.each(['-1/3', '-.3333', '-0.333'])('accepts %s for -1/3', async (s) => expect(await ok(s, -1, 3)).toBe(true))
  it.each(['-.33', '-0.33', '1/3'])('rejects %s for -1/3', async (s) => expect(await ok(s, -1, 3)).toBe(false))
  it('rejects division by zero and empty input', async () => {
    expect(await ok('1/0', 1, 0 || 1)).toBe(false)
    expect(await ok('', 0, 1)).toBe(false)
  })
})

describe('row-level security', () => {
  it('hides answer keys and other users’ data', async () => {
    const s = await as(A, () => rpc<string>('start_session', ['lesson', 'math.alg.lin1', 'easy']))
    await as(B, async () => {
      expect((await db.query('select * from public.items')).rows).toHaveLength(0)
      expect((await db.query('select * from public.sessions where id = $1', [s])).rows).toHaveLength(0)
      await expect(rpc('next_item', [s])).rejects.toThrow(/session not found/)
      await expect(db.query(`insert into public.mastery values ('${B}', 'math.alg.lin1', 5, 0)`)).rejects.toThrow()
    })
  })
  it('never sends the answer with an item', async () => {
    const s = await as(A, () => rpc<string>('start_session', ['lesson', 'math.alg.lin2', 'easy']))
    const next = await as(A, () => rpc('next_item', [s]))
    expect(JSON.stringify(next)).not.toMatch(/"answer"|explanation|rationale/)
    expect(next.item.choices).toHaveLength(4)
  })
  it('blocks anonymous (no-JWT) callers from RPCs', async () => {
    await db.exec('set role anon;')
    await expect(rpc('get_home')).rejects.toThrow()
    await db.exec('reset role;')
  })
})

describe('lesson flow, mastery and level unlock', () => {
  it('locks medium until easy is passed', async () => {
    await as(B, async () => {
      await expect(rpc('start_session', ['lesson', 'math.alg.linfn', 'medium'])).rejects.toThrow(/locked/)
    })
  })

  it('a perfect easy lesson passes, scores 2/item + 3 and moves mastery up', async () => {
    const s = await as(B, () => rpc<string>('start_session', ['lesson', 'math.alg.linfn', 'easy']))
    const L = await qlen(s)
    let res: any
    for (let i = 0; i < L; i++) res = await answer(B, s, true)
    expect(res.done).toBe(true)
    const sum = await as(B, () => rpc('complete_session', [s]))
    expect(sum).toMatchObject({ passed: true, correct: L, total: L, points: 2 * L + 3, streak: 1 })
    expect(sum.mastery_after).toBeGreaterThan(sum.mastery_before)
    // Idempotent: completing twice changes nothing.
    expect(await as(B, () => rpc('complete_session', [s]))).toEqual(sum)
    await as(B, () => rpc('start_session', ['lesson', 'math.alg.linfn', 'medium']))
  })

  it('first answer on an easy item from θ=0 follows the Elo update exactly', async () => {
    const C = '00000000-0000-0000-0000-00000000000c'
    await db.exec(`insert into auth.users values ('${C}')`)
    const s = await as(C, () => rpc<string>('start_session', ['lesson', 'math.alg.ineq', 'easy']))
    await answer(C, s, true)
    const m = await one<{ theta: number; n: number }>(`select theta, n from public.mastery where user_id = $1`, [C])
    // K = 0.8, P = σ(0 − (−1)) → θ = 0.8 · (1 − σ(1))
    expect(m.theta).toBeCloseTo(0.8 * (1 - 1 / (1 + Math.exp(-1))), 10)
    expect(m.n).toBe(1)
  })

  it('a miss is re-asked once at the end without moving mastery again', async () => {
    const D = '00000000-0000-0000-0000-00000000000d'
    await db.exec(`insert into auth.users values ('${D}')`)
    const s = await as(D, () => rpc<string>('start_session', ['lesson', 'math.alg.systems', 'easy']))
    const L = await qlen(s)
    const r = await answer(D, s, false)
    expect(r).toMatchObject({ correct: false, mistakes_left: 4 })
    expect(r.explanation.length).toBeGreaterThan(10)
    const q = await one<{ len: number; first: string; last: string }>('select cardinality(queue) len, queue[1] first, queue[cardinality(queue)] last from public.sessions where id = $1', [s])
    expect(q.len).toBe(L + 1)
    expect(q.last).toBe(q.first)
    for (let i = 0; i < L - 1; i++) await answer(D, s, true)
    const n1 = (await one<{ n: number }>(`select n from public.mastery where user_id = $1`, [D])).n
    await answer(D, s, true) // the re-ask
    expect((await one<{ n: number }>(`select n from public.mastery where user_id = $1`, [D])).n).toBe(n1)
    expect(await one(`select count(*)::int c from public.review_items where user_id = $1`, [D])).toEqual({ c: 1 })
    const sum = await as(D, () => rpc('complete_session', [s]))
    expect(sum).toMatchObject({ correct: L - 1, total: L, missed: 1, passed: L - 1 >= Math.ceil(0.75 * L), points: (L - 1) * 2 + 1 + 3 })
  })

  it('five misses end the lesson (mistake budget) without passing', async () => {
    const E = '00000000-0000-0000-0000-00000000000e'
    await db.exec(`insert into auth.users values ('${E}')`)
    const s = await as(E, () => rpc<string>('start_session', ['lesson', 'math.alg.lin2', 'easy']))
    let r: any
    for (let i = 0; i < 5; i++) r = await answer(E, s, false)
    expect(r).toMatchObject({ done: true, mistakes_left: 0 })
    const sum = await as(E, () => rpc('complete_session', [s]))
    expect(sum).toMatchObject({ status: 'failed', passed: false })
    expect(await one(`select count(*)::int c from public.level_progress where user_id = $1`, [E])).toEqual({ c: 0 })
  })

  it('refuses to complete an unfinished session', async () => {
    const s = await as(A, () => rpc<string>('start_session', ['lesson', 'math.alg.lin1', 'easy']))
    await expect(as(A, () => rpc('complete_session', [s]))).rejects.toThrow(/not finished/)
  })
})

describe('diagnostic', () => {
  it('serves 3 adaptive items per domain, gives no feedback, and seeds all skills', async () => {
    const F = '00000000-0000-0000-0000-00000000000f'
    await db.exec(`insert into auth.users values ('${F}')`)
    const s = await as(F, () => rpc<string>('start_session', ['diagnostic']))
    const tiers: string[] = []
    for (let i = 0; i < 24; i++) {
      const n = await as(F, () => rpc('next_item', [s]))
      expect(n).toMatchObject({ done: false, index: i, total: 24 })
      tiers.push(n.item.tier)
      const r = await answer(F, s, i % 3 === 0) // right on the first item of each domain, then wrong
      expect(r).toEqual({ done: i === 23 })
    }
    // Per domain: medium → (correct) hard → (wrong) medium
    for (let d = 0; d < 8; d++) expect(tiers.slice(d * 3, d * 3 + 3)).toEqual(['medium', 'hard', 'medium'])
    const sum = await as(F, () => rpc('complete_session', [s]))
    expect(sum.domains).toHaveLength(8)
    expect(await one(`select count(*)::int c from public.mastery where user_id = $1`, [F])).toEqual({ c: 29 })
  })
})

describe('streak (timezone-safe)', () => {
  const G = '00000000-0000-0000-0000-000000000001'
  const streak = async (ts: string) => {
    await db.query('select public.apply_streak($1, $2::timestamptz)', [G, ts])
    return one<{ streak: number; freezes: number; last_active: string }>(
      `select streak, freezes, to_char(last_active, 'YYYY-MM-DD') last_active from public.profiles where id = $1`, [G])
  }
  beforeAll(async () => {
    await db.exec(`insert into auth.users values ('${G}'); update public.profiles set timezone = 'America/Los_Angeles' where id = '${G}';`)
  })

  it('uses the local calendar day, not UTC', async () => {
    // 05:00 UTC on Mar 1 is still Feb 28 in Los Angeles.
    expect(await streak('2027-03-01T05:00:00Z')).toMatchObject({ streak: 1, last_active: '2027-02-28' })
    // Later the same local day: no change.
    expect(await streak('2027-03-01T07:59:00Z')).toMatchObject({ streak: 1, last_active: '2027-02-28' })
    // 08:00 UTC = midnight PST on Mar 1: next local day.
    expect(await streak('2027-03-01T08:00:00Z')).toMatchObject({ streak: 2, last_active: '2027-03-01' })
  })

  it('counts consecutive days across a DST change', async () => {
    // US DST starts 2027-03-14; one day each from Mar 2 to Mar 15 local time.
    let s: any
    for (let d = 2; d <= 15; d++) s = await streak(`2027-03-${String(d).padStart(2, '0')}T20:00:00Z`)
    expect(s).toMatchObject({ streak: 16, last_active: '2027-03-15' })
  })

  it('awards freezes at milestones (max 2) and spends one on a single missed day', async () => {
    // Streak passed 7 and 14 → 2 freezes.
    expect((await one<{ freezes: number }>(`select freezes from public.profiles where id = $1`, [G])).freezes).toBe(2)
    // Skip Mar 16, practice Mar 17 → freeze used, streak continues.
    expect(await streak('2027-03-17T20:00:00Z')).toMatchObject({ streak: 17, freezes: 1 })
    // Skip two days → reset.
    expect(await streak('2027-03-20T20:00:00Z')).toMatchObject({ streak: 1, freezes: 1 })
  })

  it('does not double-count when the timezone moves "today" backwards', async () => {
    await db.exec(`update public.profiles set timezone = 'Asia/Tokyo' where id = '${G}'`)
    const before = await streak('2027-03-21T16:00:00Z') // Mar 22 in Tokyo → +1
    expect(before).toMatchObject({ streak: 2, last_active: '2027-03-22' })
    await db.exec(`update public.profiles set timezone = 'Pacific/Honolulu' where id = '${G}'`)
    // Same instant + 1h is still Mar 21 in Honolulu: earlier than last_active, so no change.
    expect(await streak('2027-03-21T17:00:00Z')).toMatchObject({ streak: 2, last_active: '2027-03-22' })
  })
})

describe('spaced review (Leitner)', () => {
  it('promotes a due item on a correct answer and schedules the next interval', async () => {
    const H = '00000000-0000-0000-0000-000000000002'
    await db.exec(`insert into auth.users values ('${H}')`)
    const s = await as(H, () => rpc<string>('start_session', ['lesson', 'math.psda.percent', 'easy']))
    await answer(H, s, false)
    const rv = await one<{ item_id: string; box: number }>(`select item_id, box from public.review_items where user_id = $1`, [H])
    expect(rv.box).toBe(1)
    await expect(as(H, () => rpc('start_session', ['review']))).rejects.toThrow(/no items/)
    await db.query(`update public.review_items set due = public.local_day($1) where user_id = $1`, [H])
    const r = await as(H, () => rpc<string>('start_session', ['review']))
    await answer(H, r, true)
    const after = await one<{ box: number; days: number }>(
      `select box, due - public.local_day($1) days from public.review_items where user_id = $1`, [H])
    expect(after).toEqual({ box: 2, days: 3 })
  })
})

describe('home', () => {
  it('returns path data without answers', async () => {
    const h = await as(A, () => rpc('get_home'))
    expect(h.skills).toHaveLength(29)
    expect(h.skills[0]).toHaveProperty('counts')
    expect(JSON.stringify(h)).not.toMatch(/"answer"/)
  })
})
