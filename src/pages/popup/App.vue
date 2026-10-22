<script setup lang="ts">
/**
 * 工具栏快捷弹窗：收起当前窗口、查看最近收起、快速打开列表页。
 */
import { computed, onMounted, ref } from 'vue'
import Icon from '@/components/Icon.vue'
import FaviconImg from '@/components/FaviconImg.vue'
import Toasts from '@/components/Toasts.vue'
import DialogHost from '@/components/dialogs/DialogHost.vue'
import { useDataStore } from '@/stores/data'
import { useI18n } from '@/composables/useI18n'
import { useActions } from '@/composables/useActions'
import { useLibraryAutoRestore } from '@/composables/useLibraryAccess'
import { useTheme } from '@/composables/useTheme'
import { queryTabs } from '@/core/tabs'
import { humanTime } from '@/core/utils'
import type { CollectMode, Group, TabItem } from '@/types'

const data = useDataStore()
const { t, dateLocale } = useI18n()
const actions = useActions()

useTheme()
// 重启后授权会重置：在第一次点击里自动补一次，收集动作才能立刻写盘
useLibraryAutoRestore()

const collecting = ref<string>('')
const tabCount = ref<number>(0)

const recent = computed<Group[]>(() => data.groups.slice(0, 3))
const quick = computed<TabItem[]>(() => data.quickList.slice(0, 6))
const showFavicons = computed<boolean>(() => data.settings.showFavicons !== false)

async function countTabs(): Promise<void> {
  const tabs = await queryTabs({ currentWindow: true })
  tabCount.value = tabs.filter((x) => /^https?:/i.test(x.url || '')).length
}

async function doCollect(mode: CollectMode): Promise<void> {
  collecting.value = mode
  const res = await actions.collectWindow({ openList: mode === 'all', mode })
  collecting.value = ''
  if (res?.ok && res.count) window.close()
  else await countTabs()
}

function openList(search = ''): void {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    const url = chrome.runtime.getURL('list.html') + (search ? `#q=${encodeURIComponent(search)}` : '')
    if (chrome.tabs) {
      chrome.tabs.query({}, (tabs) => {
        const found = (tabs || []).find((x) => (x.url || '').startsWith(chrome.runtime.getURL('list.html')))
        if (found?.id != null) {
          chrome.tabs.update(found.id, { url, active: true }, () => void chrome.runtime?.lastError)
          chrome.windows?.update(found.windowId, { focused: true }, () => void chrome.runtime?.lastError)
        } else {
          chrome.tabs.create({ url }, () => void chrome.runtime?.lastError)
        }
        window.close()
      })
      return
    }
  }
  window.open('list.html' + (search ? `#q=${encodeURIComponent(search)}` : ''), '_blank')
}

function openSettings(): void {
  if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) chrome.runtime.openOptionsPage()
  else window.open('options.html', '_blank')
  window.close()
}

onMounted(async () => {
  await data.init()
  await countTabs()
})
</script>

