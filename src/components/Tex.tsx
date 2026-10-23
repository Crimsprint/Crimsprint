import katex from 'katex'
import 'katex/dist/katex.min.css'

/** Inline text: `$…$` → KaTeX, `\$` → a literal dollar sign. */
function Inline({ text }: { text: string }) {
  return text.split(/(?<!\\)\$/).map((part, j) =>
    j % 2 === 1 ? (
      // KaTeX escapes its input; trust is off by default, so this HTML is safe.
      <span key={j} dangerouslySetInnerHTML={{ __html: katex.renderToString(part, { throwOnError: false }) }} />
    ) : (
      <span key={j}>{part.replaceAll('\\$', '$')}</span>
    ),
  )
}

const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())

/** Renders authored text: blank lines → paragraphs; a paragraph of `| a | b |` lines → a table (first row = header). */
export function Tex({ text, className, id }: { text: string; className?: string; id?: string }) {
  return (
    <div id={id} className={className}>
      {text.split(/\n\s*\n/).map((para, i) => {
        const lines = para.trim().split('\n')
        if (lines.every((l) => l.trim().startsWith('|'))) {
          const [head, ...rows] = lines.map(cells)
          return (
            <table key={i} className="my-3 border-collapse text-center [&_td]:border-2 [&_td]:border-border [&_td]:px-3 [&_td]:py-1 [&_th]:border-2 [&_th]:border-border [&_th]:bg-surface-muted [&_th]:px-3 [&_th]:py-1">
              <thead><tr>{head.map((c, j) => <th key={j} scope="col"><Inline text={c} /></th>)}</tr></thead>
              <tbody>{rows.map((r, k) => <tr key={k}>{r.map((c, j) => j === 0 ? <th key={j} scope="row"><Inline text={c} /></th> : <td key={j}><Inline text={c} /></td>)}</tr>)}</tbody>
            </table>
          )
        }
        return <p key={i} className="whitespace-pre-line [&:not(:first-child)]:mt-3"><Inline text={para} /></p>
      })}
    </div>
  )
}
