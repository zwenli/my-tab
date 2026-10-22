<script setup lang="ts">
/**
 * 主列表页。
 * 组合：顶栏 + 侧栏 + 内容区（快捷列表 / 搜索结果 / 标签组画布）+ 多选条 + 弹窗 + 提示。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import SideBar from '@/components/SideBar.vue'
import QuickListPanel from '@/components/QuickListPanel.vue'
import GroupCard from '@/components/GroupCard.vue'
import SearchResults from '@/components/SearchResults.vue'
import SelectionBar from '@/components/SelectionBar.vue'
import EmptyState from '@/components/EmptyState.vue'
import LibraryBar from '@/components/LibraryBar.vue'
import DialogHost from '@/components/dialogs/DialogHost.vue'
import Toasts from '@/components/Toasts.vue'
import Icon from '@/components/Icon.vue'
import { useDataStore } from '@/stores/data'
import { useUiStore, SCOPE } from '@/stores/ui'
import { useI18n } from '@/composables/useI18n'
import { useActions } from '@/composables/useActions'
import { useLibraryAutoRestore } from '@/composables/useLibraryAccess'
import { useTheme } from '@/composables/useTheme'
import { applyVisibleOrder, clampPinnedIndex, hitTest, itemHitTest, moveToInsertPoint, sameOrder } from '@/core/dragOrder'
import type { Group, TabItem } from '@/types'

const data = useDataStore()
const ui = useUiStore()
const { t } = useI18n()
const actions = useActions()

useTheme()
// 浏览器重启后资料库授权会被重置成 prompt：在本次页面的第一次用户手势里自动补一次，
// 用户通常什么都不用做（授权框里选「每次访问都允许」之后就不会再问）
useLibraryAutoRestore()

const canvas = ref<HTMLElement | null>(null)
const dropIndex = ref<number>(-1)
const canvasHint = ref<boolean>(false)
/** 条目级插入线：插到 groupId 组的第 index 条之前，y 是相对画布的纵坐标 */
const itemDrop = ref<{ groupId: string; index: number; y: number } | null>(null)
/** 指针停在一个锁定组上（松手给提示，而不是静默无反应） */
const lockedTargetId = ref<string>('')

/* ------------------------- 定位高亮 -------------------------
 *
 * 来自弹窗「最近收起」或搜索结果里的分组点击：滚到该组并闪一下描边。
 * 只做视觉提示，不改数据；2.4s 后自动褪掉，避免长期占着视觉焦点。
 */

const focusedId = ref<string>('')
let focusTimer: ReturnType<typeof setTimeout> | null = null

function clearFocusHighlight(): void {
  if (focusTimer) clearTimeout(focusTimer)
  focusTimer = null
  focusedId.value = ''
}

/** 找到组元素（元素的顺序 = visibleGroups 顺序，用 dataset 比对最稳） */
function groupElement(id: string): HTMLElement | null {
  const nodes = canvas.value?.querySelectorAll<HTMLElement>('[data-group-id]') ?? []
  for (const node of nodes) if (node.dataset.groupId === id) return node
  return null
}

