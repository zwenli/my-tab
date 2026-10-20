/**
 * 持久化层。
 *
 * 这里的角色在「File over app」重构后发生了变化：
 *
 * - **真相源是资料库文件夹里的 .json 文件**（见 core/library.ts）。
 * - 本地存储（chrome.storage.local，普通网页下回退 localStorage）只保存两样东西：
 *     1. 资料库内容的**缓存镜像** —— 让页面第一时间有东西可渲染，可随时删掉重建；
 *     2. **本机设置** —— 属于「App 自己需要的东西」，不写进资料库。
 *
 * 因此每次写操作都会：改内存 → 写缓存 → **差异同步到资料库**。
 * 若尚未绑定资料库，则只写缓存（本地暂存模式），界面会提示去连接资料库。
 */
import { DEVICE_KEY, LIBRARY_FORMAT, STORAGE_KEY } from './constants'
import { getLibraryDir, readLibrary, syncLibrary, writeLibraryFiles } from './library'
import { LIB_FILE, filesToState, stateToFiles } from './libraryFormat'
import { emptyState, normalizeState } from './model'
import type { MutationOutcome } from './mutations'
import { deepClone, now, uuid } from './utils'
import type { LibraryScanResult, LibrarySyncResult, MyTabState, Settings } from '../types'

const hasChromeStorage = (): boolean => typeof chrome !== 'undefined' && !!chrome.storage?.local

/* --------------------------- 底层读写 --------------------------- */

function rawGet(keys: string | string[]): Promise<Record<string, unknown>> {
  if (hasChromeStorage()) {
    return new Promise((resolve) => chrome.storage.local.get(keys, (res) => resolve((res ?? {}) as Record<string, unknown>)))
  }
  const out: Record<string, unknown> = {}
  const list = Array.isArray(keys) ? keys : [keys]
  for (const k of list) {
    const v = globalThis.localStorage?.getItem(k)
    if (v != null) out[k] = JSON.parse(v) as unknown
  }
  return Promise.resolve(out)
}

function rawSet(obj: Record<string, unknown>): Promise<void> {
  if (hasChromeStorage()) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(obj, () => {
        const err = chrome.runtime?.lastError
        if (err) reject(new Error(err.message))
        else resolve()
      })
    })
  }
  for (const [k, v] of Object.entries(obj)) globalThis.localStorage?.setItem(k, JSON.stringify(v))
  return Promise.resolve()
}

function rawRemove(keys: string | string[]): Promise<void> {
  if (hasChromeStorage()) {
    return new Promise((resolve) => chrome.storage.local.remove(keys, () => resolve()))
  }
  const list = Array.isArray(keys) ? keys : [keys]
  for (const k of list) globalThis.localStorage?.removeItem(k)
  return Promise.resolve()
}

/* --------------------------- 设备标识 --------------------------- */

let cachedDeviceId = ''

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId
  const res = await rawGet(DEVICE_KEY)
  const stored = res[DEVICE_KEY]
  if (typeof stored === 'string' && stored) cachedDeviceId = stored
  else {
    cachedDeviceId = uuid()
    await rawSet({ [DEVICE_KEY]: cachedDeviceId })
  }
  return cachedDeviceId
}

/* --------------------------- 缓存读写 --------------------------- */

let cachedState: MyTabState | null = null

export interface LoadStateOptions {
  /** 跳过内存缓存，强制从存储读取 */
  force?: boolean
}

/** 读取缓存状态（带内存缓存） */
export async function loadState({ force = false }: LoadStateOptions = {}): Promise<MyTabState> {
  if (cachedState && !force) return cachedState
  const deviceId = await getDeviceId()
  const res = await rawGet(STORAGE_KEY)
  cachedState = normalizeState(res[STORAGE_KEY], deviceId)
  return cachedState
}

/** 写入缓存（不碰资料库） */
export async function saveState(state: MyTabState): Promise<MyTabState> {
  cachedState = state
  await rawSet({ [STORAGE_KEY]: state })
  return state
}

/* --------------------------- 资料库同步 --------------------------- */

let lastSync: LibrarySyncResult = { ok: true, written: 0, trashed: 0 }
let lastConflicts: string[] = []
/** 上一次成功同步出去的状态，用于「不带 prev」时也能算出最小差异 */
let lastSynced: MyTabState | null = null

/** 最近一次同步结果（供界面提示失败原因） */
export const getLastSync = (): LibrarySyncResult => ({ ...lastSync })
/** 最近一次扫描发现的云盘冲突副本 */
export const getLastConflicts = (): string[] => [...lastConflicts]

/**
 * 把状态差异同步到资料库。
 * 未绑定资料库时返回 NO_DIR —— 这是「本地暂存」模式，不算失败。
 * 不传 prev 时自动与「上次成功同步的状态」比较，避免重复写文件。
 */
export async function syncToLibrary(next: MyTabState, prev?: MyTabState | null, request = false): Promise<LibrarySyncResult> {
  const dir = await getLibraryDir()
  if (!dir) {
    lastSync = { ok: false, written: 0, trashed: 0, reason: 'NO_DIR' }
    return lastSync
  }
  const base = prev ?? lastSynced
  lastSync = await syncLibrary(next, { prev: base, createdAt: next.meta.createdAt, request })
  if (lastSync.ok) lastSynced = deepClone(next)
  return lastSync
}

