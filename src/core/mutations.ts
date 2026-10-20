/**
 * 状态变更操作集。
 *
 * 约定（与 core/storage.ts#mutate 配合）：
 * - 每个操作都接收 state 对象并**原地修改**它；
 * - 统一返回 `{ state, ...额外信息 }`，便于调用方拿到新建的实体或跳过计数；
 * - 会改变数据的操作都会刷新 `updatedAt`；
 * - 这里只改内存镜像，落盘由 storage 层的「差异同步」统一处理 —— 变更本身不需要知道文件的存在。
 */
import { createFolder, createGroup, createTabItem } from './model'
import { arrayMove, isCollectableUrl, now, uuid } from './utils'
import type { CollectableTab, Folder, FolderPatch, Group, GroupPatch, ItemPatch, MyTabState, Position, TabItem, TaskFlag } from '../types'

export type { FolderPatch, GroupPatch, ItemPatch, Position } from '../types'

/* ---------------------------- 类型 ---------------------------- */

/** 所有变更操作的统一返回形状 */
export interface MutationOutcome {
  state: MyTabState
}

export interface GroupOutcome extends MutationOutcome {
  group: Group
}

export interface FolderOutcome extends MutationOutcome {
  folder: Folder
}

export interface CollectOutcome extends MutationOutcome {
  group: Group | null
  /** 被跳过的标签数（不可收集 / 重复） */
  skipped: number
}

export interface CollectTabsOptions {
  title?: string
  folderId?: string | null
  position?: Position
}

export interface CreateGroupFromItemsOptions {
  title?: string
  folderId?: string | null
  position?: Position
  toIndex?: number
}

/* ---------------------------- 内部工具 ---------------------------- */

function touch(state: MyTabState): MyTabState {
  state.meta.updatedAt = now()
  return state
}

export const findGroup = (state: MyTabState, id: string): Group | null => state.groups.find((g) => g.id === id) ?? null
export const findFolder = (state: MyTabState, id: string): Folder | null => state.folders.find((f) => f.id === id) ?? null

export interface ItemHit {
  group: Group | null
  item: TabItem
}

function findItem(state: MyTabState, itemId: string): ItemHit | null {
  for (const g of state.groups) {
    const it = g.items.find((i) => i.id === itemId)
    if (it) return { group: g, item: it }
  }
  const qi = state.quickList.find((i) => i.id === itemId)
  if (qi) return { group: null, item: qi }
  return null
}

/* ============================ 标签组 ============================ */

export function addGroup(state: MyTabState, group: Group, position?: Position): MutationOutcome {
  const pos = position ?? (state.settings.newGroupPosition === 'bottom' ? 'bottom' : 'top')
  if (pos === 'bottom') state.groups.push(group)
  else state.groups.unshift(group)
  return { state: touch(state) }
}

/** 由浏览器标签创建组并入库 */
export function collectTabs(state: MyTabState, tabs: CollectableTab[] = [], opts: CollectTabsOptions = {}): CollectOutcome {
  const raw = tabs.filter((t) => t && isCollectableUrl(t.url))
  const policy = state.settings.duplicatePolicy
  let list = raw

  if (policy === 'skip') {
    const known = new Set<string>()
    for (const g of state.groups) for (const it of g.items) known.add(it.url)
    for (const it of state.quickList) known.add(it.url)
    list = raw.filter((t) => !known.has(t.url))
  }

  // 统计口径：被跳过的总数（含不可收集的 URL 与重复项）
  const skipped = tabs.length - list.length

  if (!list.length) return { state, group: null, skipped }

  const group = createGroup({
    title: opts.title || '',
    folderId: opts.folderId ?? null,
    items: list.map((t) => createTabItem({ url: t.url, title: t.title, favIconUrl: t.favIconUrl || '' }))
  })
  addGroup(state, group, opts.position)
  return { state, group, skipped }
}

export function updateGroup(state: MyTabState, id: string, patch: GroupPatch = {}): MutationOutcome {
  const g = findGroup(state, id)
  if (!g) return { state }

  if (g.locked) {
    // 锁定组只允许改名 / 备注 / 星标 / 展开等非破坏性字段
    if (patch.title !== undefined) g.title = patch.title
    if (patch.note !== undefined) g.note = patch.note
    if (patch.starred !== undefined) g.starred = patch.starred
    if (patch.collapsed !== undefined) g.collapsed = patch.collapsed
    if (patch.color !== undefined) g.color = patch.color
    if (patch.folderId !== undefined) g.folderId = patch.folderId
  } else {
    Object.assign(g, patch)
  }
  g.updatedAt = now()
  return { state: touch(state) }
}