watch(
  () => ui.focusTarget,
  async (target) => {
    if (!target) return
    await nextTick()
    const group = data.groups.find((g) => g.id === target.id)
    if (!group) return
    // 收起状态下滚过去只看到一行标题，展开才叫「打开这个组」
    if (group.collapsed) data.toggleGroupCollapsed(group.id)
    await nextTick()

    groupElement(target.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (focusTimer) clearTimeout(focusTimer)
    focusedId.value = target.id
    focusTimer = setTimeout(() => {
      focusedId.value = ''
      focusTimer = null
    }, 2400)
  }
)

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

/* ------------------------- 拖拽 -------------------------
 *
 * 三种手势，落点判定**只在画布**做（dragover 会从卡片冒泡上来），卡片自身不抢事件，
 * 这样两个判定永远只有一个生效，不会互相打架：
 *
 *   拖组   → 卡片上/下 30% 出「组级排序线」，中间 40% 合并整组
 *   拖标签 → 组体（条目区域）内出「条目级插入线」：
 *              同组内拖动 = 组内排序；拖到别组 = 移动并插到该位置
 *            卡片标题栏 / 收起卡片 = 「收进此组」（追加到末尾）
 *   空白处 → 新建组
 *
 * 这是拖标签与拖组最本质的区别：拖组只有组级的线，拖标签在组体内是条目级的线；
 * 两者互斥，同一帧只有一条线，所以「想排序却合并」不会再出现。
 *
 * 两条线都不占布局：组级线用 height:0 + 负 margin，条目级线是绝对定位，
 * 出现时卡片不位移，命中判定的坐标就是稳定的，不会「线来回跳」。
 */

/** 卡片上下各留 30% 给排序，中间 40% 才合并 —— 排序区更大，减少误触 */
const REORDER_ZONE = 0.3
/** 标签拖拽时的吸附容差，吃掉卡片之间 10px 的间隙与 1px 的行间距 */
const TAB_SNAP = 6

const isDraggingTab = computed<boolean>(() => ui.drag?.kind === 'tab')

const lockedIds = computed<Set<string>>(() => new Set(data.groups.filter((g) => g.locked).map((g) => g.id)))

/** 星标段的长度：星标组永远排在前面，拖拽不能跨过这条线 */
const pinnedCount = computed<number>(() => {
  if (!data.settings.starPinsToTop) return 0
  const list = visibleGroups.value
  let n = 0
  while (n < list.length && list[n]!.starred) n++
  return n
})

interface CardBox {
  id: string
  top: number
  bottom: number
}

/** 读取当前渲染出来的卡片盒子（顺序 = visibleGroups 顺序） */
function cardBoxes(): CardBox[] {
  const el = canvas.value
  if (!el) return []
  return [...el.querySelectorAll<HTMLElement>('[data-group-id]')].map((node) => {
    const r = node.getBoundingClientRect()
    return { id: node.dataset.groupId || '', top: r.top, bottom: r.bottom }
  })
}

/** 条目级落点区域：只有展开且未锁定的组有组体（组体 = 条目列表所在区域） */
interface ItemZoneBox {
  groupId: string
  top: number
  bottom: number
  rows: { top: number; bottom: number }[]
}

function itemZoneBoxes(): ItemZoneBox[] {
  const el = canvas.value
  if (!el) return []
  const out: ItemZoneBox[] = []
  for (const card of el.querySelectorAll<HTMLElement>('[data-group-id]')) {
    const id = card.dataset.groupId || ''
    if (!id || lockedIds.value.has(id)) continue
    const body = card.querySelector<HTMLElement>('[data-group-body]')
    if (!body) continue
    const r = body.getBoundingClientRect()
    if (r.height <= 0) continue
    const rows = [...body.querySelectorAll<HTMLElement>('[data-item-id]')].map((node) => {
      const rr = node.getBoundingClientRect()
      return { top: rr.top, bottom: rr.bottom }
    })
    out.push({ groupId: id, top: r.top, bottom: r.bottom, rows })
  }
  return out
}

/** 条目插入线的纵坐标（相对画布，便于绝对定位），落在第 index 条的上边缘 */
function itemLineY(zone: ItemZoneBox, index: number): number {
  const top = canvas.value?.getBoundingClientRect().top ?? 0
  const last = zone.rows[zone.rows.length - 1]
  const boundary = index < zone.rows.length ? zone.rows[index]!.top : last ? last.bottom : zone.top + 2
  return boundary - top - 1
}

function clearDropMarks(): void {
  dropIndex.value = -1
  canvasHint.value = false
  itemDrop.value = null
  lockedTargetId.value = ''
  if (ui.dropTarget?.kind === 'group') ui.dropTarget = null
}

/** 合并目标只在画布判定里写，避免卡片自身的 dragleave 把它抖没 */
function setMergeTarget(id: string): void {
  if (!id) {
    if (ui.dropTarget?.kind === 'group') ui.dropTarget = null
    return
  }
  if (ui.dropTarget?.kind === 'group' && ui.dropTarget.id === id) return
  ui.dropTarget = { kind: 'group', id }
}

function onCanvasDragOver(e: DragEvent): void {
  const drag = ui.drag
  if (!drag || (drag.kind !== 'group' && drag.kind !== 'tab')) return
  if (showSearch.value || showQuickFull.value) return

  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'

  const boxes = cardBoxes()
  const tops = boxes.map((b) => b.top)
  const bottoms = boxes.map((b) => b.bottom)
  if (drag.kind === 'tab') {
    dragTabOver(e, boxes, tops, bottoms)
    return
  }

  const from = boxes.findIndex((b) => b.id === drag.id)
  const hit = hitTest({
    tops,
    bottoms,
    clientY: e.clientY,
    zone: REORDER_ZONE,
    // 自己不能合并到自己；锁定组不收外来内容
    canMerge: (i) => {
      const box = boxes[i]
      if (!box || !box.id) return false
      return box.id !== drag.id && !lockedIds.value.has(box.id)
    }
  })

  itemDrop.value = null
  lockedTargetId.value = ''

  if (hit.mergeIndex >= 0) {
    setMergeTarget(boxes[hit.mergeIndex]?.id || '')
    dropIndex.value = -1
    canvasHint.value = false
    return
  }

  setMergeTarget('')

  // 落回自己身上等于没动，不画线，避免「线在自己头上」的困惑；
  // 星标置顶时把落点夹在本组所属那一段，线画在哪就落在哪
  const target = clampPinnedIndex(hit.index, from, pinnedCount.value)
  const noop = from >= 0 && (target === from || target === from + 1)
  dropIndex.value = noop ? -1 : target
  canvasHint.value = false
}

/** 拖标签的落点：条目区域 > 卡片（收进此组）> 空白（新建组），三选一 */
function dragTabOver(e: DragEvent, boxes: CardBox[], tops: number[], bottoms: number[]): void {
  dropIndex.value = -1

  const zones = itemZoneBoxes()
  const hit = itemHitTest(
    zones.map((z) => ({ groupId: z.groupId, top: z.top, bottom: z.bottom, centers: z.rows.map((r) => (r.top + r.bottom) / 2) })),
    e.clientY,
    TAB_SNAP
  )

  if (hit) {
    const zone = zones.find((z) => z.groupId === hit.groupId)
    if (zone) {
      itemDrop.value = { groupId: hit.groupId, index: hit.index, y: itemLineY(zone, hit.index) }
      setMergeTarget('')
      lockedTargetId.value = ''
      canvasHint.value = false
      return
    }
  }

  itemDrop.value = null

  // 卡片级吸附：标题栏、收起卡片、卡片之间的缝隙都算「收进此组」
  const near = hitTest({ tops, bottoms, clientY: e.clientY, zone: REORDER_ZONE, mergeAnyBand: true, snap: TAB_SNAP, canMerge: () => true })
  const card = near.mergeIndex >= 0 ? boxes[near.mergeIndex] : undefined

  if (card) {
    canvasHint.value = false
    if (lockedIds.value.has(card.id)) {
      // 锁定的组不收外来标签：不亮合并态，松手时提示原因
      setMergeTarget('')
      lockedTargetId.value = card.id
      return
    }
    lockedTargetId.value = ''
    setMergeTarget(card.id)
    return
  }

  setMergeTarget('')
  lockedTargetId.value = ''
  canvasHint.value = true
}

function onCanvasDragLeave(e: DragEvent): void {
  // dragleave 会从卡片冒泡上来，也可能 relatedTarget 为 null，
  // 所以直接用指针坐标判断是否真的离开了画布
  const el = canvas.value
  if (!el) return
  const r = el.getBoundingClientRect()
  if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return
  clearDropMarks()
}

async function onCanvasDrop(e: DragEvent): Promise<void> {
  // 先把落点读出来，再清状态 —— 顺序反了会读到默认值（这正是「拖到第一位却跑到最后」的原因）
  const drag = ui.drag
  const insertAt = dropIndex.value
  const mergeId = ui.dropTarget?.kind === 'group' ? ui.dropTarget.id : ''
  const itemTarget = itemDrop.value
  const lockedId = lockedTargetId.value
  const blank = canvasHint.value
  ui.resetDrag()
  clearDropMarks()
  if (!drag) return
  e.preventDefault()

  if (drag.kind === 'group') {
    if (mergeId && mergeId !== drag.id) {
      await data.mergeGroups(drag.id, mergeId)
      ui.toast(t('toast.merged'), 'success')
      return
    }
    if (insertAt >= 0) await reorderVisible(drag.id, insertAt)
    return
  }

  if (drag.kind !== 'tab') return
  const ids = ui.isItemSelected(drag.id) ? ui.selectedIds : [drag.id]
  if (!ids.length) return

  // 落到条目之间：按位置插入（同组 = 排序，跨组 = 移动到该位置）
  if (itemTarget) {
    await data.moveItemsToGroup(ids, itemTarget.groupId, itemTarget.index)
    ui.clearSelection()
    if (itemTarget.groupId !== drag.groupId) ui.toast(t('toast.moved'), 'success')
    return
  }

  // 落到标题栏 / 收起卡片：收进此组（追加到末尾）
  if (mergeId) {
    // 拖回自己组的标题栏 = 没动，别把条目挪到末尾
    if (mergeId === drag.groupId && ids.length === 1) return
    await data.moveItemsToGroup(ids, mergeId, -1)
    ui.clearSelection()
    ui.toast(t('toast.moved'), 'success')
    return
  }

  if (lockedId) {
    ui.toast(t('group.lockedDrop'), 'warning')
    return
  }

  if (blank) await dropTabsToNewGroup(ids)
}

/** 标签拖到画布空白处：把这些条目收成一个新组 */
async function dropTabsToNewGroup(ids: string[]): Promise<void> {
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

/**
 * 在「可见列表」内重排，并映射回全局顺序 —— 这样即使处于筛选视图也不会打乱其他组。
 */
async function reorderVisible(id: string, insertBefore: number): Promise<void> {
  const visible = visibleGroups.value.map((g) => g.id)
  const from = visible.indexOf(id)
  if (from < 0) return
  const moved = moveToInsertPoint(visible, from, insertBefore)
  if (sameOrder(visible, moved)) return // 位置没变，不写盘
  await data.reorderGroups(applyVisibleOrder(data.groups.map((g) => g.id), moved))
}

/**
 * 拖拽结束的兜底：松手、Esc 取消、把卡片拖到窗口外……所有路径最终都会把 ui.drag 置空，
 * 在这里统一清掉排序线与合并高亮，drop-line 就不会滞留在页面上。
 */
watch(
  () => ui.drag,
  (v) => {
    if (!v) clearDropMarks()
  }
)

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
    ui.selectItems(ids)
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

/**
 * 解析地址栏 hash，支持两种入口：
 *   #q=<关键词>    地址栏搜索 / 外部跳转
 *   #g=<groupId>   弹窗「最近收起」直接定位到某个组
 *
 * 必须同时处理首屏和 hashchange：列表页已经打开时再切到 list.html#g=xxx
 * 属于「同文档导航」，onMounted 不会再跑一次（历史 bug：点最近收起没反应）。
 */
function applyLocationHash(): void {
  const hash = location.hash || ''
  const q = hash.match(/[#&]q=([^&]+)/)
  const g = hash.match(/[#&]g=([^&]+)/)
  if (!q && !g) return

  const groupId = g ? decodeURIComponent(g[1]) : ''
  if (q) ui.setSearch(decodeURIComponent(q[1]))
  if (groupId && data.groups.some((x) => x.id === groupId)) ui.focusGroup(groupId)

  // 处理完就把 hash 抹掉，刷新页面不会重复定位
  history.replaceState(null, '', location.pathname)
}

onMounted(async () => {
  await data.init()
  // 文件即真相：回到列表页时静默重扫资料库，把 Finder / 云盘里的改动读进来
  void data.silentRescan()
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('hashchange', applyLocationHash)

  applyLocationHash()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('hashchange', applyLocationHash)
  clearFocusHighlight()
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
          <LibraryBar />

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
                  :selected="ui.isGroupSelected(g.id)"
                  :focused="focusedId === g.id"
                  @open-item="() => {}"
                />
              </template>
              <div v-if="dropIndex === visibleGroups.length" class="drop-line" aria-hidden="true" />

              <div v-if="itemDrop" class="item-line" :style="{ top: `${itemDrop.y}px` }" aria-hidden="true" />

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
  --card-gap: 10px;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--card-gap);
  min-height: 120px;
  padding-bottom: 18px;
}
.canvas.drag-tab {
  outline: 1.5px dashed var(--border-strong);
  outline-offset: 8px;
  border-radius: var(--radius-lg);
}
/**
 * 排序线：高度 0 + 负 margin，出现时完全不挤动卡片。
 * 卡片不位移，命中判定的坐标就是稳定的，不会出现「线来回跳」。
 */
.drop-line {
  height: 0;
  margin-top: calc(-1 * var(--card-gap));
  position: relative;
  pointer-events: none;
}
.drop-line::before {
  content: '';
  position: absolute;
  left: 2px;
  right: 2px;
  top: calc(var(--card-gap) / 2 - 2px);
  height: 4px;
  border-radius: 4px;
  background: var(--primary);
  box-shadow: 0 0 0 4px var(--primary-soft);
  animation: fade-in 120ms ease-out;
}
/**
 * 条目级插入线（拖标签）。
 * 绝对定位：不参与布局，出现时卡片一根手指都不动，命中坐标始终稳定。
 * 比组级线更细、两端内缩，视觉上明确「插在某两条之间」而不是「整组换位」。
 */
.item-line {
  position: absolute;
  left: 16px;
  right: 16px;
  height: 2px;
  border-radius: 2px;
  background: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
  pointer-events: none;
  animation: fade-in 100ms ease-out;
}
.item-line::before {
  content: '';
  position: absolute;
  left: -4px;
  top: -3.5px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--primary);
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
