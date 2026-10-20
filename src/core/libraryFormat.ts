/**
 * 资料库文件格式（纯函数，无任何平台 API 依赖，可在后台 / 页面 / 自检中通用）。
 *
 * 理念：**文件即数据**。资料库就是一个普通文件夹，里面的文件是唯一真相源，
 * 用任何文本编辑器都能打开、能读懂、能手写。因此这里刻意做了三件事：
 *
 * 1. 键按字母排序 —— diff 稳定，人也容易扫。
 * 2. 时间用 ISO 8601 字符串 —— 人能看懂，且跨时区无歧义。
 * 3. 省略一切默认值 —— 只写「非空」的字段，文件尽量短。
 *
 * 目录结构：
 *   <资料库>/
 *   ├── library.json         库身份 + 组顺序
 *   ├── folders.json         文件夹列表（数组顺序即显示顺序）
 *   ├── quicklist.json       快捷列表
 *   └── groups/
 *       └── <标题> [<短id>].json   一个组一个文件（文件名仅供人看，id 才是身份）
 */
import { SCHEMA_VERSION } from './constants'
import { createTabItem } from './model'
import type { Folder, Group, MyTabState, Settings, TabItem, TaskFlag } from '../types'

/** 资料库目录结构中的固定文件名 */
export const LIB_FILE = 'library.json'
export const FOLDERS_FILE = 'folders.json'
export const QUICK_FILE = 'quicklist.json'
export const GROUPS_DIR = 'groups'
export const TRASH_DIR = '_trash'

/** 相对路径 → 文件内容 的映射，是「一个资料库」在内存中的表示 */
export type LibraryFiles = Record<string, string>

/* ------------------------------ 时间 ------------------------------ */

/** 毫秒时间戳 → ISO 8601（UTC，秒级，如 2026-10-13T09:41:07Z） */
export function toIso(ts: number): string {
  const d = new Date(ts || 0)
  if (Number.isNaN(d.getTime())) return new Date(0).toISOString().replace(/\.\d{3}Z$/, 'Z')
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** ISO 8601（或任意可解析时间字符串 / 数字）→ 毫秒时间戳 */
export function fromIso(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value) {
    const t = Date.parse(value)
    if (!Number.isNaN(t)) return t
  }
  return fallback
}

/* ---------------------------- 人可读 JSON ---------------------------- */

/** 递归按键名排序（数组顺序保持不变） */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value && typeof value === 'object') {
    const src = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(src).sort()) out[key] = sortKeysDeep(src[key])
    return out
  }
  return value
}

/** 序列化为「写给人看」的 JSON：键排序、2 空格缩进、结尾换行 */
export function toHumanJson(value: unknown): string {
  return `${JSON.stringify(sortKeysDeep(value), null, 2)}\n`
}

/** 去掉对象里的 undefined / null / '' / false / 空数组，让文件只留有效字段 */
function compact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '' || v === false) continue
    if (Array.isArray(v) && v.length === 0) continue
    out[k] = v
  }
  return out
}

/* ------------------------------ 文件名 ------------------------------ */

/** 短 id：取 uuid 的前 8 位（不含连字符），用于文件名里锚定身份 */
export const shortId = (id = ''): string => (id.replace(/-/g, '').slice(0, 8) || 'unknown')

/** 把标题清洗成可安全落盘的文件名片段 */
export function slugify(text: string, max = 60): string {
  const cleaned = String(text ?? '')
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/, '')
  const clipped = cleaned.slice(0, max).trim()
  return clipped || '未命名'
}

/** 组文件名：`<标题> [<短id>].json`，人一眼能认出，靠 [短id] 保持稳定 */
export const groupFileName = (g: Pick<Group, 'id' | 'title' | 'createdAt'>): string =>
  `${GROUPS_DIR}/${slugify(g.title || `未命名 ${shortId(g.id)}`)} [${shortId(g.id)}].json`

/* ------------------------------ 序列化 ------------------------------ */

