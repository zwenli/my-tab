<script setup lang="ts">
/**
 * 标签组卡片：标题栏 + 操作区 + 条目列表，支持拖拽排序、拖入合并、多选。
 */
import { computed } from 'vue'
import type { PropType } from 'vue'
import Icon from './Icon.vue'
import TabRow from './TabRow.vue'
import DropdownMenu from './DropdownMenu.vue'
import { useDataStore } from '@/stores/data'
import { useUiStore } from '@/stores/ui'
import { useI18n } from '@/composables/useI18n'
import { useActions } from '@/composables/useActions'
import { humanTime } from '@/core/utils'
import type { Group, MenuItem, TabItem } from '@/types'

const props = defineProps({
  group: { type: Object as PropType<Group>, required: true },
  index: { type: Number, default: 0 },
  showFavicons: { type: Boolean, default: true },
  highlight: { type: String, default: '' },
  selectable: { type: Boolean, default: false },
  selected: { type: Boolean, default: false },
  /** 被「定位到该组」临时点亮（来自搜索结果或弹窗最近收起） */
  focused: { type: Boolean, default: false }
})

const emit = defineEmits<{
  (e: 'open-item', item: TabItem): void
  (e: 'dragstart', event: DragEvent): void
  (e: 'dragend', event: DragEvent): void
}>()

const data = useDataStore()
const ui = useUiStore()
const { t, dateLocale } = useI18n()
const actions = useActions()

const collapsed = computed<boolean>(() => !!props.group.collapsed)
const isDropTarget = computed<boolean>(() => ui.dropTarget?.kind === 'group' && ui.dropTarget.id === props.group.id)
const isDragSource = computed<boolean>(() => ui.drag?.kind === 'group' && ui.drag.id === props.group.id)

const displayTitle = computed<string>(() => props.group.title || t('group.untitled'))

const folderName = computed<string>(() => {
  if (!props.group.folderId) return ''
  return data.folders.find((f) => f.id === props.group.folderId)?.name || ''
})

const taskCount = computed<number>(() => props.group.items.filter((i) => i.task && !i.task.done).length)

const moreItems = computed<MenuItem[]>(() => [
  { key: 'rename', label: t('group.rename'), icon: 'edit' },
  { key: 'note', label: t('group.note'), icon: 'note' },
  { key: 'folder', label: t('group.moveToFolder'), icon: 'folder' },
  { key: 'copy', label: t('group.copyLinks'), icon: 'copy' },
  { separator: true },
  { key: 'lock', label: props.group.locked ? t('group.unlock') : t('group.lock'), icon: props.group.locked ? 'unlock' : 'lock' },
  { key: 'delete', label: t('group.delete'), icon: 'trash-2', danger: true, disabled: props.group.locked }
])

function toggleCollapse(): void {
  data.toggleGroupCollapsed(props.group.id)
}

function rename(): void {
  ui.openDialog('prompt', {
    title: t('dialog.renameGroup'),
    value: props.group.title || '',
    placeholder: t('dialog.renameGroupPlaceholder'),
    onConfirm: (v: string) => data.renameGroup(props.group.id, v)
  })
}

function editNote(): void {
  ui.openDialog('prompt', {
    title: t('dialog.note'),
    subtitle: displayTitle.value,
    value: props.group.note || '',
    placeholder: t('group.notePlaceholder'),
    multiline: true,
    onConfirm: (v: string) => data.updateGroup(props.group.id, { note: v })
  })
}

function moveToFolder(): void {
  ui.openDialog('move', {
    kind: 'groups',
    groupIds: [props.group.id],
    excludeGroupId: props.group.id,
    onConfirm: async (folderId: string | null) => {
      await data.moveGroupsToFolder([props.group.id], folderId)
      ui.toast(t('toast.moved'), 'success')
    }
  })
}

async function remove(): Promise<void> {
  if (props.group.locked) {
    ui.toast(t('group.deleteLocked'), 'warning')
    return
  }
  ui.openDialog('confirm', {
    title: t('group.delete'),
    message: t('group.deleteConfirm', { n: props.group.items.length }),
    confirmText: t('common.delete'),
    danger: true,
    onConfirm: async () => {
      await data.removeGroup(props.group.id)
      ui.toast(t('toast.deleted', { n: 1 }), 'success')
    }
  })
}

function onMore(key: string): void | Promise<void> | Promise<unknown> | undefined {
  switch (key) {
    case 'rename':
      return rename()
    case 'note':
      return editNote()
    case 'folder':
      return moveToFolder()
    case 'copy':
      return actions.copyLinks(props.group.items)
    case 'lock':
      data.toggleGroupLock(props.group.id)
      ui.toast(props.group.locked ? t('toast.unlocked') : t('toast.locked'), 'info')
      return
    case 'delete':
      return remove()
    default:
      return undefined
  }
}

