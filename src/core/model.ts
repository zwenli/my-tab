/**
 * 数据模型：工厂函数、归一化、迁移。
 *
 * 这里描述的是**内存中的镜像状态**。真相源是资料库文件夹里的 .json 文件
 * （见 core/libraryFormat.ts），本状态可由文件随时重建。
 *
 * {
 *   schemaVersion: 1,
 *   meta: { deviceId, createdAt, updatedAt },
 *   folders:   [Folder],
 *   groups:    [Group],       // 数组顺序 = 列表显示顺序（同时写进 library.json 的 groupOrder）
 *   quickList: [TabItem],
 *   settings:  { ...DEFAULT_SETTINGS }   // 本机偏好，不入资料库
 * }
 */
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from './constants'
import { formatDateTime, now, uuid } from './utils'
import type {
  DuplicatePolicy,
  Folder,
  Group,
  LanguagePref,
  MyTabState,
  NewGroupPosition,
  RestoreTarget,
  Settings,
  Stats,
  TabItem,
  TaskFlag,
  ThemePref,
  CollectableTab
} from '../types'

/* ------------------------------ 工厂 ------------------------------ */

export interface CreateTabItemInput {
  url?: string
  title?: string
  favIconUrl?: string
  createdAt?: number
}

export function createTabItem({ url = '', title = '', favIconUrl = '', createdAt }: CreateTabItemInput = {}): TabItem {
  const ts = createdAt ?? now()
  return {
    id: uuid(),
    url,
    title: title || url,
    favIconUrl,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
    starred: false,
    task: null,
    note: ''
  }
}

export interface CreateGroupInput {
  title?: string
  items?: TabItem[]
  folderId?: string | null
  note?: string
  starred?: boolean
  locked?: boolean
  createdAt?: number
}

export function createGroup({ title = '', items = [], folderId = null, note = '', starred, locked, createdAt }: CreateGroupInput = {}): Group {
  const ts = createdAt ?? now()
  return {
    id: uuid(),
    title,
    note,
    folderId,
    starred: starred ?? false,
    locked: locked ?? false,
    color: null,
    collapsed: false,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
    items
  }
}

export interface CreateFolderInput {
  name?: string
  color?: string | null
}

export function createFolder({ name = '', color = null }: CreateFolderInput = {}): Folder {
  const ts = now()
  return {
    id: uuid(),
    name,
    color,
    collapsed: false,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null
  }
}

/** 由一批浏览器标签生成一个标签组 */
export function groupFromTabs(
  tabs: CollectableTab[] = [],
  { title = '', folderId = null }: { title?: string; folderId?: string | null } = {}
): Group {
  const items = tabs.map((t) =>
    createTabItem({
      url: t.url,
      title: t.title,
      favIconUrl: t.favIconUrl || ''
    })
  )
  return createGroup({ title, items, folderId })
}

/** 空状态 */
export function emptyState(deviceId = ''): MyTabState {
  const ts = now()
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { deviceId, createdAt: ts, updatedAt: ts },
    folders: [],
    groups: [],
    quickList: [],
    settings: { ...DEFAULT_SETTINGS }
  }
}

/* ---------------------------- 归一化 ---------------------------- */

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const asString = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))
const asBool = (v: unknown): boolean => v === true
const asNum = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** 从若干候选值中挑一个合法枚举值，否则回退默认值 */
function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

function normalizeTask(raw: unknown): TaskFlag | null {
  if (!isRecord(raw)) return null
  return {
    done: asBool(raw.done),
    completedAt: typeof raw.completedAt === 'number' ? raw.completedAt : null
  }
}

function normalizeItem(raw: unknown, fallbackTs: number): TabItem | null {
  if (!isRecord(raw)) return null
  const ts = asNum(raw.createdAt, fallbackTs)
  return {
    id: asString(raw.id) || uuid(),
    url: asString(raw.url),
    title: asString(raw.title) || asString(raw.url),
    favIconUrl: asString(raw.favIconUrl),
    createdAt: ts,
    updatedAt: asNum(raw.updatedAt, ts),
    deletedAt: raw.deletedAt == null ? null : asNum(raw.deletedAt, ts),
    starred: asBool(raw.starred),
    task: normalizeTask(raw.task),
    note: asString(raw.note)
  }
}

function normalizeGroup(raw: unknown, fallbackTs: number): Group | null {
  if (!isRecord(raw)) return null
  const ts = asNum(raw.createdAt, fallbackTs)
  return {
    id: asString(raw.id) || uuid(),
    title: asString(raw.title),
    note: asString(raw.note),
    folderId: raw.folderId ? asString(raw.folderId) : null,
    starred: asBool(raw.starred),
    locked: asBool(raw.locked),
    color: raw.color ? asString(raw.color) : null,
    collapsed: asBool(raw.collapsed),
    createdAt: ts,
    updatedAt: asNum(raw.updatedAt, ts),
    deletedAt: raw.deletedAt == null ? null : asNum(raw.deletedAt, ts),
    items: asArray(raw.items)
      .map((i) => normalizeItem(i, ts))
      .filter((i): i is TabItem => i !== null)
  }
}

function normalizeFolder(raw: unknown, fallbackTs: number): Folder | null {
  if (!isRecord(raw)) return null
  const ts = asNum(raw.createdAt, fallbackTs)
  return {
    id: asString(raw.id) || uuid(),
    name: asString(raw.name),
    color: raw.color ? asString(raw.color) : null,
    collapsed: asBool(raw.collapsed),
    createdAt: ts,
    updatedAt: asNum(raw.updatedAt, ts),
    deletedAt: raw.deletedAt == null ? null : asNum(raw.deletedAt, ts)
  }
}

