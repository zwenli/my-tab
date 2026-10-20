<script setup lang="ts">
/**
 * 列表页顶栏：品牌、搜索、收起按钮与全局操作。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import Icon from './Icon.vue'
import DropdownMenu from './DropdownMenu.vue'
import { useDataStore } from '@/stores/data'
import { useUiStore, SCOPE } from '@/stores/ui'
import { useI18n } from '@/composables/useI18n'
import { useActions } from '@/composables/useActions'
import type { LanguagePref, MenuItem, ThemePref } from '@/types'

const emit = defineEmits<{ (e: 'toggle-sidebar'): void }>()

const data = useDataStore()
const ui = useUiStore()
const { t } = useI18n()
const actions = useActions()

const searchInput = ref<HTMLInputElement | null>(null)
const collecting = ref<boolean>(false)

const searchValue = computed<string>({
  get: () => ui.searchQuery,
  set: (v) => ui.setSearch(v)
})

const themeOptions = computed<MenuItem[]>(() => [
  { key: 'auto', label: t('list.themeAuto'), icon: 'monitor', checked: data.settings.theme === 'auto' },
  { key: 'dark', label: t('list.themeDark'), icon: 'moon', checked: data.settings.theme === 'dark' },
  { key: 'light', label: t('list.themeLight'), icon: 'sun', checked: data.settings.theme === 'light' }
])

const langOptions = computed<MenuItem[]>(() =>
  [
    { value: 'auto', label: t('list.themeAuto'), icon: 'monitor' },
    { value: 'zh-CN', label: '简体中文', icon: 'globe' },
    { value: 'en-US', label: 'English', icon: 'globe' }
  ].map((o) => ({ key: o.value, label: o.label, icon: o.icon, checked: data.settings.language === o.value }))
)

async function onCollect(): Promise<void> {
  collecting.value = true
  await actions.collectWindow({ openList: false })
  collecting.value = false
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

async function newGroup(): Promise<void> {
  const res = await data.createGroupFromItems([], { title: '' })
  if (res?.group) {
    ui.setScope(SCOPE.ALL)
    ui.toast(t('toast.groupCreated'), 'success')
  }
}

function onGlobal(action: string): void {
  switch (action) {
    case 'io':
      ui.openDialog('data', {})
      return
    case 'settings':
      openSettings()
      return
    case 'restoreAll':
      restoreAll()
      return
    case 'clear':
      clearList()
      return
    case 'tidy':
      void tidy()
      return
    case 'selectAll':
      diagSelectAll()
      return
    default:
      return
  }
}

function restoreAll(): void {
  const total = data.groups.reduce((n, g) => n + g.items.length, 0)
  if (!total) {
    ui.toast(t('toast.collectEmpty'), 'warning')
    return
  }
  ui.openDialog('confirm', {
    title: t('common.openAll'),
    message: t('group.restoreAllHint'),
    detail: t('group.itemCount', { n: total }),
    confirmText: t('common.confirm'),
    icon: 'external-link',
    onConfirm: () => actions.restoreAll()
  })
}

function diagSelectAll(): void {
  ui.setSelecting(true)
  ui.selectMany(data.displayGroups.flatMap((g) => g.items.map((i) => i.id)))
}

function openSettings(): void {
  if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) chrome.runtime.openOptionsPage()
  else window.open('options.html', '_blank')
}

function clearList(): void {
  ui.openDialog('confirm', {
    title: t('list.clearList'),
    message: t('list.clearConfirm'),
    confirmText: t('common.clear'),
    danger: true,
    onConfirm: () => actions.clearList()
  })
}

async function tidy(): Promise<void> {
  await data.tidy({ removeEmptyGroups: true })
  ui.toast(t('toast.tidied'), 'success')
}

function onTheme(key: string): void {
  data.updateSettings({ theme: key as ThemePref })
}

function onLang(key: string): void {
  data.updateSettings({ language: key as LanguagePref })
}

/** Ctrl/Cmd+K 聚焦搜索 */
function onKeydown(e: KeyboardEvent): void {
  const meta = e.ctrlKey || e.metaKey
  if (meta && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    searchInput.value?.focus()
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <header class="head">
    <button class="btn btn-ghost btn-icon side-toggle" type="button" :title="ui.sidebarCollapsed ? t('sidebar.expand') : t('sidebar.collapse')" @click="emit('toggle-sidebar')">
      <Icon :name="ui.sidebarCollapsed ? 'chevron-right' : 'chevron-left'" :size="16" />
    </button>

    <div class="brand">
      <span class="logo" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="17" height="17">
          <rect x="1" y="1" width="22" height="22" rx="6" fill="url(#g)" />
          <rect x="6" y="7.2" width="12" height="2.4" rx="1.2" fill="#fafcff" />
          <rect x="6" y="10.9" width="9" height="2.4" rx="1.2" fill="#fafcff" opacity=".92" />
          <rect x="6" y="14.6" width="6" height="2.4" rx="1.2" fill="#fafcff" opacity=".84" />
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#3C7FE0" />
              <stop offset="1" stop-color="#1E4E9C" />
            </linearGradient>
          </defs>
        </svg>
      </span>
      <span class="name">{{ t('app.name') }}</span>
    </div>

    <div class="search" :class="{ filled: !!ui.searchQuery }">
      <Icon name="search" :size="15" class="s-ico" />
      <input
        ref="searchInput"
        v-model="searchValue"
        class="s-input"
        type="search"
        :placeholder="t('list.searchPlaceholder')"
        :aria-label="t('list.searchPlaceholder')"
      />
      <button v-if="ui.searchQuery" class="s-clear btn btn-ghost btn-icon btn-sm" type="button" :aria-label="t('search.clear')" @click="ui.setSearch('')">
        <Icon name="x" :size="13" />
      </button>
      <kbd v-else class="kbd">⌘K</kbd>
    </div>

    <span class="spacer" />

    <button class="btn btn-primary collect" type="button" :disabled="collecting" @click="onCollect">
      <Icon name="inbox" :size="15" />
      <span>{{ t('list.collectWindow') }}</span>
    </button>

    <button class="btn btn-icon tip" type="button" :data-tip="t('list.newGroup')" @click="newGroup">
      <Icon name="plus" :size="16" />
    </button>
    <button class="btn btn-icon tip" type="button" :data-tip="t('list.newFolder')" @click="newFolder">
      <Icon name="folder-plus" :size="16" />
    </button>

    <DropdownMenu
      :items="[
        { key: 'restoreAll', label: t('common.openAll'), icon: 'external-link' },
        { key: 'io', label: t('list.importExport'), icon: 'download' },
        { key: 'selectAll', label: t('list.selectAll'), icon: 'check-square' },
        { key: 'tidy', label: t('list.tidy'), icon: 'sparkles' },
        { separator: true },
        { key: 'clear', label: t('list.clearList'), icon: 'trash-2', danger: true }
      ]"
      icon="more-horizontal"
      :tip="t('common.more')"
      align="end"
      @select="onGlobal"
    />

    <DropdownMenu :items="themeOptions" icon="palette" :tip="t('list.theme')" align="end" @select="onTheme" />
    <DropdownMenu :items="langOptions" icon="globe" :tip="t('list.language')" align="end" @select="onLang" />

    <button class="btn btn-icon tip" type="button" :data-tip="t('list.settings')" @click="openSettings">
      <Icon name="settings" :size="16" />
    </button>
  </header>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  gap: 8px;
  height: var(--header-h);
  padding: 0 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-elevated);
  flex: none;
}
.side-toggle {
  color: var(--text-muted);
}
.brand {
  display: flex;
  align-items: center;
  gap: 9px;
  padding-right: 6px;
}
.logo {
  display: inline-flex;
}
.name {
  font-size: var(--text-md);
  font-weight: 650;
  letter-spacing: -0.01em;
}
.search {
  flex: 0 1 400px;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 10px;
  margin-left: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  transition: border-color var(--transition), background var(--transition), box-shadow var(--transition);
}
.search:focus-within {
  border-color: var(--primary);
  background: var(--bg);
  box-shadow: 0 0 0 3px var(--primary-soft);
}
.search.filled {
  border-color: var(--border-strong);
}
.s-ico {
  color: var(--text-dim);
  flex: none;
}
.s-input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  outline: none;
  font-size: var(--text-base);
  color: var(--text);
}
.s-input::-webkit-search-cancel-button {
  display: none;
}
.s-input::placeholder {
  color: var(--text-dim);
}
.s-clear {
  color: var(--text-dim);
}
.kbd {
  flex: none;
  font-family: var(--font-sans);
  font-size: 10.5px;
  color: var(--text-dim);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 1px 5px;
  background: var(--bg-elevated);
}
.collect {
  height: 32px;
}
@media (max-width: 1080px) {
  .collect span {
    display: none;
  }
  .collect {
    width: 32px;
    padding: 0;
  }
}
@media (max-width: 900px) {
  .name {
    display: none;
  }
  .search {
    flex: 1 1 auto;
  }
}
</style>
