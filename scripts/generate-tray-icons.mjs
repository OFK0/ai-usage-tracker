// One-off generator for the tray icons. Draws a gauge arc as raw RGBA and
// encodes it as PNG, so the repo needs no image tooling to reproduce them.
import { deflateSync, crc32 } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const TAU = Math.PI * 2

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([len, body, crc])
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

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
