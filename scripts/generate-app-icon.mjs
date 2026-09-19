// Generates build/icon.png, which electron-builder turns into the .ico, .icns
// and Linux icon sizes. This reproduces design/app-icon.svg, which is the
// drawing of record: the same numbers, in the same order. Change them there
// first, then here.
import { mkdirSync, writeFileSync } from 'node:fs'
import { encodePng } from './png.mjs'

const SIZE = 1024
// The macOS icon grid: an 824 square centred in 1024, with a 185 corner radius.
const MARGIN = 100
const BODY = SIZE - MARGIN * 2
const RADIUS = 185
const SAMPLES = 4

/** oklch to 8-bit sRGB, so the icon matches the CSS tokens exactly. */
function oklch(L, C, h) {
  const a = C * Math.cos((h * Math.PI) / 180)
  const b = C * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ]
  return linear.map((x) => {
    const c = Math.min(Math.max(x, 0), 1)
    return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
  })
}

// --gradient-from and --gradient-to in light mode, at the default hue of 250,
// which is #1289e7 and #5d5ddd. The app icon is fixed, so it never follows the
// accent the user picks.
const FROM = oklch(0.62, 0.17, 250)
const TO = oklch(0.55, 0.19, 278)

const CENTRE = SIZE / 2
// The gauge: a 250 degree dial open at the bottom. It is struck from a centre
// below the middle of the body, so that the mark's own bounding box ends up
// centred rather than the circle it is cut from.
const ARC_CENTRE_X = 512
const ARC_CENTRE_Y = 564
const ARC_RADIUS = 242
const HALF_WIDTH = 64
const START = (145 * Math.PI) / 180
const SPAN = (250 * Math.PI) / 180
// How much of the dial the solid sweep covers, and how present the rest of the
// dial is behind it. The track falls away below about 32px, leaving the sweep
// to carry the silhouette.
const REMAINING = 0.62
const TRACK_ALPHA = 0.38

function insideRoundedSquare(x, y) {
  const dx = Math.max(Math.abs(x - CENTRE) - (BODY / 2 - RADIUS), 0)
  const dy = Math.max(Math.abs(y - CENTRE) - (BODY / 2 - RADIUS), 0)
  return Math.hypot(dx, dy) <= RADIUS
}

/** Inside the dial's stroke, up to the given portion of its sweep. */
function onArc(x, y, portion) {
  const dx = x - ARC_CENTRE_X
  const dy = y - ARC_CENTRE_Y
  const end = START + SPAN * portion
  const cap = (angle) =>
    Math.hypot(dx - ARC_RADIUS * Math.cos(angle), dy - ARC_RADIUS * Math.sin(angle)) <= HALF_WIDTH
  if (cap(START) || cap(end)) return true
  if (Math.abs(Math.hypot(dx, dy) - ARC_RADIUS) > HALF_WIDTH) return false
  let angle = Math.atan2(dy, dx) - START
  while (angle < 0) angle += Math.PI * 2
  return angle <= SPAN * portion
}

function sample(x, y) {
  if (!insideRoundedSquare(x, y)) return null

  // The gradient runs top left to bottom right, as .accent-gradient does.
  const t = Math.min(Math.max((x - MARGIN + (y - MARGIN)) / (BODY * 2), 0), 1)
  let colour = FROM.map((from, i) => from + (TO[i] - from) * t)

  // A soft light from the top left, like the widget's glow.
  const glow = Math.max(0, 1 - Math.hypot(x - MARGIN, y - MARGIN) / (BODY * 0.9)) * 0.22
  colour = colour.map((c) => c + (255 - c) * glow)

  const over = (alpha) => {
    colour = colour.map((c) => c + (255 - c) * alpha)
  }
  if (onArc(x, y, 1)) over(TRACK_ALPHA)
  if (onArc(x, y, REMAINING)) over(1)
  return colour
}

const rgba = Buffer.alloc(SIZE * SIZE * 4)
for (let py = 0; py < SIZE; py++) {
  for (let px = 0; px < SIZE; px++) {
    let r = 0
    let g = 0
    let b = 0
    let hits = 0
    for (let sy = 0; sy < SAMPLES; sy++) {
      for (let sx = 0; sx < SAMPLES; sx++) {
        const colour = sample(px + (sx + 0.5) / SAMPLES, py + (sy + 0.5) / SAMPLES)
        if (!colour) continue
        r += colour[0]
        g += colour[1]
        b += colour[2]
        hits++
      }
    }
    const i = (py * SIZE + px) * 4
    if (hits > 0) {
      rgba[i] = Math.round(r / hits)
      rgba[i + 1] = Math.round(g / hits)
      rgba[i + 2] = Math.round(b / hits)
    }
    rgba[i + 3] = Math.round((hits / (SAMPLES * SAMPLES)) * 255)
  }
}

mkdirSync('build', { recursive: true })
writeFileSync('build/icon.png', encodePng(SIZE, SIZE, rgba))
console.log(`build/icon.png ${SIZE}x${SIZE}`)
