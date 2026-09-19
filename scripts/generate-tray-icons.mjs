// Generates the tray icons from design/tray-glyph-template.svg and
// design/tray-glyph-accent.svg, which are the drawings of record: the same
// numbers, drawn as raw RGBA. Change them there first, then here.
import { writeFileSync } from 'node:fs'
import { encodePng } from './png.mjs'

// The glyph is drawn on a 16 grid and every size is that grid scaled, so the
// edges that land on whole pixels at 16 land on whole pixels at 32 as well:
// with a radius of 5 and a stroke of 4 about (8, 9), the dial's outer edge sits
// at x=1 and x=15 and its top at y=2.
const GRID = 16
const CENTRE_X = 8
const CENTRE_Y = 9
const RADIUS = 5
const HALF_WIDTH = 2
const START = (145 * Math.PI) / 180
const SPAN = (250 * Math.PI) / 180
const SAMPLES = 8

/** Inside the dial's round-capped stroke. */
function onArc(x, y) {
  const dx = x - CENTRE_X
  const dy = y - CENTRE_Y
  const cap = (angle) =>
    Math.hypot(dx - RADIUS * Math.cos(angle), dy - RADIUS * Math.sin(angle)) <= HALF_WIDTH
  if (cap(START) || cap(START + SPAN)) return true
  if (Math.abs(Math.hypot(dx, dy) - RADIUS) > HALF_WIDTH) return false
  let angle = Math.atan2(dy, dx) - START
  while (angle < 0) angle += Math.PI * 2
  return angle <= SPAN
}

/** Coverage of the glyph at one pixel, supersampled for smooth edges. */
function coverage(px, py, size) {
  const scale = GRID / size
  let hits = 0
  for (let sy = 0; sy < SAMPLES; sy++) {
    for (let sx = 0; sx < SAMPLES; sx++) {
      const x = (px + (sx + 0.5) / SAMPLES) * scale
      const y = (py + (sy + 0.5) / SAMPLES) * scale
      if (onArc(x, y)) hits++
    }
  }
  return hits / (SAMPLES * SAMPLES)
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

// One solid blue that reads on both light and dark taskbars, and the black
// template macOS recolours for itself.
const ACCENT = [0x12, 0x89, 0xe7]
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
