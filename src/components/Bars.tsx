export const pct = (x: number) => `${Math.round(x * 100)}%`

/** Single-series horizontal bars: one hue, direct value labels, hover title, and a table view. */
export function Bars({ title, rows, max = 1, fmt = pct }: { title: string; rows: { label: string; value: number }[]; max?: number; fmt?: (v: number) => string }) {
  return (
    <figure className="space-y-2">
      <figcaption className="font-semibold">{title}</figcaption>
      {rows.map((r) => (
        <div key={r.label} title={`${r.label}: ${fmt(r.value)}`} className="grid grid-cols-[minmax(0,10rem)_1fr_3.5rem] items-center gap-2 text-sm">
          <span className="leading-tight">{r.label}</span>
          <div className="h-3 rounded-full bg-track" aria-hidden>
            <div className="h-full rounded-full bg-chart-1" style={{ width: `${Math.max(0, Math.min(1, r.value / max)) * 100}%` }} />
          </div>
          <span className="text-right tabular-nums">{fmt(r.value)}</span>
        </div>
      ))}
      <details className="text-sm">
        <summary className="cursor-pointer text-text-muted">Table view</summary>
        <table className="mt-2 w-full text-left">
          <thead><tr><th className="py-1">Item</th><th className="py-1 text-right">Value</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.label} className="border-t border-border"><td className="py-1">{r.label}</td><td className="py-1 text-right">{fmt(r.value)}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  )
}

