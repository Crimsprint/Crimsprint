import Link from 'next/link'
import { Screen } from '@/components/ui'

// shortcut: placeholder until the practice modes (weak skills, review mistakes, timed drill) move here in Section 4.
export default function PracticePage() {
  return (
    <Screen wide className="space-y-3">
      <h1 className="text-2xl font-bold">Practice</h1>
      <p className="text-text-muted">Review mistakes and timed drills are coming soon. For now, use <Link href="/learn" className="font-semibold underline">Practice weak skills on Learn</Link>.</p>
    </Screen>
  )
}