/** TabItem → 人可读对象（省略默认值） */
export function serializeItem(it: TabItem): Record<string, unknown> {
  const task = it.task ? compact({ completedAt: it.task.completedAt ? toIso(it.task.completedAt) : '', done: it.task.done }) : null
  return compact({
    id: it.id,
    url: it.url,
    title: it.title && it.title !== it.url ? it.title : '',
    favIconUrl: it.favIconUrl,
    createdAt: toIso(it.createdAt),
    starred: it.starred,
    task: task && Object.keys(task).length ? task : null,
    note: it.note
  })
}

/** 人可读对象 → TabItem（容错：缺 id 自动生成，缺 title 回退 url） */
export function parseItem(raw: unknown, fallbackTs = 0): TabItem | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const url = typeof o.url === 'string' ? o.url : ''
  if (!url) return null
  const createdAt = fromIso(o.createdAt, fallbackTs)
  const base = createTabItem({ url, title: typeof o.title === 'string' ? o.title : '', createdAt })
  const task = o.task && typeof o.task === 'object' ? (o.task as Record<string, unknown>) : null
  return {
    ...base,
    id: typeof o.id === 'string' && o.id ? o.id : base.id,
    favIconUrl: typeof o.favIconUrl === 'string' ? o.favIconUrl : '',
    starred: o.starred === true,
    note: typeof o.note === 'string' ? o.note : '',
    task: task
      ? ({ done: task.done === true, completedAt: task.completedAt ? fromIso(task.completedAt, 0) || null : null } as TaskFlag)
      : null
  }
}

/** Group → 人可读对象 */
export function serializeGroup(g: Group): Record<string, unknown> {
  return compact({
    id: g.id,
    title: g.title,
    note: g.note,
    folderId: g.folderId,
    starred: g.starred,
    locked: g.locked,
    createdAt: toIso(g.createdAt),
    updatedAt: toIso(g.updatedAt),
    items: (g.items ?? []).map(serializeItem)
  })
}

/** 人可读对象 → Group */
export function parseGroup(raw: unknown, fallbackTs = 0): Group | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const createdAt = fromIso(o.createdAt, fallbackTs)
  const items = Array.isArray(o.items)
    ? o.items.map((i) => parseItem(i, createdAt)).filter((i): i is TabItem => i !== null)
    : []
  const id = typeof o.id === 'string' && o.id ? o.id : `${shortId(String(Math.random()))}-${createdAt}`
  return {
    id,
    title: typeof o.title === 'string' ? o.title : '',
    note: typeof o.note === 'string' ? o.note : '',
    folderId: typeof o.folderId === 'string' && o.folderId ? o.folderId : null,
    starred: o.starred === true,
    locked: o.locked === true,
    color: typeof o.color === 'string' && o.color ? o.color : null,
    collapsed: o.collapsed === true,
    createdAt,
    updatedAt: fromIso(o.updatedAt, createdAt),
    deletedAt: null,
    items
  }
}

/** Folder → 人可读对象 */
export const serializeFolder = (f: Folder): Record<string, unknown> =>
  compact({ id: f.id, name: f.name, color: f.color, createdAt: toIso(f.createdAt) })

/** 人可读对象 → Folder */
export function parseFolder(raw: unknown, fallbackTs = 0): Folder | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const createdAt = fromIso(o.createdAt, fallbackTs)
  return {
    id: typeof o.id === 'string' && o.id ? o.id : `${shortId(String(Math.random()))}-${createdAt}`,
    name: typeof o.name === 'string' ? o.name : '',
    color: typeof o.color === 'string' && o.color ? o.color : null,
    collapsed: false,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null
  }
}

/** library.json 的结构 */
export interface LibraryManifest {
  format: string
  schemaVersion: number
  createdAt: number
  /** 组的显示顺序（只存 id，缺失的组会被追加到末尾） */
  groupOrder: string[]
}

export const serializeManifest = (m: LibraryManifest): Record<string, unknown> =>
  compact({
    format: m.format,
    schemaVersion: m.schemaVersion,
    createdAt: toIso(m.createdAt),
    groupOrder: m.groupOrder
  })

export function parseManifest(raw: unknown): LibraryManifest {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    format: typeof o.format === 'string' ? o.format : 'my-tab',
    schemaVersion: typeof o.schemaVersion === 'number' ? o.schemaVersion : SCHEMA_VERSION,
    createdAt: fromIso(o.createdAt, 0),
    groupOrder: Array.isArray(o.groupOrder) ? o.groupOrder.filter((x): x is string => typeof x === 'string') : []
  }
}

