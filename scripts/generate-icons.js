#!/usr/bin/env node
/**
 * Generates neo-brutalist app icons for Brutal Budget using only Node.js stdlib.
 * Produces: assets/icon.png (1024x1024), assets/adaptive-icon.png (1024x1024),
 *           assets/splash-icon.png (400x400 centred logo).
 *
 * Run: node scripts/generate-icons.js
 */

const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

// ─── PNG encoder ─────────────────────────────────────────────────────────────

function crc32(buf) {
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[i] = c
    }
    return t
  })())
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff]
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  const crcData = Buffer.concat([typeBytes, data])
  crcBuf.writeUInt32BE(crc32(crcData), 0)
  return Buffer.concat([lenBuf, typeBytes, data, crcBuf])
}

function encodePNG(pixels, width, height) {
  // pixels: Uint8Array of RGBA, row-major
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData[8] = 8  // bit depth
  ihdrData[9] = 2  // color type: RGB (we'll drop alpha for simpler encoding)
  ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0
  const ihdr = chunk('IHDR', ihdrData)

  // Build raw scanlines (filter byte 0 = None per row)
  const rawSize = height * (1 + width * 3)
  const raw = Buffer.alloc(rawSize)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0 // filter type None
    for (let x = 0; x < width; x++) {
      const pi = (y * width + x) * 4
      const ri = y * (width * 3 + 1) + 1 + x * 3
      raw[ri] = pixels[pi]
      raw[ri + 1] = pixels[pi + 1]
      raw[ri + 2] = pixels[pi + 2]
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 6 })
  const idat = chunk('IDAT', compressed)
  const iend = chunk('IEND', Buffer.alloc(0))

  return Buffer.concat([signature, ihdr, idat, iend])
}

// ─── Drawing primitives ───────────────────────────────────────────────────────

function createCanvas(w, h, r, g, b) {
  const pixels = new Uint8Array(w * h * 4)
  // Fill background
  for (let i = 0; i < w * h; i++) {
    pixels[i * 4] = r; pixels[i * 4 + 1] = g; pixels[i * 4 + 2] = b; pixels[i * 4 + 3] = 255
  }
  const setPixel = (x, y, pr, pg, pb) => {
    x = Math.round(x); y = Math.round(y)
    if (x < 0 || x >= w || y < 0 || y >= h) return
    const i = (y * w + x) * 4
    pixels[i] = pr; pixels[i + 1] = pg; pixels[i + 2] = pb; pixels[i + 3] = 255
  }
  const fillRect = (x, y, fw, fh, pr, pg, pb) => {
    for (let dy = 0; dy < fh; dy++)
      for (let dx = 0; dx < fw; dx++)
        setPixel(x + dx, y + dy, pr, pg, pb)
  }
  const drawLine = (x0, y0, x1, y1, pr, pg, pb, thickness = 1) => {
    // Bresenham's with thickness
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
    let err = dx - dy
    let x = x0, y = y0
    const half = Math.floor(thickness / 2)
    while (true) {
      for (let ty = -half; ty <= half; ty++)
        for (let tx = -half; tx <= half; tx++)
          setPixel(x + tx, y + ty, pr, pg, pb)
      if (x === x1 && y === y1) break
      const e2 = 2 * err
      if (e2 > -dy) { err -= dy; x += sx }
      if (e2 < dx) { err += dx; y += sy }
    }
  }
  const fillCircle = (cx, cy, radius, pr, pg, pb) => {
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++)
        if (dx * dx + dy * dy <= radius * radius)
          setPixel(cx + dx, cy + dy, pr, pg, pb)
  }
  return { pixels, setPixel, fillRect, drawLine, fillCircle, width: w, height: h }
}

// ─── Icon design ──────────────────────────────────────────────────────────────
// Colors
const YELLOW = [245, 200, 66]     // #F5C842
const INK    = [17, 17, 17]       // #111111
const CREAM  = [250, 250, 245]    // #FAFAF5
const WHITE  = [255, 255, 255]

/**
 * Draw a fat "B" letterform using filled rects.
 * Origin (ox, oy), height H. Returns bounding width.
 */
