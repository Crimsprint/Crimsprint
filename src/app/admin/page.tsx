'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Tex } from '@/components/Tex'
import { Alert, Button, Screen } from '@/components/ui'
import { ensureUser, rpc, supabase } from '@/lib/supabase'

type Item = {
  id?: string; skill_id: string; subskill_id: string | null; tier: 'easy' | 'medium' | 'hard'; kind: 'mcq' | 'spr'; status: string
  passage: string | null; stem: string; choices: { id: string; text: string }[] | null
  answer: { choice?: string; values?: [number, number][]; display?: string }; explanation: string; rationales: Record<string, string>
}
type Report = { id: number; reason: string; created_at: string; item_id: string; skill_id: string; stem: string }
const IDS = ['A', 'B', 'C', 'D']
const blank = (skill: string): Item => ({
  skill_id: skill, subskill_id: null, tier: 'easy', kind: 'mcq', status: 'draft', passage: '', stem: '',
  choices: IDS.map((id) => ({ id, text: '' })), answer: { choice: 'A' }, explanation: '', rationales: {},
})
const field = 'w-full rounded-lg border-2 border-border bg-surface px-3 py-2'

/** "2/3, 0.5" → [[2,3],[1,2]] */
function parseValues(s: string): [number, number][] {
  return s.split(',').map((t) => t.trim()).filter(Boolean).map((t) => {
    if (t.includes('/')) { const [n, d] = t.split('/').map(Number); return [n, d] as [number, number] }
    const dec = t.split('.')[1]?.length ?? 0
    return [Math.round(Number(t) * 10 ** dec), 10 ** dec] as [number, number]
  })
}

