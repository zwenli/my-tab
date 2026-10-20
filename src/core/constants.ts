/**
 * 常量与默认值定义。
 */
import type { SettingSection, Settings } from '../types'

export const SCHEMA_VERSION = 1

/** 本地缓存键：资料库内容的镜像 + 本机设置。可随时删除并从资料库重建。 */
export const STORAGE_KEY = 'mytab:state'

/** 本设备的稳定标识 */
export const DEVICE_KEY = 'mytab:deviceId'

/** 资料库格式标识（写在 library.json 里） */
export const LIBRARY_FORMAT = 'my-tab'

/** JSON 导出 / 导入用的快照容器格式标识（不落进资料库） */
export const SNAPSHOT_FORMAT = 'my-tab-snapshot'

/** 分享页载荷格式标识 */
export const SHARE_FORMAT = 'my-tab-share'

/** IndexedDB：资料库目录句柄存储 */
export const IDB_NAME = 'mytab-fs'
export const IDB_STORE = 'handles'
export const IDB_DIR_KEY = 'libraryDirHandle'

/** 消息类型（页面 ↔ 后台） */
export const MSG = {
  COLLECT: 'collect',
  GET_TABS: 'get-tabs',
  OPEN_LIST: 'open-list',
  APPLY_PATCH: 'apply-patch',
  STATE_CHANGED: 'state-changed',
  RESTORE_ITEMS: 'restore-items',
  LIBRARY_STATUS: 'library-status',
  LIBRARY_SYNC: 'library-sync',
  LIBRARY_RESCAN: 'library-rescan',
  GET_STATS: 'get-stats',
  NOTIFY: 'notify',
  PING: 'ping'
} as const

export type MessageType = (typeof MSG)[keyof typeof MSG]

/** 默认设置 */
export const DEFAULT_SETTINGS: Settings = {
  /** 界面语言：auto | zh-CN | en-US */
  language: 'auto',
  /** 主题：auto | dark | light */
  theme: 'dark',
  /** 启动浏览器时自动打开列表页 */
  openListOnStartup: false,
  /** 收起时是否连同「固定标签」一起收起 */
  collectPinnedTabs: false,
  /** 重复标签策略：keep 保留 | skip 跳过 */
  duplicatePolicy: 'keep',
  /** 收集时是否排除当前（扩展页）标签 */
  skipListPage: true,
  /** 还原到：current 当前窗口 | new 新窗口 */
  restoreTarget: 'current',
  /** 还原后是否从列表中移除 */
  removeAfterRestore: true,
  /** 还原全部后是否清空列表 */
  clearListAfterRestore: false,
  /** 是否启用点击图标弹出的快捷弹窗 */
  enablePopup: true,
  /** 列表里是否显示站点图标 */
  showFavicons: true,
  /** 新组插入位置：top | bottom */
  newGroupPosition: 'top',
  /** 组内标签默认展开 */
  expandGroupsByDefault: false,
  /** 单组在列表中最多显示多少条（0 = 全部） */
  previewLimit: 0,
  /** 星标组是否强制置顶 */
  starPinsToTop: true,
  /** 搜索是否匹配网址 */
  searchInUrl: true,
  /** 收集中是否忽略固定的扩展页 */
  ignoreExtensionPages: true
}

/** 设置项的元数据，供设置页自动渲染 */
export const SETTING_GROUPS: readonly SettingSection[] = [
  {
    id: 'collect',
    titleKey: 'settings.groupCollect',
    items: [
      {
        key: 'collectPinnedTabs',
        type: 'boolean',
        labelKey: 'settings.collectPinned',
        hintKey: 'settings.collectPinnedHint'
      },
      {
        key: 'duplicatePolicy',
        type: 'select',
        labelKey: 'settings.duplicate',
        hintKey: 'settings.duplicateHint',
        options: [
          { value: 'keep', labelKey: 'settings.duplicateKeep' },
          { value: 'skip', labelKey: 'settings.duplicateSkip' }
        ]
      },
      {
        key: 'ignoreExtensionPages',
        type: 'boolean',
        labelKey: 'settings.ignoreExtensionPages',
        hintKey: 'settings.ignoreExtensionPagesHint'
      }
    ]
  },
  {
    id: 'restore',
    titleKey: 'settings.groupRestore',
    items: [
      {
        key: 'restoreTarget',
        type: 'select',
        labelKey: 'settings.restoreTarget',
        options: [
          { value: 'current', labelKey: 'settings.restoreCurrent' },
          { value: 'new', labelKey: 'settings.restoreNew' }
        ]
      },
      { key: 'removeAfterRestore', type: 'boolean', labelKey: 'settings.removeAfterRestore' },
      { key: 'clearListAfterRestore', type: 'boolean', labelKey: 'settings.clearListAfterRestore' }
    ]
  },
  {
    id: 'interface',
    titleKey: 'settings.groupInterface',
    items: [
      { key: 'enablePopup', type: 'boolean', labelKey: 'settings.enablePopup', hintKey: 'settings.enablePopupHint' },
      { key: 'openListOnStartup', type: 'boolean', labelKey: 'settings.openListOnStartup' },
      { key: 'showFavicons', type: 'boolean', labelKey: 'settings.showFavicons' },
      { key: 'starPinsToTop', type: 'boolean', labelKey: 'settings.starPins' },
      { key: 'searchInUrl', type: 'boolean', labelKey: 'settings.searchInUrl' },
      {
        key: 'newGroupPosition',
        type: 'select',
        labelKey: 'settings.newGroupPosition',
        options: [
          { value: 'top', labelKey: 'settings.positionTop' },
          { value: 'bottom', labelKey: 'settings.positionBottom' }
        ]
      }
    ]
  }
]

/** 右键菜单 id */
export const MENU = {
  ROOT: 'mytab-root',
  COLLECT_CURRENT: 'mytab-collect-current',
  COLLECT_OTHERS: 'mytab-collect-others',
  COLLECT_LEFT: 'mytab-collect-left',
  COLLECT_RIGHT: 'mytab-collect-right',
  COLLECT_ALL: 'mytab-collect-all',
  COLLECT_SELECTED: 'mytab-collect-selected',
  SEP: 'mytab-sep',
  OPEN_LIST: 'mytab-open-list'
} as const

export type MenuId = (typeof MENU)[keyof typeof MENU]
