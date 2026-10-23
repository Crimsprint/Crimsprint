// Builds the mascot assets from design/raccoon-source.png (shield on a near-black background).
// Run: node scripts/mascot.ts. Writes public/mascot/raccoon.png (transparent), public/mascot/raccoon-head.png (round head badge)
// and src/app/icon.png (favicon).
import sharp from 'sharp'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url))

const src = path('../design/raccoon-source.png')
const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true })
const { width: W, height: H } = info
const lum = (i: number) => (data[i * 3] + data[i * 3 + 1] + data[i * 3 + 2]) / 3
const BG = lum(0), EDGE = 227 // background and the shield's light outline

// Flood-fill the background from the border. The raccoon's black fur is the same color as the background,
// but the light outline closes the shield, so only the outside is reached.
const out = new Uint8Array(W * H)
const stack: number[] = []
for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x)
for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1)
while (stack.length) {
  const i = stack.pop()!
  if (out[i] || lum(i) - BG > 40) continue
  out[i] = 1
  const x = i % W
  if (x > 0) stack.push(i - 1)
  if (x < W - 1) stack.push(i + 1)
  if (i >= W) stack.push(i - W)
  if (i < W * (H - 1)) stack.push(i + W)
}

const rgba = Buffer.alloc(W * H * 4)
for (let i = 0; i < W * H; i++) {
  let a = 255
  if (out[i]) a = 0
  else {
    // Anti-aliased pixels just inside the outline: recover their coverage against the outline color.
    const x = i % W, y = (i / W) | 0
    const nearBg = [[-1, 0], [1, 0], [0, -1], [0, 1], [-2, 0], [2, 0], [0, -2], [0, 2]]
      .some(([dx, dy]) => x + dx >= 0 && x + dx < W && y + dy >= 0 && y + dy < H && out[(y + dy) * W + x + dx])
    if (nearBg && lum(i) < EDGE) {
      a = Math.round(255 * Math.max(0, Math.min(1, (lum(i) - BG) / (EDGE - BG))))
      data[i * 3] = data[i * 3 + 1] = data[i * 3 + 2] = EDGE
    }
  }
  rgba.set([data[i * 3], data[i * 3 + 1], data[i * 3 + 2], a], i * 4)
}
assert(rgba[3] === 0 && rgba[(W * H - 1) * 4 + 3] === 0, 'corners should be transparent')
assert(rgba[((H >> 1) * W + (W >> 1)) * 4 + 3] === 255, 'the raccoon (center) should stay opaque')

const cutout = sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
await cutout.clone().png().toFile(path('../public/mascot/raccoon.png'))

// Head badge: the head on the shield's own red, clipped to a rounded square (a circle would clip the ears).
const C = { x: 328, y: 340, r: 190 }
const red = { r: data[(300 * W + 150) * 3], g: data[(300 * W + 150) * 3 + 1], b: data[(300 * W + 150) * 3 + 2] }
assert(red.r > 150 && red.g < 60, `expected shield red at (150,300), got ${JSON.stringify(red)}`)
const D = C.r * 2
const head = await cutout.clone().extract({ left: C.x - C.r, top: C.y - C.r, width: D, height: D }).png().toBuffer()
const mask = Buffer.from(`<svg width="${D}" height="${D}"><rect width="${D}" height="${D}" rx="${D * 0.24}"/></svg>`)
const badge = await sharp({ create: { width: D, height: D, channels: 4, background: { ...red, alpha: 1 } } })
  .composite([{ input: head }, { input: mask, blend: 'dest-in' }]).png().toBuffer()
await sharp(badge).resize(256, 256).toFile(path('../public/mascot/raccoon-head.png'))
await sharp(badge).resize(64, 64).toFile(path('../src/app/icon.png'))
console.log('mascot assets written')
