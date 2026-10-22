<script setup lang="ts">
/**
 * 设置页：外观 / 收集 / 恢复 / 界面 / 资料库 / 数据 / 快捷键 / 关于。
 */
import { computed, onMounted, ref } from 'vue'
import Icon from '@/components/Icon.vue'
import SettingRow from '@/components/SettingRow.vue'
import Toasts from '@/components/Toasts.vue'
import DialogHost from '@/components/dialogs/DialogHost.vue'
import { useDataStore } from '@/stores/data'
import { useUiStore } from '@/stores/ui'
import { useI18n } from '@/composables/useI18n'
import { useActions } from '@/composables/useActions'
import { useLibraryAutoRestore } from '@/composables/useLibraryAccess'
import { useTheme } from '@/composables/useTheme'
import { SETTING_GROUPS } from '@/core/constants'
import type { LibraryStatus, SelectOption, SettingKey } from '@/types'
import { humanBytes, humanTime } from '@/core/utils'

/* ---------------------------- 局部类型 ---------------------------- */

interface NavItem {
  key: string
  label: string
  icon: string
}

interface RenderedSettingItem {
  key: SettingKey
  label: string
  hint: string
  type: string
  options: SelectOption[]
}

interface RenderedSettingSection {
  id: string
  title: string
  items: RenderedSettingItem[]
}

interface CommandInfo {
  name: string
  description: string
  shortcut: string
}

const data = useDataStore()
const ui = useUiStore()
const { t, dateLocale } = useI18n()
const actions = useActions()

useTheme()
// 重启后授权会重置成 prompt：在本次页面的第一次点击里自动补一次
useLibraryAutoRestore()

/** 分区键，顺序即左侧导航顺序 */
const SECTION_KEYS = ['appearance', 'collect', 'restore', 'library', 'data', 'shortcuts', 'about']

