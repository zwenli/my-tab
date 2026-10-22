/**
 * 数据仓库：把 core/storage 的状态镜像成 Vue 响应式数据，并提供所有写操作入口。
 *
 * 写路径统一走 `run(mutator)`：mutate() 内部完成「读取最新状态 → 变更 → 写回」，
 * 其他页面/后台通过 chrome.storage.onChanged 自动获得更新。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getLibraryStatus, isFsAccessSupported, restoreLibraryAccess as restoreDirAccess } from '@/core/library'
import { computeStats, emptyState } from '@/core/model'
import * as M from '@/core/mutations'
import {
  adoptLibraryState,
  getLastSync,
  hasPendingWriteAsync,
  loadFromLibrary,
  loadState,
  mutate,
  publishToLibrary,
  replaceState,
  resetAll,
  resetData,
  saveState,
  storageUsage,
  subscribe,
  syncToLibrary
} from '@/core/storage'
import type {
  CollectableTab,
  Folder,
  FolderPatch,
  Group,
  GroupPatch,
  ItemPatch,
  ItemRef,
  LibraryStatus,
  LibrarySyncResult,
  MyTabState,
  Position,
  SettingsPatch,
  Stats,
  TabItem,
  TaskFlag
} from '@/types'

export interface CreateGroupFromItemsOptions {
  title?: string
  folderId?: string | null
  position?: Position
  toIndex?: number
}

export const useDataStore = defineStore('data', () => {
  const state = ref<MyTabState>(emptyState())
  const ready = ref(false)
  const usage = ref(0)
  const error = ref('')
  /** 资料库连接状态 */
  /** 资料库连接状态（能力探测同步给出，避免首帧显示「不支持」） */
  const library = ref<LibraryStatus>({
    supported: isFsAccessSupported(),
    hasDir: false,
    dirName: '',
    permission: 'none',
    connected: false,
    level: isFsAccessSupported() ? 'unbound' : 'unsupported'
  })
  /** 最近一次写入资料库的结果 */
  const lastSync = ref<LibrarySyncResult>({ ok: true, written: 0, trashed: 0 })
  /** 正在恢复资料库授权 */
  const restoring = ref(false)
  let unsubscribe: (() => void) | null = null

  /* ---------------------------- 初始化 ---------------------------- */

  async function init(): Promise<void> {
    try {
      state.value = await loadState({ force: true })
      ready.value = true
      usage.value = await storageUsage()
    } catch (e) {
      error.value = (e as Error)?.message || 'LOAD_FAILED'
    }
    void refreshLibrary()
    if (!unsubscribe) {
      unsubscribe = subscribe((s) => {
        state.value = s
        void storageUsage().then((n) => (usage.value = n))
      })
    }
  }

  /** 执行一次状态变更 */
  async function run<R extends M.MutationOutcome>(mutator: (s: MyTabState) => R): Promise<R> {
    const res = await mutate(mutator)
    state.value = res.state
    lastSync.value = getLastSync()
    usage.value = await storageUsage()
    return res
  }

  /** 刷新资料库连接状态 */
  async function refreshLibrary(): Promise<LibraryStatus> {
    library.value = await getLibraryStatus()
    return library.value
  }

  /**
   * 恢复资料库访问（浏览器重启后授权会被重置成 prompt，但目录句柄还在）。
   *
   * 必须在用户手势里调用。成功后按情况收尾：
   * - 授权失效期间有改动停在缓存里 → 补写进文件夹（否则这些改动只在本机）；
   * - 没有欠写 → 按「文件即真相」把磁盘上的最新内容读回来。
   */
  async function restoreAccess(): Promise<{ ok: boolean; reason?: string }> {
    if (restoring.value) return { ok: false, reason: 'BUSY' }
    restoring.value = true
    try {
      const granted = await restoreDirAccess()
      const st = await refreshLibrary()
      if (!granted || !st.connected) return { ok: false, reason: 'NO_PERMISSION' }

      if (await hasPendingWriteAsync()) {
        const res = await syncToLibrary(state.value)
        lastSync.value = getLastSync()
        if (!res.ok) return { ok: false, reason: res.reason }
      } else {
        const res = await loadFromLibrary({ request: false })
        if (res.ok && !res.isNew && res.state) state.value = await adoptLibraryState(res.state)
      }
      return { ok: true }
    } finally {
      restoring.value = false
    }
  }

  /**
   * 静默重扫：不弹授权框，只在权限仍有效时把磁盘上的改动读回来。
   * 对应「每次切回扩展，都重新扫一遍资料库」。
   */
  async function silentRescan(): Promise<void> {
    const st = await refreshLibrary()
    if (!st.connected) return
    const res = await loadFromLibrary({ request: false })
    if (res.ok && !res.isNew && res.state) state.value = await adoptLibraryState(res.state)
  }

  /**
   * 重新扫描资料库：把 Finder / 云盘 / 其他设备带来的改动读进来。
   * 若资料库还是空的（还没有 library.json），则把当前内容写出去完成「落户」。
   * 必须在用户手势里调用，否则拿不到目录授权。
   */
  async function rescanFromLibrary(): Promise<{ ok: boolean; groups?: number; items?: number; conflicts?: string[]; reason?: string }> {
    const res = await loadFromLibrary({ request: true })
    if (!res.ok) {
      await refreshLibrary()
      return { ok: false, reason: res.reason }
    }

    if (res.isNew) {
      const pub = await publishToLibrary(state.value, true)
      await refreshLibrary()
      const items = state.value.groups.reduce((n, g) => n + g.items.length, 0)
      return pub.ok
        ? { ok: true, groups: state.value.groups.length, items, conflicts: [] }
        : { ok: false, reason: pub.reason }
    }

    state.value = await adoptLibraryState(res.state as MyTabState)
    await refreshLibrary()
    return { ok: true, groups: res.groups, items: res.items, conflicts: res.conflicts }
  }

  /* ---------------------------- 派生数据 ---------------------------- */

  const groups = computed<Group[]>(() => state.value.groups ?? [])
  const folders = computed<Folder[]>(() => state.value.folders ?? [])
  const quickList = computed<TabItem[]>(() => state.value.quickList ?? [])
  const settings = computed<MyTabState['settings']>(() => state.value.settings)
  const meta = computed<MyTabState['meta']>(() => state.value.meta)
  const stats = computed<Stats>(() => computeStats(state.value))

  /** 全部条目（含所属组信息），供搜索 / 多选使用 */
  const allItems = computed<ItemRef[]>(() => {
    const out: ItemRef[] = []
    for (const g of groups.value) for (const it of g.items) out.push({ item: it, group: g })
    for (const it of quickList.value) out.push({ item: it, group: null })
    return out
  })

  const itemIndex = computed<Map<string, ItemRef>>(() => {
    const map = new Map<string, ItemRef>()
    for (const ref of allItems.value) map.set(ref.item.id, ref)
    return map
  })

  /** 星标组置顶后的显示顺序 */
  const displayGroups = computed<Group[]>(() => {
    const list = groups.value.slice()
    if (!settings.value.starPinsToTop) return list
    return [...list.filter((g) => g.starred), ...list.filter((g) => !g.starred)]
  })

  /* ---------------------------- 写操作 ---------------------------- */

  const api = {
    init,
    run,

    /* 标签组 */
    addGroup: (group: Group, position?: Position) => run((s) => M.addGroup(s, group, position)),
    collectTabs: (tabs: CollectableTab[], opts?: M.CollectTabsOptions) => run((s) => M.collectTabs(s, tabs, opts)),
    updateGroup: (id: string, patch: GroupPatch) => run((s) => M.updateGroup(s, id, patch)),
    renameGroup: (id: string, title: string) => run((s) => M.renameGroup(s, id, title)),
    toggleGroupStar: (id: string) => run((s) => M.toggleGroupStar(s, id)),
    toggleGroupLock: (id: string) => run((s) => M.toggleGroupLock(s, id)),
    toggleGroupCollapsed: (id: string) => run((s) => M.toggleGroupCollapsed(s, id)),
    removeGroup: (id: string) => run((s) => M.removeGroup(s, id)),
    removeGroups: (ids: string[]) => run((s) => M.removeGroups(s, ids)),
    /**
     * 一次性删除若干分组 + 若干条目（多选「删除勾选」）。
     * 合成单次 mutate，避免写两次资料库、也避免中途只删掉一半。
     */
    removeGroupsAndItems: (groupIds: string[], itemIds: string[]) =>
      run((s) => M.removeItems(M.removeGroups(s, groupIds).state, itemIds)),
    reorderGroups: (ids: string[]) => run((s) => M.reorderGroups(s, ids)),
    moveGroup: (id: string, index: number) => run((s) => M.moveGroup(s, id, index)),
    mergeGroups: (src: string, dst: string) => run((s) => M.mergeGroups(s, src, dst)),
    moveGroupsToFolder: (ids: string[], folderId: string | null) => run((s) => M.moveGroupsToFolder(s, ids, folderId)),

    /* 条目 */
    addItemsToGroup: (gid: string, tabs: CollectableTab[], index?: number) =>
      run((s) => M.addItemsToGroup(s, gid, tabs, index)),
    createGroupFromItems: (tabs: CollectableTab[], opts?: CreateGroupFromItemsOptions) =>
      run((s) => M.createGroupFromItems(s, tabs, opts)),
    updateItem: (id: string, patch: ItemPatch) => run((s) => M.updateItem(s, id, patch)),
    toggleItemStar: (id: string) => run((s) => M.toggleItemStar(s, id)),
    /**
     * 待办开关：没有待办时创建，有则完成 / 取消完成。
     * （core 层的 toggleItemTask 只处理「已有待办」的情况）
     */
    toggleItemTask: (id: string) => {
      const hasTask = !!itemIndex.value.get(id)?.item.task
      return run((s) => (hasTask ? M.toggleItemTask(s, id) : M.setItemTask(s, id, { done: false, completedAt: null })))
    },
    setItemTask: (id: string, task: TaskFlag | null) => run((s) => M.setItemTask(s, id, task)),
    setItemNote: (id: string, note: string) => run((s) => M.setItemNote(s, id, note)),
    removeItems: (ids: string[], opts?: M.RemoveItemsOptions) => run((s) => M.removeItems(s, ids, opts)),
    removeItem: (id: string) => run((s) => M.removeItem(s, id)),
    moveItemInGroup: (gid: string, from: number, to: number) => run((s) => M.moveItemInGroup(s, gid, from, to)),
    moveItemToGroup: (id: string, gid: string, index: number) => run((s) => M.moveItemToGroup(s, id, gid, index)),
    moveItemsToGroup: (ids: string[], gid: string, index: number) => run((s) => M.moveItemsToGroup(s, ids, gid, index)),
    clearGroups: () => run((s) => M.clearGroups(s)),

    /* 文件夹 */
    addFolder: (name: string, color?: string | null) => run((s) => M.addFolder(s, name, color ?? null)),
    updateFolder: (id: string, patch: FolderPatch) => run((s) => M.updateFolder(s, id, patch)),
    removeFolder: (id: string, opts?: M.RemoveFolderOptions) => run((s) => M.removeFolder(s, id, opts)),
    toggleFolderCollapsed: (id: string) => run((s) => M.toggleFolderCollapsed(s, id)),

    /* 快捷列表 */
    addToQuickList: (tabs: CollectableTab[], index?: number) => run((s) => M.addToQuickList(s, tabs, index)),
    copyItemsToQuickList: (ids: string[]) => run((s) => M.copyItemsToQuickList(s, ids)),
    reorderQuickList: (ids: string[]) => run((s) => M.reorderQuickList(s, ids)),
    moveQuickItem: (from: number, to: number) => run((s) => M.moveQuickItem(s, from, to)),

    /* 设置与维护 */
    updateSettings: (patch: SettingsPatch) => run((s) => M.updateSettings(s, patch)),
    tidy: (opts?: M.TidyOptions) => run((s) => M.tidy(s, opts)),

    /* 整体替换 / 重置 */
    async importState(raw: unknown): Promise<MyTabState> {
      const next = await replaceState(raw)
      state.value = next
      return next
    },
    async resetDataOnly(): Promise<MyTabState> {
      const res = await resetData()
      state.value = res.state
      return res.state
    },
    async factoryReset(): Promise<MyTabState> {
      const next = await resetAll()
      state.value = next
      return next
    },
    async refresh(): Promise<MyTabState> {
      state.value = await loadState({ force: true })
      usage.value = await storageUsage()
      return state.value
    },
    async saveStateDirect(next: MyTabState): Promise<MyTabState> {
      await saveState(next)
      state.value = next
      return next
    }
  }

  return {
    state,
    ready,
    usage,
    error,
    library,
    lastSync,
    restoring,
    groups,
    folders,
    quickList,
    settings,
    meta,
    stats,
    allItems,
    itemIndex,
    displayGroups,
    refreshLibrary,
    restoreAccess,
    rescanFromLibrary,
    silentRescan,
    ...api
  }
})