function drawLetterB(c, ox, oy, H, col) {
  const [r, g, b] = col
  const strokeW = Math.round(H * 0.14)   // stem width
  const W = Math.round(H * 0.62)

  // Vertical stem
  c.fillRect(ox, oy, strokeW, H, r, g, b)

  // Top bar
  c.fillRect(ox, oy, W - Math.round(H * 0.1), strokeW, r, g, b)
  // Middle bar
  c.fillRect(ox, oy + Math.round(H * 0.5) - Math.round(strokeW / 2), W - Math.round(H * 0.08), strokeW, r, g, b)
  // Bottom bar
  c.fillRect(ox, oy + H - strokeW, W, strokeW, r, g, b)

  // Top right curve (simplified as stacked rects)
  const topBulge = [
    [W - Math.round(H * 0.12), Math.round(H * 0.08), Math.round(H * 0.12), Math.round(H * 0.06)],
    [W - Math.round(H * 0.04), Math.round(H * 0.1), Math.round(H * 0.04), Math.round(H * 0.3)],
    [W - Math.round(H * 0.12), Math.round(H * 0.36), Math.round(H * 0.12), Math.round(H * 0.06)],
  ]
  for (const [bx, by, bw, bh] of topBulge) c.fillRect(ox + bx, oy + by, bw, bh, r, g, b)

  // Bottom right curve
  const botBulge = [
    [W - Math.round(H * 0.1), Math.round(H * 0.54), Math.round(H * 0.1), Math.round(H * 0.06)],
    [W + Math.round(H * 0.02), Math.round(H * 0.58), Math.round(H * 0.08), Math.round(H * 0.3)],
    [W - Math.round(H * 0.1), Math.round(H * 0.86), Math.round(H * 0.12), Math.round(H * 0.06)],
  ]
  for (const [bx, by, bw, bh] of botBulge) c.fillRect(ox + bx, oy + by, bw, bh, r, g, b)

  return W + Math.round(H * 0.1)
}

/**
 * Draw a small pencil icon at (ox, oy) with given size.
 */
function drawPencil(c, ox, oy, size, col) {
  const [r, g, b] = col
  const tipH = Math.round(size * 0.25)
  const bodyH = Math.round(size * 0.65)
  const eraserH = size - tipH - bodyH
  const w = Math.round(size * 0.3)

  // Body (yellow)
  c.fillRect(ox, oy + eraserH, w, bodyH, ...YELLOW)
  // Eraser cap
  c.fillRect(ox, oy, w, eraserH, 255, 180, 180)
  // Tip (cream triangle approximation)
  for (let i = 0; i < tipH; i++) {
    const tw = Math.round(w * (1 - i / tipH))
    const tx = ox + Math.round((w - tw) / 2)
    c.fillRect(tx, oy + eraserH + bodyH + i, tw, 1, r, g, b)
  }
  // Outline
  c.drawLine(ox, oy, ox, oy + size - 1, r, g, b, 2)
  c.drawLine(ox + w, oy, ox + w, oy + size - tipH, r, g, b, 2)
  c.drawLine(ox, oy, ox + w, oy, r, g, b, 2)
  c.drawLine(ox, oy + eraserH, ox + w, oy + eraserH, r, g, b, 2)
  c.drawLine(ox, oy + eraserH + bodyH, ox + w, oy + eraserH + bodyH, r, g, b, 2)
  // Tip outline
  c.drawLine(ox, oy + eraserH + bodyH, ox + Math.floor(w / 2), oy + size - 1, r, g, b, 2)
  c.drawLine(ox + w, oy + eraserH + bodyH, ox + Math.floor(w / 2), oy + size - 1, r, g, b, 2)
}

