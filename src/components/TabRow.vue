<script setup lang="ts">
/**
 * 单条标签：图标 + 标题 + 域名，悬停出现操作，支持拖拽与多选。
 */
import { computed } from 'vue'
import type { PropType } from 'vue'
import Icon from './Icon.vue'
import FaviconImg from './FaviconImg.vue'
import DropdownMenu from './DropdownMenu.vue'
import { useDataStore } from '@/stores/data'
import { useUiStore } from '@/stores/ui'
import { useI18n } from '@/composables/useI18n'
import { useActions } from '@/composables/useActions'
import { hostOf } from '@/core/utils'
import type { MenuItem, TabItem } from '@/types'

const props = defineProps({
  item: { type: Object as PropType<TabItem>, required: true },
  groupId: { type: String, default: '' },
  index: { type: Number, default: -1 },
  /** 'group' | 'quick' | 'search' */
  source: { type: String, default: 'group' },
  selectable: { type: Boolean, default: false },
  selected: { type: Boolean, default: false },
  showFavicons: { type: Boolean, default: true },
  highlight: { type: String, default: '' }
})

const emit = defineEmits<{
  (e: 'open', item: TabItem): void
  (e: 'remove', item: TabItem): void
  (e: 'dragstart', event: DragEvent): void
  (e: 'dragend', event: DragEvent): void
  (e: 'contextmenu', event: MouseEvent): void
}>()

const data = useDataStore()
const ui = useUiStore()
const { t } = useI18n()
const actions = useActions()

const host = computed<string>(() => hostOf(props.item.url))
const isLocked = computed<boolean>(() => {
  if (!props.groupId) return false
  const g = data.groups.find((x) => x.id === props.groupId)
  return !!g?.locked
})

const menuItems = computed<MenuItem[]>(() => {
  const task = props.item.task
  const list: MenuItem[] = [
    { key: 'open', label: t('item.openInNewTab'), icon: 'external-link' },
    { key: 'star', label: props.item.starred ? t('item.unstar') : t('item.star'), icon: 'star' }
  ]
  // 待办三态：未加待办 → 加为待办；未完成 → 标记完成；已完成 → 恢复未完成
  if (!task) {
    list.push({ key: 'task', label: t('item.task'), icon: 'check-square' })
  } else {
    list.push({ key: 'task', label: task.done ? t('item.taskUndone') : t('item.taskDone'), icon: task.done ? 'refresh-cw' : 'check-circle' })
    // 取消待办标记（不是删除标签，只是把这条从待办里摘掉）
    list.push({ key: 'taskClear', label: t('item.taskClear'), icon: 'x-circle' })
  }
  list.push({ key: 'note', label: t('item.note'), icon: 'note' })
  list.push({ key: 'copy', label: t('item.copyUrl'), icon: 'copy' })
  if (props.source === 'quick') {
    list.push({ separator: true })
    list.push({ key: 'remove', label: t('item.removeFromQuick'), icon: 'trash', danger: true })
  } else {
    list.push({ key: 'toQuick', label: t('item.addToQuick'), icon: 'zap' })
    list.push({ key: 'move', label: t('item.moveTo'), icon: 'corner-down-right' })
    list.push({ separator: true })
    list.push({ key: 'remove', label: t('common.delete'), icon: 'trash', danger: true })
  }
  return list
})

async function open(): Promise<void> {
  emit('open', props.item)
  // 快捷列表条目由 restoreItems 内部保护，不会被「还原后移除」删掉
  await actions.restoreItems([props.item], { quiet: true })
}

async function onSelect(key: string): Promise<void> {
  switch (key) {
    case 'open':
      await open()
      break
    case 'star':
      await data.toggleItemStar(props.item.id)
      break
    case 'task':
      await data.toggleItemTask(props.item.id)
      break
    case 'taskClear':
      await data.setItemTask(props.item.id, null)
      break
    case 'note':
      ui.openDialog('prompt', {
        title: t('item.note'),
        subtitle: props.item.title,
        value: props.item.note || '',
        placeholder: t('item.notePlaceholder'),
        multiline: true,
        onConfirm: (v: string) => data.setItemNote(props.item.id, v)
      })
      break
    case 'copy':
      await actions.copyLinks([props.item])
      break
    case 'toQuick':
      await data.copyItemsToQuickList([props.item.id])
      ui.toast(t('toast.moved'), 'success')
      break
    case 'move':
      ui.openDialog('move', {
        kind: 'items',
        itemIds: [props.item.id],
        excludeGroupId: props.groupId,
        onConfirm: async (target: string | null) => {
          if (!target) return
          await data.moveItemToGroup(props.item.id, target, -1)
          ui.toast(t('toast.moved'), 'success')
        }
      })
      break
    case 'remove':
      emit('remove', props.item)
      break
    default:
      break
  }
}

function onDragStart(e: DragEvent): void {
  ui.drag = { kind: 'tab', id: props.item.id, groupId: props.groupId, index: props.index, source: props.source }
  emit('dragstart', e)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  try {
    e.dataTransfer?.setData('text/plain', props.item.url)
  } catch {
    /* ignore */
  }
}

function onDragEnd(e: DragEvent): void {
  ui.drag = null
  ui.dropTarget = null
  emit('dragend', e)
}

