<script setup lang="ts">
/**
 * 搜索结果视图：跨组、跨快捷列表检索已保存的标签。
 */
import { computed } from 'vue'
import Icon from './Icon.vue'
import TabRow from './TabRow.vue'
import EmptyState from './EmptyState.vue'
import { useDataStore } from '@/stores/data'
import { useUiStore } from '@/stores/ui'
import { useI18n } from '@/composables/useI18n'
import { useActions } from '@/composables/useActions'
import { searchGroups, searchItems } from '@/core/search'
import type { Group, SearchHit } from '@/types'

const data = useDataStore()
const ui = useUiStore()
const { t } = useI18n()
const actions = useActions()

const results = computed<SearchHit[]>(() =>
  searchItems(data.state, ui.searchQuery, { searchInUrl: data.settings.searchInUrl !== false })
)

const limited = computed<SearchHit[]>(() => results.value.slice(0, 400))

/** 组名命中的分组：单独一块，点一下定位到列表里的那个组 */
const groupHits = computed<Group[]>(() => searchGroups(data.state, ui.searchQuery).slice(0, 6))

const headTitle = computed<string>(() => {
  const n = results.value.length
  const m = groupHits.value.length
  if (n && m) return t('search.summary', { n, m })
  if (n) return t('search.results', { n })
  if (m) return t('search.groupsFound', { n: m })
  return ''
})

function sourceLabel(r: SearchHit): string {
  if (!r.group) return t('search.fromQuick')
  return t('search.inGroup', { name: r.group.title || t('group.untitled') })
}

function openAll(): void {
  actions.restoreItems(limited.value.map((r) => r.item))
}
</script>

<template>
  <section class="results">
    <header class="r-head">
      <Icon name="search" :size="15" class="r-ico" />
      <span v-if="headTitle" class="r-title">{{ headTitle }}</span>
      <span class="spacer" />
      <button v-if="results.length" class="btn btn-sm" type="button" @click="openAll">
        <Icon name="external-link" :size="13" />{{ t('common.openAll') }}
      </button>
      <button class="btn btn-ghost btn-sm" type="button" @click="ui.setSearch('')">
        <Icon name="x" :size="13" />{{ t('search.clear') }}
      </button>
    </header>

    <ul v-if="groupHits.length" class="g-list card" :aria-label="t('search.groupsFound', { n: groupHits.length })">
      <li v-for="g in groupHits" :key="g.id">
        <button class="g-row" type="button" :title="t('search.jumpToGroup')" @click="ui.focusGroup(g.id)">
          <Icon name="layers" :size="14" class="g-ico" />
          <span class="g-name truncate">{{ g.title || t('group.untitled') }}</span>
          <span class="g-meta">{{ t('group.itemCount', { n: g.items.length }) }}</span>
          <Icon name="arrow-right" :size="13" class="g-go" />
        </button>
      </li>
    </ul>

    <ul v-if="limited.length" class="r-list card">
      <li v-for="r in limited" :key="r.item.id" class="r-item">
        <TabRow
          :item="r.item"
          :group-id="r.group?.id || ''"
          :source="r.group ? 'group' : 'quick'"
          :show-favicons="data.settings.showFavicons !== false"
          :highlight="ui.searchQuery"
          @remove="(it) => data.removeItems([it.id])"
        />
        <span class="r-src">{{ sourceLabel(r) }}</span>
      </li>
    </ul>

    <EmptyState
      v-if="!limited.length && !groupHits.length"
      icon="search"
      :title="t('search.noResult')"
      :hint="t('search.noResultHint')"
      compact
    />
  </section>
</template>

<style scoped>
.results {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.r-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 4px;
}
.r-ico {
  color: var(--primary);
}
.r-title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--text-secondary);
}
.r-list {
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.r-item {
  position: relative;
  padding-right: 108px;
}
.r-src {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  font-size: var(--text-xs);
  color: var(--text-dim);
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.r-item:hover .r-src {
  opacity: 0.35;
}

/* 组名命中的分组：比条目更「重」，因为点它是跳转而不是打开标签 */
.g-list {
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin-bottom: 2px;
}
.g-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.g-row:hover {
  background: var(--primary-soft);
}
.g-ico {
  flex: none;
  color: var(--primary);
}
.g-name {
  flex: 1;
  min-width: 0;
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--text);
}
.g-meta {
  flex: none;
  font-size: var(--text-xs);
  color: var(--text-dim);
}
.g-go {
  flex: none;
  color: var(--text-dim);
}
.g-row:hover .g-go {
  color: var(--primary);
}
</style>
