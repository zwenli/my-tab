/**
 * 资料库同步调度（运行在后台 service worker）。
 *
 * 「文件即真相」之后，这里不再有「备份」概念 —— 写盘就是保存本身。
 * 剩下的调度只有两件事：
 *
 * 1. **变更即落盘**：状态一变就差异写入资料库（防抖，避免频繁小文件写）。
 *    未绑定资料库时静默跳过（本地暂存模式）。
 * 2. **启动 / 回到扩展时重新扫描**：把 Finder、OneDrive 或其他设备带来的改动读进来。
 *
 * 注意：后台没有用户手势，无法弹授权框；权限必须事先在设置页授予过。
 */
import { getLibraryStatus, isFsAccessSupported } from '@/core/library'
import { adoptLibraryState, getLastSync, loadFromLibrary, loadState, syncToLibrary } from '@/core/storage'
import { debounce } from '@/core/utils'
import type { LibraryStatus, LibrarySyncResult } from '@/types'

export interface SyncLogEntry {
  at: number
  ok: boolean
  reason: string
  written: number
  trashed: number
}

const syncLog: SyncLogEntry = { at: 0, ok: false, reason: '', written: 0, trashed: 0 }

export const getSyncLog = (): SyncLogEntry => ({ ...syncLog })

/* ---------------------------- 写入 ---------------------------- */

/** 立即把当前状态差异写入资料库 */
export async function flushToLibrary({ request = false }: { request?: boolean } = {}): Promise<LibrarySyncResult> {
  const state = await loadState({ force: true })
  const res = await syncToLibrary(state, null, request)
  Object.assign(syncLog, { at: Date.now(), ok: res.ok, reason: res.reason ?? '', written: res.written, trashed: res.trashed })
  return res
}

const scheduleSync = debounce(() => void flushToLibrary(), 1200)

/** 缓存变化时调用（由 background/index.ts 的订阅触发） */
export function onStateChanged(): void {
  void getLibraryStatus()
    .then((status) => {
      if (status.connected) scheduleSync()
    })
    .catch(() => undefined)
}

/* ---------------------------- 读取 ---------------------------- */

export interface RescanOutcome {
  ok: boolean
  reason?: string
  groups?: number
  items?: number
  conflicts?: string[]
}

/**
 * 重新扫描资料库并把结果采纳为当前状态。
 * 这是「在 Finder 里改了文件，回到扩展就能看到」的入口。
 */
export async function rescanLibrary({ request = false }: { request?: boolean } = {}): Promise<RescanOutcome> {
  const res = await loadFromLibrary({ request })
  if (!res.ok || !res.state) return { ok: false, reason: res.reason, conflicts: res.conflicts }

  // 全新资料库（还没有 library.json）：把当前本地内容写出去，完成「落户」
  if (res.isNew) {
    const local = await loadState({ force: true })
    const wrote = await syncToLibrary(local, null, request)
    Object.assign(syncLog, { at: Date.now(), ok: wrote.ok, reason: wrote.reason ?? '', written: wrote.written, trashed: wrote.trashed })
    return { ok: wrote.ok, reason: wrote.reason, groups: local.groups.length, items: local.groups.reduce((n, g) => n + g.items.length, 0), conflicts: [] }
  }

  await adoptLibraryState(res.state)
  const items = res.state.groups.reduce((n, g) => n + g.items.length, 0)
  Object.assign(syncLog, { at: Date.now(), ok: true, reason: 'RESCANNED', written: 0, trashed: 0 })
  return { ok: true, groups: res.state.groups.length, items, conflicts: res.conflicts }
}

/** 启动时：若已连接资料库，先扫描一次，把其他设备 / Finder 的改动读进来 */
export async function scanOnStartup(): Promise<RescanOutcome> {
  if (!isFsAccessSupported()) return { ok: false, reason: 'UNSUPPORTED' }
  const status = await getLibraryStatus()
  if (!status.connected) return { ok: false, reason: status.hasDir ? 'NO_PERMISSION' : 'NO_DIR' }
  return rescanLibrary()
}

export async function libraryStatus(): Promise<LibraryStatus> {
  return getLibraryStatus()
}

export { getLastSync }
