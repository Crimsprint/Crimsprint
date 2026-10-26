'use client'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRef, useState, type ReactNode } from 'react'

const ICONS = {
  learn: 'M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z',
  practice: 'M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12',
  leaderboards: 'M8 4h8v5a4 4 0 01-8 0zM8 6H5v1a3 3 0 003 3M16 6h3v1a3 3 0 01-3 3M12 13v4M8 21h8M10 17h4v4h-4z',
  quests: 'M4 10h16v9a1 1 0 01-1 1H5a1 1 0 01-1-1zM4 10l2-5h12l2 5M12 10v4',
  shop: 'M5 8h14l-1 12H6zM9 8V6a3 3 0 016 0v2',
  profile: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
}
type IconName = keyof typeof ICONS

export function NavIcon({ name, className = '' }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor"
      strokeWidth={name === 'more' ? 3.5 : 2} strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[name]} /></svg>
  )
}

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: '/learn', label: 'Learn', icon: 'learn' },
  { href: '/practice', label: 'Practice', icon: 'practice' },
  { href: '/leaderboards', label: 'Leaderboards', icon: 'leaderboards' },
  { href: '/quests', label: 'Quests', icon: 'quests' },
  { href: '/shop', label: 'Shop', icon: 'shop' },
  { href: '/profile', label: 'Profile', icon: 'profile' },
]
export const MORE = [
  { href: '/mock', label: 'Mock test' },
  { href: '/progress', label: 'Progress' },
  { href: '/settings', label: 'Settings' },
  { href: '/account', label: 'Account' },
  { href: '/help', label: 'Help' },
]
// On phones Shop and the More pages live inside Profile, so Profile stays highlighted there.
const MOBILE = NAV.filter((n) => n.href !== '/shop')
const inside = (path: string, href: string) => path === href || path.startsWith(`${href}/`)

const item = (active: boolean) =>
  `flex min-h-12 w-full items-center gap-4 rounded-xl border-2 px-3 text-sm font-bold uppercase tracking-widest md:justify-center lg:justify-start ${
    active ? 'border-nav-active-border bg-nav-active' : 'border-transparent hover:bg-nav-active'}`

function More({ active }: { active: boolean }) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  return (
    <div className="relative"
      onKeyDown={(e) => { if (e.key === 'Escape' && open) { setOpen(false); button.current?.focus() } }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false) }}>
      <button ref={button} aria-expanded={open} aria-controls="more-menu" title="More" onClick={() => setOpen(!open)} className={item(active)}>
        <NavIcon name="more" className="size-7 shrink-0" />
        <span className="md:sr-only lg:not-sr-only">More</span>
      </button>
      {open && (
        <ul id="more-menu" className="absolute bottom-0 left-full z-30 ml-2 w-56 space-y-1 rounded-2xl border-2 border-border bg-surface p-2">
          {MORE.map((m) => (
            <li key={m.href}>
              <Link href={m.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 font-semibold hover:bg-nav-active">{m.label}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Signed-in layout: sidebar on desktop (icons only on tablets), bottom tab bar on phones. */
export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname()
  const inMore = MORE.some((m) => inside(path, m.href))
  return (
    <>
      <nav aria-label="Main" className="fixed inset-y-0 left-0 z-20 hidden w-20 flex-col gap-1 border-r-2 border-border bg-sidebar px-2 py-6 md:flex lg:w-60 lg:px-4">
        <Link href="/learn" className="mb-6 flex items-center gap-3 rounded-xl px-2 md:justify-center lg:justify-start">
          <Image src="/mascot/raccoon-head.png" alt="Crimsprint raccoon mascot" width={44} height={44} priority className="size-11" />
          <span aria-hidden className="hidden text-2xl font-bold tracking-tight lg:inline">Crimsprint</span>
        </Link>
        <ul className="space-y-1">
          {NAV.map((n) => {
            const active = inside(path, n.href)
            return (
              <li key={n.href}>
                <Link href={n.href} aria-current={active ? 'page' : undefined} title={n.label} className={item(active)}>
                  <NavIcon name={n.icon} className="size-7 shrink-0" />
                  <span className="md:sr-only lg:not-sr-only">{n.label}</span>
                </Link>
              </li>
            )
          })}
          <li><More active={inMore} /></li>
        </ul>
      </nav>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-border bg-sidebar pb-[env(safe-area-inset-bottom)] md:hidden">
        <ul className="grid grid-cols-5">
          {MOBILE.map((n) => {
            const active = inside(path, n.href) || (n.href === '/profile' && (inMore || inside(path, '/shop')))
            return (
              <li key={n.href}>
                <Link href={n.href} aria-current={active ? 'page' : undefined}
                  className={`flex min-h-16 flex-col items-center justify-center gap-1 border-t-4 text-[11px] font-semibold ${active ? 'border-nav-active-border bg-nav-active' : 'border-transparent'}`}>
                  <NavIcon name={n.icon} className="size-6" />
                  {n.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="flex flex-1 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0 md:pl-20 lg:pl-60">{children}</div>
    </>
  )
}
