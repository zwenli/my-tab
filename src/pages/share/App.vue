<script setup lang="ts">
/**
 * 分享页：接收 `#d=<payload>` 并渲染成可点开的链接清单。
 * 该页面不依赖本地数据仓库，也可以在没装扩展的场景下由「下载的独立 HTML」承担同样职责。
 */
import { computed, onMounted, ref } from 'vue'
import Icon from '@/components/Icon.vue'
import FaviconImg from '@/components/FaviconImg.vue'
import { unpackPayload } from '@/core/share'
import { detectLocale, translate } from '@/i18n'
import type { Translator } from '@/composables/useI18n'
import type { ShareItem, SharePayload } from '@/types'
import { copyText } from '@/core/utils'

const locale = ref<string>('zh-CN')
const theme = ref<'dark' | 'light'>('dark')
const payload = ref<SharePayload | null>(null)
const loaded = ref<boolean>(false)
const q = ref<string>('')

const t: Translator = (key, params) => translate(locale.value, key, params)

const items = computed<ShareItem[]>(() => payload.value?.items ?? [])

const filtered = computed<ShareItem[]>(() => {
  const s = q.value.trim().toLowerCase()
  if (!s) return items.value
  return items.value.filter((i) => `${i.title} ${i.url}`.toLowerCase().includes(s))
})

const heading = computed<string>(() => {
  if (!payload.value) return ''
  if (payload.value.title) return payload.value.title
  const d = new Date(payload.value.createdAt || Date.now())
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
})

const createdText = computed<string>(() => {
  if (!payload.value?.createdAt) return ''
  const d = new Date(payload.value.createdAt)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
})

function openAll(): void {
  if (!items.value.length) return
  if (!confirm(t('share.openAllConfirm', { n: items.value.length }))) return
  for (const it of items.value) window.open(it.url, '_blank', 'noopener')
}

async function copyAll(): Promise<void> {
  await copyText(items.value.map((i) => i.url).join('\n'))
}

function toggleTheme(): void {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  document.documentElement.setAttribute('data-theme', theme.value)
  try {
    localStorage.setItem('mytab:share-theme', theme.value)
  } catch {
    /* ignore */
  }
}

onMounted(async () => {
  locale.value = detectLocale()
  try {
    const saved = localStorage.getItem('mytab:share-theme')
    if (saved === 'dark' || saved === 'light') theme.value = saved
  } catch {
    /* ignore */
  }
  document.documentElement.setAttribute('data-theme', theme.value)

  const hash = location.hash || ''
  const m = hash.match(/[#&]d=([^&]+)/)
  if (m) payload.value = await unpackPayload(decodeURIComponent(m[1]))
  loaded.value = true
  if (payload.value?.title) document.title = `${payload.value.title} — MyTab`
})
</script>

<template>
  <div class="share">
    <header class="top">
      <span class="brand"><span class="dot" />MyTab</span>
      <span class="spacer" />
      <button class="btn btn-ghost btn-icon" type="button" :aria-label="t('list.theme')" @click="toggleTheme">
        <Icon :name="theme === 'dark' ? 'sun' : 'moon'" :size="15" />
      </button>
    </header>

    <!-- 加载中 -->
    <div v-if="!loaded" class="state">{{ t('common.loading') }}</div>

    <!-- 无效载荷 -->
    <div v-else-if="!payload" class="state">
      <Icon name="alert-circle" :size="30" class="bad" />
      <h1>{{ t('share.notFound') }}</h1>
      <p class="muted">{{ t('share.notFoundHint') }}</p>
    </div>

    <!-- 正常渲染 -->
    <template v-else>
      <section class="head">
        <div class="crumb">{{ t('share.from') }}</div>
        <h1 class="title">{{ heading }}</h1>
        <p class="meta">{{ t('share.itemCount', { n: items.length }) }}<template v-if="createdText"> · {{ createdText }}</template></p>
        <p v-if="payload.note" class="note">{{ payload.note }}</p>
      </section>

      <div class="toolbar">
        <div class="filter">
          <Icon name="search" :size="14" />
          <input v-model="q" type="search" :placeholder="t('common.search')" />
        </div>
        <button class="btn" type="button" @click="copyAll">
          <Icon name="copy" :size="14" />{{ t('common.copy') }}
        </button>
        <button class="btn btn-primary" type="button" @click="openAll">
          <Icon name="external-link" :size="14" />{{ t('common.openAll') }}
        </button>
      </div>

      <ol class="list card">
        <li v-for="(it, i) in filtered" :key="`${it.url}-${i}`" class="row">
          <span class="idx">{{ i + 1 }}</span>
          <a class="link" :href="it.url" target="_blank" rel="noopener noreferrer">
            <FaviconImg :url="it.url" :title="it.title" :size="16" />
            <span class="text">
              <span class="t-title">{{ it.title || it.url }}<span v-if="it.starred" class="star">★</span></span>
              <span class="t-url">{{ it.url }}</span>
            </span>
          </a>
        </li>
        <li v-if="!filtered.length" class="empty">{{ t('search.noResult') }}</li>
      </ol>
    </template>
  </div>
</template>

<style scoped>
.share {
  max-width: 780px;
  margin: 0 auto;
  padding: 28px 20px 80px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.top {
  display: flex;
  align-items: center;
  gap: 10px;
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: var(--text-sm);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  background: linear-gradient(180deg, #3c7fe0, #1e4e9c);
}
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 90px 20px;
  text-align: center;
  color: var(--text-muted);
}
.state h1 {
  font-size: var(--text-xl);
  font-weight: 650;
  color: var(--text);
}
.bad {
  color: var(--danger);
}
.crumb {
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-bottom: 8px;
}
.title {
  font-size: 27px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.25;
}
.meta {
  margin-top: 8px;
  font-size: var(--text-sm);
  color: var(--text-muted);
}
.note {
  margin-top: 14px;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 3px solid var(--primary);
  border-radius: var(--radius);
  font-size: var(--text-base);
  color: var(--text-secondary);
  white-space: pre-wrap;
  line-height: 1.6;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.filter {
  flex: 1 1 200px;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  color: var(--text-dim);
}
.filter:focus-within {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
}
.filter input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  outline: none;
  font-size: var(--text-base);
  color: var(--text);
}
.list {
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 9px 12px;
  border-radius: var(--radius-sm);
  transition: background var(--transition);
}
.row:hover {
  background: var(--surface-2);
}
.idx {
  flex: none;
  width: 22px;
  text-align: right;
  font-size: var(--text-xs);
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  padding-top: 3px;
}
.link {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  text-decoration: none;
  color: inherit;
}
.link:hover {
  text-decoration: none;
}
.text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.t-title {
  font-size: var(--text-base);
  color: var(--text);
  overflow-wrap: anywhere;
}
.link:hover .t-title {
  color: var(--primary);
}
.star {
  color: var(--star);
  margin-left: 5px;
}
.t-url {
  font-size: var(--text-xs);
  color: var(--text-dim);
  overflow-wrap: anywhere;
}
.empty {
  padding: 30px;
  text-align: center;
  color: var(--text-dim);
  font-size: var(--text-sm);
}
</style>