<template>
  <div class="pop">
    <header class="head">
      <span class="logo" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16">
          <rect x="1" y="1" width="22" height="22" rx="6" fill="url(#pg)" />
          <rect x="6" y="7.2" width="12" height="2.4" rx="1.2" fill="#fafcff" />
          <rect x="6" y="10.9" width="9" height="2.4" rx="1.2" fill="#fafcff" opacity=".92" />
          <rect x="6" y="14.6" width="6" height="2.4" rx="1.2" fill="#fafcff" opacity=".84" />
          <defs>
            <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#3C7FE0" />
              <stop offset="1" stop-color="#1E4E9C" />
            </linearGradient>
          </defs>
        </svg>
      </span>
      <span class="name">{{ t('app.name') }}</span>
      <span class="spacer" />
      <span class="win-count">{{ t('popup.tabCount', { n: tabCount }) }}</span>
      <button class="btn btn-ghost btn-icon btn-sm" type="button" v-tip="{ text: t('popup.settings'), dir: 'bottom' }" @click="openSettings">
        <Icon name="settings" :size="15" />
      </button>
    </header>

    <div class="actions">
      <button class="btn btn-primary big" type="button" :disabled="!!collecting" @click="doCollect('auto')">
        <Icon name="inbox" :size="17" />
        <span>{{ t('popup.collect') }}</span>
      </button>
      <div class="sub-actions">
        <button class="btn btn-sm" type="button" :disabled="!!collecting" @click="doCollect('current')">
          {{ t('popup.collectCurrent') }}
        </button>
        <button class="btn btn-sm" type="button" :disabled="!!collecting" @click="doCollect('others')">
          {{ t('popup.collectOthers') }}
        </button>
      </div>
    </div>

    <section v-if="quick.length" class="block">
      <div class="blk-head">
        <Icon name="zap" :size="13" class="blk-ico" />
        <span>{{ t('popup.quickOpen') }}</span>
      </div>
      <div class="chips">
        <button
          v-for="it in quick"
          :key="it.id"
          class="chip"
          type="button"
          :title="it.title"
          @click="actions.restoreItems([it], { removeAfter: false, quiet: true })"
        >
          <FaviconImg :url="it.url" :title="it.title" :size="13" :show="showFavicons" />
          <span class="truncate">{{ it.title || it.url }}</span>
        </button>
      </div>
    </section>

    <section class="block">
      <div class="blk-head">
        <Icon name="clock" :size="13" class="blk-ico" />
        <span>{{ t('popup.recent') }}</span>
      </div>

      <p v-if="!recent.length" class="empty">{{ t('popup.noRecent') }}</p>

      <ul v-else class="recent">
        <li v-for="g in recent" :key="g.id" class="r-row">
          <button class="r-main" type="button" :title="g.title" @click="openList(g.title)">
            <span class="r-title truncate">{{ g.title || t('group.untitled') }}</span>
            <span class="r-meta">{{ t('group.itemCount', { n: g.items.length }) }} · {{ humanTime(g.createdAt, dateLocale) }}</span>
          </button>
          <button class="btn btn-ghost btn-icon btn-sm" type="button" v-tip="t('popup.restore')" @click="actions.restoreGroup(g)">
            <Icon name="external-link" :size="14" />
          </button>
        </li>
      </ul>
    </section>

    <footer class="foot">
      <span>{{ t('popup.stats', { groups: data.stats.groupCount, tabs: data.stats.tabCount }) }}</span>
      <span class="spacer" />
      <button class="btn btn-ghost btn-sm" type="button" @click="openList('')">
        <Icon name="maximize-2" :size="13" />{{ t('popup.openList') }}
      </button>
    </footer>

    <DialogHost />
    <Toasts />
  </div>
</template>

<style scoped>
.pop {
  width: 360px;
  max-height: 560px;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  overflow-y: auto;
}
.head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-elevated);
  position: sticky;
  top: 0;
  z-index: 5;
}
.name {
  font-size: var(--text-base);
  font-weight: 650;
}
.win-count {
  font-size: var(--text-xs);
  color: var(--text-dim);
}
.actions {
  padding: 14px 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.btn.big {
  height: 42px;
  font-size: var(--text-md);
  font-weight: 600;
}
.sub-actions {
  display: flex;
  gap: 6px;
}
.sub-actions .btn {
  flex: 1;
}
.block {
  padding: 6px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.blk-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-dim);
}
.blk-ico {
  color: var(--primary);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  height: 26px;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  cursor: pointer;
}
.chip:hover {
  border-color: var(--primary);
  color: var(--text);
}
.chip span {
  max-width: 130px;
}
.empty {
  font-size: var(--text-sm);
  color: var(--text-dim);
  padding: 4px 2px;
}
.recent {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.r-row {
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: var(--radius-sm);
}
.r-row:hover {
  background: var(--surface-2);
}
.r-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 6px 8px;
  border: 0;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  text-align: left;
}
.r-title {
  font-size: var(--text-base);
}
.r-meta {
  font-size: var(--text-xs);
  color: var(--text-dim);
}
.foot {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-top: 1px solid var(--border);
  background: var(--bg-elevated);
  font-size: var(--text-xs);
  color: var(--text-dim);
}
</style>
