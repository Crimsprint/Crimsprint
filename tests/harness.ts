// Shared PGlite harness: the real migrations + seed, with a minimal stand-in for Supabase's auth schema.
import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'

const sqlFile = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
export let db: PGlite

export async function setup() {
  db = new PGlite()
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated;
    -- Supabase's default: API roles can execute every new function in public unless revoked.
    alter default privileges in schema public grant execute on functions to anon, authenticated;
  `)
  for (const f of readdirSync(new URL('../supabase/migrations', import.meta.url)).sort()) await db.exec(sqlFile(`supabase/migrations/${f}`))
  await db.exec(sqlFile('supabase/seed.sql'))
  // Supabase's default privileges: table access for API roles, filtered by RLS.
  await db.exec('grant all on all tables in schema public to anon, authenticated;')
}

export async function newUser(id: string, tz = 'America/Los_Angeles') {
  await db.exec(`insert into auth.users values ('${id}'); update public.profiles set timezone = '${tz}' where id = '${id}';`)
  return id
}

/** Runs `fn` as an authenticated Supabase user. */
export async function as<T>(uid: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`)
  try { return await fn() } finally { await db.exec('reset role;') }
}
export const one = async <T = Record<string, unknown>>(q: string, params: unknown[] = []) => (await db.query<T>(q, params)).rows[0]
export const qlen = async (s: string) => (await one<{ n: number }>('select cardinality(queue) n from public.sessions where id = $1', [s])).n
export const rpc = <T = any>(fn: string, args: unknown[] = []) =>
  one<{ r: T }>(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args).then((x) => x.r)

/** The key (or a wrong answer) for an item, looked up as the database owner. */
export async function keyFor(itemId: string, correct: boolean) {
  const it = await one<{ kind: string; answer: any; choices: any }>('select kind, answer, choices from public.items where id = $1', [itemId])
  if (it.kind === 'mcq') return correct ? it.answer.choice : it.choices.find((c: any) => c.id !== it.answer.choice).id
  return correct ? it.answer.display : '99999'
}

/** Answers the current session item correctly (or not). */
export async function answer(uid: string, session: string, correct: boolean) {
  const s = await one<{ item: string }>('select queue[pos + 1] as item from public.sessions where id = $1', [session])
  const resp = await keyFor(s.item, correct)
  return as(uid, () => rpc('submit_answer', [session, resp, 30000]))
}