export default function Admin() {
  const [skills, setSkills] = useState<{ id: string; name: string }[]>([])
  const [skill, setSkill] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [edit, setEdit] = useState<Item | null>(null)
  const [valuesText, setValuesText] = useState('')
  const [error, setError] = useState('')
  const [denied, setDenied] = useState('')
  const [uid, setUid] = useState('')
  const [version, setVersion] = useState(0)

  useEffect(() => {
    ensureUser().then((u) => {
      setUid(u.id)
      return Promise.all([rpc<Report[]>('admin_reports'), supabase().from('skills').select('id, name').order('sort')])
    }).then(([r, s]) => { setReports(r); setSkills(s.data ?? []) })
      .catch((e) => (String(e.message).includes('admin only') ? setDenied(e.message) : setError(e.message)))
  }, [version])

  useEffect(() => {
    if (skill) rpc<Item[]>('admin_items', { p_skill: skill }).then(setItems).catch((e) => setError(e.message))
  }, [skill, version])

  function open(it: Item) {
    setEdit(it)
    setValuesText((it.answer.values ?? []).map(([n, d]) => (d === 1 ? `${n}` : `${n}/${d}`)).join(', '))
    setError('')
  }

  async function save() {
    if (!edit) return
    setError('')
    const payload = { ...edit, answer: edit.kind === 'mcq' ? { choice: edit.answer.choice } : { values: parseValues(valuesText), display: edit.answer.display } }
    try {
      const id = await rpc<string>('admin_save_item', { p: payload })
      setEdit({ ...edit, id })
      setVersion((v) => v + 1)
    } catch (e) { setError((e as Error).message) }
  }

  if (denied) return (
    <Screen className="space-y-3">
      <h1 className="text-2xl font-bold">Admins only</h1>
      <p>To make this account an admin, run in the Supabase SQL editor:</p>
      <pre className="whitespace-pre-wrap break-all rounded-lg bg-surface p-3 text-sm">{`update public.profiles set is_admin = true where id = '${uid}';`}</pre>
    </Screen>
  )

  const set = (patch: Partial<Item>) => setEdit((e) => e && { ...e, ...patch })
  const key = edit?.answer.choice

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[18rem_1fr]">
      <aside className="space-y-4">
        <Link href="/learn" className="underline">← App</Link>
        <h1 className="text-xl font-bold">Content</h1>
        <label className="block">
          <span className="mb-1 block text-sm">Skill</span>
          <select className={field} value={skill} onChange={(e) => { setSkill(e.target.value); setEdit(null) }}>
            <option value="">Choose…</option>
            {skills.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        {skill && <Button variant="secondary" className="w-full" onClick={() => open(blank(skill))}>New item</Button>}
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id}>
              <button onClick={() => open(it)} className={`w-full rounded-lg border-2 p-2 text-left text-sm ${edit?.id === it.id ? 'border-text' : 'border-border'} bg-surface`}>
                <span className="font-semibold capitalize">{it.tier} · {it.kind} · {it.status}</span>
                <span className="line-clamp-2 block text-text-muted">{it.stem}</span>
              </button>
            </li>
          ))}
        </ul>
        {reports.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-semibold">Open reports ({reports.length})</h2>
            {reports.map((r) => (
              <div key={r.id} className="rounded-lg border-2 border-border bg-surface p-2 text-sm">
                <p className="font-semibold">“{r.reason}”</p>
                <p className="line-clamp-2 text-text-muted">{r.stem}</p>
                <div className="mt-1 flex gap-3">
                  <button className="underline" onClick={() => { setSkill(r.skill_id) }}>Open skill</button>
                  <button className="underline" onClick={() => rpc('admin_resolve_report', { p_id: r.id }).then(() => setVersion((v) => v + 1))}>Resolve</button>
                </div>
              </div>
            ))}
          </section>
        )}
      </aside>

      {edit ? (
        <section className="grid gap-6 xl:grid-cols-2">
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save() }}>
            <div className="grid grid-cols-3 gap-2">
              {([['tier', ['easy', 'medium', 'hard']], ['kind', ['mcq', 'spr']], ['status', ['draft', 'published', 'retired']]] as const).map(([k, opts]) => (
                <label key={k} className="text-sm"><span className="mb-1 block capitalize">{k}</span>
                  <select className={field} value={edit[k]} onChange={(e) => set({ [k]: e.target.value, ...(k === 'kind' && e.target.value === 'mcq' && !edit.choices ? { choices: IDS.map((id) => ({ id, text: '' })), answer: { choice: 'A' } } : {}) })}>
                    {opts.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <label className="block text-sm"><span className="mb-1 block">Sub-skill id (optional)</span>
              <input className={field} value={edit.subskill_id ?? ''} onChange={(e) => set({ subskill_id: e.target.value || null })} /></label>
            <label className="block text-sm"><span className="mb-1 block">Passage (optional; $…$ for math, \$ for a dollar sign)</span>
              <textarea rows={4} className={field} value={edit.passage ?? ''} onChange={(e) => set({ passage: e.target.value })} /></label>
            <label className="block text-sm"><span className="mb-1 block">Question</span>
              <textarea rows={3} required className={field} value={edit.stem} onChange={(e) => set({ stem: e.target.value })} /></label>
            {edit.kind === 'mcq' ? IDS.map((id, i) => (
              <fieldset key={id} className="space-y-1 rounded-lg border-2 border-border p-2">
                <legend className="px-1 text-sm font-semibold">Choice {id}</legend>
                <input aria-label={`Choice ${id} text`} className={field} value={edit.choices?.[i]?.text ?? ''}
                  onChange={(e) => set({ choices: IDS.map((cid, j) => ({ id: cid, text: j === i ? e.target.value : edit.choices?.[j]?.text ?? '' })) })} />
                <label className="flex items-center gap-2 text-sm"><input type="radio" name="key" checked={key === id} onChange={() => set({ answer: { choice: id } })} /> Correct answer</label>
                {key !== id && (
                  <input aria-label={`Why ${id} is wrong`} placeholder="Why this choice is wrong" className={field} value={edit.rationales[id] ?? ''}
                    onChange={(e) => set({ rationales: { ...edit.rationales, [id]: e.target.value } })} />
                )}
              </fieldset>
            )) : (
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm"><span className="mb-1 block">Accepted values (e.g. 2/3, 1.5)</span>
                  <input className={field} value={valuesText} onChange={(e) => setValuesText(e.target.value)} /></label>
                <label className="text-sm"><span className="mb-1 block">Shown answer (must be a valid entry)</span>
                  <input className={field} value={edit.answer.display ?? ''} onChange={(e) => set({ answer: { ...edit.answer, display: e.target.value } })} /></label>
              </div>
            )}
            <label className="block text-sm"><span className="mb-1 block">Explanation</span>
              <textarea rows={4} required className={field} value={edit.explanation} onChange={(e) => set({ explanation: e.target.value })} /></label>
            {error && <Alert title="Not saved">{error}</Alert>}
            <Button type="submit" className="w-full">{edit.id ? 'Save changes' : 'Create item'}</Button>
          </form>

          <div className="space-y-3 rounded-xl border-2 border-border bg-surface p-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-text-muted">Preview</p>
            {edit.passage && <Tex text={edit.passage} className="rounded-lg border-2 border-border p-3" />}
            <Tex text={edit.stem || '…'} className="font-semibold" />
            {edit.kind === 'mcq' && edit.choices?.map((c) => (
              <div key={c.id} className={`flex gap-2 rounded-lg border-2 p-2 ${c.id === key ? 'border-success' : 'border-border'}`}>
                <b>{c.id})</b><Tex text={c.text || '…'} />{c.id === key && <span className="ml-auto text-sm">✓ key</span>}
              </div>
            ))}
            <Tex text={edit.explanation || 'Explanation…'} className="text-sm text-text-muted" />
          </div>
        </section>
      ) : (
        <p className="text-text-muted">{error ? <Alert title="Error">{error}</Alert> : 'Choose a skill, then an item to edit, or create a new one.'}</p>
      )}
    </main>
  )
}
