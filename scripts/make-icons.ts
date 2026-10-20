/**
 * 生成扩展图标（纯 Node，无第三方依赖）。
 *
 * 图形语义：一张被「折叠收拢」的列表 —— 深色圆角底 + 三条长度递减的浅色横条。
 * 输出：public/icons/icon{16,32,48,128}.png
 *
 * 用法：npm run icons
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/* ----------------------------- PNG 编码 ----------------------------- */

const CRC_TABLE: Int32Array = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf: Buffer): number {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

/** rgba: 长度 = width*height*4 */
function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  let p = 0
  for (let y = 0; y < height; y++) {
    raw[p++] = 0 // filter: none
    for (let x = 0; x < width * 4; x++) raw[p++] = rgba[y * width * 4 + x]!
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/* ----------------------------- 几何工具 ----------------------------- */

/** 圆角矩形有符号距离场（归一化坐标，<0 在内部） */
function sdRoundRect(px: number, py: number, cx: number, cy: number, hw: number, hh: number, r: number): number {
  const qx = Math.abs(px - cx) - (hw - r)
  const qy = Math.abs(py - cy) - (hh - r)
  const ax = Math.max(qx, 0)
  const ay = Math.max(qy, 0)
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(qx, qy), 0) - r
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const mix = (a: number, b: number, t: number): number => a + (b - a) * t
const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16)
]

/* ----------------------------- 图形定义 ----------------------------- */

const BG_FROM = hexToRgb('#3C7FE0') // 顶部
const BG_TO = hexToRgb('#1E4E9C') // 底部
const BAR: [number, number, number] = [250, 252, 255]

const BG = { x0: 0.05, y0: 0.05, x1: 0.95, y1: 0.95, r: 0.22 }
const BARS = [
  { x0: 0.235, y0: 0.31, x1: 0.765, y1: 0.4 },
  { x0: 0.235, y0: 0.465, x1: 0.665, y1: 0.555 },
  { x0: 0.235, y0: 0.62, x1: 0.565, y1: 0.71 }
]
const BAR_RADIUS = 0.045

type Rgba = [number, number, number, number]

/** 返回归一化坐标处的 [r,g,b,a]，a ∈ [0,1] */
function sample(u: number, v: number): Rgba {
  let r = 0
  let g = 0
  let b = 0
  let a = 0

  const bgD = sdRoundRect(u, v, (BG.x0 + BG.x1) / 2, (BG.y0 + BG.y1) / 2, (BG.x1 - BG.x0) / 2, (BG.y1 - BG.y0) / 2, BG.r)
  if (bgD < 0) {
    const t = clamp01((v - BG.y0) / (BG.y1 - BG.y0))
    r = mix(BG_FROM[0], BG_TO[0], t)
    g = mix(BG_FROM[1], BG_TO[1], t)
    b = mix(BG_FROM[2], BG_TO[2], t)
    a = 1
  }

  for (const bar of BARS) {
    const d = sdRoundRect(
      u,
      v,
      (bar.x0 + bar.x1) / 2,
      (bar.y0 + bar.y1) / 2,
      (bar.x1 - bar.x0) / 2,
      (bar.y1 - bar.y0) / 2,
      BAR_RADIUS
    )
    if (d < 0) {
      const t = 0.93
      r = mix(r, BAR[0], t)
      g = mix(g, BAR[1], t)
      b = mix(b, BAR[2], t)
      a = Math.max(a, bgD < 0 ? t : 0)
      if (bgD >= 0) a = t
    }
  }

  return [r, g, b, a]
}

function render(size: number): Uint8Array {
  const SS = 4 // 超采样倍数，用于抗锯齿
  const out = new Uint8Array(size * size * 4)
  const step = 1 / (size * SS)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample((x * SS + sx + 0.5) * step, (y * SS + sy + 0.5) * step)
          r += c[0] * c[3]
          g += c[1] * c[3]
          b += c[2] * c[3]
          a += c[3]
        }
      }
      const n = SS * SS
      const alpha = a / n
      const i = (y * size + x) * 4
      out[i] = alpha > 0 ? Math.round(r / a) : 0
      out[i + 1] = alpha > 0 ? Math.round(g / a) : 0
      out[i + 2] = alpha > 0 ? Math.round(b / a) : 0
      out[i + 3] = Math.round(alpha * 255)
    }
  }
  return out
}

/* ------------------------------- 主流程 ------------------------------- */

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public', 'icons')
mkdirSync(outDir, { recursive: true })

for (const size of [16, 32, 48, 128]) {
  const png = encodePng(size, size, render(size))
  const file = join(outDir, `icon${size}.png`)
  writeFileSync(file, png)
  console.log(`✓ ${file} (${png.length} bytes)`)
}
