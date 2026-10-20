/**
 * MyTab 全局类型定义。
 *
 * 这一层只描述「数据长什么样」，不含任何运行时代码，
 * 因此 core / stores / background / 页面 可以共同依赖它而不产生循环引用。
 */

/* ============================ 基础实体 ============================ */

/** 待办标记 */
export interface TaskFlag {
  done: boolean
  completedAt: number | null
}

/** 一条被保存的网页链接 */
export interface TabItem {
  id: string
  url: string
  title: string
  favIconUrl: string
  createdAt: number
  updatedAt: number
  deletedAt: number | null
  starred: boolean
  task: TaskFlag | null
  note: string
}

/** 一次「收起」产生的标签组，是列表里的基本卡片单位 */
export interface Group {
  id: string
  title: string
  note: string
  folderId: string | null
  starred: boolean
  locked: boolean
  color: string | null
  collapsed: boolean
  createdAt: number
  updatedAt: number
  deletedAt: number | null
  items: TabItem[]
}

/** 文件夹：容纳多个标签组，形成「文件夹 → 组 → 标签」两级结构 */
export interface Folder {
  id: string
  name: string
  color: string | null
  collapsed: boolean
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

/* ============================== 设置 ============================== */

export type LanguagePref = 'auto' | 'zh-CN' | 'en-US'
export type ThemePref = 'auto' | 'dark' | 'light'
export type DuplicatePolicy = 'keep' | 'skip'
export type RestoreTarget = 'current' | 'new'
export type NewGroupPosition = 'top' | 'bottom'

export interface Settings {
  language: LanguagePref
  theme: ThemePref
  openListOnStartup: boolean
  collectPinnedTabs: boolean
  duplicatePolicy: DuplicatePolicy
  skipListPage: boolean
  restoreTarget: RestoreTarget
  removeAfterRestore: boolean
  clearListAfterRestore: boolean
  enablePopup: boolean
  showFavicons: boolean
  newGroupPosition: NewGroupPosition
  expandGroupsByDefault: boolean
  previewLimit: number
  starPinsToTop: boolean
  searchInUrl: boolean
  ignoreExtensionPages: boolean
}

export type SettingKey = keyof Settings

export interface SettingOption {
  value: string
  labelKey: string
}

export interface SettingItem {
  key: SettingKey
  type: 'boolean' | 'select' | 'slot'
  labelKey: string
  hintKey?: string
  options?: SettingOption[]
}

export interface SettingSection {
  id: string
  titleKey: string
  items: SettingItem[]
}

/** 设置补丁：允许部分字段 */
export type SettingsPatch = Partial<Settings>

/* ---------------------------- 变更补丁 ---------------------------- */

export type Position = 'top' | 'bottom'

/** 组上允许被直接修改的字段 */
export type GroupPatch = Partial<Pick<Group, 'title' | 'note' | 'folderId' | 'starred' | 'locked' | 'color' | 'collapsed'>>

/** 条目上允许被直接修改的字段 */
export type ItemPatch = Partial<Pick<TabItem, 'title' | 'starred' | 'task' | 'note'>>

/** 文件夹上允许被直接修改的字段 */
export type FolderPatch = Partial<Pick<Folder, 'name' | 'color' | 'collapsed'>>

/* ============================ 整体状态 ============================ */

export interface StateMeta {
  deviceId: string
  createdAt: number
  updatedAt: number
}

/**
 * 完整状态。
 *
 * 注意：`groups` / `folders` / `quickList` 只是资料库文件在内存中的镜像，
 * 真相源是用户文件夹里的 .json 文件；而 `settings` 属于「本机偏好」，只存本地。
 */
export interface MyTabState {
  schemaVersion: number
  meta: StateMeta
  folders: Folder[]
  groups: Group[]
  quickList: TabItem[]
  settings: Settings
}

/** 统计概览 */
export interface Stats {
  groupCount: number
  tabCount: number
  quickCount: number
  folderCount: number
  starredCount: number
  lockedCount: number
  taskOpen: number
  domainCount: number
}

/* ============================ 收集与还原 ============================ */

export type CollectMode = 'all' | 'auto' | 'current' | 'others' | 'left' | 'right' | 'selected'

/** 从浏览器标签归一化出来的最小结构 */
export interface CollectableTab {
  url: string
  title: string
  favIconUrl: string
}

export interface CollectOptions {
  mode?: CollectMode
  windowId?: number
  tabId?: number
  openList?: boolean
  title?: string
}

export interface CollectResult {
  ok: boolean
  reason?: string
  count?: number
  skipped?: number
  groupId?: string | null
  title?: string
  mode?: CollectMode
}

/* ============================ 检索 ============================ */

export interface SearchHit {
  item: TabItem
  group: Group | null
  score: number
  host: string
}

export interface SearchOptions {
  searchInUrl?: boolean
}

/* ============================ 导出 / 导入 ============================ */

export type ExportKind = 'text' | 'json' | 'html'
export type ImportFormat = 'json' | 'html' | 'text' | 'empty' | 'unknown'

/** JSON 快照：导出 / 导入时使用的一次性容器（资料库本身不是这种格式） */
export interface SnapshotMeta {
  format: string
  schemaVersion: number
  deviceId: string
  exportedAt: number
}

export interface Snapshot extends SnapshotMeta {
  store: MyTabState
}

/** parseSnapshot 的返回值：把 store 摊平为 state */
export interface ParsedSnapshot extends SnapshotMeta {
  state: MyTabState
}

export interface ImportResult {
  state: MyTabState | null
  groups: Group[]
  format: ImportFormat
}

/* ============================== 分享 ============================== */

export interface ShareItem {
  url: string
  title: string
  starred: boolean
}

export interface SharePayload {
  format: string
  schemaVersion: number
  title: string
  note: string
  color: string | null
  createdAt: number
  source: string
  items: ShareItem[]
}

export interface ShareBundle {
  payload: SharePayload
  packed: string
  url: string
}

/* ============================ 资料库 ============================ */

export type LibraryReason =
  | 'NO_DIR'
  | 'NO_PERMISSION'
  | 'UNSUPPORTED'
  | 'BUSY'
  | 'NOTHING_TO_COLLECT'
  | 'READ_FAILED'
  | 'WRITE_FAILED'
  | 'CANCELLED'
  | 'NO_RUNTIME'
  | 'INTERNAL_ERROR'
  | 'UNKNOWN_MESSAGE'
  | 'COLLECT_FAILED'

/** 资料库连接状态 */
export interface LibraryStatus {
  supported: boolean
  hasDir: boolean
  dirName: string
  permission: PermissionState | 'none' | 'error'
  connected: boolean
}

/** 一次差异同步的结果 */
export interface LibrarySyncResult {
  ok: boolean
  written: number
  trashed: number
  reason?: string
}

/** 一次重新扫描（从文件重建状态）的结果 */
export interface LibraryScanResult {
  ok: boolean
  groups: number
  items: number
  /** 云盘冲突副本文件（只提示，不自动合并） */
  conflicts: string[]
  reason?: string
}

/* ============================ 消息协议 ============================ */

export interface MessageEnvelope<T = unknown> {
  type: string
  payload?: T
}

/** 所有消息响应的公共形状 */
export interface BaseResponse {
  ok: boolean
  reason?: string
}

export interface CollectResponse extends BaseResponse, CollectResult {}
export interface StatsResponse extends BaseResponse {
  stats: Stats
  updatedAt: number
}
export interface LibraryStatusResponse extends BaseResponse {
  status: LibraryStatus
}

/* ============================ 界面辅助 ============================ */

/** 下拉选项（value + 已翻译的显示文案） */
export interface SelectOption {
  value: string
  label: string
}

/** 下拉菜单项 */
export interface MenuItem {
  key?: string
  label?: string
  icon?: string
  danger?: boolean
  disabled?: boolean
  /** 渲染为分隔线 */
  separator?: boolean
  /** 显示勾选标记 */
  checked?: boolean
}

/** 条目 + 所属组（搜索结果、多选批量操作使用） */
export interface ItemRef {
  item: TabItem
  group: Group | null
}

export type ToastType = 'info' | 'success' | 'warning' | 'error'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface Toast {
  id: number
  message: string
  type: ToastType
  action: ToastAction | null
}

export type DialogName = 'confirm' | 'prompt' | 'move' | 'share' | 'data'

export interface DialogEntry {
  name: DialogName
  props: Record<string, unknown>
  key: string
}

export type ScopeType = 'all' | 'quick' | 'starred' | 'locked' | 'tasks' | 'folder'

export interface DragPayload {
  kind: 'tab' | 'group' | 'quick'
  id: string
  groupId?: string
  index: number
  source?: string
}

export interface DropTarget {
  kind: 'group' | 'folder' | 'quick' | 'canvas'
  id: string
}
