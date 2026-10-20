/**
 * 收集标签：把浏览器标签折叠成一个 MyTab 标签组，并关闭原标签。
 */
import { collectTabs } from '@/core/mutations'
import { badgeText, countOpenTasks, defaultGroupTitle } from '@/core/model'
import { loadState, mutate } from '@/core/storage'
import {
  closeTabs,
  filterCollectable,
  getLastFocusedWindow,
  getTab,
  isListPageUrl,
  openListPage,
  queryTabs,
  resolveTabsByMode,
  toCollectable
} from '@/core/tabs'
import { now } from '@/core/utils'
import { resolveLocale } from '@/i18n'
import type { CollectOptions, CollectResult } from '@/types'

let collecting = false

/** 徽标底色：待办是「待处理」信号，用琥珀色与普通计数区分 */
const BADGE_COLOR = '#C98A12'

/** 与页面消息协议共用的收集参数 */
export type CollectParams = CollectOptions

/**
 * 收起标签。
 * mode='auto' 时：标签栏有多选就只收选中的，否则收全部。
 */
export async function collect({ mode = 'auto', windowId, tabId, openList = true, title = '' }: CollectParams = {}): Promise<CollectResult> {
  if (collecting) return { ok: false, reason: 'BUSY' }
  collecting = true

  try {
    const state = await loadState({ force: true })
    const settings = state.settings

    const win = windowId != null ? { id: windowId } : await getLastFocusedWindow()
    const winId = win?.id ?? windowId
    const allTabs = winId != null ? await queryTabs({ windowId: winId }) : await queryTabs({ currentWindow: true })

    const activeTab = tabId != null ? await getTab(tabId) : allTabs.find((t) => t.active)
    const scoped = await resolveTabsByMode(mode, { windowId: winId, tabId: activeTab?.id })

    const listTab = allTabs.find((t) => isListPageUrl(t.url ?? ''))
    const targets = filterCollectable(scoped, {
      collectPinnedTabs: settings.collectPinnedTabs,
      ignoreExtensionPages: settings.ignoreExtensionPages !== false,
      keepTabId: listTab?.id ?? null
    })

    if (!targets.length) return { ok: false, reason: 'NOTHING_TO_COLLECT', count: 0 }

    const items = targets.map(toCollectable)
    const locale = resolveLocale(settings.language)
    const groupTitle = title || defaultGroupTitle(items.length, now(), locale)

    const res = await mutate((s) => collectTabs(s, items, { title: groupTitle }))

    // 先保证窗口里还有页面，再关闭被收起的标签
    const targetIds = new Set(targets.map((t) => t.id))
    const remaining = allTabs.filter((t) => t.id == null || !targetIds.has(t.id))
    if (remaining.length === 0) await openListPage({ windowId: winId, focus: true })

    await closeTabs([...targetIds])

    if (openList && remaining.length > 0) await openListPage({ windowId: winId, focus: false })

    return {
      ok: true,
      count: items.length,
      skipped: res.skipped,
      groupId: res.group?.id ?? null,
      title: groupTitle,
      mode
    }
  } catch (e) {
    return { ok: false, reason: (e as Error)?.message || 'COLLECT_FAILED' }
  } finally {
    collecting = false
  }
}

/** 收起当前窗口（自动识别多选） */
export const collectAuto = (params: CollectParams = {}): Promise<CollectResult> => collect({ mode: 'auto', ...params })

/**
 * 刷新工具栏徽标：显示**未完成待办数**，而不是标签条目总数。
 *
 * 理由：收起的标签条目数对使用没有指导意义（收得越多数字越大，反而像噪音）；
 * 待办才是「还需要你去处理的事」，所以徽标只提示待办，没有待办就不显示数字。
 * 口径与侧边栏「待办」一致，见 core/model 的 countOpenTasks。
 */
export async function refreshBadge(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.action) return
  const state = await loadState()
  const text = badgeText(countOpenTasks(state))
  chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR })
  // Chrome 110+ 支持指定文字颜色；老版本忽略即可（默认白色）
  try {
    chrome.action.setBadgeTextColor?.({ color: '#FFFFFF' })
  } catch {
    /* ignore */
  }
  chrome.action.setBadgeText({ text })
}