/* --------------------------- 状态 ⇄ 文件集 --------------------------- */

export interface SerializeOptions {
  format: string
  /** 库创建时间；为 0 时用 state.meta.createdAt */
  createdAt?: number
}

/**
 * 把完整状态展开成「相对路径 → 文件内容」的文件集。
 * 这是写向磁盘的唯一出口：想写什么文件，这里就有什么。
 */
export function stateToFiles(state: MyTabState, opts: SerializeOptions): LibraryFiles {
  const files: LibraryFiles = {}

  const manifest: LibraryManifest = {
    format: opts.format,
    schemaVersion: state.schemaVersion,
    createdAt: opts.createdAt || state.meta?.createdAt || 0,
    groupOrder: (state.groups ?? []).map((g) => g.id)
  }
  files[LIB_FILE] = toHumanJson(serializeManifest(manifest))
  files[FOLDERS_FILE] = toHumanJson((state.folders ?? []).map(serializeFolder))
  files[QUICK_FILE] = toHumanJson((state.quickList ?? []).map(serializeItem))

  for (const g of state.groups ?? []) {
    files[groupFileName(g)] = toHumanJson(serializeGroup(g))
  }
  return files
}

export interface ParseOptions {
  deviceId?: string
  settings: Settings
  fallbackTs?: number
}

/**
 * 从文件集还原完整状态。
 * 手写的 json、被 Finder 改过名 / 挪过位置的文件，都会被尽力读进来。
 */
export function filesToState(files: LibraryFiles, opts: ParseOptions): MyTabState {
  const fallbackTs = opts.fallbackTs ?? Date.now()
  const manifest = files[LIB_FILE] ? parseManifest(safeJson(files[LIB_FILE])) : parseManifest(null)

  const folders: Folder[] = []
  const folderRaw = files[FOLDERS_FILE] ? safeJson(files[FOLDERS_FILE]) : []
  if (Array.isArray(folderRaw)) {
    for (const f of folderRaw) {
      const parsed = parseFolder(f, fallbackTs)
      if (parsed) folders.push(parsed)
    }
  }

  const quickList: TabItem[] = []
  const quickRaw = files[QUICK_FILE] ? safeJson(files[QUICK_FILE]) : []
  if (Array.isArray(quickRaw)) {
    for (const i of quickRaw) {
      const parsed = parseItem(i, fallbackTs)
      if (parsed) quickList.push(parsed)
    }
  }

  // 一个组一个文件：凡在 groups/ 下的 .json 都是组，与文件名无关
  const groups: Group[] = []
  for (const [path, text] of Object.entries(files)) {
    if (!path.startsWith(`${GROUPS_DIR}/`) || !path.endsWith('.json')) continue
    const parsed = parseGroup(safeJson(text), fallbackTs)
    if (parsed) groups.push(parsed)
  }

  // 按 library.json 里的 groupOrder 排序，未登记的（手写新增）追加到末尾
  const order = new Map(manifest.groupOrder.map((id, i) => [id, i]))
  groups.sort((a, b) => {
    const ia = order.has(a.id) ? (order.get(a.id) as number) : Number.MAX_SAFE_INTEGER
    const ib = order.has(b.id) ? (order.get(b.id) as number) : Number.MAX_SAFE_INTEGER
    if (ia !== ib) return ia - ib
    return a.createdAt - b.createdAt
  })

  return {
    schemaVersion: manifest.schemaVersion || SCHEMA_VERSION,
    meta: {
      deviceId: opts.deviceId ?? '',
      createdAt: manifest.createdAt || fallbackTs,
      updatedAt: fallbackTs
    },
    folders,
    groups,
    quickList,
    settings: opts.settings
  }
}

/** 内部：安全解析 JSON，失败返回 null */
function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

/** 识别 OneDrive / Dropbox 生成的冲突副本文件（不自动合并，只提示用户） */
export const isConflictCopy = (name: string): boolean => /conflicted copy|冲突|\(.*的副本\)|的冲突副本/i.test(name)
