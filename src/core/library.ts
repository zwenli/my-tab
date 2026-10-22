/**
 * 资料库（Library）：把「一个文件夹」当作唯一真相源。
 *
 * 分工：
 * - 本文件负责**碰磁盘**：拿目录句柄、读写文件、扫全库、同步差异。
 * - 文件长什么样由 libraryFormat.ts 决定（纯函数，可单测）。
 *
 * 三条与「File over app」对齐的原则：
 * 1. 真相在文件里 —— 每次写操作都把变更落到 .json 文件；本地存储只是可丢弃的缓存。
 * 2. Finder 里的操作都认 —— 每次读取都重新扫目录，改名 / 挪位置 / 手写文件都会被识别。
 * 3. 删除不抹掉 —— 扩展内删除的组会被移到 `_trash/`，与 Vimpo 的「移到废纸篓」一致。
 */
import { IDB_DIR_KEY, LIBRARY_FORMAT } from './constants'
import { idbDelete, idbGet, idbSet } from './idb'
import { libraryAccessLevel, isRestorable, type LibraryAccessLevel } from './libraryAccess'
import { FOLDERS_FILE, GROUPS_DIR, LIB_FILE, QUICK_FILE, TRASH_DIR, stateToFiles, isConflictCopy, groupFileName, type LibraryFiles } from './libraryFormat'
import { now } from './utils'
import type { MyTabState } from '../types'

/* ------------------------- 环境能力探测 ------------------------- */

export const isFsAccessSupported = (): boolean =>
  typeof globalThis.showDirectoryPicker === 'function' && typeof indexedDB !== 'undefined'

/** 带权限查询能力的目录句柄（lib.dom 对这两个方法的存在性不稳定，用交叉类型避免冲突） */
type PermHandle = FileSystemDirectoryHandle & {
  queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>
  requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>
  values?: () => AsyncIterableIterator<FileSystemHandle>
  entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>
}

const asPerm = (h: FileSystemDirectoryHandle): PermHandle => h as PermHandle

/* ------------------------- 目录句柄管理 ------------------------- */

let cachedDir: FileSystemDirectoryHandle | null = null

/** 读取已保存的资料库目录句柄 */
export async function getLibraryDir(): Promise<FileSystemDirectoryHandle | null> {
  if (cachedDir) return cachedDir
  try {
    cachedDir = await idbGet<FileSystemDirectoryHandle>(IDB_DIR_KEY)
    return cachedDir
  } catch {
    return null
  }
}

/** 让用户选择资料库目录（需要用户手势） */
export async function pickLibraryDir(): Promise<FileSystemDirectoryHandle> {
  const picker = globalThis.showDirectoryPicker
  if (typeof picker !== 'function') throw new Error('FS_ACCESS_UNSUPPORTED')
  const handle = await picker({ id: 'mytab-library', mode: 'readwrite', startIn: 'documents' })
  await idbSet(IDB_DIR_KEY, handle)
  cachedDir = handle
  return handle
}

/** 解除绑定（不动磁盘上的文件） */
export async function forgetLibraryDir(): Promise<void> {
  cachedDir = null
  try {
    await idbDelete(IDB_DIR_KEY)
  } catch {
    /* ignore */
  }
}

/** 校验 / 申请句柄权限；request=true 时才允许弹授权框（需要用户手势） */
export async function verifyPermission(
  handle: FileSystemDirectoryHandle | null,
  mode: 'read' | 'readwrite' = 'readwrite',
  request = false
): Promise<boolean> {
  if (!handle) return false
  const h = asPerm(handle)
  if (typeof h.queryPermission !== 'function') return true // 老实现没有权限查询，默认放行
  const opts = { mode }
  if ((await h.queryPermission(opts)) === 'granted') return true
  if (!request) return false
  if (typeof h.requestPermission !== 'function') return false
  return (await h.requestPermission(opts)) === 'granted'
}

/**
 * 恢复资料库访问：复用 IndexedDB 里已有的目录句柄重新申请授权。
 *
 * 必须在用户手势里调用（点击）。它**不会**弹文件夹选择器：
 * 浏览器只是问一句「是否允许继续访问这个文件夹」，所以用户不用重新找一遍目录。
 * 若权限已被彻底拒绝（denied）或句柄失效，返回 false，此时才需要重新选择文件夹。
 */
export async function restoreLibraryAccess(): Promise<boolean> {
  const dir = await getLibraryDir()
  if (!dir) return false
  try {
    return await verifyPermission(dir, 'readwrite', true)
  } catch {
    return false
  }
}