/** 支持 options.html#library 这类深链（同步解析，避免先闪一下默认分区） */
const initialSection = (() => {
  const raw = (globalThis.location?.hash || '').replace(/^#/, '')
  return SECTION_KEYS.includes(raw) ? raw : 'appearance'
})()

const active = ref<string>(initialSection)
/**
 * 资料库状态直接取 store（唯一真相源）：
 * 这样「恢复访问」在别处完成后，这里的卡片会同步更新，不会停在旧的「未授权」。
 * 能力探测在 store 初始化时已同步做过，首帧不会闪出「不支持」。
 */
const library = computed<LibraryStatus>(() => data.library)
/** 绑定还在，只差浏览器重启后的一次重新确认 */
const needsGrant = computed<boolean>(() => library.value.level === 'needs-grant')
const busy = ref<boolean>(false)
const pasteText = ref<string>('')
const commands = ref<CommandInfo[]>([])
const version = ref<string>('1.0.0')

const NAV = computed<NavItem[]>(() => [
  { key: 'appearance', label: t('settings.groupInterface'), icon: 'palette' },
  { key: 'collect', label: t('settings.groupCollect'), icon: 'inbox' },
  { key: 'restore', label: t('settings.groupRestore'), icon: 'external-link' },
  { key: 'library', label: t('settings.groupLibrary'), icon: 'hard-drive' },
  { key: 'data', label: t('settings.groupData'), icon: 'layers' },
  { key: 'shortcuts', label: t('settings.groupShortcuts'), icon: 'keyboard' },
  { key: 'about', label: t('settings.groupAbout'), icon: 'info' }
])

const themeOptions = computed<SelectOption[]>(() => [
  { value: 'auto', label: t('settings.themeAuto') },
  { value: 'dark', label: t('settings.themeDark') },
  { value: 'light', label: t('settings.themeLight') }
])

const langOptions = computed<SelectOption[]>(() => [
  { value: 'auto', label: t('list.themeAuto') },
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en-US', label: 'English' }
])

const settingGroups = computed<RenderedSettingSection[]>(() =>
  SETTING_GROUPS.map((g) => ({
    ...g,
    title: t(g.titleKey),
    items: g.items.map((it) => ({
      ...it,
      label: t(it.labelKey),
      hint: it.hintKey ? t(it.hintKey) : '',
      options: (it.options || []).map((o) => ({ value: o.value, label: t(o.labelKey) }))
    }))
  }))
)

const restoreGroup = computed<RenderedSettingSection | undefined>(() => settingGroups.value.find((g) => g.id === 'restore'))
const interfaceGroup = computed<RenderedSettingSection | undefined>(() => settingGroups.value.find((g) => g.id === 'interface'))
const collectGroup = computed<RenderedSettingSection | undefined>(() => settingGroups.value.find((g) => g.id === 'collect'))

/** 最近一次写入资料库的时间（来自本次会话的缓存状态） */
const lastSyncText = computed<string>(() =>
  data.meta.updatedAt ? humanTime(data.meta.updatedAt, dateLocale.value) : t('settings.libraryNever')
)

/** 资料库目录结构示意 */
const libraryTree = computed<string>(() =>
  [
    `${library.value.dirName || 'MyTab'}/`,
    '├── library.json         库身份 + 组顺序',
    '├── folders.json         文件夹',
    '├── quicklist.json       快捷列表',
    '├── groups/',
    '│   └── 前端性能优化 [6f1c2a9e].json',
    '└── _trash/              删除的组（不直接抹掉）'
  ].join('\n')
)

function set(key: SettingKey, value: boolean | string | number): void {
  data.updateSettings({ [key]: value })
}

/** 切换分区并同步地址栏片段，方便分享/回到某一节 */
function selectSection(key: string): void {
  active.value = key
  try {
    history.replaceState(null, '', `#${key}`)
  } catch {
    /* ignore */
  }
}

async function loadLibraryStatus(): Promise<void> {
  await data.refreshLibrary()
}

async function pickDir(): Promise<void> {
  busy.value = true
  await actions.chooseLibraryDir()
  busy.value = false
  await loadLibraryStatus()
}

async function forgetDir(): Promise<void> {
  await actions.forgetLibrary()
  await loadLibraryStatus()
}

/** 恢复访问：复用已保存的句柄重新授权，不需要重新选择文件夹 */
async function restoreAccess(): Promise<void> {
  busy.value = true
  await actions.restoreLibraryAccess()
  busy.value = false
  await loadLibraryStatus()
}

/** 立即把当前内容写入资料库 */
async function doWrite(): Promise<void> {
  busy.value = true
  await actions.writeLibrary()
  busy.value = false
  await loadLibraryStatus()
}

/** 重新扫描：把 Finder / 云盘里的改动读回来 */
async function doRescan(): Promise<void> {
  busy.value = true
  await actions.rescanLibrary()
  busy.value = false
  await loadLibraryStatus()
}

async function doImportPaste(): Promise<void> {
  if (!pasteText.value.trim()) return
  await actions.importText(pasteText.value)
  pasteText.value = ''
}

function resetDataOnly(): void {
  ui.openDialog('confirm', {
    title: t('settings.resetData'),
    message: t('settings.resetDataHint'),
    detail: t('settings.resetConfirm'),
    confirmText: t('common.reset'),
    danger: true,
    onConfirm: async () => {
      await data.resetDataOnly()
      ui.toast(t('toast.resetDone'), 'success')
    }
  })
}

function factoryReset(): void {
  ui.openDialog('confirm', {
    title: t('settings.resetAll'),
    message: t('settings.resetAllHint'),
    detail: t('settings.resetConfirm'),
    confirmText: t('common.reset'),
    danger: true,
    onConfirm: async () => {
      await data.factoryReset()
      ui.toast(t('toast.resetDone'), 'success')
    }
  })
}

function openShortcutsPage(): void {
  const url = 'chrome://extensions/shortcuts'
  if (typeof chrome !== 'undefined' && chrome.tabs) chrome.tabs.create({ url }, () => void chrome.runtime?.lastError)
  else window.open(url, '_blank')
}

async function loadCommands(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.commands?.getAll) {
    commands.value = [
      { name: 'collect-all-tabs', description: t('settings.cmdCollectAll'), shortcut: 'Alt+Shift+O' },
      { name: 'collect-current-tab', description: t('settings.cmdCollectCurrent'), shortcut: 'Alt+Shift+C' },
      { name: 'collect-other-tabs', description: t('settings.cmdCollectOthers'), shortcut: '' },
      { name: 'open-list', description: t('settings.cmdOpenList'), shortcut: 'Alt+Shift+L' }
    ]
    return
  }
  const list = await new Promise<chrome.commands.Command[]>((r) => chrome.commands.getAll((c) => r(c || [])))
  const map: Record<string, string> = {
    'collect-all-tabs': t('settings.cmdCollectAll'),
    'collect-current-tab': t('settings.cmdCollectCurrent'),
    'collect-other-tabs': t('settings.cmdCollectOthers'),
    'open-list': t('settings.cmdOpenList')
  }
  commands.value = list
    .filter((c) => !!map[c.name ?? ''])
    .map((c) => ({ name: c.name ?? '', description: c.description || map[c.name ?? ''] || '', shortcut: c.shortcut || '' }))
}

