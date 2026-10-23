export const pct = (x: number) => `${Math.round(x * 100)}%`

/** A bar's value; null means nothing answered yet, and `estimated` marks a diagnostic-only figure. */
export type BarRow = { label: string; value: number | null; estimated?: boolean }

/** Single-series horizontal bars: one hue, direct value labels, hover title, and a table view. */
export function Bars({ title, rows, max = 1, fmt = pct }: { title: string; rows: BarRow[]; max?: number; fmt?: (v: number) => string }) {
  const text = (r: BarRow) => (r.value === null ? 'Not started' : r.estimated ? `~${fmt(r.value)}` : fmt(r.value))
  const long = (r: BarRow) => text(r) + (r.estimated ? ' (diagnostic estimate)' : '')
  return (
    <figure className="space-y-2">
      <figcaption className="font-semibold">{title}</figcaption>
      {rows.map((r) => (
        <div key={r.label} title={`${r.label}: ${long(r)}`} className="grid grid-cols-[minmax(0,10rem)_1fr_3.5rem] items-center gap-2 text-sm">
          <span className="leading-tight">{r.label}</span>
          {r.value === null ? <span className="col-span-2 text-text-muted">Not started</span> : <>
            <div className="h-3 rounded-full bg-track" aria-hidden>
              <div className="h-full rounded-full bg-chart-1" style={{ width: `${Math.max(0, Math.min(1, r.value / max)) * 100}%` }} />
            </div>
            <span className="text-right tabular-nums">{text(r)}</span>
          </>}
        </div>
      ))}
      {rows.some((r) => r.estimated) && <p className="text-xs text-text-muted">~ estimated from your diagnostic until you answer questions in that skill.</p>}
      <details className="text-sm">
        <summary className="cursor-pointer text-text-muted">Table view</summary>
        <table className="mt-2 w-full text-left">
          <thead><tr><th className="py-1">Item</th><th className="py-1 text-right">Value</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.label} className="border-t border-border"><td className="py-1">{r.label}</td><td className="py-1 text-right">{long(r)}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  )
}
