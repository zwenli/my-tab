/**
 * 高层用户动作：把「收起 / 恢复 / 导入导出 / 分享 / 资料库」这些意图统一封装，
 * 供列表页、弹窗页、设置页共用，避免各页面重复实现。
 *
 * 「File over app」之后，保存不是一个动作 —— 每次变更都会自动写进资料库文件。
 * 这里只保留两个显式入口：**写入资料库**（强推一次）与**重新扫描**（把磁盘改动读回来）。
 */
import { useDataStore } from '@/stores/data'
import { useUiStore } from '@/stores/ui'
import { useI18n } from './useI18n'
import type { Translator } from './useI18n'
import { collectViaBackground } from './useMessaging'
import { isFsAccessSupported, pickLibraryDir, forgetLibraryDir } from '@/core/library'
import { downloadFile, exportNames, exportToHtml, exportToSnapshot, exportToText, importAny } from '@/core/exportImport'
import { createGroup } from '@/core/model'
import { publishToLibrary } from '@/core/storage'
import { buildShareBundle as buildBundle, type BuildPayloadInput } from '@/core/share'
import { getDeviceId } from '@/core/storage'
import { openUrls } from '@/core/tabs'
import { copyText, isCollectableUrl } from '@/core/utils'
import type { CollectMode, CollectResult, ExportKind, Group, LibraryStatus, ShareBundle, TabItem } from '@/types'

/** 把后台返回的 reason 码翻译成人话 */
export function reasonText(t: Translator, reason?: string | null): string {
  if (!reason) return t('common.unknown')
  const key = `reason.${reason}`
  const text = t(key)
  return text === key ? String(reason) : text
}

export interface RestoreOptions {
  /** 还原后是否从列表中移除；null / undefined 表示沿用设置 */
  removeAfter?: boolean | null
  /** 还原到当前窗口还是新窗口；缺省沿用设置 */
  target?: 'current' | 'new'
  /** 不弹出提示 */
  quiet?: boolean
}

export interface ActionResult {
  ok: boolean
  reason?: string
}

export interface ImportSummary extends ActionResult {
  groups?: number
  tabs?: number
}

export interface SyncSummary extends ActionResult {
  written?: number
  trashed?: number
}

export interface ScanSummary extends ActionResult {
  groups?: number
  items?: number
  conflicts?: string[]
}

export interface UseActionsApi {
  collectWindow: (opts?: { openList?: boolean; mode?: CollectMode }) => Promise<CollectResult>
  restoreItems: (items: TabItem[], opts?: RestoreOptions) => Promise<number>
  restoreGroup: (group: Group, opts?: RestoreOptions) => Promise<number>
  restoreAll: () => Promise<number>
  copyLinks: (items: TabItem[]) => Promise<boolean>
  copyTextWithFeedback: (text: string, successKey?: string) => Promise<boolean>
  shareGroup: (group: Group) => void
  buildSharePayload: (input: BuildPayloadInput) => Promise<ShareBundle>
  exportList: (kind?: ExportKind) => Promise<void>
  importText: (text: string) => Promise<ImportSummary>
  pickAndImport: () => void
  /* 资料库 */
  libraryStatus: () => Promise<LibraryStatus>
  chooseLibraryDir: () => Promise<{ ok: boolean; name?: string; reason?: string }>
  forgetLibrary: () => Promise<void>
  restoreLibraryAccess: (opts?: { silent?: boolean }) => Promise<ActionResult>
  writeLibrary: (opts?: { silent?: boolean }) => Promise<SyncSummary>
  rescanLibrary: () => Promise<ScanSummary>
  /* 其他 */
  clearList: () => Promise<void>
  deleteGroup: (group: Group) => Promise<boolean>
  reasonText: (reason?: string | null) => string
  t: Translator
}