onMounted(async () => {
  await data.init()
  await loadLibraryStatus()
  await loadCommands()
  if (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) {
    version.value = chrome.runtime.getManifest().version ?? version.value
  }
})
</script>

<template>
  <div class="opt">
    <header class="head">
      <span class="logo" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18">
          <rect x="1" y="1" width="22" height="22" rx="6" fill="url(#og)" />
          <rect x="6" y="7.2" width="12" height="2.4" rx="1.2" fill="#fafcff" />
          <rect x="6" y="10.9" width="9" height="2.4" rx="1.2" fill="#fafcff" opacity=".92" />
          <rect x="6" y="14.6" width="6" height="2.4" rx="1.2" fill="#fafcff" opacity=".84" />
          <defs>
            <linearGradient id="og" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#3C7FE0" />
              <stop offset="1" stop-color="#1E4E9C" />
            </linearGradient>
          </defs>
        </svg>
      </span>
      <div class="head-text">
        <h1 class="title">{{ t('settings.title') }}</h1>
        <p class="sub">{{ t('settings.subtitle') }}</p>
      </div>
      <span class="spacer" />
      <span class="ver">v{{ version }}</span>
    </header>

    <div class="layout">
      <nav class="nav">
        <button
          v-for="n in NAV"
          :key="n.key"
          class="nav-item"
          :class="{ on: active === n.key }"
          type="button"
          @click="selectSection(n.key)"
        >
          <Icon :name="n.icon" :size="15" />
          <span>{{ n.label }}</span>
        </button>
      </nav>

      <main class="content">
        <!-- 外观 -->
        <section v-if="active === 'appearance'" class="sec">
          <h2 class="sec-title">{{ t('settings.groupInterface') }}</h2>
          <div class="card">
            <SettingRow
              :label="t('settings.theme')"
              type="select"
              :model-value="data.settings.theme"
              :options="themeOptions"
              @update:model-value="set('theme', $event)"
            />
            <SettingRow
              :label="t('settings.language')"
              type="select"
              :model-value="data.settings.language"
              :options="langOptions"
              @update:model-value="set('language', $event)"
            />
            <SettingRow
              v-for="it in interfaceGroup?.items || []"
              :key="it.key"
              :label="it.label"
              :hint="it.hint"
              :type="it.type"
              :options="it.options"
              :model-value="data.settings[it.key]"
              @update:model-value="set(it.key, $event)"
            />
          </div>
        </section>

        <!-- 收集 -->
        <section v-else-if="active === 'collect'" class="sec">
          <h2 class="sec-title">{{ t('settings.groupCollect') }}</h2>
          <div class="card">
            <SettingRow
              v-for="it in collectGroup?.items || []"
              :key="it.key"
              :label="it.label"
              :hint="it.hint"
              :type="it.type"
              :options="it.options"
              :model-value="data.settings[it.key]"
              @update:model-value="set(it.key, $event)"
            />
          </div>
          <p class="tip-note">
            <Icon name="info" :size="14" />
            <span>{{ t('settings.omniboxHint', { keyword: 'mt' }) }}</span>
          </p>
        </section>

        <!-- 恢复 -->
        <section v-else-if="active === 'restore'" class="sec">
          <h2 class="sec-title">{{ t('settings.groupRestore') }}</h2>
          <div class="card">
            <SettingRow
              v-for="it in restoreGroup?.items || []"
              :key="it.key"
              :label="it.label"
              :hint="it.hint"
              :type="it.type"
              :options="it.options"
              :model-value="data.settings[it.key]"
              @update:model-value="set(it.key, $event)"
            />
          </div>
        </section>

        <!-- 资料库 -->
        <section v-else-if="active === 'library'" class="sec">
          <h2 class="sec-title">{{ t('settings.groupLibrary') }}</h2>

          <div class="card box">
            <div class="b-line">
              <Icon :name="library.connected ? 'check-circle' : library.supported ? 'alert-circle' : 'x-circle'" :size="17" :class="library.connected ? 'ok' : library.supported ? 'warn' : 'bad'" />
              <div class="b-text">
                <div class="b-title">
                  {{ t('settings.libraryDir') }}：<strong>{{ library.dirName || t('settings.libraryUnset') }}</strong>
                </div>
                <div class="b-sub">
                  {{ library.supported ? t('settings.librarySupported') : t('settings.libraryUnsupported') }}
                  <template v-if="library.hasDir">
                    · {{ t('settings.libraryPermission', { state: library.permission === 'granted' ? t('settings.libraryGranted') : needsGrant ? t('settings.libraryConfirmNeeded') : t('settings.libraryDenied') }) }}
                  </template>
                </div>
              </div>
              <div class="b-acts">
                <button class="btn btn-primary btn-sm" type="button" :disabled="!library.supported || busy" @click="pickDir">
                  {{ t('settings.libraryPick') }}
                </button>
                <button v-if="needsGrant" class="btn btn-sm" type="button" :disabled="busy" @click="restoreAccess">
                  <Icon name="refresh-cw" :size="13" />{{ t('library.restore') }}
                </button>
                <button v-if="library.hasDir" class="btn btn-sm" type="button" @click="forgetDir">
                  {{ t('settings.libraryForget') }}
                </button>
              </div>
            </div>
            <p class="b-hint">{{ t('settings.libraryPickHint') }}</p>

            <p v-if="needsGrant" class="b-hint warn-line">
              {{ t('settings.libraryNeedsGrant', { name: library.dirName }) }}
            </p>
            <p v-else-if="!library.hasDir" class="b-hint warn-line">{{ t('settings.libraryStaging') }}</p>

            <div class="b-acts wide">
              <button class="btn btn-primary" type="button" :disabled="busy || !library.connected" @click="doWrite">
                <Icon name="hard-drive" :size="14" />{{ t('settings.libraryWrite') }}
              </button>
              <button class="btn" type="button" :disabled="busy || !library.connected" @click="doRescan">
                <Icon name="refresh-cw" :size="14" />{{ t('settings.libraryRescan') }}
              </button>
            </div>
            <p class="b-hint">{{ t('settings.libraryRescanHint') }}</p>
          </div>

          <div class="card box">
            <div class="b-title">{{ t('settings.libraryTree') }}</div>
            <pre class="tree">{{ libraryTree }}</pre>
            <p class="b-hint">{{ t('settings.libraryTreeHint') }}</p>
          </div>

          <p class="muted small">{{ t('settings.libraryLast', { time: lastSyncText }) }}</p>
        </section>

        <!-- 数据 -->
        <section v-else-if="active === 'data'" class="sec">
          <h2 class="sec-title">{{ t('settings.export') }}</h2>
          <div class="card box">
            <div class="b-acts wide">
              <button class="btn" type="button" @click="actions.exportList('text')">
                <Icon name="file-text" :size="14" />{{ t('settings.exportText') }}
              </button>
              <button class="btn" type="button" @click="actions.exportList('json')">
                <Icon name="hard-drive" :size="14" />{{ t('settings.exportJson') }}
              </button>
              <button class="btn" type="button" @click="actions.exportList('html')">
                <Icon name="globe" :size="14" />{{ t('settings.exportHtml') }}
              </button>
            </div>
          </div>

          <h2 class="sec-title mt">{{ t('settings.import') }}</h2>
          <div class="card box">
            <p class="b-hint">{{ t('settings.importHint') }}</p>
            <button class="btn btn-primary" type="button" @click="actions.pickAndImport()">
              <Icon name="upload" :size="14" />{{ t('settings.importPick') }}
            </button>
            <textarea v-model="pasteText" class="input textarea" rows="5" :placeholder="t('settings.importPastePlaceholder')" />
            <button class="btn" type="button" :disabled="!pasteText.trim()" @click="doImportPaste">
              {{ t('settings.importDo') }}
            </button>
          </div>

          <h2 class="sec-title mt">{{ t('settings.dangerZone') }}</h2>
          <div class="card box danger-box">
            <div class="b-line">
              <Icon name="alert-circle" :size="17" class="bad" />
              <div class="b-text">
                <div class="b-title">{{ t('settings.resetData') }}</div>
                <div class="b-sub">{{ t('settings.resetDataHint') }}</div>
              </div>
              <button class="btn btn-danger" type="button" @click="resetDataOnly">{{ t('settings.resetData') }}</button>
            </div>
            <div class="b-line">
              <Icon name="alert-circle" :size="17" class="bad" />
              <div class="b-text">
                <div class="b-title">{{ t('settings.resetAll') }}</div>
                <div class="b-sub">{{ t('settings.resetAllHint') }}</div>
              </div>
              <button class="btn btn-danger" type="button" @click="factoryReset">{{ t('settings.resetAll') }}</button>
            </div>
          </div>

          <p class="muted small">{{ t('settings.storageUsed', { size: humanBytes(data.usage) }) }}</p>
        </section>

        <!-- 快捷键 -->
        <section v-else-if="active === 'shortcuts'" class="sec">
          <h2 class="sec-title">{{ t('settings.groupShortcuts') }}</h2>
          <div class="card">
            <div v-for="c in commands" :key="c.name" class="cmd">
              <span class="c-desc">{{ c.description }}</span>
              <kbd class="c-key">{{ c.shortcut || t('common.none') }}</kbd>
            </div>
          </div>
          <button class="btn" type="button" @click="openShortcutsPage">
            <Icon name="external-link" :size="14" />{{ t('settings.shortcutsOpen') }}
          </button>
          <p class="muted small">{{ t('settings.shortcutsHint') }}</p>
          <p class="muted small">{{ t('settings.omniboxHint', { keyword: 'mt' }) }}</p>
        </section>

        <!-- 关于 -->
        <section v-else class="sec">
          <h2 class="sec-title">{{ t('settings.groupAbout') }}</h2>
          <div class="card box">
            <div class="about-row"><span class="a-k">{{ t('settings.version') }}</span><span class="a-v">{{ version }}</span></div>
            <div class="about-row"><span class="a-k">{{ t('settings.deviceId') }}</span><span class="a-v mono">{{ data.meta.deviceId?.slice(0, 8) }}…</span></div>
            <div class="about-row"><span class="a-k">{{ t('stats.groups') }}</span><span class="a-v">{{ data.stats.groupCount }}</span></div>
            <div class="about-row"><span class="a-k">{{ t('stats.tabs') }}</span><span class="a-v">{{ data.stats.tabCount }}</span></div>
            <div class="about-row"><span class="a-k">{{ t('stats.storage') }}</span><span class="a-v">{{ humanBytes(data.usage) }}</span></div>
            <div class="about-row"><span class="a-k">Schema</span><span class="a-v">{{ data.state.schemaVersion }}</span></div>
          </div>
          <div class="card box">
            <p class="b-hint">{{ t('settings.dataLocal') }}</p>
            <p class="b-hint">{{ t('settings.privacyNote') }}</p>
          </div>
          <p class="muted small">MyTab · Vue 3 + Composition API + Manifest V3</p>
        </section>
      </main>
    </div>

    <DialogHost />
    <Toasts />
  </div>