export interface LibraryStatus {
  supported: boolean
  /** 已绑定目录且权限有效 */
  connected: boolean
  hasDir: boolean
  dirName: string
  permission: PermissionState | 'none' | 'error'
  /**
   * 访问等级（见 core/libraryAccess.ts）。
   * `needs-grant` 表示「绑定还在，只差一次重新确认」，不能当成「未连接」。
   */
  level: LibraryAccessLevel
}

export async function getLibraryStatus(): Promise<LibraryStatus> {
  const supported = isFsAccessSupported()
  const dir = await getLibraryDir()

  let permission: LibraryStatus['permission'] = 'none'
  if (dir) {
    try {
      const h = asPerm(dir)
      permission = typeof h.queryPermission === 'function' ? await h.queryPermission({ mode: 'readwrite' }) : 'granted'
    } catch {
      permission = 'error'
    }
  }

  return {
    supported,
    hasDir: !!dir,
    dirName: dir?.name ?? '',
    permission,
    connected: supported && !!dir && permission === 'granted',
    level: libraryAccessLevel({ supported, hasDir: !!dir, permission })
  }
}

/* --------------------------- 底层文件读写 --------------------------- */

const splitPath = (path: string): { dir: string[]; name: string } => {
  const parts = path.split('/').filter(Boolean)
  return { dir: parts.slice(0, -1), name: parts[parts.length - 1] ?? '' }
}

/** 按相对路径逐级取到所在目录（必要时创建） */
async function ensureParentDir(root: FileSystemDirectoryHandle, segments: string[], create: boolean): Promise<FileSystemDirectoryHandle> {
  let dir = root
  for (const seg of segments) dir = await dir.getDirectoryHandle(seg, { create })
  return dir
}

async function readTextFile(root: FileSystemDirectoryHandle, path: string): Promise<string | null> {
  const { dir, name } = splitPath(path)
  try {
    let cur = root
    for (const seg of dir) cur = await cur.getDirectoryHandle(seg)
    const fh = await cur.getFileHandle(name)
    const file = await fh.getFile()
    return await file.text()
  } catch {
    return null
  }
}

async function writeTextFile(root: FileSystemDirectoryHandle, path: string, text: string): Promise<void> {
  const { dir, name } = splitPath(path)
  const parent = await ensureParentDir(root, dir, true)
  const fh = await parent.getFileHandle(name, { create: true })
  const writable = await fh.createWritable()
  await writable.write(new Blob([text], { type: 'application/json' }))
  await writable.close()
}

/** 把文件移到 `_trash/<时间戳>-<原名>`，而不是直接删掉 */
async function trashFile(root: FileSystemDirectoryHandle, path: string): Promise<void> {
  const { dir, name } = splitPath(path)
  const text = await readTextFile(root, path)
  if (text == null) return
  try {
    const trash = await root.getDirectoryHandle(TRASH_DIR, { create: true })
    const stamp = new Date(now()).toISOString().replace(/[:.]/g, '-')
    const target = await trash.getFileHandle(`${stamp}-${name}`, { create: true })
    const writable = await target.createWritable()
    await writable.write(new Blob([text], { type: 'application/json' }))
    await writable.close()
    // 复制成功后才移除原文件 —— 否则下次扫描会把它读回来，删除就等于没删
    const parent = await ensureParentDir(root, dir, false)
    await parent.removeEntry(name)
  } catch {
    /* 进不了回收站也不阻塞主流程 */
  }
}

/** 列出某目录下的直接子文件名 */
async function listDir(root: FileSystemDirectoryHandle, segments: string[] = []): Promise<string[]> {
  const names: string[] = []
  try {
    let cur = root
    for (const seg of segments) cur = await cur.getDirectoryHandle(seg)
    const p = asPerm(cur)
    if (typeof p.entries === 'function') {
      for await (const [name] of p.entries()) names.push(name)
    } else if (typeof p.values === 'function') {
      for await (const handle of p.values()) names.push(handle.name)
    }
  } catch {
    /* 目录不存在 = 空 */
  }
  return names
}

/* ---------------------------- 读整个库 ---------------------------- */

export interface ReadLibraryResult {
  ok: boolean
  /** 相对路径 → 文本内容 */
  files: LibraryFiles
  /** 检测到的云盘冲突副本（只提示，不自动合并） */
  conflicts: string[]
  /** 目录里还没有 library.json（空目录 / 首次使用） */
  isNew: boolean
  reason?: string
}

