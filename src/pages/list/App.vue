<script setup lang="ts">
/**
 * 主列表页。
 * 组合：顶栏 + 侧栏 + 内容区（快捷列表 / 搜索结果 / 标签组画布）+ 多选条 + 弹窗 + 提示。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import SideBar from '@/components/SideBar.vue'
import QuickListPanel from '@/components/QuickListPanel.vue'
import GroupCard from '@/components/GroupCard.vue'
import SearchResults from '@/components/SearchResults.vue'
import SelectionBar from '@/components/SelectionBar.vue'
import EmptyState from '@/components/EmptyState.vue'
import DialogHost from '@/components/dialogs/DialogHost.vue'
import Toasts from '@/components/Toasts.vue'
import Icon from '@/components/Icon.vue'
import { useDataStore } from '@/stores/data'
import { useUiStore, SCOPE } from '@/stores/ui'
import { useI18n } from '@/composables/useI18n'
import { useActions } from '@/composables/useActions'
import { useTheme } from '@/composables/useTheme'
import type { Group, TabItem } from '@/types'

const data = useDataStore()
const ui = useUiStore()
const { t } = useI18n()
const actions = useActions()

useTheme()

const canvas = ref<HTMLElement | null>(null)
const dropIndex = ref<number>(-1)
const canvasHint = ref<boolean>(false)

/* ------------------------- 可见分组 ------------------------- */

const visibleGroups = computed<Group[]>(() => {
  const list = data.displayGroups
  switch (ui.scope.type) {
    case SCOPE.STARRED:
      return list.filter((g) => g.starred || g.items.some((i) => i.starred))
    case SCOPE.LOCKED:
      return list.filter((g) => g.locked)
    case SCOPE.TASKS:
      return list.filter((g) => g.items.some((i) => i.task && !i.task.done))
    case SCOPE.FOLDER:
      return list.filter((g) => g.folderId === ui.scope.id)
    case SCOPE.ALL:
      if (ui.scope.id === 'none') return list.filter((g) => !g.folderId)
      return list
    default:
      return list
  }
})

const showSearch = computed<boolean>(() => !!ui.searchQuery.trim())
const showQuickFull = computed<boolean>(() => !showSearch.value && ui.scope.type === SCOPE.QUICK)

const scopeTitle = computed<string>(() => {
  if (ui.scope.type === SCOPE.ALL) return ui.scope.id === 'none' ? t('sidebar.uncategorized') : t('sidebar.all')
  if (ui.scope.type === SCOPE.QUICK) return t('sidebar.quick')
  if (ui.scope.type === SCOPE.STARRED) return t('sidebar.starred')
  if (ui.scope.type === SCOPE.LOCKED) return t('sidebar.locked')
  if (ui.scope.type === SCOPE.TASKS) return t('sidebar.tasks')
  if (ui.scope.type === SCOPE.FOLDER) return data.folders.find((f) => f.id === ui.scope.id)?.name || t('sidebar.folders')
  return t('sidebar.all')
})

const showFavicons = computed<boolean>(() => data.settings.showFavicons !== false)

/* ------------------------- 拖拽 ------------------------- */

const isDraggingGroup = computed<boolean>(() => ui.drag?.kind === 'group')
const isDraggingTab = computed<boolean>(() => ui.drag?.kind === 'tab')

function onCanvasDragOver(e: DragEvent): void {
  if (showSearch.value || showQuickFull.value) return
  if (isDraggingGroup.value) {
    e.preventDefault()
    const cards = canvas.value ? [...canvas.value.querySelectorAll('[data-group-id]')] : []
    let idx = cards.length
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i]!.getBoundingClientRect()
      if (e.clientY < r.top + r.height / 2) {
        idx = i
        break
      }
    }
    dropIndex.value = idx
    canvasHint.value = false
  } else if (isDraggingTab.value) {
    e.preventDefault()
    dropIndex.value = -1
    canvasHint.value = true
  }
}