</template>

<style scoped>
.opt {
  min-height: 100vh;
  background: var(--bg);
  display: flex;
  flex-direction: column;
}
.head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 28px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-elevated);
}
.head-text {
  min-width: 0;
}
.title {
  font-size: var(--text-xl);
  font-weight: 680;
  letter-spacing: -0.015em;
}
.sub {
  margin-top: 3px;
  font-size: var(--text-sm);
  color: var(--text-muted);
}
.ver {
  font-size: var(--text-xs);
  color: var(--text-dim);
  border: 1px solid var(--border);
  padding: 2px 8px;
  border-radius: var(--radius-pill);
}
.layout {
  flex: 1;
  display: flex;
  align-items: flex-start;
  max-width: 1100px;
  width: 100%;
  margin: 0 auto;
  padding: 22px 28px 80px;
  gap: 26px;
}
.nav {
  flex: none;
  width: 190px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: sticky;
  top: 22px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 34px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--text-base);
  cursor: pointer;
  text-align: left;
  transition: background var(--transition), color var(--transition);
}
.nav-item:hover {
  background: var(--surface-2);
  color: var(--text);
}
.nav-item.on {
  background: var(--primary-soft);
  color: var(--text);
  font-weight: 550;
}
.content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sec {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sec-title {
  font-size: var(--text-xs);
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
  padding-left: 3px;
}
.sec-title.mt {
  margin-top: 16px;
}
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.box {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.danger-box {
  border-color: rgba(242, 112, 111, 0.35);
}
.b-line {
  display: flex;
  align-items: center;
  gap: 14px;
}
.b-text {
  flex: 1;
  min-width: 0;
}
.b-title {
  font-size: var(--text-base);
  color: var(--text);
}
.b-title strong {
  font-weight: 600;
}
.b-sub {
  margin-top: 3px;
  font-size: var(--text-sm);
  color: var(--text-muted);
  line-height: 1.5;
}
.b-acts {
  flex: none;
  display: flex;
  gap: 8px;
}
.b-acts.wide {
  flex-wrap: wrap;
}
.b-hint {
  font-size: var(--text-sm);
  color: var(--text-muted);
  line-height: 1.6;
}
.b-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.mini-lbl {
  flex: none;
  width: 120px;
  font-size: var(--text-sm);
  color: var(--text-muted);
}
.ok {
  color: var(--success);
}
.warn {
  color: var(--warning);
}
.bad {
  color: var(--danger);
}
.small {
  font-size: var(--text-sm);
}
.mono {
  font-family: var(--font-mono);
}
.tip-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: var(--text-sm);
  color: var(--text-muted);
  padding: 10px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  line-height: 1.55;
}
.cmd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-soft);
}
.cmd:last-child {
  border-bottom: 0;
}
.c-desc {
  font-size: var(--text-base);
  color: var(--text);
}
.c-key {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  padding: 3px 9px;
}
.about-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  font-size: var(--text-base);
  padding: 4px 0;
}
.a-k {
  color: var(--text-muted);
}
.a-v {
  color: var(--text);
}
@media (max-width: 760px) {
  .layout {
    flex-direction: column;
    padding: 16px 14px 60px;
    gap: 14px;
  }
  .nav {
    width: 100%;
    flex-direction: row;
    overflow-x: auto;
    position: static;
  }
  .nav-item {
    white-space: nowrap;
  }
  .head {
    padding: 14px 16px;
  }
}

.tree {
  margin: 0;
  padding: 14px 16px;
  background: var(--bg-code, rgba(127, 127, 127, 0.08));
  border: 1px solid var(--border-soft, rgba(127, 127, 127, 0.2));
  border-radius: 10px;
  font-family: var(--mono, ui-monospace, SFMono-Regular, Consolas, monospace);
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--fg-soft, inherit);
  overflow-x: auto;
  white-space: pre;
}

.warn-line {
  color: var(--warn, #b6791a);
}
</style>
