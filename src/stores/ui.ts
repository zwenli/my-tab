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
  const selected = ref<Set<string>>(new Set())

  const selectedIds = computed<string[]>(() => [...selected.value])
  const selectedCount = computed<number>(() => selected.value.size)
  const hasSelection = computed<boolean>(() => selected.value.size > 0)

  function setSelecting(on: boolean): void {
    selecting.value = on
    if (!on) selected.value = new Set()
  }

  function toggleSelected(id: string): void {
    const next = new Set(selected.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selected.value = next
    if (next.size === 0) selecting.value = false
  }

  function isSelected(id: string): boolean {
    return selected.value.has(id)
  }

  function selectMany(ids: string[]): void {
    const next = new Set(selected.value)
    for (const id of ids) next.add(id)
    selected.value = next
    selecting.value = next.size > 0
  }

  function clearSelection(): void {
    selected.value = new Set()
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
    selected,
    selectedIds,
    selectedCount,
    hasSelection,
    setSelecting,
    toggleSelected,
    isSelected,
    selectMany,
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