/** 设置项逐字段校验，非法值一律回落到默认值 */
export function normalizeSettings(raw: unknown): Settings {
  const src = isRecord(raw) ? raw : {}
  const d = DEFAULT_SETTINGS
  return {
    language: pickEnum<LanguagePref | 'auto'>(src.language, ['auto', 'zh-CN', 'en-US'], d.language),
    theme: pickEnum<ThemePref>(src.theme, ['auto', 'dark', 'light'], d.theme),
    openListOnStartup: asBool(src.openListOnStartup),
    collectPinnedTabs: asBool(src.collectPinnedTabs),
    duplicatePolicy: pickEnum<DuplicatePolicy>(src.duplicatePolicy, ['keep', 'skip'], d.duplicatePolicy),
    skipListPage: src.skipListPage === undefined ? d.skipListPage : asBool(src.skipListPage),
    restoreTarget: pickEnum<RestoreTarget>(src.restoreTarget, ['current', 'new'], d.restoreTarget),
    removeAfterRestore: src.removeAfterRestore === undefined ? d.removeAfterRestore : asBool(src.removeAfterRestore),
    clearListAfterRestore: asBool(src.clearListAfterRestore),
    enablePopup: src.enablePopup === undefined ? d.enablePopup : asBool(src.enablePopup),
    showFavicons: src.showFavicons === undefined ? d.showFavicons : asBool(src.showFavicons),
    newGroupPosition: pickEnum<NewGroupPosition>(src.newGroupPosition, ['top', 'bottom'], d.newGroupPosition),
    expandGroupsByDefault: asBool(src.expandGroupsByDefault),
    previewLimit: Math.max(0, asNum(src.previewLimit, d.previewLimit)),
    starPinsToTop: src.starPinsToTop === undefined ? d.starPinsToTop : asBool(src.starPinsToTop),
    searchInUrl: src.searchInUrl === undefined ? d.searchInUrl : asBool(src.searchInUrl),
    ignoreExtensionPages: src.ignoreExtensionPages === undefined ? d.ignoreExtensionPages : asBool(src.ignoreExtensionPages)
  }
}

/**
 * 把任意来源（storage / 导入文件 / 备份文件）的数据整理为合法状态对象。
 * 容错优先：坏数据被丢弃而不是抛错。
 */
export function normalizeState(raw: unknown, deviceId = ''): MyTabState {
  if (!isRecord(raw)) return emptyState(deviceId)

  const fallbackTs = now()
  const meta = isRecord(raw.meta) ? raw.meta : {}

  const state: MyTabState = {
    schemaVersion: asNum(raw.schemaVersion, SCHEMA_VERSION),
    meta: {
      deviceId: asString(meta.deviceId) || deviceId || uuid(),
      createdAt: asNum(meta.createdAt, fallbackTs),
      updatedAt: asNum(meta.updatedAt, fallbackTs)
    },
    folders: asArray(raw.folders)
      .map((f) => normalizeFolder(f, fallbackTs))
      .filter((f): f is Folder => f !== null),
    groups: asArray(raw.groups)
      .map((g) => normalizeGroup(g, fallbackTs))
      .filter((g): g is Group => g !== null),
    quickList: asArray(raw.quickList)
      .map((i) => normalizeItem(i, fallbackTs))
      .filter((i): i is TabItem => i !== null),
    settings: normalizeSettings(raw.settings)
  }

  return migrate(state)
}

/** 版本迁移（当前只有 v1，保留扩展点） */
export function migrate(state: MyTabState): MyTabState {
  if (state.schemaVersion === SCHEMA_VERSION) return state
  // 未来版本在此按序升级
  state.schemaVersion = SCHEMA_VERSION
  return state
}

/* ---------------------------- 统计 ---------------------------- */

/**
 * 未完成待办数量（工具栏徽标 / 侧边栏 / 「待办」分组共用一个口径）。
 * 只统计组内条目：快捷列表是常驻收藏，不算待办进度。
 */
export function countOpenTasks(state: MyTabState): number {
  let n = 0
  for (const g of state.groups ?? []) for (const it of g.items ?? []) if (it.task && !it.task.done) n++
  return n
}

/**
 * 工具栏徽标文本：0 个待办就不显示（返回空串，徽标消失），超过 99 收敛为 99+。
 * 徽标代表「还有多少事要处理」，所以不显示标签条目总数。
 */
export function badgeText(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return ''
  return count > 99 ? '99+' : String(Math.floor(count))
}

export function computeStats(state: MyTabState): Stats {
  const groups = state.groups ?? []
  const items = groups.flatMap((g) => g.items ?? [])
  const all = items.concat(state.quickList ?? [])
  const domains = new Set<string>()
  for (const it of all) {
    try {
      domains.add(new URL(it.url).hostname)
    } catch {
      /* ignore */
    }
  }
  return {
    groupCount: groups.length,
    tabCount: items.length,
    quickCount: (state.quickList ?? []).length,
    folderCount: (state.folders ?? []).length,
    starredCount: groups.filter((g) => g.starred).length + items.filter((i) => i.starred).length,
    lockedCount: groups.filter((g) => g.locked).length,
    taskOpen: countOpenTasks(state),
    domainCount: domains.size
  }
}

/**
 * 生成默认组名：本地时间，精确到秒，例如「2026-10-13 10:30:07」。
 *
 * 刻意不带标签数量：数量会随组内条目的增删而不同步，组卡片/侧边栏本来就有条目数，
 * 写在名字里只会越看越不对。精确到秒是为了让「同一分钟内连续收起两次」不重名。
 */
export function defaultGroupTitle(ts = now()): string {
  return formatDateTime(ts, true)
}
