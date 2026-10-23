'use client' // MORE comes from a client module; a server component would only get a reference to it.
import Link from 'next/link'
import { MORE } from '@/components/AppShell'
import { Screen } from '@/components/ui'

// Stats, avatar and achievements arrive in Section 4. On phones this page is also where Shop and the More pages live.
export default function ProfilePage() {
  return (
    <Screen wide className="space-y-4">
      <h1 className="text-2xl font-bold">Profile</h1>
      <nav aria-label="Profile">
        <ul className="divide-y-2 divide-border overflow-hidden rounded-2xl border-2 border-border bg-surface">
          {[{ href: '/shop', label: 'Shop' }, ...MORE].map((m) => (
            <li key={m.href}><Link href={m.href} className="flex min-h-12 items-center justify-between px-4 font-semibold">{m.label}<span aria-hidden>›</span></Link></li>
          ))}
        </ul>
      </nav>
    </Screen>
  )
}