function generateIcon(size) {
  const c = createCanvas(size, size, ...YELLOW)
  const border = Math.round(size * 0.04)

  // Outer border
  c.fillRect(0, 0, size, border, ...INK)
  c.fillRect(0, size - border, size, border, ...INK)
  c.fillRect(0, 0, border, size, ...INK)
  c.fillRect(size - border, 0, border, size, ...INK)

  // Hard shadow box (cream inset)
  const inset = border * 2
  const boxSize = size - inset * 2 - Math.round(size * 0.06)
  const boxX = inset
  const boxY = inset
  // Shadow
  c.fillRect(boxX + Math.round(size * 0.03), boxY + Math.round(size * 0.03), boxSize, boxSize, ...INK)
  // Main box
  c.fillRect(boxX, boxY, boxSize, boxSize, ...CREAM)
  // Box border
  const bb = Math.round(size * 0.025)
  c.fillRect(boxX, boxY, boxSize, bb, ...INK)
  c.fillRect(boxX, boxY + boxSize - bb, boxSize, bb, ...INK)
  c.fillRect(boxX, boxY, bb, boxSize, ...INK)
  c.fillRect(boxX + boxSize - bb, boxY, bb, boxSize, ...INK)

  // "BB" letters centred in the box
  const letterH = Math.round(boxSize * 0.52)
  const letterY = boxY + Math.round((boxSize - letterH) / 2)

  // First B
  const b1x = boxX + Math.round(boxSize * 0.1)
  drawLetterB(c, b1x, letterY, letterH, INK)
  // Second B
  const b2x = boxX + Math.round(boxSize * 0.52)
  drawLetterB(c, b2x, letterY, letterH, INK)

  // Pencil in bottom-right corner
  const pencilSize = Math.round(size * 0.14)
  const px = size - border * 3 - pencilSize - Math.round(size * 0.02)
  const py = size - border * 3 - pencilSize - Math.round(size * 0.02)
  drawPencil(c, px, py, pencilSize, INK)

  // Horizontal rule lines (pencil-sketch texture)
  const lineSpacing = Math.round(size * 0.055)
  for (let i = 1; i < 4; i++) {
    const ly = boxY + bb + Math.round(boxSize * 0.72) + i * lineSpacing * 0.4
    if (ly < boxY + boxSize - bb * 2) {
      c.fillRect(boxX + bb * 2, Math.round(ly), boxSize - bb * 4, Math.max(1, Math.round(size * 0.006)), ...MUTED)
    }
  }

  return encodePNG(c.pixels, size, size)
}

const MUTED = [216, 209, 199]  // #D8D1C7

function generateSplash(size) {
  // Splash is square logo on cream bg — Expo will centre it
  const c = createCanvas(size, size, ...CREAM)
  const border = Math.round(size * 0.05)

  // Yellow filled background square
  const sq = Math.round(size * 0.78)
  const sqX = Math.round((size - sq) / 2)
  const sqY = Math.round((size - sq) / 2)

  // Hard shadow
  c.fillRect(sqX + Math.round(size * 0.03), sqY + Math.round(size * 0.03), sq, sq, ...INK)
  c.fillRect(sqX, sqY, sq, sq, ...YELLOW)

  // Border
  c.fillRect(sqX, sqY, sq, border, ...INK)
  c.fillRect(sqX, sqY + sq - border, sq, border, ...INK)
  c.fillRect(sqX, sqY, border, sq, ...INK)
  c.fillRect(sqX + sq - border, sqY, border, sq, ...INK)

  // "BB" inside
  const letterH = Math.round(sq * 0.44)
  const letterY = sqY + Math.round((sq - letterH) / 2) - Math.round(size * 0.03)
  const b1x = sqX + Math.round(sq * 0.1)
  drawLetterB(c, b1x, letterY, letterH, INK)
  const b2x = sqX + Math.round(sq * 0.52)
  drawLetterB(c, b2x, letterY, letterH, INK)

  // Pencil below letters
  const pencilSize = Math.round(sq * 0.16)
  const px = sqX + Math.round((sq - pencilSize * 0.3) / 2)
  const py = letterY + letterH + Math.round(sq * 0.06)
  drawPencil(c, px, py, pencilSize, INK)

  return encodePNG(c.pixels, size, size)
}

// ─── Write files ──────────────────────────────────────────────────────────────

const assetsDir = path.join(__dirname, '..', 'assets')

console.log('Generating icon.png (1024x1024)...')
fs.writeFileSync(path.join(assetsDir, 'icon.png'), generateIcon(1024))

console.log('Generating adaptive-icon.png (1024x1024)...')
fs.writeFileSync(path.join(assetsDir, 'adaptive-icon.png'), generateIcon(1024))

console.log('Generating splash-icon.png (400x400)...')
fs.writeFileSync(path.join(assetsDir, 'splash-icon.png'), generateSplash(400))

console.log('Done! Update app.json splash backgroundColor to #F5F0E8 (cream).')