function toggleSelect(): void {
  ui.toggleItemSelected(props.item.id)
}

const taskState = computed<'none' | 'open' | 'done'>(() => {
  if (!props.item.task) return 'none'
  return props.item.task.done ? 'done' : 'open'
})

/** 行内待办按钮的提示要跟着三态走，避免「写着加为待办、点了却变完成」 */
const taskTip = computed<string>(() => {
  if (taskState.value === 'done') return t('item.taskUndone')
  if (taskState.value === 'open') return t('item.taskDone')
  return t('item.task')
})

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }

const titleHtml = computed<string>(() => {
  const title = props.item.title || props.item.url || ''
  const escaped = title.replace(/[&<>"]/g, (c) => HTML_ESCAPES[c] ?? c)
  const q = props.highlight?.trim()
  if (!q) return escaped
  const tokens = q
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!tokens.length) return escaped
  try {
    return escaped.replace(new RegExp(`(${tokens.join('|')})`, 'gi'), '<mark>$1</mark>')
  } catch {
    return escaped
  }
})
</script>

<template>
  <li
    class="row"
    :class="{ selected, selecting: selectable, done: taskState === 'done' }"
    :draggable="!isLocked && !selectable"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
    @contextmenu.prevent="emit('contextmenu', $event)"
  >
    <label v-if="selectable" class="check" @click.stop>
      <input type="checkbox" :checked="selected" :aria-label="t('group.select')" @change="toggleSelect" />
      <span class="box"><Icon v-if="selected" name="check" :size="11" :stroke-width="3" /></span>
    </label>

    <button class="main" type="button" :title="item.title" @click="open">
      <FaviconImg :url="item.url" :title="item.title" :size="16" :show="showFavicons" />
      <span class="text">
        <span class="title truncate" v-html="titleHtml" />
        <span class="host truncate">{{ host }}</span>
      </span>
      <span class="flags">
        <Icon v-if="taskState === 'open'" name="clock" :size="12" class="f-task" />
        <Icon v-else-if="taskState === 'done'" name="check-circle" :size="12" class="f-done" />
        <Icon v-if="item.note" name="note" :size="12" class="f-note" />
        <Icon v-if="item.starred" name="star" :size="12" class="f-star" filled />
      </span>
    </button>

    <span class="acts">
      <button
        class="btn btn-ghost btn-icon btn-sm"
        type="button"
        v-tip="item.starred ? t('item.unstar') : t('item.star')"
        :class="item.starred ? 'on-star' : ''"
        @click.stop="data.toggleItemStar(item.id)"
      >
        <Icon name="star" :size="14" :filled="item.starred" />
      </button>
      <button
        class="btn btn-ghost btn-icon btn-sm"
        type="button"
        v-tip="taskTip"
        @click.stop="data.toggleItemTask(item.id)"
      >
        <Icon :name="taskState === 'done' ? 'check-circle' : 'check-square'" :size="14" />
      </button>
      <button
        class="btn btn-ghost btn-icon btn-sm"
        type="button"
        v-tip="t('item.note')"
        @click.stop="
          ui.openDialog('prompt', {
            title: t('item.note'),
            subtitle: item.title,
            value: item.note || '',
            placeholder: t('item.notePlaceholder'),
            multiline: true,
            onConfirm: (v: string) => data.setItemNote(item.id, v)
          })
        "
      >
        <Icon name="note" :size="14" />
      </button>
      <DropdownMenu :items="menuItems" @select="onSelect" />
    </span>
  </li>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: var(--row-h);
  padding: 1px 6px 1px 4px;
  border-radius: var(--radius-sm);
  transition: background var(--transition);
  position: relative;
}
.row:hover {
  background: var(--surface-2);
}
.row.selected {
  background: var(--primary-soft);
}
.row.done .title {
  color: var(--text-muted);
  text-decoration: line-through;
  text-decoration-color: var(--text-dim);
}

.check {
  flex: none;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  padding: 0 4px 0 2px;
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
  transition: background var(--transition), border-color var(--transition);
}
.check input:checked + .box {
  background: var(--primary);
  border-color: var(--primary);
}
.check input:focus-visible + .box {
  box-shadow: var(--focus-ring);
}

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 9px;
  height: 30px;
  padding: 0 4px;
  border: 0;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  text-align: left;
  border-radius: var(--radius-xs);
}
.text {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.title {
  font-size: var(--text-base);
  color: var(--text);
  min-width: 0;
}
.title :deep(mark) {
  background: var(--warning-soft);
  color: var(--warning);
  border-radius: 3px;
  padding: 0 2px;
}
.host {
  flex: none;
  max-width: 34%;
  font-size: var(--text-xs);
  color: var(--text-dim);
}
.flags {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: none;
}
.f-star {
  color: var(--star);
}
.f-task {
  color: var(--warning);
}
.f-done {
  color: var(--success);
}
.f-note {
  color: var(--text-dim);
}

.acts {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 1px;
  opacity: 0;
  transition: opacity var(--transition);
}
.row:hover .acts,
.row:focus-within .acts {
  opacity: 1;
}
.on-star {
  color: var(--star);
}
</style>
