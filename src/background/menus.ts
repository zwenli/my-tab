/**
 * 右键菜单：按范围收集 + 打开列表。
 */
import { MENU } from '@/core/constants'
import { openListPage } from '@/core/tabs'
import { collect } from './collect'
import type { CollectMode, CollectResult } from '@/types'

export interface MenuClickOutcome {
  ok: boolean
  reason?: string
  count?: number
}

/** 创建全部右键菜单项（幂等：先清空再建） */
export function buildMenus(): void {
  if (typeof chrome === 'undefined' || !chrome.contextMenus) return
  const t = (key: string): string => chrome.i18n.getMessage(key)

  chrome.contextMenus.removeAll(() => {
    const create = (props: chrome.contextMenus.CreateProperties): void => {
      chrome.contextMenus.create(props)
    }
    create({ id: MENU.ROOT, title: t('extName') || 'MyTab', contexts: ['all'] })
    create({ id: MENU.COLLECT_ALL, parentId: MENU.ROOT, title: '收起全部标签', contexts: ['all'] })
    create({ id: MENU.COLLECT_CURRENT, parentId: MENU.ROOT, title: '只收起当前标签', contexts: ['all'] })
    create({ id: MENU.COLLECT_OTHERS, parentId: MENU.ROOT, title: '收起其他标签', contexts: ['all'] })
    create({ id: MENU.COLLECT_LEFT, parentId: MENU.ROOT, title: '收起左侧标签', contexts: ['all'] })
    create({ id: MENU.COLLECT_RIGHT, parentId: MENU.ROOT, title: '收起右侧标签', contexts: ['all'] })
    create({ id: MENU.COLLECT_SELECTED, parentId: MENU.ROOT, title: '收起选中的标签', contexts: ['all'] })
    create({ id: MENU.SEP, parentId: MENU.ROOT, type: 'separator', contexts: ['all'] })
    create({ id: MENU.OPEN_LIST, parentId: MENU.ROOT, title: '打开 MyTab 列表页', contexts: ['all'] })
  })
}

const MENU_MODES: Record<string, CollectMode> = {
  [MENU.COLLECT_ALL]: 'all',
  [MENU.COLLECT_CURRENT]: 'current',
  [MENU.COLLECT_OTHERS]: 'others',
  [MENU.COLLECT_LEFT]: 'left',
  [MENU.COLLECT_RIGHT]: 'right',
  [MENU.COLLECT_SELECTED]: 'selected'
}

/** 菜单点击处理 */
export async function handleMenuClick(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): Promise<CollectResult | null> {
  const menuId = String(info.menuItemId)
  const base = { windowId: tab?.windowId, tabId: tab?.id }

  if (menuId === MENU.OPEN_LIST) {
    await openListPage({ focus: true })
    return null
  }

  const mode = MENU_MODES[menuId]
  if (!mode) return null
  return collect({ mode, ...base })
}
