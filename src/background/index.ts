/**
 * MyTab 后台服务（Manifest V3 Service Worker）。
 *
 * 职责：
 * - 生命周期初始化（默认数据、右键菜单、工具栏弹窗开关、徽标计数）
 * - 工具栏图标 / 快捷键 / 右键菜单触发的「收起标签」
 * - 地址栏（omnibox）检索已保存标签
 * - 页面消息路由
 * - 状态变更后差异写入资料库、启动时重新扫描资料库
 */
import { getDeviceId, loadState, saveState, subscribe } from '@/core/storage'
import { openListPage, queryTabs } from '@/core/tabs'
import { onStateChanged, scanOnStartup } from './librarySync'
import { collect, refreshBadge } from './collect'
import { buildMenus, handleMenuClick } from './menus'
import { handleInputChanged, handleInputEntered } from './omnibox'
import { handleMessage } from './router'
import type { OutgoingMessage } from './router'
import type { MyTabState } from '@/types'

/* ---------------------------- 初始化 ---------------------------- */

/** 首次安装时补齐设备标识 */
async function initState(): Promise<MyTabState> {
  const state = await loadState({ force: true })
  const deviceId = await getDeviceId()
  if (!state.meta.deviceId) {
    state.meta.deviceId = deviceId
    await saveState(state)
  }
  return state
}

/** 根据设置决定点击图标是「弹窗」还是「直接收起」 */
async function syncPopupMode(): Promise<void> {
  const state = await loadState({ force: true })
  try {
    await chrome.action.setPopup({ popup: state.settings.enablePopup ? 'popup.html' : '' })
  } catch {
    /* ignore */
  }
}

async function bootstrap({ openList = false }: { openList?: boolean } = {}): Promise<void> {
  await initState()
  buildMenus()
  await syncPopupMode()
  await refreshBadge()
  if (openList) await openListPage({ focus: true })
}

chrome.runtime.onInstalled.addListener((details) => {
  void bootstrap({ openList: details.reason === 'install' })
})

chrome.runtime.onStartup.addListener(() => {
  void (async (): Promise<void> => {
    await bootstrap()
    // 文件即真相：启动时先扫一遍资料库，把其他设备 / Finder 的改动读进来
    await scanOnStartup().catch(() => undefined)
    const state = await loadState({ force: true })
    if (state.settings.openListOnStartup) await openListPage({ focus: true })
  })()
})

/* ---------------------------- 工具栏图标 ---------------------------- */

// 仅在「关闭弹窗」设置下才会触发（开启了弹窗时由 popup 自行处理）
chrome.action.onClicked.addListener((tab) => {
  void collect({ mode: 'auto', windowId: tab.windowId, tabId: tab.id, openList: true })
})

/* ---------------------------- 快捷键 ---------------------------- */

chrome.commands?.onCommand.addListener((command) => {
  void (async (): Promise<void> => {
    const tabs = await queryTabs({ active: true, lastFocusedWindow: true })
    const tab = tabs[0]
    const base = { windowId: tab?.windowId, tabId: tab?.id }
    switch (command) {
      case 'collect-all-tabs':
        await collect({ mode: 'all', ...base })
        break
      case 'collect-current-tab':
        await collect({ mode: 'current', ...base })
        break
      case 'collect-other-tabs':
        await collect({ mode: 'others', ...base })
        break
      case 'open-list':
        await openListPage({ focus: true })
        break
      default:
        break
    }
  })()
})

/* ---------------------------- 右键菜单 ---------------------------- */

chrome.contextMenus?.onClicked.addListener((info, tab) => {
  void handleMenuClick(info, tab).catch(() => undefined)
})

/* ---------------------------- 地址栏搜索 ---------------------------- */

chrome.omnibox?.onInputChanged.addListener(handleInputChanged)
chrome.omnibox?.onInputEntered.addListener(handleInputEntered)

/* ---------------------------- 消息路由 ---------------------------- */

chrome.runtime.onMessage.addListener((message: OutgoingMessage, sender, sendResponse) => {
  void handleMessage(message, sender, sendResponse)
  return true // 异步响应
})

/* ---------------------------- 状态同步 ---------------------------- */

subscribe(() => {
  void refreshBadge().catch(() => undefined)
  void syncPopupMode().catch(() => undefined)
  onStateChanged()
})
