<script setup lang="ts">
/**
 * 快捷列表：常用条目的一栏快速入口，支持拖入、拖拽排序、一键全开。
 */
import { computed, ref } from 'vue'
import Icon from './Icon.vue'
import FaviconImg from './FaviconImg.vue'
import { useDataStore } from '@/stores/data'
import { useUiStore } from '@/stores/ui'
import { useI18n } from '@/composables/useI18n'
import { useActions } from '@/composables/useActions'
import type { TabItem } from '@/types'

defineProps({
  /** 'strip' 细条（其他视图下）｜ 'full' 完整面板（快捷列表视图） */
  variant: { type: String, default: 'strip' },
  showFavicons: { type: Boolean, default: true }
})

const data = useDataStore()
const ui = useUiStore()
const { t } = useI18n()
const actions = useActions()

const over = ref<boolean>(false)
const dragIndex = ref<number>(-1)

const items = computed<TabItem[]>(() => data.quickList)

function isDropTarget(): boolean {
  return over.value
}

function onDragOver(e: DragEvent): void {
  if (!ui.drag) return
  if (ui.drag.kind !== 'tab' && ui.drag.kind !== 'group') return
  over.value = true
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
}

async function onDrop(e: DragEvent): Promise<void> {
  e.preventDefault()
  e.stopPropagation()
  over.value = false
  const drag = ui.drag
  if (!drag) return

  if (drag.kind === 'tab') {
    const ids = ui.isItemSelected(drag.id) ? ui.selectedIds : [drag.id]
    await data.copyItemsToQuickList(ids)
    ui.clearSelection()
    ui.toast(t('toast.moved'), 'success')
  } else if (drag.kind === 'group') {
    const g = data.groups.find((x) => x.id === drag.id)
    if (g) {
      await data.addToQuickList(g.items.map((i) => ({ url: i.url, title: i.title, favIconUrl: i.favIconUrl })))
      ui.toast(t('toast.moved'), 'success')
    }
  }
}

function onChipDragStart(e: DragEvent, index: number): void {
  dragIndex.value = index
  ui.drag = { kind: 'quick', id: items.value[index].id, index }
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onChipDragOver(e: DragEvent, _index: number): void {
  if (ui.drag?.kind !== 'quick') return
  e.preventDefault()
  e.stopPropagation()
}

async function onChipDrop(e: DragEvent, index: number): Promise<void> {
  if (ui.drag?.kind !== 'quick') return
  e.preventDefault()
  e.stopPropagation()
  if (dragIndex.value !== index && dragIndex.value >= 0) {
    await data.moveQuickItem(dragIndex.value, index)
  }
  dragIndex.value = -1
  ui.drag = null
}

function onChipDragEnd(): void {
  dragIndex.value = -1
  ui.drag = null
  over.value = false
}

function clearQuick(): void {
  ui.openDialog('confirm', {
    title: t('quick.clear'),
    message: t('quick.clearConfirm'),
    confirmText: t('common.clear'),
    danger: true,
    onConfirm: async () => {
      await data.removeItems(items.value.map((i) => i.id))
      ui.toast(t('toast.deleted', { n: items.value.length }), 'success')
    }
  })
}

const openAll = () => actions.restoreItems(items.value, { removeAfter: false })
const openOne = (it: TabItem): Promise<number> => actions.restoreItems([it], { removeAfter: false, quiet: true })
</script>

<template>
  <section
    v-if="variant === 'full' || items.length"
    class="quick"
    :class="[variant, { over: isDropTarget() }]"
    @dragover="onDragOver"
    @dragleave="over = false"
    @drop="onDrop"
  >
    <div class="q-head">
      <Icon name="zap" :size="14" class="q-ico" />
      <span class="q-title">{{ t('quick.title') }}</span>
      <span class="q-count">{{ items.length }}</span>
      <span class="spacer" />
      <button v-if="items.length" class="btn btn-ghost btn-sm" type="button" @click="openAll">
        <Icon name="external-link" :size="13" />{{ t('quick.openAll') }}
      </button>
      <button v-if="items.length && variant === 'full'" class="btn btn-ghost btn-sm" type="button" @click="clearQuick">
        {{ t('quick.clear') }}
      </button>
    </div>

    <div v-if="items.length" class="chips">
      <button
        v-for="(it, i) in items"
        :key="it.id"
        class="chip"
        :class="{ dragging: dragIndex === i }"
        type="button"
        draggable="true"
        :title="it.title"
        @click="openOne(it)"
        @dragstart="onChipDragStart($event, i)"
        @dragover="onChipDragOver($event, i)"
        @drop="onChipDrop($event, i)"
        @dragend="onChipDragEnd"
      >
        <FaviconImg :url="it.url" :title="it.title" :size="14" :show="showFavicons" />
        <span class="c-title truncate">{{ it.title || it.url }}</span>
        <span
          class="c-x"
          role="button"
          tabindex="0"
          :aria-label="t('item.removeFromQuick')"
          @click.stop="data.removeItems([it.id])"
          @keydown.enter.stop="data.removeItems([it.id])"
        >
          <Icon name="x" :size="11" />
        </span>
      </button>
    </div>

    <p v-else class="q-empty">{{ t('quick.empty') }}</p>

    <div v-if="isDropTarget()" class="q-drop">
      <Icon name="corner-down-right" :size="14" />
      <span>{{ t('quick.dropHere') }}</span>
    </div>
  </section>
</template>

<style scoped>
.quick {
  position: relative;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  background: var(--surface);
  padding: 10px 12px;
  transition: border-color var(--transition), background var(--transition);
}
.quick.over {
  border-color: var(--primary);
  background: var(--primary-soft);
}
.quick.full {
  padding: 14px;
}
.q-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--text-sm);
  color: var(--text-muted);
}
.q-ico {
  color: var(--primary);
}
.q-title {
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: 0.01em;
}
.q-count {
  font-size: var(--text-xs);
  color: var(--text-dim);
  background: var(--surface-2);
  padding: 1px 7px;
  border-radius: var(--radius-pill);
  font-variant-numeric: tabular-nums;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 9px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: 260px;
  height: 28px;
  padding: 0 6px 0 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: border-color var(--transition), background var(--transition), color var(--transition);
}
.chip:hover {
  border-color: var(--primary);
  color: var(--text);
  background: var(--surface-3);
}
.chip.dragging {
  opacity: 0.5;
}
.c-title {
  max-width: 180px;
}
.c-x {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  color: var(--text-dim);
  flex: none;
}
.c-x:hover {
  background: var(--danger-soft);
  color: var(--danger);
}
.q-empty {
  margin-top: 8px;
  font-size: var(--text-sm);
  color: var(--text-dim);
}
.q-drop {
  position: absolute;
  inset: 6px;
  border: 1.5px dashed var(--primary);
  border-radius: var(--radius);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-size: var(--text-sm);
  color: var(--primary);
  background: var(--primary-soft);
  pointer-events: none;
}
</style>
