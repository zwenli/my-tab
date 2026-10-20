<script setup lang="ts">
/**
 * 左侧栏：分类导航、文件夹树、概览统计。
 */
import { computed, ref } from 'vue'
import Icon from './Icon.vue'
import { useDataStore } from '@/stores/data'
import { useUiStore, SCOPE } from '@/stores/ui'
import { useI18n } from '@/composables/useI18n'
import { humanBytes } from '@/core/utils'
import type { Folder } from '@/types'

const data = useDataStore()
const ui = useUiStore()
const { t } = useI18n()

const navItems = computed(() => [
  { key: SCOPE.ALL, id: null, label: t('sidebar.all'), icon: 'layers', count: data.stats.groupCount },
  { key: SCOPE.QUICK, id: null, label: t('sidebar.quick'), icon: 'zap', count: data.stats.quickCount },
  { key: SCOPE.STARRED, id: null, label: t('sidebar.starred'), icon: 'star', count: data.stats.starredCount },
  { key: SCOPE.TASKS, id: null, label: t('sidebar.tasks'), icon: 'clock', count: data.stats.taskOpen },
  { key: SCOPE.LOCKED, id: null, label: t('sidebar.locked'), icon: 'lock', count: data.stats.lockedCount }
])

const uncategorizedCount = computed(() => data.groups.filter((g) => !g.folderId).length)

const folderDrop = ref<string>('')

function folderCount(id: string): number {
  return data.groups.filter((g) => g.folderId === id).length
}

function newFolder(): void {
  ui.openDialog('prompt', {
    title: t('dialog.newFolder'),
    placeholder: t('dialog.newFolderPlaceholder'),
    onConfirm: async (name: string) => {
      if (!name?.trim()) return
      await data.addFolder(name.trim())
      ui.toast(t('toast.folderCreated'), 'success')
    }
  })
}

function renameFolder(folder: Folder): void {
  ui.openDialog('prompt', {
    title: t('dialog.renameFolder'),
    value: folder.name,
    placeholder: t('dialog.renameFolderPlaceholder'),
    onConfirm: (v: string) => data.updateFolder(folder.id, { name: String(v || '').trim() })
  })
}

function deleteFolder(folder: Folder): void {
  ui.openDialog('confirm', {
    title: t('dialog.deleteFolder'),
    message: `${folder.name}`,
    detail: t('dialog.deleteFolderHint'),
    confirmText: t('common.delete'),
    danger: true,
    onConfirm: async () => {
      await data.removeFolder(folder.id, { keepGroups: true })
      if (ui.scope.type === SCOPE.FOLDER && ui.scope.id === folder.id) ui.setScope(SCOPE.ALL)
      ui.toast(t('toast.deleted', { n: 1 }), 'success')
    }
  })
}

