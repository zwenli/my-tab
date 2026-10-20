/**
 * 浏览器标签页 API 封装（页面与后台共用）。
 * 统一 chrome.* 的回调风格为 Promise，并提供收集/还原所需的高层动作。
 */
import { isCollectableUrl } from './utils'
import type { CollectableTab, CollectMode } from '../types'

const hasTabs = (): boolean => typeof chrome !== 'undefined' && !!chrome.tabs
const hasWindows = (): boolean => typeof chrome !== 'undefined' && !!chrome.windows

/* ------------------------------ 基础查询 ------------------------------ */

export function queryTabs(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
  if (!hasTabs()) return Promise.resolve([])
  return new Promise((resolve) => chrome.tabs.query(queryInfo, (tabs) => resolve(tabs ?? [])))
}

export function getTab(tabId?: number | null): Promise<chrome.tabs.Tab | null> {
  if (!hasTabs() || tabId == null) return Promise.resolve(null)
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab) => resolve(chrome.runtime?.lastError ? null : tab))
  })
}

export function getCurrentWindow(): Promise<chrome.windows.Window | null> {
  if (!hasWindows()) return Promise.resolve(null)
  return new Promise((resolve) => {
    chrome.windows.getCurrent({}, (win) => resolve(chrome.runtime?.lastError ? null : win))
  })
}

export function getLastFocusedWindow(): Promise<chrome.windows.Window | null> {
  if (!hasWindows()) return Promise.resolve(null)
  return new Promise((resolve) => {
    chrome.windows.getLastFocused({ populate: false }, (win) => resolve(chrome.runtime?.lastError ? null : win))
  })
}

/* ------------------------------ 页面判定 ------------------------------ */

/** 列表页 URL 判定 */
export function isListPageUrl(url = ''): boolean {
  if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) return false
  return url.startsWith(chrome.runtime.getURL('list.html'))
}

export function isExtensionPageUrl(url = ''): boolean {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) return false
  return url.startsWith(`chrome-extension://${chrome.runtime.id}/`)
}

/* ------------------------------ 收集范围 ------------------------------ */

export interface ResolveContext {
  windowId?: number
  tabId?: number
}

/**
 * 计算需要收起的标签集合。
 * - auto：窗口里有多选（>1 个高亮标签）时只收选中的，否则等同 all
 */
export async function resolveTabsByMode(mode: CollectMode, { windowId }: ResolveContext = {}): Promise<chrome.tabs.Tab[]> {
  const win = windowId != null ? { id: windowId } : await getLastFocusedWindow()
  const winId = win?.id
  if (winId == null) return []

  const tabs = await queryTabs({ windowId: winId })
  if (!tabs.length) return []

  if (mode === 'selected' || mode === 'auto') {
    const highlighted = tabs.filter((t) => t.highlighted)
    // 只有真正多选（>1）时才用选中集
    if (highlighted.length > 1) return highlighted
    if (mode === 'selected') return tabs.filter((t) => t.active)
  }

  const active = tabs.find((t) => t.active) ?? tabs[tabs.length - 1]!
  const activeIndex = tabs.indexOf(active)

  switch (mode) {
    case 'current':
      return active ? [active] : []
    case 'others':
      return tabs.filter((t) => t.id !== active?.id)
    case 'left':
      return tabs.slice(0, activeIndex)
    case 'right':
      return tabs.slice(activeIndex + 1)
    case 'all':
    case 'auto':
    default:
      return tabs
  }
}

export interface FilterCollectableOptions {
  collectPinnedTabs?: boolean
  ignoreExtensionPages?: boolean
  /** 无论设置如何都要保留的标签（例如列表页自身） */
  keepTabId?: number | null
}

/** 过滤掉不应被收集的标签 */
export function filterCollectable(tabs: chrome.tabs.Tab[], opts: FilterCollectableOptions = {}): chrome.tabs.Tab[] {
  const { collectPinnedTabs = false, ignoreExtensionPages = true, keepTabId = null } = opts
  return tabs.filter((t) => {
    if (!t || t.id == null) return false
    if (t.id === keepTabId) return false
    if (t.pinned && !collectPinnedTabs) return false
    if (!isCollectableUrl(t.url ?? '')) return false
    if (ignoreExtensionPages && isExtensionPageUrl(t.url ?? '')) return false
    return true
  })
}