function onDragStart(e: DragEvent): void {
  ui.drag = { kind: 'group', id: props.group.id, index: props.index }
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', props.group.id)
  }
  emit('dragstart', e)
}

function onDragEnd(e: DragEvent): void {
  ui.resetDrag()
  emit('dragend', e)
}

/**
 * 只处理「标签拖进本组」。
 * 组的排序 / 合并落点由列表页画布统一判定（见 pages/list/App.vue），
 * 卡片不再抢 dragover，否则两条判定线会互相打架，导致想排序却合并。
 */
async function onDrop(e: DragEvent): Promise<void> {
  const drag = ui.drag
  if (!drag || drag.kind !== 'tab') return
  e.preventDefault()
  e.stopPropagation()
  ui.resetDrag()

  if (drag.groupId === props.group.id) return
  if (props.group.locked) {
    ui.toast(t('group.lockedDrop'), 'warning')
    return
  }
  const ids = ui.isItemSelected(drag.id) ? ui.selectedIds : [drag.id]
  await data.moveItemsToGroup(ids, props.group.id, -1)
  ui.clearSelection()
  ui.toast(t('toast.moved'), 'success')
}

async function onItemRemove(item: TabItem): Promise<void> {
  ui.openDialog('confirm', {
    title: t('item.delete'),
    message: t('item.deleteConfirm'),
    confirmText: t('common.delete'),
    danger: true,
    onConfirm: async () => {
      await data.removeItems([item.id])
      ui.toast(t('toast.deleted', { n: 1 }), 'success')
    }
  })
}

function onItemDragStart(): void {
  /* 由 TabRow 写入 ui.drag */
}

function toggleSelect(): void {
  ui.toggleGroupSelected(props.group.id)
}
</script>

<template>
  <article
    class="card group"
    :class="{ collapsed, target: isDropTarget, dragging: isDragSource, locked: group.locked, selected, focused }"
    :draggable="!selectable"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
    @drop="onDrop"
  >
    <header class="head">
      <label v-if="selectable" class="check" @click.stop>
        <input type="checkbox" :checked="selected" :aria-label="t('group.select')" @change="toggleSelect" />
        <span class="box"><Icon v-if="selected" name="check" :size="11" :stroke-width="3" /></span>
      </label>

      <span class="grip" aria-hidden="true"><Icon name="grip-vertical" :size="15" /></span>

      <button class="toggle" type="button" :aria-expanded="!collapsed" :title="collapsed ? t('group.expand') : t('group.collapse')" @click="toggleCollapse">
        <Icon :name="collapsed ? 'chevron-right' : 'chevron-down'" :size="15" />
      </button>

      <div class="title-area" @dblclick="rename">
        <h3 class="g-title truncate" :title="displayTitle">{{ displayTitle }}</h3>
        <div class="g-meta">
          <span class="count">{{ t('group.itemCount', { n: group.items.length }) }}</span>
          <span v-if="folderName" class="folder-chip"><Icon name="folder" :size="11" />{{ folderName }}</span>
          <span v-if="group.locked" class="lock-chip"><Icon name="lock" :size="11" />{{ t('group.lock') }}</span>
          <span v-if="taskCount" class="task-chip"><Icon name="clock" :size="11" />{{ taskCount }}</span>
          <span class="time">{{ humanTime(group.createdAt, dateLocale) }}</span>
        </div>
      </div>

      <div class="badges">
        <span v-if="isDropTarget && collapsed" class="merge-chip"><Icon name="layers" :size="11" />{{ t('group.mergeTarget') }}</span>
        <Icon v-if="group.locked" name="lock" :size="13" class="b-lock" :aria-label="t('group.lock')" />
        <Icon v-if="group.starred" name="star" :size="13" class="b-star" filled :aria-label="t('group.star')" />
      </div>

      <div class="acts">
        <button class="btn btn-ghost btn-sm" type="button" v-tip="t('group.restoreAllHint')" @click="actions.restoreGroup(group)">
          <Icon name="external-link" :size="14" /><span class="lbl">{{ t('group.restoreAll') }}</span>
        </button>
        <button class="btn btn-ghost btn-icon btn-sm" type="button" v-tip="t('group.copyLinksHint')" @click="actions.copyLinks(group.items)">
          <Icon name="copy" :size="14" />
        </button>
        <button class="btn btn-ghost btn-icon btn-sm" type="button" v-tip="t('group.share')" @click="actions.shareGroup(group)">
          <Icon name="share" :size="14" />
        </button>
        <button
          class="btn btn-ghost btn-icon btn-sm"
          type="button"
          :class="{ 'on-star': group.starred }"
          v-tip="group.starred ? t('group.unstar') : t('group.star')"
          @click="data.toggleGroupStar(group.id)"
        >
          <Icon name="star" :size="14" :filled="group.starred" />
        </button>
        <DropdownMenu :items="moreItems" @select="onMore" />
      </div>
    </header>

    <p v-if="group.note && !collapsed" class="note">{{ group.note }}</p>

    <div v-if="!collapsed" class="body">
      <ul class="items">
        <TabRow
          v-for="(it, i) in group.items"
          :key="it.id"
          :item="it"
          :group-id="group.id"
          :index="i"
          :selectable="selectable"
          :selected="ui.isItemSelected(it.id)"
          :show-favicons="showFavicons"
          :highlight="highlight"
          @open="emit('open-item', $event)"
          @remove="onItemRemove"
          @dragstart="onItemDragStart"
        />
      </ul>
      <p v-if="!group.items.length" class="empty-items">{{ t('common.empty') }}</p>
      <div v-if="isDropTarget" class="drop-hint">
        <Icon :name="ui.drag?.kind === 'group' ? 'layers' : 'corner-down-right'" :size="14" />
        <span>{{ ui.drag?.kind === 'group' ? t('group.mergeHint') : t('common.add') }}</span>
      </div>
    </div>
  </article>
