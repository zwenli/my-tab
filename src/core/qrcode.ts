/**
 * 二维码生成（基于 qrcode-generator，纯 JS、无网络、无 canvas 依赖）。
 * 只在页面上下文使用，不会被后台 service worker 引用。
 */
import qrcode from 'qrcode-generator'

/** 纠错等级，按容量从高到低尝试 */
type ErrorLevel = 'L' | 'M' | 'Q' | 'H'

export interface QrOptions {
  cellSize?: number
  margin?: number
}

/**
 * 生成二维码 SVG 字符串。
 * 先按 EC=M 生成，内容过长时自动降级到 EC=L；仍失败返回 null。
 */
export function qrSvg(text: string, { cellSize = 4, margin = 2 }: QrOptions = {}): string | null {
  if (!text) return null
  for (const level of ['M', 'L'] as ErrorLevel[]) {
    try {
      const qr = qrcode(0, level)
      qr.addData(text)
      qr.make()
      return qr.createSvgTag({ cellSize, margin, scalable: true })
    } catch {
      /* 尝试更低纠错等级 */
    }
  }
  return null
}

/** 生成 data-url 形式的 PNG 二维码 */
export function qrDataUrl(text: string, { cellSize = 6, margin = 2 }: QrOptions = {}): string | null {
  for (const level of ['M', 'L'] as ErrorLevel[]) {
    try {
      const qr = qrcode(0, level)
      qr.addData(text)
      qr.make()
      return qr.createDataURL(cellSize, margin)
    } catch {
      /* fallthrough */
    }
  }
  return null
}
