import { describe, expect, it } from 'vitest'
import { applyVisibleOrder, clampPinnedIndex, hitTest, itemHitTest, moveToInsertPoint, sameOrder } from '@/core/dragOrder'

describe('拖拽排序', () => {
  it('拖到第一位：插到最前，而不是跑到末尾', () => {
    expect(moveToInsertPoint(['a', 'b', 'c', 'd'], 2, 0)).toEqual(['c', 'a', 'b', 'd'])
    expect(moveToInsertPoint(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c'])
  })

  it('拖到末尾 / 向下移动时下标左移一位', () => {
    expect(moveToInsertPoint(['a', 'b', 'c', 'd'], 0, 4)).toEqual(['b', 'c', 'd', 'a'])
    // 插到 c 之前（移动前的下标 2），a 抽走后 c 变成下标 1
    expect(moveToInsertPoint(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'a', 'c', 'd'])
    expect(moveToInsertPoint(['a', 'b', 'c', 'd'], 1, 4)).toEqual(['a', 'c', 'd', 'b'])
  })

  it('落回原位是空操作（不写盘）', () => {
    const before = ['a', 'b', 'c']
    expect(moveToInsertPoint(before, 1, 1)).toEqual(before)
    expect(moveToInsertPoint(before, 1, 2)).toEqual(before)
    expect(sameOrder(before, moveToInsertPoint(before, 1, 1))).toBe(true)
    expect(sameOrder(before, moveToInsertPoint(before, 1, 3))).toBe(false)
  })

  it('筛选视图内重排不影响其他组的位置', () => {
    const all = ['a', 'b', 'c', 'd', 'e']
    const visible = ['b', 'd'] // 只看得到 b、d，把 d 拖到 b 前面
    expect(applyVisibleOrder(all, ['d', 'b'])).toEqual(['a', 'd', 'c', 'b', 'e'])
    expect(applyVisibleOrder(all, visible), '顺序没变时全局也不变').toEqual(all)
    expect(applyVisibleOrder(all, ['x', 'b', 'd', 'b']), '未知 id、重复 id 被忽略').toEqual(all)
  })

  it('星标置顶时插入点夹在所属分段内', () => {
    // 前 2 个是星标组：[星, 星, 普通, 普通]
    expect(clampPinnedIndex(0, 3, 2), '普通组拖到顶上 → 只能落到星标段之后').toBe(2)
    expect(clampPinnedIndex(4, 0, 2), '星标组拖到底 → 只能落到星标段末尾').toBe(2)
    expect(clampPinnedIndex(1, 0, 2), '星标段内正常排序不受影响').toBe(1)
    expect(clampPinnedIndex(3, 3, 2), '普通段内正常排序不受影响').toBe(3)
    expect(clampPinnedIndex(0, 3, 0), '没有星标组时不限制').toBe(0)
  })

  it('命中判定：上下段出排序线，中间窄带才合并', () => {
    // 三张卡片，各 100px 高，zone = 0.3 → 排序带 30px，合并带 40px
    const tops = [0, 110, 220]
    const bottoms = [100, 210, 320]
    const always = (): boolean => true
    const hit = (clientY: number, canMerge: (i: number) => boolean = always) =>
      hitTest({ tops, bottoms, clientY, zone: 0.3, canMerge })

    expect(hit(10), '第一张上段 → 插到最前').toEqual({ index: 0, mergeIndex: -1 })
    expect(hit(95), '第一张下段 → 插到第二张前').toEqual({ index: 1, mergeIndex: -1 })
    expect(hit(105), '卡片之间的空隙 → 仍是插到第二张前').toEqual({ index: 1, mergeIndex: -1 })
    expect(hit(50), '第一张中间 → 合并到第一张').toEqual({ index: -1, mergeIndex: 0 })
    expect(hit(400), '最后一张下方 → 插到末尾').toEqual({ index: 3, mergeIndex: -1 })
  })

  it('命中判定：自己与锁定组不参与合并，退化为排序', () => {
    const tops = [0]
    const bottoms = [100]
    // 中间带（40~60）但不可合并 → 按上下半判断，60 属于下半 → 插到后面
    expect(hitTest({ tops, bottoms, clientY: 60, zone: 0.3, canMerge: () => false })).toEqual({
      index: 1,
      mergeIndex: -1
    })
    expect(hitTest({ tops, bottoms, clientY: 45, zone: 0.3, canMerge: () => false })).toEqual({
      index: 0,
      mergeIndex: -1
    })
  })

  it('命中判定：标签拖拽整张卡片都是目标，间隙会吸附', () => {
    const tops = [0, 110, 220]
    const bottoms = [100, 210, 320]
    const tabHit = (clientY: number) =>
      hitTest({ tops, bottoms, clientY, zone: 0.3, mergeAnyBand: true, snap: 6, canMerge: () => true })

    expect(tabHit(50)).toEqual({ index: -1, mergeIndex: 0 })
    expect(tabHit(105), '间隙吸附到上一张，不会闪成「新建组」').toEqual({ index: -1, mergeIndex: 0 })
    expect(tabHit(300)).toEqual({ index: -1, mergeIndex: 2 })
    expect(tabHit(400), '离所有卡片都远 → 空白处，新建组').toEqual({ index: -1, mergeIndex: -1 })
  })
})

describe('拖标签的条目级落点', () => {
  // 两组：A 组体 100~190（3 行，中线 120/150/180），B 组体 300~340（2 行，中线 310/330）
  const zones = [
    { groupId: 'A', top: 100, bottom: 190, centers: [120, 150, 180] },
    { groupId: 'B', top: 300, bottom: 340, centers: [310, 330] }
  ]

  it('按行中线判断插到第几条之前', () => {
    expect(itemHitTest(zones, 105), '第一条上半 → 插到最前').toEqual({ groupId: 'A', index: 0 })
    expect(itemHitTest(zones, 125), '过了第一条中线 → 插到第二条前').toEqual({ groupId: 'A', index: 1 })
    expect(itemHitTest(zones, 160)).toEqual({ groupId: 'A', index: 2 })
    expect(itemHitTest(zones, 185), '最后一条下半 → 插到末尾').toEqual({ groupId: 'A', index: 3 })
    expect(itemHitTest(zones, 335), '落到另一组 → 组内下标另算').toEqual({ groupId: 'B', index: 2 })
  })

  it('正好压在中线上算「在它前面」（同一坐标反复 dragover 不会左右横跳）', () => {
    expect(itemHitTest(zones, 120)).toEqual({ groupId: 'A', index: 0 })
    expect(itemHitTest(zones, 150)).toEqual({ groupId: 'A', index: 1 })
    expect(itemHitTest(zones, 120.5)).toEqual({ groupId: 'A', index: 1 })
  })

  it('组体上下各留一点吸附，行间空隙不会闪成「新建组」', () => {
    expect(itemHitTest(zones, 195)).toEqual({ groupId: 'A', index: 3 })
    expect(itemHitTest(zones, 296)).toEqual({ groupId: 'B', index: 0 })
    expect(itemHitTest(zones, 230), '两组之间的大空隙 → 不算条目落点').toBe(null)
  })

  it('空组：任何位置都插到第 0 条', () => {
    expect(itemHitTest([{ groupId: 'E', top: 0, bottom: 40, centers: [] }], 20)).toEqual({ groupId: 'E', index: 0 })
  })
})