export function useActions(): UseActionsApi {
  const data = useDataStore()
  const ui = useUiStore()
  const { t } = useI18n()

  const fail = (prefixKey: string, reason?: string | null): void => {
    ui.toast(t(prefixKey, { reason: reasonText(t, reason) }), 'error')
  }

  /* ============================ 收集 ============================ */

  /**
   * 收起当前窗口的标签（走后台，保证「先留页面再关标签」的顺序安全）。
   * mode='auto' 时：标签栏有多选就只收选中的，否则收全部。
   */
  async function collectWindow({ openList = true, mode = 'auto' }: { openList?: boolean; mode?: CollectMode } = {}): Promise<CollectResult> {
    const res = await collectViaBackground({ mode, openList })
    if (res?.ok && (res.count ?? 0) > 0) {
      ui.toast(t('toast.collected', { n: res.count }), 'success')
      await data.refresh()
    } else if (res?.reason === 'NOTHING_TO_COLLECT') {
      ui.toast(t('toast.collectEmpty'), 'warning')
    } else if (res?.reason && res.reason !== 'NO_RUNTIME') {
      ui.toast(t('toast.error', { reason: reasonText(t, res.reason) }), 'error')
    }
    return res
  }

  /* ============================ 恢复 ============================ */

  /** 还原一组标签，返回实际打开的条数 */
  async function restoreItems(items: TabItem[] = [], opts: RestoreOptions = {}): Promise<number> {
    const list = (items || []).filter((i) => i && isCollectableUrl(i.url))
    if (!list.length) return 0

    const settings = data.settings
    const target = opts.target ?? settings.restoreTarget ?? 'current'
    // 未显式指定时一律以「设置」为准，避免各处调用点把设置覆盖掉
    const removeAfter = opts.removeAfter ?? !!settings.removeAfterRestore

    await openUrls(
      list.map((i) => i.url),
      { target }
    )

    if (removeAfter) {
      // 快捷列表里的条目是「常驻收藏」，打开后不参与移除
      const ids = list.map((i) => i.id).filter((id) => !!id && !!data.itemIndex.get(id)?.group)
      if (ids.length) await data.removeItems(ids, { pruneEmptyGroups: true })
    }

    if (!opts.quiet) ui.toast(t('toast.restored', { n: list.length }), 'success')
    return list.length
  }

  /** 恢复整组（默认跟随设置） */
  function restoreGroup(group: Group, opts: RestoreOptions = {}): Promise<number> {
    return restoreItems(group?.items ?? [], opts)
  }

  /** 恢复全部（列表中所有组的标签） */
  async function restoreAll(): Promise<number> {
    const all = data.groups.flatMap((g) => g.items)
    if (!all.length) return 0

    // 逐条移除在这里没有意义：整表还原要么清空列表，要么只把条目移掉（不留空壳组）
    const count = await restoreItems(all, { removeAfter: false, quiet: true })
    if (data.settings.clearListAfterRestore) await data.clearGroups()
    else if (data.settings.removeAfterRestore) await data.removeItems(all.map((i) => i.id), { pruneEmptyGroups: true })

    ui.toast(t('toast.restored', { n: count }), 'success')
    return count
  }

  /* ============================ 复制 ============================ */

  async function copyLinks(items: TabItem[] = []): Promise<boolean> {
    const text = (items || []).map((i) => i.url).filter(Boolean).join('\n')
    if (!text) return false
    return copyTextWithFeedback(text)
  }

  async function copyTextWithFeedback(text: string, successKey = 'common.copied'): Promise<boolean> {
    const ok = await copyText(text)
    ui.toast(ok ? t(successKey) : t('common.copyFailed'), ok ? 'success' : 'error')
    return ok
  }

  /* ============================ 分享 ============================ */

  function shareGroup(group: Group): void {
    if (!group) return
    ui.openDialog('share', {
      groupId: group.id,
      items: group.items.map((i) => ({ ...i })),
      title: group.title,
      note: group.note
    })
  }

  /** 生成分享所需的一切（链接 / 二维码 / 文本 / 独立 HTML） */
  const buildSharePayload = (input: BuildPayloadInput): Promise<ShareBundle> => buildBundle(input)

  /* ============================ 导出 / 导入 ============================ */

  async function exportList(kind: ExportKind = 'text'): Promise<void> {
    const state = data.state
    if (kind === 'json') {
      const deviceId = await getDeviceId()
      downloadFile(exportNames.json(), JSON.stringify(exportToSnapshot(state, deviceId), null, 2), 'application/json')
    } else if (kind === 'html') {
      downloadFile(exportNames.html(), exportToHtml(state), 'text/html')
    } else {
      downloadFile(exportNames.text(), exportToText(state), 'text/plain')
    }
    ui.toast(t('toast.indexExported'), 'success')
  }

  /** 导入一段文本（自动识别格式） */
  async function importText(text: string): Promise<ImportSummary> {
    const deviceId = await getDeviceId()
    const res = importAny(text, deviceId)
    if (!res.format || res.format === 'empty' || res.format === 'unknown') {
      fail('toast.importFailed', 'READ_FAILED')
      return { ok: false }
    }

    // JSON 快照：整体替换资料库内容（设置沿用本机）
    if (res.format === 'json' && res.state) {
      await data.importState(res.state)
      const groups = res.state.groups.length
      const tabs = res.state.groups.reduce((n, g) => n + g.items.length, 0)
      ui.toast(t('toast.imported', { groups, tabs }), 'success')
      return { ok: true, groups, tabs }
    }

    // 文本 / HTML：把解析出的组追加到列表
    const groups = [...(res.groups ?? [])].reverse()
    if (!groups.length) {
      fail('toast.importFailed', 'READ_FAILED')
      return { ok: false }
    }
    let tabCount = 0
    let groupCount = 0
    for (const g of groups) {
      const group = createGroup({ title: g.title, note: g.note, items: g.items })
      tabCount += group.items.length
      groupCount++
      await data.addGroup(group, 'top')
    }
    ui.toast(t('toast.imported', { groups: groupCount, tabs: tabCount }), 'success')
    return { ok: true, groups: groupCount, tabs: tabCount }
  }

  function pickAndImport(): void {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.txt,.html,.htm,text/plain,application/json,text/html'
    input.style.display = 'none'
    document.body.appendChild(input)
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      document.body.removeChild(input)
      if (!file) return
      void file
        .text()
        .then((text) => importText(text))
        .catch((e: unknown) => fail('toast.importFailed', (e as Error)?.message || 'READ_FAILED'))
    })
    input.click()
  }

  /* ============================ 资料库 ============================ */

  const libraryStatus = (): Promise<LibraryStatus> => data.refreshLibrary()

  /** 选择 / 新建资料库文件夹；空库自动把当前内容写出去，非空库则采纳库内容 */
  async function chooseLibraryDir(): Promise<{ ok: boolean; name?: string; reason?: string }> {
    if (!isFsAccessSupported()) return { ok: false, reason: 'UNSUPPORTED' }
    try {
      const handle = await pickLibraryDir()
      const res = await data.rescanFromLibrary()
      if (!res.ok) {
        fail('toast.libraryFailed', res.reason)
        return { ok: false, reason: res.reason }
      }
      ui.toast(t('toast.libraryConnected', { name: handle.name }), 'success')
      if (res.conflicts?.length) ui.toast(t('toast.libraryConflicts', { n: res.conflicts.length }), 'warning')
      return { ok: true, name: handle.name }
    } catch (e) {
      const err = e as { name?: string; message?: string }
      if (err?.name === 'AbortError') return { ok: false, reason: 'CANCELLED' }
      fail('toast.libraryFailed', err?.message || 'UNSUPPORTED')
      return { ok: false, reason: err?.message }
    }
  }

  /** 解除绑定（不动磁盘上的文件） */
  async function forgetLibrary(): Promise<void> {
    await forgetLibraryDir()
    await data.refreshLibrary()
    ui.toast(t('toast.libraryForgotten'), 'success')
  }

  /**
   * 恢复资料库访问：复用已保存的目录句柄重新授权，不需要重新选择文件夹。
   * 必须在用户手势（点击）里调用。
   */
  async function restoreLibraryAccess({ silent = false }: { silent?: boolean } = {}): Promise<ActionResult> {
    const res = await data.restoreAccess()
    if (res.ok) {
      if (!silent) ui.toast(t('toast.libraryAccessRestored'), 'success')
      return { ok: true }
    }
    if (!silent && res.reason !== 'BUSY') {
      ui.toast(t('toast.libraryAccessPending'), 'warning')
    }
    return { ok: false, reason: res.reason }
  }

  /** 立即把当前内容全量写入资料库（用户手势上下文，可弹授权） */
  async function writeLibrary({ silent = false }: { silent?: boolean } = {}): Promise<SyncSummary> {
    const res = await publishToLibrary(data.state, true)
    await data.refreshLibrary()
    if (!silent) {
      if (res.ok) ui.toast(t('toast.libraryWritten', { n: res.written }), 'success')
      else fail('toast.libraryFailed', res.reason)
    }
    return { ok: res.ok, written: res.written, trashed: res.trashed, reason: res.reason }
  }

  /** 重新扫描资料库（把 Finder / 云盘 / 其他设备的改动读进来） */
  async function rescanLibrary(): Promise<ScanSummary> {
    const res = await data.rescanFromLibrary()
    if (!res.ok) {
      if (res.reason !== 'CANCELLED') fail('toast.libraryFailed', res.reason)
      return { ok: false, reason: res.reason }
    }
    ui.toast(t('toast.libraryScanned', { groups: res.groups ?? 0, tabs: res.items ?? 0 }), 'success')
    if (res.conflicts?.length) ui.toast(t('toast.libraryConflicts', { n: res.conflicts.length }), 'warning')
    return { ok: true, groups: res.groups, items: res.items, conflicts: res.conflicts }
  }

  /* ============================ 其他 ============================ */

  async function clearList(): Promise<void> {
    const before = data.groups.length
    await data.clearGroups()
    const removed = Math.max(0, before - data.groups.length)
    ui.toast(t('toast.deleted', { n: removed }), 'success')
  }

  async function deleteGroup(group: Group): Promise<boolean> {
    if (group.locked) {
      ui.toast(t('group.deleteLocked'), 'warning')
      return false
    }
    await data.removeGroup(group.id)
    ui.toast(t('toast.deleted', { n: 1 }), 'success')
    return true
  }

  return {
    collectWindow,
    restoreItems,
    restoreGroup,
    restoreAll,
    copyLinks,
    copyTextWithFeedback,
    shareGroup,
    buildSharePayload,
    exportList,
    importText,
    pickAndImport,
    libraryStatus,
    chooseLibraryDir,
    forgetLibrary,
    restoreLibraryAccess,
    writeLibrary,
    rescanLibrary,
    clearList,
    deleteGroup,
    reasonText: (r) => reasonText(t, r),
    t
  }
}
