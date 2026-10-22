/**
 * 界面状态仓库：搜索、筛选范围、多选、拖拽、弹窗、提示。
 * 与持久化数据无关，刷新即重置。
 */
import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { uuid } from '@/core/utils'
import type { DialogEntry, DialogName, DragPayload, DropTarget, ScopeType, Toast, ToastType } from '@/types'

export const SCOPE = {
  ALL: 'all',
  QUICK: 'quick',
  STARRED: 'starred',
  LOCKED: 'locked',
  TASKS: 'tasks',
  FOLDER: 'folder'
} as const satisfies Record<string, ScopeType>

export interface ToastOptions {
  duration?: number
  action?: { label: string; onClick: () => void } | null
}

export const useUiStore = defineStore('ui', () => {
  /* ---------------------------- 搜索与筛选 ---------------------------- */

  const searchQuery = ref('')
  const scope = reactive<{ type: ScopeType; id: string | null }>({ type: SCOPE.ALL, id: null })

  function setScope(type: ScopeType, id: string | null = null): void {
    scope.type = type
    scope.id = id
    clearSelection()
  }

  function setSearch(q: string): void {
    searchQuery.value = q
  }

  /**
   * 「跳到某个分组」的请求。用对象 + 自增序号，保证对同一个组连续触发也能被 watch 到
   * （单纯存 id 的话第二次点击值没变，watch 不响应）。
   */
  const focusTarget = ref<{ id: string; nonce: number } | null>(null)
  let focusSeq = 0

  /** 清掉搜索与筛选，让目标组一定在画布里可见，再交给列表页滚动高亮 */
  function focusGroup(id: string): void {
    searchQuery.value = ''
    scope.type = SCOPE.ALL
    scope.id = null
    clearSelection()
    focusTarget.value = { id, nonce: ++focusSeq }
  }

  const isFiltering = computed<boolean>(() => !!searchQuery.value.trim() || scope.type !== SCOPE.ALL)

  /* ---------------------------- 多选 ---------------------------- */

  const selecting = ref(false)
  /**
   * 多选分成两个集合：条目（标签）与整组。
   * 两者 id 来源不同、动作语义也不同（删条目 ≠ 删组），混在一个 Set 里会让
   * 「勾选标签组 → 删除勾选」这类批量动作静默失效，所以必须分开存。
   */
  const itemSelection = ref<Set<string>>(new Set())
  const groupSelection = ref<Set<string>>(new Set())

  /** 选中的条目 id（拖拽、批量移动都按条目处理） */
  const selectedIds = computed<string[]>(() => [...itemSelection.value])
  /** 选中的分组 id */
  const selectedGroupIds = computed<string[]>(() => [...groupSelection.value])
  const selectedCount = computed<number>(() => itemSelection.value.size + groupSelection.value.size)
  const hasSelection = computed<boolean>(() => selectedCount.value > 0)

  function setSelecting(on: boolean): void {
    selecting.value = on
    if (!on) {
      itemSelection.value = new Set()
      groupSelection.value = new Set()
    }
  }

  /** 选中变空时自动退出多选模式 */
  function syncSelecting(): void {
    if (!hasSelection.value) selecting.value = false
  }

  function toggleItemSelected(id: string): void {
    const next = new Set(itemSelection.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    itemSelection.value = next
    syncSelecting()
  }

  function toggleGroupSelected(id: string): void {
    const next = new Set(groupSelection.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    groupSelection.value = next
    syncSelecting()
  }

  function isItemSelected(id: string): boolean {
    return itemSelection.value.has(id)
  }

  function isGroupSelected(id: string): boolean {
    return groupSelection.value.has(id)
  }

  function selectItems(ids: string[]): void {
    const next = new Set(itemSelection.value)
    for (const id of ids) next.add(id)
    itemSelection.value = next
    if (hasSelection.value) selecting.value = true
  }

  function clearSelection(): void {
    itemSelection.value = new Set()
    groupSelection.value = new Set()
    selecting.value = false
  }

  /* ---------------------------- 布局 ---------------------------- */

  const sidebarCollapsed = ref(false)
  const drag = ref<DragPayload | null>(null)
  const dropTarget = ref<DropTarget | null>(null)

  /** 拖拽结束（松手 / 取消 / 落到别处）必须调用，避免拖拽状态残留 */
  function resetDrag(): void {
    drag.value = null
    dropTarget.value = null
  }

  /* ---------------------------- 提示 ---------------------------- */

  const toasts = ref<Toast[]>([])
  let toastSeq = 0

  function toast(message: string, type: ToastType = 'info', { duration = 3200, action = null }: ToastOptions = {}): number {
    const id = ++toastSeq
    toasts.value = [...toasts.value, { id, message, type, action }]
    setTimeout(() => dismissToast(id), duration)
    return id
  }

  function dismissToast(id: number): void {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  /* ---------------------------- 弹窗 ---------------------------- */

  const dialogs = ref<DialogEntry[]>([])

  function openDialog(name: DialogName, props: Record<string, unknown> = {}): string {
    const entry: DialogEntry = { name, props, key: uuid() }
    dialogs.value = [...dialogs.value, entry]
    return entry.key
  }

  function closeDialog(key: string | null = null): void {
    if (key == null) dialogs.value = dialogs.value.slice(0, -1)
    else dialogs.value = dialogs.value.filter((d) => d.key !== key)
  }

  const topDialog = computed<DialogEntry | null>(() => dialogs.value[dialogs.value.length - 1] ?? null)

  function reset(): void {
    searchQuery.value = ''
    scope.type = SCOPE.ALL
    scope.id = null
    focusTarget.value = null
    clearSelection()
    drag.value = null
    dropTarget.value = null
  }

  return {
    searchQuery,
    scope,
    setScope,
    setSearch,
    focusTarget,
    focusGroup,
    isFiltering,
    selecting,
    selectedIds,
    selectedGroupIds,
    selectedCount,
    hasSelection,
    setSelecting,
    toggleItemSelected,
    toggleGroupSelected,
    isItemSelected,
    isGroupSelected,
    selectItems,
    clearSelection,
    sidebarCollapsed,
    drag,
    dropTarget,
    resetDrag,
    toasts,
    toast,
    dismissToast,
    dialogs,
    openDialog,
    closeDialog,
    topDialog,
    reset
  }
})
