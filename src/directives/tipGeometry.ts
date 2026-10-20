/**
 * 提示气泡的定位几何。
 *
 * 这里只做「给定触发元素矩形 + 气泡尺寸 + 视口尺寸 → 方向与坐标」的纯计算，
 * 不碰 DOM，因此可以直接在 Node 里单测（scripts/selftest.ts）。
 */

export type TipDir = 'auto' | 'top' | 'bottom' | 'left' | 'right'

/** 触发元素矩形（DOMRect 的最小子集） */
export interface TipRect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

/** 视口尺寸 */
export interface TipViewport {
  vw: number
  vh: number
}

/** 气泡与视口边缘的最小留白 */
export const TIP_EDGE = 8
/** 气泡与触发元素的默认间距 */
export const TIP_GAP = 8

function clamp(v: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(Math.max(v, min), max)
}

/**
 * 解析最终方向。
 * 显式方向直接采用（仍会做边界夹取）；auto 时按剩余空间挑一个放得下的方向，
 * 优先级：上 → 下 → 右 → 左，都放不下时选剩余空间更大的一侧。
 */
export function resolveTipDir(
  rect: TipRect,
  bw: number,
  bh: number,
  want: TipDir,
  gap: number,
  view: TipViewport
): TipDir {
  if (want !== 'auto') return want

  const up = rect.top - bh - gap - TIP_EDGE
  const down = view.vh - rect.bottom - bh - gap - TIP_EDGE
  if (up >= 0) return 'top'
  if (down >= 0) return 'bottom'

  const right = view.vw - rect.right - bw - gap - TIP_EDGE
  const left = rect.left - bw - gap - TIP_EDGE
  if (right >= 0) return 'right'
  if (left >= 0) return 'left'
  return up >= down ? 'top' : 'bottom'
}

/** 按方向算出气泡左上角坐标，并夹取到视口内（避免贴边被切） */
export function resolveTipPos(
  rect: TipRect,
  bw: number,
  bh: number,
  dir: TipDir,
  gap: number,
  view: TipViewport
): { x: number; y: number } {
  const cx = rect.left + rect.width / 2 - bw / 2
  const cy = rect.top + rect.height / 2 - bh / 2
  let x = cx
  let y = rect.top - bh - gap

  if (dir === 'bottom') {
    y = rect.bottom + gap
  } else if (dir === 'left') {
    x = rect.left - bw - gap
    y = cy
  } else if (dir === 'right') {
    x = rect.right + gap
    y = cy
  }

  return {
    x: clamp(x, TIP_EDGE, view.vw - bw - TIP_EDGE),
    y: clamp(y, TIP_EDGE, view.vh - bh - TIP_EDGE)
  }
}