export const renameGroup = (state: MyTabState, id: string, title: string): MutationOutcome =>
  updateGroup(state, id, { title: String(title ?? '').trim() })

export function toggleGroupStar(state: MyTabState, id: string): MutationOutcome {
  const g = findGroup(state, id)
  if (!g) return { state }
  return updateGroup(state, id, { starred: !g.starred })
}

export function toggleGroupLock(state: MyTabState, id: string): MutationOutcome {
  const g = findGroup(state, id)
  if (!g) return { state }
  g.locked = !g.locked
  g.updatedAt = now()
  return { state: touch(state) }
}

export function toggleGroupCollapsed(state: MyTabState, id: string): MutationOutcome {
  const g = findGroup(state, id)
  if (!g) return { state }
  g.collapsed = !g.collapsed
  return { state: touch(state) }
}

export function removeGroup(state: MyTabState, id: string): MutationOutcome {
  const i = state.groups.findIndex((g) => g.id === id)
  if (i < 0) return { state }
  const g = state.groups[i]!
  if (g.locked) return { state } // 锁定组不可删除
  state.groups.splice(i, 1)
  return { state: touch(state) }
}

export function reorderGroups(state: MyTabState, orderedIds: string[] = []): MutationOutcome {
  const map = new Map(state.groups.map((g) => [g.id, g]))
  const out: Group[] = []
  for (const id of orderedIds) {
    const g = map.get(id)
    if (g) {
      out.push(g)
      map.delete(id)
    }
  }
  for (const g of map.values()) out.push(g)
  state.groups = out
  return { state: touch(state) }
}

export function moveGroup(state: MyTabState, id: string, toIndex: number): MutationOutcome {
  const from = state.groups.findIndex((g) => g.id === id)
  if (from < 0) return { state }
  state.groups = arrayMove(state.groups, from, toIndex)
  return { state: touch(state) }
}

/** 把 source 组的全部标签并入 target 组（source 组被删除） */
export function mergeGroups(state: MyTabState, sourceId: string, targetId: string): MutationOutcome {
  if (sourceId === targetId) return { state }
  const src = findGroup(state, sourceId)
  const dst = findGroup(state, targetId)
  if (!src || !dst || dst.locked) return { state }

  const existing = new Set(dst.items.map((i) => i.url))
  const incoming = state.settings.duplicatePolicy === 'skip' ? src.items.filter((i) => !existing.has(i.url)) : src.items

  dst.items.push(...incoming)
  dst.updatedAt = now()
  // 合并后源组消失（文件会被移进 _trash/）
  state.groups = state.groups.filter((g) => g.id !== sourceId)
  return { state: touch(state) }
}

/* ============================ 标签条目 ============================ */

export function addItemsToGroup(state: MyTabState, groupId: string, tabs: CollectableTab[] = [], index = -1): MutationOutcome {
  const g = findGroup(state, groupId)
  if (!g || g.locked) return { state }
  const items = tabs
    .filter((t) => t && isCollectableUrl(t.url))
    .map((t) => createTabItem({ url: t.url, title: t.title, favIconUrl: t.favIconUrl || '' }))
  if (!items.length) return { state }
  if (index < 0 || index >= g.items.length) g.items.push(...items)
  else g.items.splice(index, 0, ...items)
  g.updatedAt = now()
  return { state: touch(state) }
}

/** 用一批标签新开一个组（拖出建组 / 分组用） */
export function createGroupFromItems(
  state: MyTabState,
  tabs: CollectableTab[] = [],
  opts: CreateGroupFromItemsOptions = {}
): GroupOutcome {
  const group = createGroup({
    title: opts.title || '',
    folderId: opts.folderId ?? null,
    items: tabs
      .filter((t) => t && isCollectableUrl(t.url))
      .map((t) => createTabItem({ url: t.url, title: t.title, favIconUrl: t.favIconUrl || '' }))
  })
  if (opts.toIndex != null) state.groups.splice(Math.max(0, opts.toIndex), 0, group)
  else if (opts.position === 'bottom') state.groups.push(group)
  else state.groups.unshift(group)
  return { state: touch(state), group }
}

export function updateItem(state: MyTabState, itemId: string, patch: ItemPatch = {}): MutationOutcome {
  const hit = findItem(state, itemId)
  if (!hit) return { state }

  if (hit.group?.locked) {
    if (patch.title !== undefined) hit.item.title = patch.title
    if (patch.starred !== undefined) hit.item.starred = patch.starred
    if (patch.task !== undefined) hit.item.task = patch.task
    if (patch.note !== undefined) hit.item.note = patch.note
  } else {
    Object.assign(hit.item, patch)
  }
  hit.item.updatedAt = now()
  if (hit.group) hit.group.updatedAt = now()
  return { state: touch(state) }
}

