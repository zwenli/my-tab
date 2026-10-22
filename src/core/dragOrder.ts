/**
 * 拖拽排序的纯计算（无 DOM、无副作用），由列表页与自测共用。
 *
 * 关键约定：
 * - 拖拽过程中算出来的位置是「**插入到移动前数组的下标 insertBefore 之前**」，
 *   也就是 drop-line 画在第 insertBefore 张卡片上方时的语义。
 * - 可见列表可能只是全局列表的子集（筛选视图），重排后要**映射回全局顺序**，
 *   只替换可见项占的位置，其他组原地不动。
 */

/** 把 from 处的元素移动到「插入到 insertBefore 之前」的位置，返回新数组 */
export function moveToInsertPoint<T>(list: readonly T[], from: number, insertBefore: number): T[] {
  const out = list.slice()
  if (from < 0 || from >= out.length) return out
  const moved = out.splice(from, 1)[0] as T
  // 元素被抽出后，位于它后面的插入点都要左移一位
  const target = insertBefore > from ? insertBefore - 1 : insertBefore
  out.splice(Math.max(0, Math.min(out.length, target)), 0, moved)
  return out
}

/**
 * 把「可见子序列」的新顺序映射回全局顺序：
 * 依次用新顺序去填这些可见项原来占的槽位，不可见项保持原位。
 */
export function applyVisibleOrder(globalIds: readonly string[], visibleIds: readonly string[]): string[] {
  const known = new Set(globalIds)
  const seen = new Set<string>()
  const slots: string[] = []
  for (const id of visibleIds) {
    if (!known.has(id) || seen.has(id)) continue
    seen.add(id)
    slots.push(id)
  }
  let i = 0
  return globalIds.map((id) => (seen.has(id) ? (slots[i++] as string) : id))
}

/** 两个顺序是否完全一致（用于跳过没有实际变化的写盘） */
export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((id, i) => id === b[i])
}

/**
 * 「星标置顶」开启时，显示顺序被固定成「星标组在前、其余在后」。
 * 这时把组拖过星标分界线是无效的（读回来后会被重新排序拉回去），
 * 所以要把插入点夹在本组所属的那一段里 —— 排序线画在哪里，落点就在哪里。
 *
 * @param boundary 星标段长度（0 表示没有星标组）
 * @param from 被拖动组当前的下标
 */
export function clampPinnedIndex(index: number, from: number, boundary: number): number {
  if (boundary <= 0 || from < 0) return index
  return from < boundary ? Math.min(index, boundary) : Math.max(index, boundary)
}

export interface DropHit {
  /** 排序插入点（0..n，n 表示插到末尾）；-1 表示本帧不显示排序线 */
  index: number
  /** 合并目标卡片下标；-1 表示不合并 */
  mergeIndex: number
}

export interface HitOptions {
  /** 各卡片的 top / bottom（视口坐标），按显示顺序 */
  tops: readonly number[]
  bottoms: readonly number[]
  clientY: number
  /** 上下各占卡片高度的比例（0~0.5）：越大，排序线越容易触发 */
  zone: number
  /** 第 i 张卡片能否作为合并目标（拖拽源自己、锁定组都不行） */
  canMerge: (i: number) => boolean
  /** 标签拖拽：整张卡片都是合法落点，不需要保留排序带 */
  mergeAnyBand?: boolean
  /** 标签拖拽对卡片上下边缘的吸附容差，用来吃掉卡片之间的间隙 */
  snap?: number
}

/**
 * 拖拽落点判定。
 *
 * 每张卡片切成三段：上段 → 排序线画在它前面；下段 → 排序线画在它后面；
 * 中间窄带 → 合并目标。排序区占大头，避免「想排序却误触合并」。
 */
export function hitTest(opts: HitOptions): DropHit {
  const { tops, bottoms, clientY, zone, canMerge, mergeAnyBand = false, snap = 6 } = opts
  const n = tops.length

  if (mergeAnyBand) {
    // 卡片级吸附（标签拖拽的兜底）：整张卡片含相邻间隙都是目标，取距离最近的一张
    let best = -1
    let bestDist = snap + 1
    for (let i = 0; i < n; i++) {
      const top = tops[i] as number
      const bottom = bottoms[i] as number
      const d = clientY < top ? top - clientY : clientY > bottom ? clientY - bottom : 0
      if (d < bestDist && canMerge(i)) {
        bestDist = d
        best = i
      }
    }
    return best < 0 ? { index: -1, mergeIndex: -1 } : { index: -1, mergeIndex: best }
  }

  for (let i = 0; i < n; i++) {
    const top = tops[i] as number
    const bottom = bottoms[i] as number
    const band = Math.max(6, (bottom - top) * zone)
    if (clientY < top + band) return { index: i, mergeIndex: -1 }
    if (clientY <= bottom - band) {
      if (canMerge(i)) return { index: -1, mergeIndex: i }
      // 不能合并（拖拽源自己 / 锁定组）：退回按上下半判断落点
      return { index: clientY < (top + bottom) / 2 ? i : i + 1, mergeIndex: -1 }
    }
  }
  return { index: n, mergeIndex: -1 }
}

/* ---------------------------- 标签条目 ---------------------------- */

/** 一组条目的落点区域：组体上下边界 + 组内各行的垂直中线（升序） */
export interface ItemZone {
  groupId: string
  top: number
  bottom: number
  centers: readonly number[]
}

export interface ItemDrop {
  groupId: string
  /** 插入点：插到组内第 index 条之前；index === 条目数 表示插到末尾 */
  index: number
}

/**
 * 标签拖拽的落点判定：先挑指针所在的条目区域（含少量吸附吃掉行间空隙），
 * 再按行中线决定插到第几条之前 —— 同组内就是排序，跨组就是「移动并插入」。
 *
 * 只认组体（条目区域）：标题栏、收起卡片不算条目落点，那是「收进此组」，
 * 由调用方在没有命中时退回卡片级手势（见 hitTest 的 mergeAnyBand）。
 */
export function itemHitTest(zones: readonly ItemZone[], clientY: number, snap = 6): ItemDrop | null {
  let best: ItemZone | null = null
  let bestDist = snap + 1
  for (const z of zones) {
    const d = clientY < z.top ? z.top - clientY : clientY > z.bottom ? clientY - z.bottom : 0
    if (d < bestDist) {
      bestDist = d
      best = z
    }
  }
  if (!best) return null

  // 行中线在指针上方 → 这条留在指针前面，插入点顺延；
  // 正好压在中线上算「在它前面」，保证指针不动时落点稳定（不会在 ±0.5px 之间来回跳）
  let index = 0
  while (index < best.centers.length && clientY > (best.centers[index] as number)) index++
  return { groupId: best.groupId, index }
}