/**
 * 扫描整个资料库目录，把所有 .json 读进内存。
 * 每次调用都重新扫盘 —— 这就是「Finder 里的改动都认」的实现方式。
 */
export async function readLibrary(request = false): Promise<ReadLibraryResult> {
  const dir = await getLibraryDir()
  if (!dir) return { ok: false, files: {}, conflicts: [], isNew: false, reason: 'NO_DIR' }
  if (!(await verifyPermission(dir, 'readwrite', request))) {
    return { ok: false, files: {}, conflicts: [], isNew: false, reason: 'NO_PERMISSION' }
  }

  const files: LibraryFiles = {}
  const conflicts: string[] = []

  const rootNames = await listDir(dir)
  for (const name of rootNames) {
    if (isConflictCopy(name)) {
      conflicts.push(name)
      continue
    }
    if (name !== LIB_FILE && name !== FOLDERS_FILE && name !== QUICK_FILE) continue
    const text = await readTextFile(dir, name)
    if (text != null) files[name] = text
  }

  const groupNames = await listDir(dir, [GROUPS_DIR])
  for (const name of groupNames) {
    if (!name.endsWith('.json')) continue
    if (isConflictCopy(name)) {
      conflicts.push(`${GROUPS_DIR}/${name}`)
      continue
    }
    const text = await readTextFile(dir, `${GROUPS_DIR}/${name}`)
    if (text != null) files[`${GROUPS_DIR}/${name}`] = text
  }

  return { ok: true, files, conflicts, isNew: !files[LIB_FILE] }
}

/* --------------------------- 写（差异同步） --------------------------- */

export interface SyncResult {
  ok: boolean
  written: number
  trashed: number
  reason?: string
}

/** 一次性把整个文件集写进资料库（首次建立 / 全量覆盖时使用） */
export async function writeLibraryFiles(files: LibraryFiles, request = false): Promise<SyncResult> {
  const dir = await getLibraryDir()
  if (!dir) return { ok: false, written: 0, trashed: 0, reason: 'NO_DIR' }
  if (!(await verifyPermission(dir, 'readwrite', request))) {
    return { ok: false, written: 0, trashed: 0, reason: 'NO_PERMISSION' }
  }
  let written = 0
  try {
    for (const [path, text] of Object.entries(files)) {
      await writeTextFile(dir, path, text)
      written++
    }
    return { ok: true, written, trashed: 0 }
  } catch (e) {
    return { ok: false, written, trashed: 0, reason: (e as Error)?.message || 'WRITE_FAILED' }
  }
}

/**
 * 差异同步：只写变化的文件，把不再存在的组移进回收站。
 * 这是所有写操作的统一出口 —— 状态变完，交给它落盘。
 */
export async function syncLibrary(
  next: MyTabState,
  opts: { prev?: MyTabState | null; createdAt?: number; request?: boolean } = {}
): Promise<SyncResult> {
  const dir = await getLibraryDir()
  if (!dir) return { ok: false, written: 0, trashed: 0, reason: 'NO_DIR' }
  if (!(await verifyPermission(dir, 'readwrite', opts.request ?? false))) {
    return { ok: false, written: 0, trashed: 0, reason: 'NO_PERMISSION' }
  }

  const nextFiles = stateToFiles(next, { format: LIBRARY_FORMAT, createdAt: opts.createdAt })
  const prevFiles = opts.prev ? stateToFiles(opts.prev, { format: LIBRARY_FORMAT, createdAt: opts.createdAt }) : null

  let written = 0
  let trashed = 0

  try {
    for (const [path, text] of Object.entries(nextFiles)) {
      if (prevFiles && prevFiles[path] === text) continue
      await writeTextFile(dir, path, text)
      written++
    }

    // 被删掉的组：移进回收站（而不是抹掉）
    if (prevFiles) {
      for (const path of Object.keys(prevFiles)) {
        if (!path.startsWith(`${GROUPS_DIR}/`)) continue
        if (nextFiles[path]) continue
        await trashFile(dir, path)
        trashed++
      }
    }

    return { ok: true, written, trashed }
  } catch (e) {
    return { ok: false, written, trashed, reason: (e as Error)?.message || 'WRITE_FAILED' }
  }
}

export { groupFileName, LIBRARY_FORMAT, libraryAccessLevel, isRestorable }
export type { LibraryAccessLevel }