export function toggleItemStar(state: MyTabState, itemId: string): MutationOutcome {
  const hit = findItem(state, itemId)
  if (!hit) return { state }
  return updateItem(state, itemId, { starred: !hit.item.starred })
}

/**
 * 待办标记三态：
 * - 无任务 → 无任务（点击不产生空任务）
 * - 有任务未完成 → 已完成
 * - 有任务已完成 → 未完成
 */
export function toggleItemTask(state: MyTabState, itemId: string): MutationOutcome {
  const hit = findItem(state, itemId)
  if (!hit) return { state }
  const cur = hit.item.task
  if (!cur) return { state }
  const next: TaskFlag = cur.done
    ? { done: false, completedAt: null }
    : { done: true, completedAt: now() }
  return updateItem(state, itemId, { task: next })
}

/** 显式创建 / 取消待办（比开关更明确，供界面「加为待办」使用） */
export function setItemTask(state: MyTabState, itemId: string, task: TaskFlag | null): MutationOutcome {
  return updateItem(state, itemId, { task })
}

export const setItemNote = (state: MyTabState, itemId: string, note: string): MutationOutcome =>
  updateItem(state, itemId, { note: String(note ?? '') })

export interface RemoveItemsOptions {
  /** true 时把因此变空的组一并删掉（还原后移除场景，避免留下空组） */
  pruneEmptyGroups?: boolean
}

export function removeItems(state: MyTabState, itemIds: string[] = [], opts: RemoveItemsOptions = {}): MutationOutcome {
  const ids = new Set(itemIds)
  if (!ids.size) return { state }
  const ts = now()
  const touched: Group[] = []

  for (const g of state.groups) {
    if (g.locked) continue
    const before = g.items.length
    g.items = g.items.filter((it) => !ids.has(it.id))
    if (g.items.length !== before) {
      g.updatedAt = ts
      touched.push(g)
    }
  }

  state.quickList = state.quickList.filter((it) => !ids.has(it.id))

  // 只清掉「本次被搬空」的组，用户自己建的空组不动
  if (opts.pruneEmptyGroups) {
    const emptied = new Set(touched.filter((g) => !g.items.length).map((g) => g.id))
    if (emptied.size) state.groups = state.groups.filter((g) => !emptied.has(g.id))
  }

  return { state: touch(state) }
}

export const removeItem = (state: MyTabState, itemId: string): MutationOutcome => removeItems(state, [itemId])

/** 组内移动 */
export function moveItemInGroup(state: MyTabState, groupId: string, from: number, to: number): MutationOutcome {
  const g = findGroup(state, groupId)
  if (!g || g.locked) return { state }
  g.items = arrayMove(g.items, from, to)
  g.updatedAt = now()
  return { state: touch(state) }
}

/** 跨组移动：把 itemId 移到 targetGroupId 的 index 位置 */
export function moveItemToGroup(state: MyTabState, itemId: string, targetGroupId: string, index = -1): MutationOutcome {
  const hit = findItem(state, itemId)
  const target = findGroup(state, targetGroupId)
  if (!hit || !target || target.locked || hit.group?.locked) return { state }
  if (hit.group) hit.group.items = hit.group.items.filter((i) => i.id !== itemId)
  const moved: TabItem = { ...hit.item, updatedAt: now() }
  if (index < 0 || index >= target.items.length) target.items.push(moved)
  else target.items.splice(index, 0, moved)
  if (hit.group) hit.group.updatedAt = now()
  target.updatedAt = now()
  return { state: touch(state) }
}

/** 批量移动到另一个组 */
export function moveItemsToGroup(state: MyTabState, itemIds: string[] = [], targetGroupId: string, index = -1): MutationOutcome {
  const target = findGroup(state, targetGroupId)
  if (!target || target.locked) return { state }
  const ids = new Set(itemIds)
  const picked: TabItem[] = []

  for (const g of state.groups) {
    if (g.locked || g.id === targetGroupId) continue
    const keep: TabItem[] = []
    for (const it of g.items) {
      if (ids.has(it.id)) picked.push(it)
      else keep.push(it)
    }
    if (keep.length !== g.items.length) {
      g.items = keep
      g.updatedAt = now()
    }
  }
  if (!picked.length) return { state }
  if (index < 0 || index >= target.items.length) target.items.push(...picked)
  else target.items.splice(index, 0, ...picked)
  target.updatedAt = now()
  return { state: touch(state) }
}

