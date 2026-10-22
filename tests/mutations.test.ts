import { describe, expect, it } from 'vitest'
import { badgeText, computeStats, countOpenTasks, createTabItem, emptyState } from '@/core/model'
import * as M from '@/core/mutations'
import type { CollectableTab, TaskFlag } from '@/types'

const tab = (url: string, title: string): CollectableTab => ({ url, title, favIconUrl: '' })

/** 每组用例都从干净状态出发 */
const fresh = () => emptyState('d')

describe('收集与变更', () => {
  it('collectTabs 过滤非 http 链接并建组', () => {
    const s = fresh()
    const res = M.collectTabs(s, [tab('https://a.com', 'A'), tab('chrome://newtab', 'N'), tab('https://b.com', 'B')], {
      title: 'G1'
    })
    expect(res.group?.items.length).toBe(2)
    expect(res.skipped).toBe(1)
    expect(s.groups[0]!.title).toBe('G1')
  })

  it('collectTabs 支持指定文件夹', () => {
    const s = fresh()
    const { folder } = M.addFolder(s, 'Work')
    const res = M.collectTabs(s, [tab('https://a.com', 'A')], { folderId: folder.id })
    expect(res.group?.folderId).toBe(folder.id)
  })

  it('duplicatePolicy=skip 跳过已保存网址', () => {
    const s = fresh()
    s.settings.duplicatePolicy = 'skip'
    M.collectTabs(s, [tab('https://a.com', 'A')], {})
    const res = M.collectTabs(s, [tab('https://a.com', 'A2'), tab('https://c.com', 'C')], {})
    expect(res.group?.items.length).toBe(1)
    expect(res.group?.items[0]!.url).toBe('https://c.com')
    expect(res.skipped).toBe(1)
  })

  it('mergeGroups 合并条目并删除源组', () => {
    const s = fresh()
    const a = M.collectTabs(s, [tab('https://a.com', 'A')], {}).group!
    const b = M.collectTabs(s, [tab('https://b.com', 'B')], {}).group!
    M.mergeGroups(s, a.id, b.id)
    expect(s.groups.length).toBe(1)
    expect(s.groups[0]!.items.length).toBe(2)
    expect(s.groups[0]!.id).toBe(b.id) // 合并后只保留目标组
  })

  it('moveItemsToGroup 跨组迁移', () => {
    const s = fresh()
    const a = M.collectTabs(s, [tab('https://a.com', 'A'), tab('https://b.com', 'B')], {}).group!
    const b = M.collectTabs(s, [tab('https://c.com', 'C')], {}).group!
    M.moveItemsToGroup(s, [a.items[0]!.id], b.id, -1)
    expect(s.groups.find((g) => g.id === a.id)!.items.length).toBe(1)
    expect(s.groups.find((g) => g.id === b.id)!.items.length).toBe(2)
  })

  /** 造一组条目，标题即顺序标记 */
  const itemsOf = (s: ReturnType<typeof fresh>, gid: string) =>
    M.findGroup(s, gid)!.items.map((i) => i.title)

  const three = (s: ReturnType<typeof fresh>) =>
    M.collectTabs(s, [tab('https://1.com', 'A'), tab('https://2.com', 'B'), tab('https://3.com', 'C')], {}).group!

  it('同组内拖拽排序：插到指定条目之前', () => {
    const s = fresh()
    const g = three(s)
    const [a, , c] = g.items
    M.moveItemsToGroup(s, [c!.id], g.id, 0)
    expect(itemsOf(s, g.id)).toEqual(['C', 'A', 'B'])
    // 再把它拖到 B 前面（下标 2 = C 之后）
    M.moveItemsToGroup(s, [c!.id], g.id, 2)
    expect(itemsOf(s, g.id)).toEqual(['A', 'C', 'B'])
    expect(a!.id).toBe(M.findGroup(s, g.id)!.items[0]!.id)
  })

  it('同组内向下拖：锚点按移动前的下标算，不会跑回末尾', () => {
    const s = fresh()
    const g = three(s)
    const [a, b, c] = g.items
    // 把 A 拖到「C 之后」（插入线画在第 3 条上方 = 移到末尾之前）
    M.moveItemsToGroup(s, [a!.id], g.id, 3)
    expect(itemsOf(s, g.id)).toEqual(['B', 'C', 'A'])
    // 再把 A 拖回最前
    M.moveItemsToGroup(s, [a!.id], g.id, 0)
    expect(itemsOf(s, g.id)).toEqual(['A', 'B', 'C'])
    expect(b!.id).toBe(M.findGroup(s, g.id)!.items[1]!.id)
    expect(c!.id).toBe(M.findGroup(s, g.id)!.items[2]!.id)
  })

  it('跨组插入到指定位置', () => {
    const s = fresh()
    const a = M.collectTabs(s, [tab('https://1.com', 'A1'), tab('https://2.com', 'A2')], {}).group!
    const b = M.collectTabs(s, [tab('https://3.com', 'B1'), tab('https://4.com', 'B2')], {}).group!
    M.moveItemsToGroup(s, [a.items[1]!.id], b.id, 1)
    expect(itemsOf(s, b.id)).toEqual(['B1', 'A2', 'B2'])
    expect(itemsOf(s, a.id)).toEqual(['A1'])
  })

  it('锚点本身也在移动（多选）时落点顺延，不被摘走后掉到末尾', () => {
    const s = fresh()
    const g = three(s)
    const [a, b] = g.items
    // 同时移动 A、B，插入线画在第 0 条之前：锚点跳过 A、B 落到 C → 原地不动
    M.moveItemsToGroup(s, [a!.id, b!.id], g.id, 0)
    expect(itemsOf(s, g.id)).toEqual(['A', 'B', 'C'])
    // 画在末尾 → 整体后移，而不是被拆散
    M.moveItemsToGroup(s, [a!.id, b!.id], g.id, 3)
    expect(itemsOf(s, g.id)).toEqual(['C', 'A', 'B'])
  })

  it('拖回原位不算改动（不刷新 updatedAt，避免无意义写盘）', () => {
    const s = fresh()
    const g = three(s)
    const ts = 946684800000
    s.meta.updatedAt = ts
    M.moveItemsToGroup(s, [g.items[1]!.id], g.id, 1)
    M.moveItemsToGroup(s, [g.items[1]!.id], g.id, 2)
    expect(s.meta.updatedAt, '顺序没变就不该 touch').toBe(ts)
    expect(itemsOf(s, g.id)).toEqual(['A', 'B', 'C'])
  })

  it('锁定组不收外来条目，也不许自己的条目被拖走', () => {
    const s = fresh()
    const a = M.collectTabs(s, [tab('https://1.com', 'A1')], {}).group!
    const b = M.collectTabs(s, [tab('https://2.com', 'B1'), tab('https://3.com', 'B2')], {}).group!
    M.toggleGroupLock(s, b.id)
    M.moveItemsToGroup(s, [a.items[0]!.id], b.id, 0)
    expect(itemsOf(s, b.id), '锁定组不能被写入').toEqual(['B1', 'B2'])
    expect(itemsOf(s, a.id), '来源没被清空').toEqual(['A1'])
    M.moveItemsToGroup(s, [b.items[0]!.id], a.id, 0)
    expect(itemsOf(s, b.id), '锁定组的条目不能被拖走').toEqual(['B1', 'B2'])
  })

  it('locked 组不可删除、仍可改名', () => {
    const s = fresh()
    const g = M.collectTabs(s, [tab('https://a.com', 'A')], {}).group!
    M.toggleGroupLock(s, g.id)
    M.removeGroup(s, g.id)
    expect(s.groups.length, '锁定组应被保留').toBe(1)
    M.updateGroup(s, g.id, { title: 'NEW' })
    expect(s.groups[0]!.title, '锁定组仍可改名').toBe('NEW')
  })

  it('removeItems 从组内移除条目', () => {
    const s = fresh()
    const g = M.collectTabs(s, [tab('https://a.com', 'A')], {}).group!
    M.removeItems(s, [g.items[0]!.id])
    expect(s.groups[0]!.items.length).toBe(0)
  })

  it('removeItems 可选清掉变空的组（还原后移除）', () => {
    const s = fresh()
    const g = M.collectTabs(s, [tab('https://a.com', 'A'), tab('https://b.com', 'B')], {}).group!
    M.removeItems(s, [g.items[0]!.id], { pruneEmptyGroups: true })
    expect(s.groups.length, '还没空，组应保留').toBe(1)
    M.removeItems(s, [g.items[0]!.id], { pruneEmptyGroups: true })
    expect(s.groups.length, '空了应移除组').toBe(0)

    const locked = M.collectTabs(s, [tab('https://c.com', 'C')], {}).group!
    M.toggleGroupLock(s, locked.id)
    M.removeItems(s, [locked.items[0]!.id], { pruneEmptyGroups: true })
    expect(s.groups.length, '锁定组不清').toBe(1)
    expect(s.groups[0]!.items.length, '锁定组的条目也不删').toBe(1)
  })

  it('待办标记：创建 → 完成 → 取消完成 → 清除', () => {
    const s = fresh()
    const g = M.collectTabs(s, [tab('https://a.com', 'A')], {}).group!
    const id = g.items[0]!.id
    const task = (): TaskFlag | null => g.items[0]!.task

    // 没有待办时 toggle 保持无任务（由 store 层负责「创建」）
    M.toggleItemTask(s, id)
    expect(task()).toBeNull()

    M.setItemTask(s, id, { done: false, completedAt: null })
    expect(task()?.done).toBe(false)

    M.toggleItemTask(s, id)
    expect(task()?.done).toBe(true)
    expect(task()?.completedAt).toBeTruthy()

    M.toggleItemTask(s, id)
    expect(task()?.done).toBe(false)

    M.setItemTask(s, id, null)
    expect(task()).toBeNull()
  })

  it('待办计数（工具栏徽标口径）：只算未完成，且不含快捷列表', () => {
    const s = fresh()
    const g = M.collectTabs(
      s,
      [tab('https://a.com', 'A'), tab('https://b.com', 'B'), tab('https://c.com', 'C')],
      {}
    ).group!
    const [a, b, c] = g.items

    expect(countOpenTasks(s), '初始没有待办').toBe(0)

    M.setItemTask(s, a!.id, { done: false, completedAt: null })
    expect(countOpenTasks(s)).toBe(1)

    M.setItemTask(s, b!.id, { done: false, completedAt: null })
    M.toggleItemTask(s, b!.id)
    expect(countOpenTasks(s), '已完成的不计入').toBe(1)

    M.setItemTask(s, c!.id, { done: false, completedAt: null })
    expect(countOpenTasks(s)).toBe(2)

    M.setItemTask(s, c!.id, null)
    expect(countOpenTasks(s), '取消待办标记后不再计入').toBe(1)

    // 快捷列表是常驻收藏，不进待办进度
    const q = createTabItem({ url: 'https://q.com', title: 'Q' })
    q.task = { done: false, completedAt: null }
    s.quickList.push(q)
    expect(countOpenTasks(s), '快捷列表的待办不计入').toBe(1)

    // 与侧边栏共用的统计口径保持一致
    expect(computeStats(s).taskOpen).toBe(1)
  })

  it('徽标文本：没有待办不显示，超出收敛为 99+', () => {
    expect(badgeText(0), '0 个待办不显示数字').toBe('')
    expect(badgeText(-1)).toBe('')
    expect(badgeText(3)).toBe('3')
    expect(badgeText(99)).toBe('99')
    expect(badgeText(100)).toBe('99+')
  })

  it('快捷列表去重', () => {
    const s = fresh()
    M.addToQuickList(s, [tab('https://a.com', 'A')])
    M.addToQuickList(s, [tab('https://a.com', 'A')])
    expect(s.quickList.length).toBe(1)
  })

  it('copyItemsToQuickList 复制为独立条目', () => {
    const s = fresh()
    const g = M.collectTabs(s, [tab('https://a.com', 'A')], {}).group!
    M.copyItemsToQuickList(s, [g.items[0]!.id])
    expect(s.quickList.length).toBe(1)
    expect(s.quickList[0]!.id, '应使用新 id，避免与列表条目互相影响').not.toBe(g.items[0]!.id)
    expect(s.quickList[0]!.url).toBe('https://a.com')
  })

  it('文件夹删除后组回到未归类', () => {
    const s = fresh()
    const { folder } = M.addFolder(s, 'Work')
    const g = M.collectTabs(s, [tab('https://a.com', 'A')], { folderId: folder.id }).group!
    expect(g.folderId).toBe(folder.id)
    M.removeFolder(s, folder.id, { keepGroups: true })
    expect(s.groups[0]!.folderId).toBeNull()
    expect(s.folders.length).toBe(0)
  })

  it('clearGroups 保留锁定组', () => {
    const s = fresh()
    const g1 = M.collectTabs(s, [tab('https://a.com', 'A')], {}).group!
    M.collectTabs(s, [tab('https://b.com', 'B')], {})
    M.toggleGroupLock(s, g1.id)
    M.clearGroups(s)
    expect(s.groups.length).toBe(1)
    expect(s.groups[0]!.id).toBe(g1.id)
  })

  it('removeGroups 批量删除分组，锁定的组跳过', () => {
    const s = fresh()
    const g1 = M.collectTabs(s, [tab('https://a.com', 'A')], {}).group!
    const g2 = M.collectTabs(s, [tab('https://b.com', 'B')], {}).group!
    const g3 = M.collectTabs(s, [tab('https://c.com', 'C')], {}).group!
    M.toggleGroupLock(s, g2.id)
    M.removeGroups(s, [g1.id, g2.id])
    expect(s.groups.map((g) => g.id).sort()).toEqual([g2.id, g3.id].sort())
    expect(s.groups.find((g) => g.id === g3.id)!.items.length, '未选中的组不受影响').toBe(1)
  })

  it('removeGroups 空数组不改动状态', () => {
    const s = fresh()
    M.collectTabs(s, [tab('https://a.com', 'A')], {})
    M.removeGroups(s, [])
    expect(s.groups.length).toBe(1)
  })

  it('tidy 清理空组但保留锁定组', () => {
    const s = fresh()
    const g1 = M.collectTabs(s, [tab('https://a.com', 'A')], {}).group!
    const g2 = M.collectTabs(s, [tab('https://b.com', 'B')], {}).group!
    M.removeItems(s, [g1.items[0]!.id, g2.items[0]!.id])
    M.toggleGroupLock(s, g1.id)
    M.tidy(s, { removeEmptyGroups: true })
    expect(s.groups.length, '空组被清掉，锁定的空组保留').toBe(1)
    expect(s.groups[0]!.id).toBe(g1.id)
  })

  it('computeStats 统计正确', () => {
    const s = fresh()
    M.collectTabs(s, [tab('https://a.com/1', 'A1'), tab('https://a.com/2', 'A2'), tab('https://b.com', 'B')], {})
    const st = computeStats(s)
    expect(st.groupCount).toBe(1)
    expect(st.tabCount).toBe(3)
    expect(st.domainCount).toBe(2)
  })
})
