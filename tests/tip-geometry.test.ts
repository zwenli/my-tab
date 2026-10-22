import { describe, expect, it } from 'vitest'
import { resolveTipDir, resolveTipPos } from '@/directives/tipGeometry'
import type { TipRect } from '@/directives/tipGeometry'

const viewport = { vw: 1200, vh: 800 }
/** 30×28 的按钮，左上角定位 */
const rectAt = (left: number, top: number): TipRect => ({
  left,
  top,
  right: left + 30,
  bottom: top + 28,
  width: 30,
  height: 28
})

describe('提示气泡定位', () => {
  it('顶栏按钮（贴着上沿）自动朝下', () => {
    expect(resolveTipDir(rectAt(500, 10), 80, 26, 'auto', 8, viewport)).toBe('bottom')
  })

  it('页面中部按钮优先朝上', () => {
    expect(resolveTipDir(rectAt(400, 400), 80, 26, 'auto', 8, viewport)).toBe('top')
  })

  it('底部按钮自动翻到上方', () => {
    expect(resolveTipDir(rectAt(400, 760), 80, 26, 'auto', 8, viewport)).toBe('top')
  })

  it('显式方向优先于自动检测', () => {
    expect(resolveTipDir(rectAt(400, 400), 80, 26, 'right', 8, viewport)).toBe('right')
  })

  it('贴右边缘的气泡被夹回视口内', () => {
    const pos = resolveTipPos(rectAt(1160, 10), 200, 26, 'bottom', 8, viewport)
    expect(pos.x, '右侧至少要留 8px').toBe(1200 - 200 - 8)
    expect(pos.y).toBe(38 + 8)
  })

  it('超宽气泡也不会越界', () => {
    const pos = resolveTipPos(rectAt(600, 400), 1400, 26, 'top', 8, { vw: 400, vh: 800 })
    expect(pos.x).toBe(8)
  })

  it('朝下时 y 取元素下沿 + 间距', () => {
    expect(resolveTipPos(rectAt(100, 10), 80, 26, 'bottom', 8, viewport)).toEqual({ x: 75, y: 46 })
  })
})