/** 批量移动到文件夹 */
export function moveGroupsToFolder(state: MyTabState, groupIds: string[] = [], folderId: string | null = null): MutationOutcome {
  const ids = new Set(groupIds)
  for (const g of state.groups) {
    if (ids.has(g.id)) {
      g.folderId = folderId
      g.updatedAt = now()
    }
  }
  return { state: touch(state) }
}

/** 清空列表（删除所有未锁定的标签组） */
export function clearGroups(state: MyTabState): MutationOutcome {
  state.groups = state.groups.filter((g) => g.locked)
  return { state: touch(state) }
}

/* ============================ 文件夹 ============================ */

export function addFolder(state: MyTabState, name: string, color: string | null = null): FolderOutcome {
  const folder = createFolder({ name: String(name ?? '').trim(), color })
  state.folders.push(folder)
  return { state: touch(state), folder }
}

export function updateFolder(state: MyTabState, id: string, patch: FolderPatch = {}): MutationOutcome {
  const f = findFolder(state, id)
  if (!f) return { state }
  Object.assign(f, patch)
  f.updatedAt = now()
  return { state: touch(state) }
}

export interface RemoveFolderOptions {
  /** true 时把组移出到未归类，false 时连组一起删除 */
  keepGroups?: boolean
}

export function removeFolder(state: MyTabState, id: string, { keepGroups = true }: RemoveFolderOptions = {}): MutationOutcome {
  const i = state.folders.findIndex((f) => f.id === id)
  if (i < 0) return { state }
  const ts = now()

  if (keepGroups) {
    for (const g of state.groups) {
      if (g.folderId === id) {
        g.folderId = null
        g.updatedAt = ts
      }
    }
  } else {
    state.groups = state.groups.filter((g) => g.folderId !== id)
  }

  state.folders.splice(i, 1)
  return { state: touch(state) }
}

export function toggleFolderCollapsed(state: MyTabState, id: string): MutationOutcome {
  const f = findFolder(state, id)
  if (!f) return { state }
  f.collapsed = !f.collapsed
  return { state: touch(state) }
}

/* ============================ 快捷列表 ============================ */

export function addToQuickList(state: MyTabState, tabs: CollectableTab[] = [], index = -1): MutationOutcome {
  const known = new Set(state.quickList.map((i) => i.url))
  const items = tabs
    .filter((t) => t && t.url && !known.has(t.url))
    .map((t) => createTabItem({ url: t.url, title: t.title, favIconUrl: t.favIconUrl || '' }))
  if (!items.length) return { state }
  if (index < 0 || index >= state.quickList.length) state.quickList.push(...items)
  else state.quickList.splice(index, 0, ...items)
  return { state: touch(state) }
}

/** 把已有条目（按 id）复制进快捷列表 */
export function copyItemsToQuickList(state: MyTabState, itemIds: string[] = []): MutationOutcome {
  const ids = new Set(itemIds)
  const known = new Set(state.quickList.map((i) => i.url))
  const picked: TabItem[] = []
  for (const g of state.groups) {
    for (const it of g.items) {
      if (ids.has(it.id) && !known.has(it.url)) {
        known.add(it.url)
        picked.push({ ...it, id: uuid(), createdAt: now(), updatedAt: now(), deletedAt: null })
      }
    }
  }
  if (!picked.length) return { state }
  state.quickList.push(...picked)
  return { state: touch(state) }
}

export function reorderQuickList(state: MyTabState, orderedIds: string[] = []): MutationOutcome {
  const map = new Map(state.quickList.map((i) => [i.id, i]))
  const out: TabItem[] = []
  for (const id of orderedIds) {
    const it = map.get(id)
    if (it) {
      out.push(it)
      map.delete(id)
    }
  }
  for (const it of map.values()) out.push(it)
  state.quickList = out
  return { state: touch(state) }
}

export function moveQuickItem(state: MyTabState, from: number, to: number): MutationOutcome {
  state.quickList = arrayMove(state.quickList, from, to)
  return { state: touch(state) }
}

/* ============================ 设置与维护 ============================ */

export function updateSettings(state: MyTabState, patch: Partial<MyTabState['settings']> = {}): MutationOutcome {
  Object.assign(state.settings, patch)
  return { state: touch(state) }
}

/** 记录一次成功写入资料库的时间 */
export function markSynced(state: MyTabState, ts = now()): MutationOutcome {
  state.meta.updatedAt = ts
  return { state }
}

export interface TidyOptions {
  removeEmptyGroups?: boolean
}

/** 深度清理：可选去掉空组 */
export function tidy(state: MyTabState, { removeEmptyGroups = false }: TidyOptions = {}): MutationOutcome {
  if (removeEmptyGroups) {
    state.groups = state.groups.filter((g) => g.items.length > 0 || g.locked)
  }
  return { state: touch(state) }
}
