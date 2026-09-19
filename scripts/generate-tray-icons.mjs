// One-off generator for the tray icons: a gauge arc drawn as raw RGBA.
import { writeFileSync } from 'node:fs'
import { encodePng } from './png.mjs'

const TAU = Math.PI * 2

/** Coverage of the gauge arc at one pixel, supersampled for smooth edges. */
function coverage(px, py, size) {
  const centre = size / 2
  const outer = size * 0.44
  const inner = size * 0.27
  const gapStart = Math.PI * 0.25 // bottom gap, y grows downward
  const gapEnd = Math.PI * 0.75
  const samples = 4
  let hits = 0

  for (let sy = 0; sy < samples; sy++) {
    for (let sx = 0; sx < samples; sx++) {
      const x = px + (sx + 0.5) / samples - centre
      const y = py + (sy + 0.5) / samples - centre
      const d = Math.hypot(x, y)
      if (d < inner || d > outer) continue
      let a = Math.atan2(y, x)
      if (a < 0) a += TAU
      if (a > gapStart && a < gapEnd) continue
      hits++
    }
  }

  return hits / (samples * samples)
}

function render(size, [r, g, b]) {
  const rgba = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = coverage(x, y, size)
      const i = (y * size + x) * 4
      rgba[i] = r
      rgba[i + 1] = g
      rgba[i + 2] = b
      rgba[i + 3] = Math.round(a * 255)
    }
  }
  return encodePng(size, size, rgba)
}

const ACCENT = [76, 110, 245]
const BLACK = [0, 0, 0]

const targets = [
  ['resources/tray/tray.png', 16, ACCENT],
  ['resources/tray/tray@2x.png', 32, ACCENT],
  ['resources/tray/trayTemplate.png', 16, BLACK],
  ['resources/tray/trayTemplate@2x.png', 32, BLACK]
]

for (const [file, size, colour] of targets) {
  writeFileSync(file, render(size, colour))
  console.log(`${file} ${size}x${size}`)
}