</template>

<style scoped>
.group {
  position: relative;
  transition: border-color var(--transition), box-shadow var(--transition), transform var(--transition);
}
.group.target {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
}
.group.dragging {
  opacity: 0.55;
}
.group.selected {
  border-color: var(--primary);
  background: var(--primary-soft);
}
/* 定位到该组时的临时描边：用 --primary-soft 做光环，和选中态区分开 */
.group.focused {
  border-color: var(--primary);
  box-shadow: 0 0 0 4px var(--primary-soft);
  animation: focus-ring 1.2s ease-in-out 2;
}
@keyframes focus-ring {
  0%,
  100% {
    box-shadow: 0 0 0 4px var(--primary-soft);
  }
  50% {
    box-shadow: 0 0 0 8px transparent;
  }
}
@media (prefers-reduced-motion: reduce) {
  .group.focused {
    animation: none;
  }
}
.group.locked::before {
  content: '';
  position: absolute;
  left: 0;
  top: 14px;
  bottom: 14px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--warning);
  opacity: 0.85;
}

.head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 10px 10px 12px;
  cursor: default;
}
.grip {
  color: var(--border-strong);
  cursor: grab;
  display: inline-flex;
  padding: 0 1px;
}
.grip:active {
  cursor: grabbing;
}
.group:hover .grip {
  color: var(--text-dim);
}
.check {
  flex: none;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}
.check input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}
.box {
  width: 15px;
  height: 15px;
  border-radius: 4px;
  border: 1.5px solid var(--border-strong);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}
.check input:checked + .box {
  background: var(--primary);
  border-color: var(--primary);
}
.toggle {
  flex: none;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  border-radius: var(--radius-xs);
  cursor: pointer;
}
.toggle:hover {
  background: var(--surface-2);
  color: var(--text);
}
.title-area {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: 4px;
}
.g-title {
  font-size: var(--text-md);
  font-weight: 600;
  letter-spacing: -0.005em;
  color: var(--text);
}
.g-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--text-xs);
  color: var(--text-dim);
  flex-wrap: wrap;
}
.folder-chip,
.task-chip,
.lock-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  background: var(--surface-3);
  color: var(--text-muted);
}
.lock-chip {
  background: var(--warning-soft);
  color: var(--warning);
}
.badges {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: none;
}
.b-star {
  color: var(--star);
}
.b-lock {
  color: var(--warning);
}
.merge-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 7px;
  border-radius: var(--radius-pill);
  background: var(--primary-soft);
  color: var(--primary);
  font-size: var(--text-xs);
  white-space: nowrap;
}
.acts {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 1px;
  opacity: 0;
  transition: opacity var(--transition);
}
.group:hover .acts,
.group:focus-within .acts {
  opacity: 1;
}
.acts .lbl {
  margin-left: 2px;
}
.on-star {
  color: var(--star);
}
.note {
  margin: 0 14px 8px;
  padding: 8px 11px;
  border-left: 3px solid var(--border-strong);
  background: var(--bg-elevated);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  font-size: var(--text-sm);
  color: var(--text-muted);
  white-space: pre-wrap;
  line-height: 1.6;
}
.body {
  padding: 0 8px 9px;
  position: relative;
}
.items {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.empty-items {
  padding: 14px;
  text-align: center;
  color: var(--text-dim);
  font-size: var(--text-sm);
}
.drop-hint {
  position: absolute;
  inset: 4px;
  border: 1.5px dashed var(--primary);
  border-radius: var(--radius);
  background: var(--primary-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-size: var(--text-sm);
  color: var(--primary);
  pointer-events: none;
}
</style>
