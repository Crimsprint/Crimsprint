// Traces public/mascot/raccoon.png into a flat-color SVG (public/mascot/raccoon.svg).
// Run: node scripts/trace.ts. The art is four flat colors, so each pixel of a 2× upscale snaps to the nearest one, every
// color region is outlined along pixel edges, simplified (Ramer–Douglas–Peucker) and smoothed with quadratic curves through
// edge midpoints. Layers stack on a silhouette in the outline color, so seams between regions never show the page through.
import sharp from 'sharp'
import assert from 'node:assert'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url))
const SCALE = 2 // tracing an upscale turns pixel stair-steps into gentler slopes
const src = await sharp(path('../public/mascot/raccoon.png')).metadata()
const { data, info } = await sharp(path('../public/mascot/raccoon.png')).resize(src.width! * SCALE).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const { width: W, height: H } = info

// Sampled from the artwork; drawn back to front.
const PALETTE = [
  { name: 'outline', rgb: [230, 230, 230] },
  { name: 'red', rgb: [199, 21, 24] },
  { name: 'gray', rgb: [158, 156, 157] },
  { name: 'black', rgb: [28, 22, 22] },
] as const
const hex = (rgb: readonly number[]) => '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('')

const cls = new Int8Array(W * H).fill(-1)
for (let i = 0; i < W * H; i++) {
  if (data[i * 4 + 3] < 128) continue
  let best = 0, bestD = Infinity
  PALETTE.forEach((p, k) => {
    const d = (data[i * 4] - p.rgb[0]) ** 2 + (data[i * 4 + 1] - p.rgb[1]) ** 2 + (data[i * 4 + 2] - p.rgb[2]) ** 2
    if (d < bestD) { bestD = d; best = k }
  })
  cls[i] = best
}

/** Closed outlines of a mask, following pixel edges clockwise (holes come out counter-clockwise, so nonzero fill works). */
function outlines(inMask: (x: number, y: number) => boolean): [number, number][][] {
  const C = W + 1
  const out = new Map<number, number[]>() // corner → corners reachable by one boundary edge
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const k = y0 * C + x0
    out.set(k, [...(out.get(k) ?? []), y1 * C + x1])
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inMask(x, y)) continue
    if (!inMask(x, y - 1)) add(x, y, x + 1, y)
    if (!inMask(x + 1, y)) add(x + 1, y, x + 1, y + 1)
    if (!inMask(x, y + 1)) add(x + 1, y + 1, x, y + 1)
    if (!inMask(x - 1, y)) add(x, y + 1, x, y)
  }
  const loops: [number, number][][] = []
  for (const start of [...out.keys()]) {
    while (out.get(start)?.length) {
      const loop: [number, number][] = []
      let at = start
      do {
        const next = out.get(at)!.pop()!
        if (!out.get(at)!.length) out.delete(at)
        loop.push([at % C, Math.floor(at / C)])
        at = next
      } while (at !== start)
      loops.push(loop)
    }
  }
  return loops
}

function simplify(pts: [number, number][], eps: number): [number, number][] {
  if (pts.length < 3) return pts
  const [a, b] = [pts[0], pts[pts.length - 1]]
  let far = 0, idx = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i]
    const d = Math.abs((b[1] - a[1]) * x - (b[0] - a[0]) * y + b[0] * a[1] - b[1] * a[0]) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1)
    if (d > far) { far = d; idx = i }
  }
  if (far <= eps) return [a, b]
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)]
}

const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${src.width} ${src.height}" role="img" aria-label="Crimsprint raccoon mascot">`
const n = (v: number) => +(v / SCALE).toFixed(1)
let points = 0
PALETTE.forEach((p, k) => {
  // The first layer is the whole silhouette; each later layer is just its own color.
  const loops = outlines((x, y) => inBounds(x, y) && (k === 0 ? cls[y * W + x] >= 0 : cls[y * W + x] === k))
    .filter((l) => l.length >= 8 * SCALE) // drop specks of a few pixels
  const d = loops.map((l) => {
    // A closed loop starts and ends on the same point, which RDP can't measure from: split it at its farthest point.
    let m = 0
    l.forEach(([x, y], i) => { if (Math.hypot(x - l[0][0], y - l[0][1]) > Math.hypot(l[m][0] - l[0][0], l[m][1] - l[0][1])) m = i })
    const s = [...simplify(l.slice(0, m + 1), 1.2).slice(0, -1), ...simplify([...l.slice(m), l[0]], 1.2).slice(0, -1)]
    points += s.length
    // Curve through the midpoints of each edge, using the vertices as control points.
    const mid = (i: number) => { const [a, b] = [s[i % s.length], s[(i + 1) % s.length]]; return `${n((a[0] + b[0]) / 2)} ${n((a[1] + b[1]) / 2)}` }
    return `M${mid(0)}` + s.map((_, i) => `Q${n(s[(i + 1) % s.length][0])} ${n(s[(i + 1) % s.length][1])} ${mid(i + 1)}`).join('') + 'Z'
  }).join('')
  svg += `<path fill="${hex(p.rgb)}" d="${d}"/>`
})
svg += '</svg>'
assert(points > 500, 'the trace should not be empty')
writeFileSync(path('../public/mascot/raccoon.svg'), svg)
console.log(`raccoon.svg: ${points} points, ${(svg.length / 1024).toFixed(0)} KB`)