function onCanvasDragLeave(e: DragEvent): void {
  if (e.currentTarget === e.target) {
    dropIndex.value = -1
    canvasHint.value = false
  }
}

async function onCanvasDrop(e: DragEvent): Promise<void> {
  const drag = ui.drag
  dropIndex.value = -1
  canvasHint.value = false
  if (!drag) return
  e.preventDefault()

  if (drag.kind === 'group') {
    await reorderVisible(drag.id, dropIndex.value < 0 ? visibleGroups.value.length : dropIndex.value)
    return
  }

  if (drag.kind === 'tab') {
    const ids = ui.hasSelection && ui.selected.has(drag.id) ? ui.selectedIds : [drag.id]
    const items = ids.map((id) => data.itemIndex.get(id)?.item).filter((i): i is TabItem => !!i)
    if (!items.length) return
    await data.createGroupFromItems(
      items.map((i) => ({ url: i.url, title: i.title, favIconUrl: i.favIconUrl })),
      { title: '' }
    )
    await data.removeItems(ids)
    ui.clearSelection()
    ui.toast(t('toast.groupCreated'), 'success')
  }
}

/**
 * 在「可见列表」内重排，并映射回全局顺序 —— 这样即使处于筛选视图也不会打乱其他组。
 */
async function reorderVisible(id: string, insertAt: number): Promise<void> {
  const visible = visibleGroups.value.map((g) => g.id)
  const from = visible.indexOf(id)
  if (from < 0) return
  const [moved] = visible.splice(from, 1)
  const target = insertAt > from ? insertAt - 1 : insertAt
  visible.splice(Math.max(0, Math.min(visible.length, target)), 0, moved)

  const visibleSet = new Set(visible)
  let vi = 0
  const nextOrder = data.groups.map((g) => (visibleSet.has(g.id) ? visible[vi++] : g.id))
  await data.reorderGroups(nextOrder)
}

/* ------------------------- 键盘 ------------------------- */

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable
}

function onKeydown(e: KeyboardEvent): void {
  const meta = e.ctrlKey || e.metaKey
  if (meta && e.key.toLowerCase() === 'a' && !isTypingTarget(e.target as Element | null)) {
    e.preventDefault()
    ui.setSelecting(true)
    const ids = showSearch.value
      ? []
      : visibleGroups.value.flatMap((g) => g.items.map((i) => i.id))
    ui.selectMany(ids)
    return
  }
  if (e.key === 'Escape') {
    if (ui.dialogs.length) {
      ui.closeDialog()
      return
    }
    if (ui.hasSelection) ui.clearSelection()
    else if (ui.searchQuery) ui.setSearch('')
    return
  }
  if (e.key === '/' && !isTypingTarget(e.target as Element | null)) {
    e.preventDefault()
    document.querySelector<HTMLInputElement>('.s-input')?.focus()
  }
}

/* ------------------------- 初始化 ------------------------- */

