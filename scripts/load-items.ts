// Loads supabase/seed-items.json into a hosted project through the validated admin RPC (no database password needed).
// Run: node scripts/load-items.ts, then mark the printed user id as admin in SQL. Skills must already exist.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import type { Item } from './math-templates.ts'

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
const items: Item[] = JSON.parse(readFileSync(new URL('../supabase/seed-items.json', import.meta.url), 'utf8'))

const { data: auth, error: authErr } = await sb.auth.signInAnonymously()
if (authErr) throw new Error(`anonymous sign-in failed (enable it in Authentication → Sign In / Providers): ${authErr.message}`)
console.log(`LOADER_USER_ID=${auth.user!.id}`)

// Wait (up to 5 minutes) for this user to be made admin.
for (let i = 0; ; i++) {
  const { data } = await sb.from('profiles').select('is_admin').eq('id', auth.user!.id).single()
  if (data?.is_admin) break
  if (i > 150) throw new Error('timed out waiting for admin rights')
  await new Promise((r) => setTimeout(r, 2000))
}

let saved = 0, skipped = 0
const bySkill = Object.groupBy(items, (it) => it.skill)
for (const [skill, list] of Object.entries(bySkill)) {
  const { data: existing, error } = await sb.rpc('admin_items', { p_skill: skill })
  if (error) throw error
  if ((existing as unknown[]).length > 0) { skipped += list!.length; continue }  // already loaded
  for (let i = 0; i < list!.length; i += 8) {
    await Promise.all(list!.slice(i, i + 8).map(async (it) => {
      const { error } = await sb.rpc('admin_save_item', { p: {
        skill_id: it.skill, subskill_id: it.subskill, tier: it.tier, kind: it.kind, passage: it.passage ?? null, stem: it.stem,
        choices: it.choices ?? null, answer: it.answer, explanation: it.explanation, rationales: it.rationales, status: 'published',
      } })
      if (error) throw new Error(`${skill}: ${error.message} — ${it.stem.slice(0, 60)}`)
      saved++
    }))
  }
  console.log(`${skill}: ${list!.length}`)
}
console.log(`DONE saved=${saved} skipped=${skipped}`)