function onDragOverFolder(e: DragEvent, folder: Folder): void {
  if (ui.drag?.kind !== 'group') return
  folderDrop.value = folder.id
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

async function onDropFolder(e: DragEvent, folder: Folder): Promise<void> {
  e.preventDefault()
  e.stopPropagation()
  folderDrop.value = ''
  const drag = ui.drag
  if (!drag || drag.kind !== 'group') return
  const ids = ui.hasSelection && ui.selected.has(drag.id) ? ui.selectedIds : [drag.id]
  await data.moveGroupsToFolder(ids, folder.id)
  ui.clearSelection()
  ui.toast(t('toast.moved'), 'success')
}
</script>

<template>
  <aside class="side" :class="{ collapsed: ui.sidebarCollapsed }">
    <!-- 概览 -->
    <div class="stats">
      <div class="stat">
        <span class="v">{{ data.stats.groupCount }}</span>
        <span class="k">{{ t('stats.groups') }}</span>
      </div>
      <div class="stat">
        <span class="v">{{ data.stats.tabCount }}</span>
        <span class="k">{{ t('stats.tabs') }}</span>
      </div>
      <div class="stat">
        <span class="v">{{ data.stats.domainCount }}</span>
        <span class="k">{{ t('stats.domains') }}</span>
      </div>
    </div>

    <!-- 分类 -->
    <nav class="nav">
      <button
        v-for="n in navItems"
        :key="n.key"
        class="nav-item"
        :class="{ on: ui.scope.type === n.key }"
        type="button"
        @click="ui.setScope(n.key, null)"
      >
        <Icon :name="n.icon" :size="15" class="ni" />
        <span class="nl truncate">{{ n.label }}</span>
        <span v-if="n.count" class="nc">{{ n.count }}</span>
      </button>

      <button
        class="nav-item"
        :class="{ on: ui.scope.type === SCOPE.ALL && ui.scope.id === 'none' }"
        type="button"
        @click="ui.setScope(SCOPE.ALL, 'none')"
      >
        <Icon name="inbox" :size="15" class="ni" />
        <span class="nl truncate">{{ t('sidebar.uncategorized') }}</span>
        <span v-if="uncategorizedCount" class="nc">{{ uncategorizedCount }}</span>
      </button>
    </nav>

    <!-- 文件夹 -->
    <div class="folders">
      <div class="sec-head">
        <span class="sec-title">{{ t('sidebar.folders') }}</span>
        <button class="btn btn-ghost btn-icon btn-sm tip" type="button" :data-tip="t('list.newFolder')" @click="newFolder">
          <Icon name="plus" :size="14" />
        </button>
      </div>

      <p v-if="!data.folders.length" class="hint">{{ t('sidebar.noFolder') }}</p>

      <div
        v-for="f in data.folders"
        :key="f.id"
        class="folder"
        :class="{ on: ui.scope.type === SCOPE.FOLDER && ui.scope.id === f.id, drop: folderDrop === f.id }"
        role="button"
        tabindex="0"
        @click="ui.setScope(SCOPE.FOLDER, f.id)"
        @keydown.enter="ui.setScope(SCOPE.FOLDER, f.id)"
        @dragover="onDragOverFolder($event, f)"
        @dragleave="folderDrop = ''"
        @drop="onDropFolder($event, f)"
      >
        <Icon name="folder" :size="15" class="ni" />
        <span class="nl truncate" :title="f.name">{{ f.name || t('dialog.newFolder') }}</span>
        <span class="nc">{{ folderCount(f.id) }}</span>
        <span class="f-acts">
          <button class="btn btn-ghost btn-icon btn-sm" type="button" :aria-label="t('common.rename')" @click.stop="renameFolder(f)">
            <Icon name="edit" :size="13" />
          </button>
          <button class="btn btn-ghost btn-icon btn-sm" type="button" :aria-label="t('common.delete')" @click.stop="deleteFolder(f)">
            <Icon name="trash-2" :size="13" />
          </button>
        </span>
      </div>
    </div>

    <span class="spacer" />

    <footer class="foot">
      <Icon name="hard-drive" :size="13" />
      <span>{{ t('stats.storage') }} {{ humanBytes(data.usage) }}</span>
    </footer>
  </aside>
</template>

<style scoped>
.side {
  flex: none;
  width: 236px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px 10px;
  border-right: 1px solid var(--border);
  background: var(--bg-elevated);
  overflow-y: auto;
  transition: width var(--transition-slow), opacity var(--transition);
}
.side.collapsed {
  width: 0;
  padding-left: 0;
  padding-right: 0;
  overflow: hidden;
  opacity: 0;
  border-right-color: transparent;
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  padding: 10px 8px;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius);
  background: var(--surface);
}
.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
}
.stat .v {
  font-size: var(--text-lg);
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
.stat .k {
  font-size: 10.5px;
  color: var(--text-dim);
  white-space: nowrap;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.nav-item,
.folder {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  height: 33px;
  padding: 0 9px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--text-base);
  cursor: pointer;
  text-align: left;
  transition: background var(--transition), color var(--transition);
  position: relative;
}
.nav-item:hover,
.folder:hover {
  background: var(--surface-2);
  color: var(--text);
}
.nav-item.on,
.folder.on {
  background: var(--primary-soft);
  color: var(--text);
  font-weight: 550;
}
.folder.drop {
  box-shadow: inset 0 0 0 1.5px var(--primary);
  background: var(--primary-soft-strong);
}
.ni {
  flex: none;
  color: var(--text-muted);
}
.nav-item.on .ni,
.folder.on .ni {
  color: var(--primary);
}
.nl {
  flex: 1;
  min-width: 0;
}
.nc {
  flex: none;
  font-size: var(--text-xs);
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
}
.nav-item.on .nc,
.folder.on .nc {
  background: var(--surface-3);
  color: var(--text-secondary);
}

.folders {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.sec-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px 4px 9px;
}
.sec-title {
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-dim);
}
.hint {
  padding: 4px 9px 6px;
  font-size: var(--text-sm);
  color: var(--text-dim);
}
.f-acts {
  position: absolute;
  right: 6px;
  display: none;
  align-items: center;
  gap: 1px;
  background: linear-gradient(90deg, transparent, var(--surface-2) 30%);
  padding-left: 10px;
}
.folder:hover .f-acts {
  display: inline-flex;
}
.folder:hover .nc {
  visibility: hidden;
}

.foot {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 9px 2px;
  border-top: 1px solid var(--border-soft);
  font-size: var(--text-xs);
  color: var(--text-dim);
}
</style>
