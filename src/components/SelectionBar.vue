<script setup lang="ts">
/**
 * 多选操作条：悬浮在底部，展示已选数量与批量动作。
 */
import { computed } from 'vue'
import Icon from './Icon.vue'
import DropdownMenu from './DropdownMenu.vue'
import { useDataStore } from '@/stores/data'
import { useUiStore } from '@/stores/ui'
import { useI18n } from '@/composables/useI18n'
import { useActions } from '@/composables/useActions'
import type { TabItem } from '@/types'

const data = useDataStore()
const ui = useUiStore()
const { t } = useI18n()
const actions = useActions()

const selectedItems = computed<TabItem[]>(() => ui.selectedIds.map((id) => data.itemIndex.get(id)?.item).filter((i): i is TabItem => !!i))

const groupTargets = computed(() => [
  { key: '__new__', label: t('list.newGroup'), icon: 'plus' },
  { separator: true },
  ...data.groups.map((g) => ({
    key: g.id,
    label: g.title || t('group.untitled'),
    icon: 'layers'
  }))
])

function exit(): void {
  ui.clearSelection()
}

async function restore(): Promise<void> {
  await actions.restoreItems(selectedItems.value)
  ui.clearSelection()
}

function removeSelected(): void {
  ui.openDialog('confirm', {
    title: t('selection.delete'),
    message: t('selection.deleteConfirm', { n: ui.selectedCount }),
    confirmText: t('common.delete'),
    danger: true,
    onConfirm: async () => {
      const n = ui.selectedCount
      await data.removeItems(ui.selectedIds)
      ui.clearSelection()
      ui.toast(t('toast.deleted', { n }), 'success')
    }
  })
}

async function moveToGroup(key: string): Promise<void> {
  if (key === '__new__') {
    const items = selectedItems.value.map((i) => ({ url: i.url, title: i.title, favIconUrl: i.favIconUrl }))
    await data.createGroupFromItems(items, { title: '' })
    await data.removeItems(ui.selectedIds)
  } else {
    await data.moveItemsToGroup(ui.selectedIds, key, -1)
  }
  ui.clearSelection()
  ui.toast(t('toast.moved'), 'success')
}

async function moveToFolder(): Promise<void> {
  ui.openDialog('move', {
    kind: 'groups',
    onConfirm: async (folderId: string | null) => {
      const ids = ui.selectedIds
        .map((id) => data.itemIndex.get(id)?.group?.id)
        .filter((v): v is string => !!v)
      if (ids.length) await data.moveGroupsToFolder(ids, folderId)
      ui.clearSelection()
      ui.toast(t('toast.moved'), 'success')
    }
  })
}

async function toQuick(): Promise<void> {
  await data.copyItemsToQuickList(ui.selectedIds)
  ui.clearSelection()
  ui.toast(t('toast.moved'), 'success')
}

async function star(on: boolean): Promise<void> {
  for (const id of ui.selectedIds) {
    await data.updateItem(id, { starred: on })
  }
}
</script>

<template>
  <Transition name="bar">
    <div v-if="ui.selecting" class="bar" role="toolbar" :aria-label="t('list.selection')">
      <button class="btn btn-ghost btn-icon btn-sm" type="button" :aria-label="t('list.exitSelect')" @click="exit">
        <Icon name="x" :size="15" />
      </button>

      <span class="count">{{ t('selection.count', { n: ui.selectedCount }) }}</span>

      <span class="sep" />

      <button class="btn btn-sm" type="button" :disabled="!ui.hasSelection" @click="restore">
        <Icon name="external-link" :size="13" />{{ t('selection.restore') }}
      </button>

      <DropdownMenu
        :items="groupTargets"
        icon="corner-down-right"
        :label="t('selection.moveToGroup')"
        align="center"
        placement="top"
        :disabled="!ui.hasSelection"
        @select="moveToGroup"
      />

      <button class="btn btn-sm" type="button" :disabled="!ui.hasSelection" @click="toQuick">
        <Icon name="zap" :size="13" />{{ t('selection.addToQuick') }}
      </button>

      <button class="btn btn-sm" type="button" :disabled="!ui.hasSelection" @click="star(true)">
        <Icon name="star" :size="13" />{{ t('selection.star') }}
      </button>

      <button class="btn btn-sm" type="button" :disabled="!ui.hasSelection" @click="moveToFolder">
        <Icon name="folder" :size="13" />{{ t('selection.moveToFolder') }}
      </button>

      <button class="btn btn-danger btn-sm" type="button" :disabled="!ui.hasSelection" @click="removeSelected">
        <Icon name="trash-2" :size="13" />{{ t('selection.delete') }}
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.bar {
  position: fixed;
  left: 50%;
  bottom: 22px;
  transform: translateX(-50%);
  z-index: 150;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  box-shadow: var(--shadow-3);
  max-width: calc(100vw - 40px);
  overflow-x: auto;
}
.count {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  padding: 0 4px;
}
.sep {
  width: 1px;
  height: 20px;
  background: var(--border);
  margin: 0 3px;
  flex: none;
}
.bar-enter-active,
.bar-leave-active {
  transition: opacity var(--transition-slow), transform var(--transition-slow);
}
.bar-enter-from,
.bar-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(14px);
}
</style>