onMounted(async () => {
  await data.init()
  // 文件即真相：回到列表页时静默重扫资料库，把 Finder / 云盘里的改动读进来
  void data.silentRescan()
  document.addEventListener('keydown', onKeydown)

  // 支持 list.html#q=关键词（来自地址栏搜索或外部跳转）
  const hash = location.hash || ''
  const m = hash.match(/[#&]q=([^&]+)/)
  if (m) {
    ui.setSearch(decodeURIComponent(m[1]))
    history.replaceState(null, '', location.pathname)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
})

watch(
  () => ui.scope.type,
  (v, old) => {
    if (v === SCOPE.QUICK && old !== SCOPE.QUICK) ui.setSearch('')
  }
)

function collect(): void {
  actions.collectWindow({ openList: false })
}
</script>

<template>
  <div class="app">
    <AppHeader @toggle-sidebar="ui.sidebarCollapsed = !ui.sidebarCollapsed" />

    <div class="layout">
      <SideBar />

      <main class="content" role="main">
        <div class="content-inner">
          <QuickListPanel v-if="!showSearch && !showQuickFull" variant="strip" :show-favicons="showFavicons" />

          <SearchResults v-if="showSearch" />

          <template v-else-if="showQuickFull">
            <header class="sec-head">
              <Icon name="zap" :size="16" class="sh-ico" />
              <h2 class="sh-title">{{ t('quick.title') }}</h2>
            </header>
            <QuickListPanel variant="full" :show-favicons="showFavicons" />
          </template>

          <template v-else>
            <header class="sec-head">
              <h2 class="sh-title">{{ scopeTitle }}</h2>
              <span class="sh-count">{{ visibleGroups.length }} {{ t('common.groups') }}</span>
              <span class="spacer" />
              <button class="btn btn-ghost btn-sm" type="button" @click="ui.setSelecting(!ui.selecting)">
                <Icon name="check-square" :size="13" />{{ ui.selecting ? t('list.exitSelect') : t('list.selection') }}
              </button>
            </header>

            <EmptyState
              v-if="!visibleGroups.length"
              :icon="data.groups.length ? 'filter' : 'inbox'"
              :title="data.groups.length ? t('empty.filtered') : t('empty.title')"
              :hint="data.groups.length ? t('empty.filteredHint') : t('empty.hint')"
              :action-label="data.groups.length ? '' : t('empty.cta')"
              @action="collect"
            />

            <div
              v-else
              ref="canvas"
              class="canvas"
              :class="{ 'drag-tab': isDraggingTab }"
              @dragover="onCanvasDragOver"
              @dragleave="onCanvasDragLeave"
              @drop="onCanvasDrop"
            >
              <template v-for="(g, i) in visibleGroups" :key="g.id">
                <div v-if="dropIndex === i" class="drop-line" aria-hidden="true" />
                <GroupCard
                  :data-group-id="g.id"
                  :group="g"
                  :index="i"
                  :show-favicons="showFavicons"
                  :selectable="ui.selecting"
                  :selected="ui.isSelected(g.id)"
                  @open-item="() => {}"
                />
              </template>
              <div v-if="dropIndex === visibleGroups.length" class="drop-line" aria-hidden="true" />

              <div v-if="canvasHint" class="canvas-drop">
                <Icon name="plus" :size="15" />
                <span>{{ t('group.dropToNew') }}</span>
              </div>
            </div>
          </template>
        </div>
      </main>
    </div>

    <SelectionBar />
    <DialogHost />
    <Toasts />
  </div>
</template>

<style scoped>
.app {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}
.layout {
  flex: 1;
  display: flex;
  min-height: 0;
}
.content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
}
.content-inner {
  max-width: 1080px;
  margin: 0 auto;
  padding: 18px 22px 96px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sec-head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 2px 4px 2px;
}
.sh-ico {
  color: var(--primary);
}
.sh-title {
  font-size: var(--text-lg);
  font-weight: 650;
  letter-spacing: -0.01em;
}
.sh-count {
  font-size: var(--text-xs);
  color: var(--text-dim);
  background: var(--surface-2);
  padding: 2px 8px;
  border-radius: var(--radius-pill);
}
.canvas {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 120px;
}
.canvas.drag-tab {
  outline: 1.5px dashed var(--border-strong);
  outline-offset: 8px;
  border-radius: var(--radius-lg);
}
.drop-line {
  height: 3px;
  border-radius: 3px;
  background: var(--primary);
  box-shadow: 0 0 0 4px var(--primary-soft);
  margin: -3px 4px;
  animation: fade-in 120ms ease-out;
}
.canvas-drop {
  position: absolute;
  inset: -6px;
  border: 1.5px dashed var(--primary);
  border-radius: var(--radius-lg);
  background: var(--primary-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--primary);
  font-size: var(--text-base);
  pointer-events: none;
}
@media (max-width: 760px) {
  .content-inner {
    padding: 14px 12px 110px;
  }
}
</style>