/** 把当前状态全量写入资料库（首次连接 / 全新资料库时使用） */
export async function publishToLibrary(state: MyTabState, request = true): Promise<LibrarySyncResult> {
  const files = stateToFiles(state, { format: LIBRARY_FORMAT, createdAt: state.meta.createdAt })
  lastSync = await writeLibraryFiles(files, request)
  if (lastSync.ok) lastSynced = deepClone(state)
  return lastSync
}

export interface LibraryLoadResult extends LibraryScanResult {
  state?: MyTabState
  isNew: boolean
}

/**
 * 从资料库重新读取全部内容（这就是「Finder 里的改动都认」）。
 * 读到的结果覆盖缓存，settings 仍以本机为准。
 */
export async function loadFromLibrary({ request = false }: { request?: boolean } = {}): Promise<LibraryLoadResult> {
  const local = await loadState({ force: true })
  const res = await readLibrary(request)
  if (!res.ok) {
    return { ok: false, groups: 0, items: 0, conflicts: [], isNew: false, reason: res.reason }
  }

  lastConflicts = res.conflicts
  const settings: Settings = local.settings
  const state = filesToState(res.files, { deviceId: local.meta.deviceId, settings })
  // 库创建时间优先用文件里的；设备身份沿用本机
  state.meta.deviceId = local.meta.deviceId

  const items = state.groups.reduce((n, g) => n + g.items.length, 0)
  return {
    ok: true,
    groups: state.groups.length,
    items,
    conflicts: res.conflicts,
    isNew: res.isNew,
    state
  }
}

/** 用资料库内容替换本地缓存（不改动磁盘），并把它记为「已同步」基线 */
export async function adoptLibraryState(state: MyTabState): Promise<MyTabState> {
  lastSynced = deepClone(state)
  return saveState(state)
}

/* --------------------------- 事务式变更 --------------------------- */

/**
 * 事务式更新：读取最新状态 → 应用 mutator → 写缓存 → 差异同步到资料库。
 *
 * mutator 是「原地修改」的，所以先深拷贝一份用于计算差异。
 */
export async function mutate<R extends MutationOutcome>(mutator: (state: MyTabState) => R): Promise<R> {
  const current = await loadState({ force: true })
  const before = deepClone(current)
  const result = mutator(current)
  await saveState(result.state)
  await syncToLibrary(result.state, before).catch((e: unknown) => {
    lastSync = { ok: false, written: 0, trashed: 0, reason: (e as Error)?.message || 'WRITE_FAILED' }
  })
  return result
}

/* --------------------------- 变更订阅 --------------------------- */

/**
 * 监听缓存变化（同浏览器内的多页面实时同步）。
 * @returns 取消订阅函数
 */
export function subscribe(cb: (state: MyTabState) => void): () => void {
  if (hasChromeStorage()) {
    const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
      if (area !== 'local' || !changes[STORAGE_KEY]) return
      cachedState = null
      const raw = changes[STORAGE_KEY]!.newValue
      void getDeviceId().then((deviceId) => cb(normalizeState(raw, deviceId)))
    }
    chrome.storage.onChanged.addListener(handler)
    return () => chrome.storage.onChanged.removeListener(handler)
  }

  const handler = (e: StorageEvent): void => {
    if (e.key && e.key !== STORAGE_KEY) return
    cachedState = null
    void loadState({ force: true }).then(cb)
  }
  globalThis.addEventListener?.('storage', handler)
  return () => globalThis.removeEventListener?.('storage', handler)
}

/* --------------------------- 导入 / 重置 --------------------------- */

/** 用外部数据整体替换状态（导入），并同步到资料库 */
export async function replaceState(raw: unknown): Promise<MyTabState> {
  const deviceId = await getDeviceId()
  const before = await loadState({ force: true })
  const snapshot = deepClone(before)
  const next = normalizeState(raw, deviceId)
  next.meta.updatedAt = now()
  next.settings = { ...before.settings }
  await saveState(next)
  await syncToLibrary(next, snapshot).catch(() => undefined)
  return next
}

/** 恢复出厂：清空本地缓存与资料库内容 */
export async function resetAll(): Promise<MyTabState> {
  const before = await loadState({ force: true })
  const snapshot = deepClone(before)
  await rawRemove(STORAGE_KEY)
  cachedState = null
  const deviceId = await getDeviceId()
  const next = emptyState(deviceId)
  next.settings = { ...before.settings }
  await saveState(next)
  await syncToLibrary(next, snapshot).catch(() => undefined)
  return next
}

/** 仅清空列表数据，保留设置（资料库里的组文件会被移进 _trash/） */
export function resetData(): Promise<MutationOutcome> {
  return mutate((s) => {
    s.groups = []
    s.folders = []
    s.quickList = []
    s.meta.updatedAt = now()
    return { state: s }
  })
}

/** 当前存储占用（字节，近似） */
export function storageUsage(): Promise<number> {
  if (hasChromeStorage() && chrome.storage.local.getBytesInUse) {
    return new Promise((resolve) => chrome.storage.local.getBytesInUse(null, (n) => resolve(n || 0)))
  }
  let total = 0
  const ls = globalThis.localStorage
  for (let i = 0; i < (ls?.length || 0); i++) {
    const k = ls!.key(i)
    total += (k?.length || 0) + (ls!.getItem(k!)?.length || 0)
  }
  return Promise.resolve(total)
}

export { LIB_FILE }
