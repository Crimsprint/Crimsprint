'use client'

/** Flips between light and dark, overriding the OS preference; the choice persists per browser. */
export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
    root.dataset.theme = dark ? 'light' : 'dark'
    try { localStorage.setItem('theme', root.dataset.theme) } catch {}
  }
  return (
    <button onClick={toggle} aria-label="Toggle light or dark theme" className="grid size-10 place-items-center rounded-full border-2 border-border bg-surface">
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden fill="currentColor"><path d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 2v14a7 7 0 010-14z" /></svg>
    </button>
  )
}