/** 把 chrome.tabs.Tab 归一为收集所需的最小结构 */
export function toCollectable(tab: chrome.tabs.Tab): CollectableTab {
  return {
    url: tab.url || tab.pendingUrl || '',
    title: tab.title || tab.url || '',
    favIconUrl: tab.favIconUrl || ''
  }
}

/* ------------------------------ 打开 / 关闭 ------------------------------ */

export interface OpenUrlsOptions {
  target?: 'current' | 'new'
  windowId?: number | null
  active?: boolean
}

/** 打开一组 URL，返回新建的标签 id */
export async function openUrls(urls: string[] = [], { target = 'current', windowId = null, active = false }: OpenUrlsOptions = {}): Promise<Array<number | undefined>> {
  const list = urls.filter(Boolean)
  if (!list.length) return []

  if (target === 'new' && hasWindows()) {
    const win = await new Promise<chrome.windows.Window | null>((resolve) =>
      chrome.windows.create({ url: list[0], focused: true }, (w) => resolve(chrome.runtime?.lastError ? null : (w ?? null)))
    )
    if (!win) return []

    const created: Array<number | undefined> = [win.tabs?.[0]?.id]
    for (const url of list.slice(1)) {
      const t = await createTab({ url, windowId: win.id, active: false })
      if (t) created.push(t.id)
    }
    return created
  }

  const created: Array<number | undefined> = []
  for (const url of list) {
    const t = await createTab({ url, windowId: windowId ?? undefined, active })
    if (t) created.push(t.id)
  }
  return created
}

export function createTab(props: chrome.tabs.CreateProperties): Promise<chrome.tabs.Tab | null> {
  if (!hasTabs()) return Promise.resolve(null)
  return new Promise((resolve) => {
    chrome.tabs.create(props, (tab) => resolve(chrome.runtime?.lastError ? null : (tab ?? null)))
  })
}

export function closeTabs(tabIds: Array<number | undefined> = []): Promise<void> {
  const ids = tabIds.filter((id): id is number => id != null)
  if (!hasTabs() || !ids.length) return Promise.resolve()
  return new Promise((resolve) => chrome.tabs.remove(ids, () => resolve()))
}

export function activateTab(tabId: number): Promise<void> {
  if (!hasTabs()) return Promise.resolve()
  return new Promise((resolve) => chrome.tabs.update(tabId, { active: true }, () => resolve()))
}

export function updateTab(tabId: number, props: chrome.tabs.UpdateProperties): Promise<chrome.tabs.Tab | null> {
  if (!hasTabs()) return Promise.resolve(null)
  return new Promise((resolve) => chrome.tabs.update(tabId, props, (t) => resolve(chrome.runtime?.lastError ? null : (t ?? null))))
}

/* ------------------------------ 列表页 ------------------------------ */

export interface OpenListOptions {
  windowId?: number | null
  search?: string
  focus?: boolean
}

/** 打开（或聚焦）MyTab 列表页 */
export async function openListPage({ windowId = null, search = '', focus = true }: OpenListOptions = {}): Promise<chrome.tabs.Tab | null> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) return null
  const url = chrome.runtime.getURL('list.html') + (search ? `#q=${encodeURIComponent(search)}` : '')

  const existing = await queryTabs({})
  const found = existing.find((t) => isListPageUrl(t.url ?? ''))
  if (found?.id != null) {
    if (search) await updateTab(found.id, { url, active: focus })
    else if (focus) await updateTab(found.id, { active: true })
    if (focus && hasWindows() && found.windowId != null) {
      chrome.windows.update(found.windowId, { focused: true }, () => void chrome.runtime?.lastError)
    }
    return found
  }

  // 新标签页插入到最前面，避免打乱用户当前浏览位置
  return createTab({ url, windowId: windowId ?? undefined, active: focus, index: 0 })
}

/** 打开扩展内页面 */
export function openExtensionPage(page: string, hash = ''): Promise<chrome.tabs.Tab | null> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) return Promise.resolve(null)
  return createTab({ url: chrome.runtime.getURL(page) + hash, active: true })
}

/** 系统级通知（页面内的 toast 由页面自己实现） */
export function notify(title: string, message: string): void {
  if (typeof chrome === 'undefined' || !chrome.notifications) return
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title,
    message
  })
}
