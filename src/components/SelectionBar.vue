<script setup lang="ts">
/**
 * 多选操作条：悬浮在底部，展示已选数量与批量动作。
 *
 * 选中项有两大类：条目（TabItem）与整组（Group）。**每个批量动作都必须同时照顾两类**，
 * 只按 itemIndex 处理条目的话，「勾选标签组 → 删除勾选」会查不到 id 而静默无效。
 */
import { computed } from 'vue'
import Icon from './Icon.vue'
import DropdownMenu from './DropdownMenu.vue'
import { useDataStore } from '@/stores/data'
import { useUiStore } from '@/stores/ui'
import { useI18n } from '@/composables/useI18n'
import { useActions } from '@/composables/useActions'
import * as M from '@/core/mutations'
import type { CollectableTab, Group, TabItem } from '@/types'

const data = useDataStore()
const ui = useUiStore()
const { t } = useI18n()
const actions = useActions()

/** 单独勾选的条目 */
const selectedItems = computed<TabItem[]>(() =>
  ui.selectedIds.map((id) => data.itemIndex.get(id)?.item).filter((i): i is TabItem => !!i)
)

/** 勾选的整组 */
const selectedGroups = computed<Group[]>(() =>
  ui.selectedGroupIds.map((id) => data.groups.find((g) => g.id === id)).filter((g): g is Group => !!g)
)

/** 「按条目处理」的动作（恢复 / 加星 / 加快捷）要覆盖勾选整组里的条目 */
const allSelectedItems = computed<TabItem[]>(() => {
  const seen = new Set<string>()
  const merged = [...selectedGroups.value.flatMap((g) => g.items), ...selectedItems.value]
  return merged.filter((i) => {
    if (seen.has(i.id)) return false
    seen.add(i.id)
    return true
  })
})

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
  await actions.restoreItems(allSelectedItems.value)
  ui.clearSelection()
}

function removeSelected(): void {
  const groups = selectedGroups.value
  const items = selectedItems.value
  const deletable = groups.filter((g) => !g.locked)
  const lockedCount = groups.length - deletable.length

  if (!deletable.length && !items.length) {
    ui.toast(t('group.deleteLocked'), 'warning')
    return
  }

  const tabCount = groups.reduce((n, g) => n + g.items.length, 0)
  const message =
    groups.length && items.length
      ? t('selection.deleteMixedConfirm', { g: groups.length, i: items.length })
      : groups.length
        ? t('selection.deleteGroupsConfirm', { g: groups.length, n: tabCount })
        : t('selection.deleteConfirm', { n: items.length })

  ui.openDialog('confirm', {
    title: t('selection.delete'),
    message,
    confirmText: t('common.delete'),
    danger: true,
    onConfirm: async () => {
      const groupIds = deletable.map((g) => g.id)
      const itemIds = items.map((i) => i.id)
      await data.removeGroupsAndItems(groupIds, itemIds)
      ui.clearSelection()
      if (lockedCount) ui.toast(t('selection.deleteLockedSkipped', { n: lockedCount }), 'warning')
      ui.toast(t('toast.deleted', { n: groupIds.length + itemIds.length }), 'success')
    }
  })
}

async function moveToGroup(key: string): Promise<void> {
  const itemIds = ui.selectedIds

  if (key === '__new__') {
    // 新建组：把「勾选条目 + 勾选分组内的条目」一起搬进新组，再清掉被搬空的旧分组
    const tabs: CollectableTab[] = allSelectedItems.value.map((i) => ({ url: i.url, title: i.title, favIconUrl: i.favIconUrl }))
    if (!tabs.length) return
    await data.createGroupFromItems(tabs, { title: '' })
    await data.removeGroupsAndItems(selectedGroups.value.map((g) => g.id), itemIds)
  } else {
    // 整组 → 并入目标组（锁定组跳过，源组在合并后消失）；条目 → 直接移动
    const groupIds = selectedGroups.value.filter((g) => !g.locked && g.id !== key).map((g) => g.id)
    if (!groupIds.length && !itemIds.length) {
      ui.clearSelection()
      return
    }
    await data.run((s) => {
      let st = s
      for (const gid of groupIds) st = M.mergeGroups(st, gid, key).state
      return M.moveItemsToGroup(st, itemIds, key, -1)
    })
  }
  ui.clearSelection()
  ui.toast(t('toast.moved'), 'success')
}

async function moveToFolder(): Promise<void> {
  ui.openDialog('move', {
    kind: 'groups',
    onConfirm: async (folderId: string | null) => {
      const ids = new Set(ui.selectedGroupIds)
      for (const item of selectedItems.value) {
        const gid = data.itemIndex.get(item.id)?.group?.id
        if (gid) ids.add(gid)
      }
      if (ids.size) await data.moveGroupsToFolder([...ids], folderId)
      ui.clearSelection()
      ui.toast(t('toast.moved'), 'success')
    }
  })
}

async function toQuick(): Promise<void> {
  await data.copyItemsToQuickList(allSelectedItems.value.map((i) => i.id))
  ui.clearSelection()
  ui.toast(t('toast.moved'), 'success')
}

async function star(on: boolean): Promise<void> {
  for (const id of ui.selectedIds) await data.updateItem(id, { starred: on })
  for (const id of ui.selectedGroupIds) await data.updateGroup(id, { starred: on })
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
